import os

path = "main.py"
with open(path, "r") as f:
    code = f.read()

# 1. Imports
if "from models import Job" not in code:
    code = code.replace("from models import User, Door, Offcut, Profile", "from models import User, Door, Offcut, Profile, Job\nfrom worker import run_nesting_task, run_gcode_task\nimport uuid")

# 2. Add /api/jobs/{job_id} endpoint
job_endpoint = """
@router.get("/jobs/{job_id}")
def get_job_status(job_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Not authorized to view this job")
    return {
        "id": job.id,
        "status": job.status,
        "result": job.result,
        "error": job.error
    }
"""

if "@router.get(\"/jobs/{job_id}\")" not in code:
    code = code.replace("# ════════════════════════════════════════════════════════════\n#  Labels\n# ════════════════════════════════════════════════════════════", job_endpoint + "\n\n# ════════════════════════════════════════════════════════════\n#  Labels\n# ════════════════════════════════════════════════════════════")

# 3. Replace /nest logic
old_nest = """@router.post("/nest")
async def api_nest(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    doors = [d.dict() for d in session.exec(select(Door).where(Door.user_id == current_user.id)).all()]
    if not doors:
        raise HTTPException(400, "No doors to nest.")
    offcuts = [o.dict() for o in session.exec(select(Offcut).where(Offcut.user_id == current_user.id)).all()]
    
    prof = session.exec(select(Profile).where(Profile.user_id == current_user.id, Profile.is_active == True)).first()
    s = prof.settings if prof else _DEFAULT_SETTINGS

    try:
        res = do_nesting(
            doors=doors,
            offcuts=offcuts,
            sheet_w=s["sheet_w"], sheet_h=s["sheet_h"],
            margin=s["margin"], kerf=s["kerf"],
            allow_rotation=s["allow_rotation"],
            small_part_threshold=s["small_part_threshold"],
            nesting_iterations=s.get("nesting_iterations", 100),
            sheet_grain=s.get("sheet_grain", "None"),
        )
        
        # Calculate costing
        total_length_mm = 0
        frame_w = s.get("frame_w", 50.0)
        stepover = s.get("t6_dia", 12.7) * s.get("spiral_overlap", 0.5)
        
        for sht in res.get("sheets", []):
            for plc in sht:
                w, h = plc["w"], plc["h"]
                total_length_mm += 2 * (w + h)
                if plc.get("type", "Slab") in ["Shaker", "Shaker Step", "Beaded Shaker", "Thin Rail Shaker"]:
                    inner_w, inner_h = max(0, w - 2 * frame_w), max(0, h - 2 * frame_w)
                    total_length_mm += 2 * (inner_w + inner_h)
                    if s.get("do_pocket", True) and stepover > 0:
                        area = inner_w * inner_h
                        total_length_mm += area / stepover

        feed_xy = s.get("feed_xy", 3000)
        time_minutes = (total_length_mm / feed_xy) * 1.1 if feed_xy > 0 else 0
        time_hours = time_minutes / 60.0
        
        sheet_count = len(res.get("sheets", []))
        sheet_cost = s.get("sheet_cost", 65.0)
        shop_rate = s.get("shop_rate", 85.0)
        
        total_material = sheet_count * sheet_cost
        total_labor = time_hours * shop_rate
        
        res["costing"] = {
            "sheet_count": sheet_count,
            "material_cost": round(total_material, 2),
            "machine_time_hours": round(time_hours, 3),
            "labor_cost": round(total_labor, 2),
            "total_estimate": round(total_material + total_labor, 2)
        }
        
        _memory_store[current_user.id]["nesting_result"] = res
        return res
    except Exception as e:
        logger.error(f"Nesting error: {e}")
        raise HTTPException(500, str(e))"""

new_nest = """@router.post("/nest")
async def api_nest(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    doors = [d.dict() for d in session.exec(select(Door).where(Door.user_id == current_user.id)).all()]
    if not doors:
        raise HTTPException(400, "No doors to nest.")
    offcuts = [o.dict() for o in session.exec(select(Offcut).where(Offcut.user_id == current_user.id)).all()]
    
    prof = session.exec(select(Profile).where(Profile.user_id == current_user.id, Profile.is_active == True)).first()
    s = prof.settings if prof else _DEFAULT_SETTINGS

    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="nesting", status="PENDING", user_id=current_user.id)
    session.add(job)
    session.commit()
    
    try:
        run_nesting_task.delay(doors, offcuts, s, current_user.id)
        return {"job_id": job_id}
    except Exception as e:
        logger.error(f"Nesting task dispatch error: {e}")
        job.status = "FAILED"
        job.error = str(e)
        session.add(job)
        session.commit()
        raise HTTPException(500, str(e))"""

code = code.replace(old_nest, new_nest)


# 4. Replace /generate-gcode logic
old_gcode = """@router.post("/generate-gcode")
async def api_generate_gcode(req: GenerateRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    nr = _memory_store[current_user.id].get("nesting_result")
    if not nr or "sheets" not in nr:
        raise HTTPException(400, "No nesting result available. Run nesting first.")

    prof = session.exec(select(Profile).where(Profile.user_id == current_user.id, Profile.is_active == True)).first()
    s = prof.settings if prof else _DEFAULT_SETTINGS

    indices = [req.sheet_index] if req.sheet_index >= 0 else range(len(nr["sheets"]))
    
    results = []
    try:
        for idx in indices:
            meta = nr["sheets_meta"][idx]
            gcode = generate_gcode_for_sheet(
                sheet_doors=nr["sheets"][idx],
                sheet_idx=idx,
                total_sheets=len(nr["sheets"]),
                sheet_w=meta["w"], sheet_h=meta["h"],
                mat_z=s["mat_z"], margin=s["margin"],
                frame_w=s["frame_w"],
                pocket_depth=s["pocket_depth"],
                pocket_depth2=s["pocket_depth2"],
                pocket_step_offset=s.get("pocket_step_offset", 6.35),
                chamfer_depth=s["chamfer_depth"],
                outer_chamfer_depth=s["outer_chamfer_depth"],
                rabbet_w=s.get("rabbet_w", 12.7),
                rabbet_d=s.get("rabbet_d", 6.35),
                t6_name=s["t6_name"], t6_dia=s["t6_dia"],
                t6_type=s["t6_type"],
                t6_spindle=s["t6_spindle"], t6_feed=s["t6_feed"],
                pocket_strategy=s["pocket_strategy"],
                spiral_overlap=s["spiral_overlap"],
                do_pocket=s["do_pocket"],
                do_corners_rest=s["do_corners_rest"],
                do_french_miter=s["do_french_miter"],
                do_cutout=s["do_cutout"],
                do_rough_pass=s["do_rough_pass"],
                common_line=s.get("common_line", False),
                do_tabs=s.get("do_tabs", True),
                tab_height=s.get("tab_height", 0.4),
                tab_width=s.get("tab_width", 4.0),
                tab_min_area=s.get("small_part_threshold", 0.05) * 1e6,
                kerf=s["kerf"], corner_r=s["corner_r"],
                feed_xy=s["feed_xy"],
                t2_tool_t=s["t2_tool_t"], t2_spindle=s["t2_spindle"],
                t2_feed=s["t2_feed"],
                t3_tool_t=s["t3_tool_t"], t3_spindle=s["t3_spindle"],
                t3_feed=s["t3_feed"],
                t5_tool_t=s["t5_tool_t"], t5_spindle=s["t5_spindle"],
                t5_feed=s["t5_feed"],
                order_id=s["order_id"],
            )
            line_count = len([l for l in gcode.split("\\n") if l.strip() and not l.startswith("(")])
            time_stats = estimate_machining_time(gcode)
            results.append({
                "sheet_index": idx,
                "gcode": gcode,
                "stats": {
                    "line_count": line_count,
                    "parts_on_sheet": len(nr["sheets"][idx]),
                    "sheet_w": meta["w"],
                    "sheet_h": meta["h"],
                    "is_offcut": meta.get("is_offcut", False),
                    **time_stats,
                },
            })
        return {"sheets": results}
    except Exception as e:
        logger.error(f"Gcode error: {e}")
        raise HTTPException(500, str(e))"""


new_gcode = """@router.post("/generate-gcode")
async def api_generate_gcode(req: GenerateRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    nr = _memory_store[current_user.id].get("nesting_result")
    if not nr or "sheets" not in nr:
        raise HTTPException(400, "No nesting result available. Run nesting first.")

    prof = session.exec(select(Profile).where(Profile.user_id == current_user.id, Profile.is_active == True)).first()
    s = prof.settings if prof else _DEFAULT_SETTINGS

    indices = list([req.sheet_index] if req.sheet_index >= 0 else range(len(nr["sheets"])))
    
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="gcode", status="PENDING", user_id=current_user.id)
    session.add(job)
    session.commit()
    
    try:
        run_gcode_task.apply_async(
            args=[nr["sheets"], nr["sheets_meta"], s, current_user.id, indices],
            task_id=job_id
        )
        return {"job_id": job_id}
    except Exception as e:
        logger.error(f"Gcode task dispatch error: {e}")
        job.status = "FAILED"
        job.error = str(e)
        session.add(job)
        session.commit()
        raise HTTPException(500, str(e))"""

code = code.replace(old_gcode, new_gcode)

old_update = """@router.post("/update-nesting")
async def api_update_nesting(payload: dict, current_user: User = Depends(get_current_user)):
    if "sheets" in payload and "sheets_meta" in payload:
        _memory_store[current_user.id]["nesting_result"] = payload
        return {"ok": True}
    raise HTTPException(400, "Invalid payload")"""

new_update = """@router.post("/update-nesting")
async def api_update_nesting(payload: dict, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if "sheets" in payload and "sheets_meta" in payload:
        _memory_store[current_user.id]["nesting_result"] = payload
        return {"ok": True}
    raise HTTPException(400, "Invalid payload")"""
code = code.replace(old_update, new_update)

with open(path, "w") as f:
    f.write(code)
