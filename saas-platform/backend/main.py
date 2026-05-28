"""
SuperShaker SaaS — FastAPI Backend
===================================
REST API for nesting and G-code generation using the real SuperShaker engine.
Run with: uvicorn main:app --reload --port 8000
"""
import copy
import io
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Form, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from typing import Optional, Dict
import os
import logging
import json
import uuid

# Authentication setup
AUTH_USER = os.environ.get("AUTH_USER", "admin")
AUTH_PASS = os.environ.get("AUTH_PASS", "supershaker2026")
VALID_TOKEN = str(uuid.uuid4())

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != VALID_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return credentials.credentials

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "name": record.name
        }
        if record.exc_info:
            log_record["traceback"] = self.formatException(record.exc_info)
        return json.dumps(log_record)

logger = logging.getLogger("supershaker")
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)
logger.setLevel(logging.INFO)


from engine import do_nesting, generate_gcode_for_sheet, calc_t6_params
from label_generator import generate_labels_pdf
from time_estimator import estimate_machining_time

# ════════════════════════════════════════════════════════════
#  FastAPI Application
# ════════════════════════════════════════════════════════════

app = FastAPI(
    title="SuperShaker SaaS API",
    description="CNC G-code generation & nesting engine API",
    version="0.2.0-beta",
)

# Public router
public_router = APIRouter(prefix="/api")

# Protected router for business logic
router = APIRouter(prefix="/api", dependencies=[Depends(verify_token)])

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════
#  In-memory state (single-user prototype)
# ════════════════════════════════════════════════════════════

_DEFAULT_SETTINGS = {
    "sheet_w": 1245, "sheet_h": 2466,
    "mat_z": 19.2, "margin": 10, "kerf": 6.0,
    "frame_w": 65.0, "pocket_depth": 7.5, "pocket_depth2": 3.0,
    "pocket_step_offset": 5.0, "chamfer_depth": 0.5,
    "outer_chamfer_depth": 0.5, "corner_r": 1.0, "feed_xy": 8000,
    "t6_name": "T6", "t6_dia": 31.75, "t6_type": "PCD",
    "t6_spindle": 18000, "t6_feed": 6000, "t6_teeth": 2,
    "pocket_strategy": "Snake", "spiral_overlap": 50.0,
    "do_pocket": True, "do_corners_rest": True,
    "do_french_miter": True, "do_cutout": True,
    "do_rough_pass": False, "common_line": False, "allow_rotation": True,
    "do_tabs": True, "tab_height": 0.4, "tab_width": 4.0,
    "small_part_threshold": 0.05, "nesting_iterations": 100,
    "t2_tool_t": "T2", "t2_spindle": 18000, "t2_feed": 6000,
    "t3_tool_t": "T3", "t3_spindle": 18000, "t3_feed": 8000,
    "t5_tool_t": "T5", "t5_spindle": 18000, "t5_feed": 8000,
    "order_id": "",
    "label_format": "Roll Printer",
    "label_w": 62.0,
    "label_h": 29.0,
    "sheet_grain": "None",
    "sheet_cost": 65.0,
    "shop_rate": 85.0,
}

_state = {
    "doors": [],
    "next_id": 1,
    "offcuts": [],
    "next_offcut_id": 1,
    "nesting_result": None,
    "settings": copy.deepcopy(_DEFAULT_SETTINGS),
    "active_profile_id": 1,
}

# Machine profiles — each stores a full settings snapshot
_profiles = [
    {"id": 1, "name": "Default CNC", "settings": copy.deepcopy(_DEFAULT_SETTINGS)},
]
_profile_next_id = 2


# ════════════════════════════════════════════════════════════
#  Pydantic Models
# ════════════════════════════════════════════════════════════

class DoorIn(BaseModel):
    w: float = Field(..., description="Width mm")
    h: float = Field(..., description="Height mm")
    qty: int = Field(1, description="Quantity")
    type: str = Field("Shaker", description="Shaker | Shaker Step | Slab | Grooved Slab | Beaded Shaker | Thin Rail Shaker")
    grain: str = Field("None", description="Horizontal | Vertical | None")


class DoorOut(BaseModel):
    id: int
    w: float
    h: float
    qty: int
    type: str
    grain: str

class OffcutIn(BaseModel):
    w: float = Field(..., description="Width mm")
    h: float = Field(..., description="Height mm")
    qty: int = Field(1, description="Quantity")

class OffcutOut(BaseModel):
    id: int
    w: float
    h: float
    qty: int


class SettingsModel(BaseModel):
    sheet_w: Optional[float] = None
    sheet_h: Optional[float] = None
    mat_z: Optional[float] = None
    margin: Optional[float] = None
    kerf: Optional[float] = None
    frame_w: Optional[float] = None
    pocket_depth: Optional[float] = None
    pocket_depth2: Optional[float] = None
    pocket_step_offset: Optional[float] = None
    chamfer_depth: Optional[float] = None
    outer_chamfer_depth: Optional[float] = None
    rabbet_w: Optional[float] = None
    rabbet_d: Optional[float] = None
    corner_r: Optional[float] = None
    feed_xy: Optional[int] = None
    t6_name: Optional[str] = None
    t6_dia: Optional[float] = None
    t6_type: Optional[str] = None
    t6_spindle: Optional[int] = None
    t6_feed: Optional[int] = None
    t6_teeth: Optional[int] = None
    pocket_strategy: Optional[str] = None
    spiral_overlap: Optional[float] = None
    do_pocket: Optional[bool] = None
    do_corners_rest: Optional[bool] = None
    do_french_miter: Optional[bool] = None
    do_cutout: Optional[bool] = None
    do_rough_pass: Optional[bool] = None
    common_line: Optional[bool] = None
    allow_rotation: Optional[bool] = None
    do_tabs: Optional[bool] = None
    tab_height: Optional[float] = None
    tab_width: Optional[float] = None
    small_part_threshold: Optional[float] = None
    nesting_iterations: Optional[int] = None
    t2_tool_t: Optional[str] = None
    t2_spindle: Optional[int] = None
    t2_feed: Optional[int] = None
    t3_tool_t: Optional[str] = None
    t3_spindle: Optional[int] = None
    t3_feed: Optional[int] = None
    t5_tool_t: Optional[str] = None
    t5_spindle: Optional[int] = None
    t5_feed: Optional[int] = None
    order_id: Optional[str] = None
    label_format: Optional[str] = None
    label_w: Optional[float] = None
    label_h: Optional[float] = None
    sheet_grain: Optional[str] = None
    sheet_cost: Optional[float] = None
    shop_rate: Optional[float] = None


class ProfileIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class CalcParamsRequest(BaseModel):
    D: float
    z: int = 2
    tool_type: str = "PCD"
    pass_type: str = "finish"
    doc: float = 3.0


class GenerateRequest(BaseModel):
    sheet_index: int = Field(0, description="0-based sheet index, or -1 for all sheets")

class LabelRequest(BaseModel):
    order_id: str = ""
    doors: list[dict]


# ════════════════════════════════════════════════════════════
#  Endpoints
# ════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str

@public_router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest):
    if req.username == AUTH_USER and req.password == AUTH_PASS:
        logger.info(f"Successful login for user {req.username}")
        return {"token": VALID_TOKEN, "user": {"name": req.username}}
    logger.warning(f"Failed login attempt for username: {req.username}")
    raise HTTPException(401, "Invalid credentials")


@public_router.get("/health")
@limiter.limit("100/minute")
async def health_check(request: Request):
    return {"status": "ok", "version": "0.2.0-beta"}


# ── Doors CRUD ───────────────────────────────────────────

@router.get("/doors")
@limiter.limit("100/minute")
async def list_doors(request: Request):
    return _state["doors"]


@router.post("/doors")
@limiter.limit("100/minute")
async def add_door(request: Request, door: DoorIn):
    d = {
        "id": _state["next_id"],
        "w": door.w, "h": door.h,
        "qty": door.qty, "type": door.type,
        "grain": door.grain,
    }
    _state["next_id"] += 1
    _state["doors"].append(d)
    _state["nesting_result"] = None
    return d


@router.put("/doors/{door_id}")
@limiter.limit("100/minute")
async def update_door(request: Request, door_id: int, door: DoorIn):
    for d in _state["doors"]:
        if d["id"] == door_id:
            d.update({"w": door.w, "h": door.h, "qty": door.qty, "type": door.type, "grain": door.grain})
            _state["nesting_result"] = None
            return d
    raise HTTPException(404, f"Door {door_id} not found")


@router.delete("/doors/{door_id}")
@limiter.limit("100/minute")
async def delete_door(request: Request, door_id: int):
    _state["doors"] = [d for d in _state["doors"] if d["id"] != door_id]
    _state["nesting_result"] = None
    return {"ok": True}


@router.delete("/doors")
@limiter.limit("100/minute")
async def clear_doors(request: Request):
    _state["doors"] = []
    _state["next_id"] = 1
    _state["nesting_result"] = None
    return {"ok": True}


# ── Offcuts CRUD ─────────────────────────────────────────

@router.get("/offcuts")
async def list_offcuts():
    return _state["offcuts"]

@router.post("/offcuts", response_model=OffcutOut)
async def add_offcut(offcut: OffcutIn):
    new_o = {
        "id": _state["next_offcut_id"],
        "w": offcut.w,
        "h": offcut.h,
        "qty": offcut.qty,
    }
    _state["next_offcut_id"] += 1
    _state["offcuts"].append(new_o)
    _state["nesting_result"] = None
    return new_o

@router.delete("/offcuts/{offcut_id}")
async def delete_offcut(offcut_id: int):
    for i, o in enumerate(_state["offcuts"]):
        if o["id"] == offcut_id:
            del_o = _state["offcuts"].pop(i)
            _state["nesting_result"] = None
            return {"ok": True, "deleted": del_o}
    raise HTTPException(404, "Offcut not found")


@router.post("/jobs/import-batch")
@limiter.limit("10/minute")
async def import_batch(
    request: Request,
    file: UploadFile = File(...),
    unit: str = Form("mm"),
    source: str = Form("generic")
):
    if not file.filename.endswith((".xlsx", ".csv")):
        raise HTTPException(400, "Invalid file format. Only .xlsx and .csv allowed.")
    
    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = await run_in_threadpool(pd.read_csv, io.BytesIO(contents))
        else:
            df = await run_in_threadpool(pd.read_excel, io.BytesIO(contents))
    except Exception as e:
        logger.error(f"Failed to read imported batch file {file.filename}: {e}", exc_info=True)
        raise HTTPException(400, f"Error reading file: {str(e)}")
        
    col_map = {str(c).lower().strip(): c for c in df.columns}
    
    def get_col(candidates):
        for c in candidates:
            if c in col_map:
                return col_map[c]
        return None
        
    w_col = get_col(["w", "width", "x"])
    h_col = get_col(["h", "height", "y", "length", "len", "l"])
    qty_col = get_col(["qty", "quantity", "count", "num", "amount"])
    type_col = get_col(["type", "style", "facade"])
    grain_col = get_col(["grain", "direction"])
    
    if not w_col or not h_col:
        raise HTTPException(400, "Excel/CSV must contain 'W'/'Width' and 'H'/'Height' columns.")
        
    added = 0
    for _, row in df.iterrows():
        try:
            w = float(row[w_col])
            h = float(row[h_col])
            if pd.isna(w) or pd.isna(h):
                continue

            if unit == "in":
                w *= 25.4
                h *= 25.4
            elif unit == "cm":
                w *= 10.0
                h *= 10.0
            if qty_col and not pd.isna(row[qty_col]):
                qty_val = row[qty_col]
                if not pd.isna(qty_val):
                    qty = int(qty_val)
                
            d_type = "Shaker"
            if type_col and not pd.isna(row[type_col]):
                t_val = str(row[type_col]).strip().title()
                if t_val in ["Shaker", "Shaker Step", "Slab", "Grooved Slab", "Beaded Shaker", "Thin Rail Shaker"]:
                    d_type = t_val
                elif "Step" in t_val:
                    d_type = "Shaker Step"
                elif "Beaded" in t_val:
                    d_type = "Beaded Shaker"
                elif "Thin" in t_val:
                    d_type = "Thin Rail Shaker"
                elif "Groove" in t_val:
                    d_type = "Grooved Slab"
                elif "Slab" in t_val or "Flat" in t_val:
                    d_type = "Slab"

            d_grain = "None"
            if grain_col and not pd.isna(row[grain_col]):
                g_val = str(row[grain_col]).strip().title()
                if g_val in ["Horizontal", "Vertical", "None"]:
                    d_grain = g_val
                elif "Horiz" in g_val:
                    d_grain = "Horizontal"
                elif "Vert" in g_val:
                    d_grain = "Vertical"

            d = {
                "id": _state["next_id"],
                "w": w, "h": h,
                "qty": qty, "type": d_type,
                "grain": d_grain,
            }
            _state["next_id"] += 1
            _state["doors"].append(d)
            added += 1
        except Exception:
            pass
            
    _state["nesting_result"] = None
    return {"ok": True, "added": added}


# ── Settings ─────────────────────────────────────────────

@router.get("/settings")
@limiter.limit("100/minute")
async def get_settings(request: Request):
    return _state["settings"]


@router.put("/settings")
@limiter.limit("100/minute")
async def update_settings(request: Request, s: SettingsModel):
    for k, v in s.model_dump(exclude_none=True).items():
        _state["settings"][k] = v
    return _state["settings"]


# ── Machine Profiles ─────────────────────────────────────

@router.get("/profiles")
@limiter.limit("100/minute")
async def list_profiles(request: Request):
    return {
        "profiles": [{"id": p["id"], "name": p["name"]} for p in _profiles],
        "active_id": _state["active_profile_id"],
    }


@router.post("/profiles")
@limiter.limit("100/minute")
async def create_profile(request: Request, body: ProfileIn):
    global _profile_next_id
    profile = {
        "id": _profile_next_id,
        "name": body.name,
        "settings": copy.deepcopy(_state["settings"]),
    }
    _profile_next_id += 1
    _profiles.append(profile)
    _state["active_profile_id"] = profile["id"]
    return {"id": profile["id"], "name": profile["name"]}


@router.put("/profiles/{profile_id}")
@limiter.limit("100/minute")
async def rename_profile(request: Request, profile_id: int, body: ProfileIn):
    for p in _profiles:
        if p["id"] == profile_id:
            p["name"] = body.name
            return {"id": p["id"], "name": p["name"]}
    raise HTTPException(404, f"Profile {profile_id} not found")


@router.delete("/profiles/{profile_id}")
@limiter.limit("100/minute")
async def delete_profile(request: Request, profile_id: int):
    if len(_profiles) <= 1:
        raise HTTPException(400, "Cannot delete the last profile")
    idx = next((i for i, p in enumerate(_profiles) if p["id"] == profile_id), None)
    if idx is None:
        raise HTTPException(404, f"Profile {profile_id} not found")
    _profiles.pop(idx)
    if _state["active_profile_id"] == profile_id:
        _state["active_profile_id"] = _profiles[0]["id"]
        _state["settings"] = copy.deepcopy(_profiles[0]["settings"])
    return {"ok": True, "active_id": _state["active_profile_id"]}


@router.post("/profiles/{profile_id}/load")
@limiter.limit("100/minute")
async def load_profile(request: Request, profile_id: int):
    for p in _profiles:
        if p["id"] == profile_id:
            _state["settings"] = copy.deepcopy(p["settings"])
            _state["active_profile_id"] = profile_id
            return _state["settings"]
    raise HTTPException(404, f"Profile {profile_id} not found")


@router.post("/profiles/{profile_id}/save")
@limiter.limit("100/minute")
async def save_profile(request: Request, profile_id: int):
    for p in _profiles:
        if p["id"] == profile_id:
            p["settings"] = copy.deepcopy(_state["settings"])
            return {"ok": True, "id": p["id"], "name": p["name"]}
    raise HTTPException(404, f"Profile {profile_id} not found")


# ── Chip-load Calculator ─────────────────────────────────

@router.post("/calc-params")
@limiter.limit("100/minute")
async def calc_params(request: Request, req: CalcParamsRequest):
    return calc_t6_params(req.D, req.z, req.tool_type, req.pass_type, req.doc)


# ── Nesting ──────────────────────────────────────────────

@router.post("/nest")
@limiter.limit("10/minute")
async def nest(request: Request):
    if not _state["doors"]:
        raise HTTPException(400, "No parts to nest")

    s = _state["settings"]
    logger.info(f"Starting nesting for {len(_state['doors'])} doors")
    try:
        result = await run_in_threadpool(
            do_nesting,
            doors=_state["doors"],
            offcuts=_state["offcuts"],
            sheet_w=s["sheet_w"], sheet_h=s["sheet_h"],
            margin=s["margin"], kerf=s["kerf"],
            allow_rotation=s["allow_rotation"],
            small_part_threshold=s["small_part_threshold"],
            nesting_iterations=s.get("nesting_iterations", 100),
            sheet_grain=s.get("sheet_grain", "None"),
        )
        logger.info(f"Nesting complete. Generated {len(result.get('sheets', []))} sheets.")
    except Exception as e:
        logger.error(f"Nesting failed: {e}", exc_info=True)
        raise HTTPException(500, f"Nesting engine failed: {str(e)}")
    
    # Costing Estimation
    total_length_mm = 0
    frame_w = s.get("frame_w", 50.0)
    stepover = s.get("t6_dia", 12.7) * s.get("spiral_overlap", 0.5)
    
    for sht in result.get("sheets", []):
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
    
    sheet_count = len(result.get("sheets", []))
    sheet_cost = s.get("sheet_cost", 65.0)
    shop_rate = s.get("shop_rate", 85.0)
    
    total_material = sheet_count * sheet_cost
    total_labor = time_hours * shop_rate
    
    result["costing"] = {
        "sheet_count": sheet_count,
        "material_cost": round(total_material, 2),
        "machine_time_hours": round(time_hours, 3),
        "labor_cost": round(total_labor, 2),
        "total_estimate": round(total_material + total_labor, 2)
    }

    _state["nesting_result"] = result
    return result


@router.post("/update-nesting")
@limiter.limit("100/minute")
async def update_nesting(request: Request, payload: dict):
    _state["nesting_result"] = payload
    return {"ok": True}


# ── Labels ───────────────────────────────────────────────

from fastapi.responses import Response

@router.post("/labels/pdf")
@limiter.limit("10/minute")
def create_labels_pdf(request: Request, req: LabelRequest):
    logger.info(f"Generating PDF labels for order {req.order_id}")
    pdf_buffer = generate_labels_pdf(req, _state["settings"])
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=labels_{req.order_id}.pdf"}
    )

@router.get("/labels/pdf")
@limiter.limit("10/minute")
def create_labels_pdf_get(request: Request):
    order_id = _state["settings"].get("order_id", "")
    logger.info(f"Generating PDF labels (GET) for order {order_id}")
    req = LabelRequest(
        order_id=order_id,
        doors=_state["doors"]
    )
    pdf_buffer = generate_labels_pdf(req, _state["settings"])
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=labels_{order_id}.pdf"}
    )


# ── Cutting Map PDF ──────────────────────────────────────

from cutting_map import generate_cutting_map_pdf

@router.get("/cutting-map/pdf")
@limiter.limit("10/minute")
def create_cutting_map_pdf(request: Request):
    if not _state["nesting_result"] or not _state["nesting_result"]["sheets"]:
        raise HTTPException(400, "No nesting result. Run nesting first.")
    s = _state["settings"]
    order_id = s.get("order_id", "")
    logger.info(f"Generating Cutting Map PDF for order {order_id}")
    pdf_buffer = generate_cutting_map_pdf(
        sheets=_state["nesting_result"]["sheets"],
        sheets_meta=_state["nesting_result"]["sheets_meta"],
        mat_z=s["mat_z"], margin=s["margin"],
        order_id=order_id,
    )
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=CuttingMap_{order_id}.pdf"}
    )

# ── G-code Generation ────────────────────────────────────

@router.post("/generate-gcode")
@limiter.limit("10/minute")
async def generate_gcode(request: Request, req: GenerateRequest):
    nr = _state["nesting_result"]
    if not nr or not nr["sheets"]:
        raise HTTPException(400, "Run nesting first")

    s = _state["settings"]
    sheets = nr["sheets"]

    if req.sheet_index == -1:
        indices = list(range(len(sheets)))
    else:
        if req.sheet_index < 0 or req.sheet_index >= len(sheets):
            raise HTTPException(400, f"Invalid sheet index {req.sheet_index}")
        indices = [req.sheet_index]

    results = []
    logger.info(f"Starting G-code generation for {len(indices)} sheets")
    for idx in indices:
        meta = nr["sheets_meta"][idx]
        try:
            gcode = await run_in_threadpool(
                generate_gcode_for_sheet,
                sheet_doors=sheets[idx],
                sheet_idx=idx,
                total_sheets=len(sheets),
                sheet_w=meta["w"], sheet_h=meta["h"],
                mat_z=s["mat_z"], margin=s["margin"],
                frame_w=s["frame_w"],
                pocket_depth=s["pocket_depth"],
                pocket_depth2=s["pocket_depth2"],
                pocket_step_offset=s["pocket_step_offset"],
                chamfer_depth=s["chamfer_depth"],
                outer_chamfer_depth=s["outer_chamfer_depth"],
                rabbet_w=s["rabbet_w"],
                rabbet_d=s["rabbet_d"],
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
        except Exception as e:
            logger.error(f"G-code generation failed for sheet {idx}: {e}", exc_info=True)
            raise HTTPException(500, f"G-code generation failed: {str(e)}")
            
        line_count = len([l for l in gcode.split("\n") if l.strip() and not l.startswith("(")])
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

    return {"sheets": results}


# ── Include Routers ────────────────────────────────────────

app.include_router(public_router)
app.include_router(router)

# ── Static Files ─────────────────────────────────────────

# Mount the frontend dist directory to the root
# Note: In production, this folder will contain the built React app
dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")

@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    # This ensures that React Router works by serving index.html for unknown routes
    if os.path.exists(os.path.join(dist_path, "index.html")):
        return FileResponse(
            os.path.join(dist_path, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
        )
    return {"error": "Frontend not built or index.html missing"}

# ════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    # Use PORT environment variable if available (for Cloud Run)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
