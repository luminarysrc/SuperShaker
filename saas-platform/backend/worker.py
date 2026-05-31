import os
from celery import Celery
from engine import do_nesting, generate_gcode_for_sheet
from time_estimator import estimate_machining_time
from sqlmodel import Session, select
from database import engine, get_session
from models import Job
import logging

logger = logging.getLogger(__name__)

# Initialize Celery app
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery(
    "supershaker_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task(bind=True)
def run_nesting_task(self, doors: list, offcuts: list, settings: dict, user_id: int):
    try:
        # Update status
        with Session(engine) as session:
            job = session.get(Job, self.request.id)
            if job:
                job.status = "PROCESSING"
                session.add(job)
                session.commit()
                
        # Run nesting
        result = do_nesting(
            doors=doors,
            offcuts=offcuts,
            sheet_w=settings["sheet_w"], sheet_h=settings["sheet_h"],
            margin=settings["margin"], kerf=settings["kerf"],
            allow_rotation=settings["allow_rotation"],
            small_part_threshold=settings["small_part_threshold"],
            nesting_iterations=settings.get("nesting_iterations", 100),
            sheet_grain=settings.get("sheet_grain", "None"),
        )
        

        # Update Job in Database
        with Session(engine) as session:
            job = session.get(Job, self.request.id)
            if job:
                job.status = "COMPLETED"
                job.result = result
                session.add(job)
                session.commit()
                
        return result
    except Exception as e:
        logger.error(f"Nesting task failed: {e}", exc_info=True)
        with Session(engine) as session:
            job = session.get(Job, self.request.id)
            if job:
                job.status = "FAILED"
                job.error = str(e)
                session.add(job)
                session.commit()
        raise e

@celery_app.task(bind=True)
def run_gcode_task(self, sheets: list, sheets_meta: list, settings: dict, user_id: int, indices: list):
    try:
        with Session(engine) as session:
            job = session.get(Job, self.request.id)
            if job:
                job.status = "PROCESSING"
                session.add(job)
                session.commit()
                
        results = []
        for idx in indices:
            meta = sheets_meta[idx]
            gcode = generate_gcode_for_sheet(
                sheet_doors=sheets[idx],
                sheet_idx=idx,
                total_sheets=len(sheets),
                sheet_w=meta["w"], sheet_h=meta["h"],
                mat_z=settings["mat_z"], margin=settings["margin"],
                frame_w=settings["frame_w"],
                pocket_depth=settings["pocket_depth"],
                pocket_depth2=settings["pocket_depth2"],
                pocket_step_offset=settings.get("pocket_step_offset", 6.35),
                chamfer_depth=settings["chamfer_depth"],
                outer_chamfer_depth=settings["outer_chamfer_depth"],
                rabbet_w=settings.get("rabbet_w", 12.7),
                rabbet_d=settings.get("rabbet_d", 6.35),
                t6_name=settings["t6_name"], t6_dia=settings["t6_dia"],
                t6_type=settings["t6_type"],
                t6_spindle=settings["t6_spindle"], t6_feed=settings["t6_feed"],
                pocket_strategy=settings["pocket_strategy"],
                spiral_overlap=settings["spiral_overlap"],
                do_pocket=settings["do_pocket"],
                do_corners_rest=settings["do_corners_rest"],
                do_french_miter=settings["do_french_miter"],
                do_cutout=settings["do_cutout"],
                do_rough_pass=settings["do_rough_pass"],
                common_line=settings.get("common_line", False),
                do_tabs=settings.get("do_tabs", True),
                tab_height=settings.get("tab_height", 0.4),
                tab_width=settings.get("tab_width", 4.0),
                tab_min_area=settings.get("small_part_threshold", 0.05) * 1e6,
                kerf=settings["kerf"], corner_r=settings["corner_r"],
                feed_xy=settings["feed_xy"],
                t2_tool_t=settings["t2_tool_t"], t2_spindle=settings["t2_spindle"],
                t2_feed=settings["t2_feed"],
                t3_tool_t=settings["t3_tool_t"], t3_spindle=settings["t3_spindle"],
                t3_feed=settings["t3_feed"],
                t5_tool_t=settings["t5_tool_t"], t5_spindle=settings["t5_spindle"],
                t5_feed=settings["t5_feed"],
                order_id=settings["order_id"],
            )
            line_count = len([l for l in gcode.split("\\n") if l.strip() and not l.startswith("(")])
            time_stats = estimate_machining_time(gcode)
            results.append({
                "sheet_index": idx,
                "gcode": gcode,
                "stats": {
                    "line_count": line_count,
                    "parts_on_sheet": len(sheets[idx]),
                    "sheet_w": meta["w"],
                    "sheet_h": meta["h"],
                    "is_offcut": meta.get("is_offcut", False),
                    **time_stats,
                },
            })

        result_obj = {"sheets": results}
        
        with Session(engine) as session:
            job = session.get(Job, self.request.id)
            if job:
                job.status = "COMPLETED"
                job.result = result_obj
                session.add(job)
                session.commit()
                
        return result_obj
        
    except Exception as e:
        logger.error(f"G-code generation failed: {e}", exc_info=True)
        with Session(engine) as session:
            job = session.get(Job, self.request.id)
            if job:
                job.status = "FAILED"
                job.error = str(e)
                session.add(job)
                session.commit()
        raise e
