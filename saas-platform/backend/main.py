"""
SuperShaker SaaS — FastAPI Backend
===================================
REST API for nesting and G-code generation using the real SuperShaker engine.
Run with: uvicorn main:app --reload --port 8000
"""
import copy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict

from engine import do_nesting, generate_gcode_for_sheet, calc_t6_params
from label_generator import generate_labels_pdf

# ════════════════════════════════════════════════════════════
#  FastAPI Application
# ════════════════════════════════════════════════════════════

app = FastAPI(
    title="SuperShaker SaaS API",
    description="CNC G-code generation & nesting engine API",
    version="0.2.0-beta",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
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
    "do_rough_pass": False, "allow_rotation": True,
    "small_part_threshold": 0.05,
    "t2_tool_t": "T2", "t2_spindle": 18000, "t2_feed": 6000,
    "t3_tool_t": "T3", "t3_spindle": 18000, "t3_feed": 8000,
    "t5_tool_t": "T5", "t5_spindle": 18000, "t5_feed": 8000,
    "order_id": "",
}

_state = {
    "doors": [],
    "next_id": 1,
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
    type: str = Field("Shaker", description="Shaker | Shaker Step | Slab")


class DoorOut(BaseModel):
    id: int
    w: float
    h: float
    qty: int
    type: str


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
    allow_rotation: Optional[bool] = None
    small_part_threshold: Optional[float] = None
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

class EdgeBanding(BaseModel):
    top: bool = False
    bottom: bool = False
    left: bool = False
    right: bool = False

class LabelRequest(BaseModel):
    order_id: str = ""
    doors: list[dict]
    edge_banding: Dict[str, EdgeBanding] = {}


# ════════════════════════════════════════════════════════════
#  Endpoints
# ════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0-beta"}


# ── Doors CRUD ───────────────────────────────────────────

@app.get("/doors")
async def list_doors():
    return _state["doors"]


@app.post("/doors")
async def add_door(door: DoorIn):
    d = {
        "id": _state["next_id"],
        "w": door.w, "h": door.h,
        "qty": door.qty, "type": door.type,
    }
    _state["next_id"] += 1
    _state["doors"].append(d)
    _state["nesting_result"] = None
    return d


@app.put("/doors/{door_id}")
async def update_door(door_id: int, door: DoorIn):
    for d in _state["doors"]:
        if d["id"] == door_id:
            d.update({"w": door.w, "h": door.h, "qty": door.qty, "type": door.type})
            _state["nesting_result"] = None
            return d
    raise HTTPException(404, f"Door {door_id} not found")


@app.delete("/doors/{door_id}")
async def delete_door(door_id: int):
    _state["doors"] = [d for d in _state["doors"] if d["id"] != door_id]
    _state["nesting_result"] = None
    return {"ok": True}


@app.delete("/doors")
async def clear_doors():
    _state["doors"] = []
    _state["next_id"] = 1
    _state["nesting_result"] = None
    return {"ok": True}


# ── Settings ─────────────────────────────────────────────

@app.get("/settings")
async def get_settings():
    return _state["settings"]


@app.put("/settings")
async def update_settings(s: SettingsModel):
    for k, v in s.model_dump(exclude_none=True).items():
        _state["settings"][k] = v
    return _state["settings"]


# ── Machine Profiles ─────────────────────────────────────

@app.get("/profiles")
async def list_profiles():
    return {
        "profiles": [{"id": p["id"], "name": p["name"]} for p in _profiles],
        "active_id": _state["active_profile_id"],
    }


@app.post("/profiles")
async def create_profile(body: ProfileIn):
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


@app.put("/profiles/{profile_id}")
async def rename_profile(profile_id: int, body: ProfileIn):
    for p in _profiles:
        if p["id"] == profile_id:
            p["name"] = body.name
            return {"id": p["id"], "name": p["name"]}
    raise HTTPException(404, f"Profile {profile_id} not found")


@app.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: int):
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


@app.post("/profiles/{profile_id}/load")
async def load_profile(profile_id: int):
    for p in _profiles:
        if p["id"] == profile_id:
            _state["settings"] = copy.deepcopy(p["settings"])
            _state["active_profile_id"] = profile_id
            return _state["settings"]
    raise HTTPException(404, f"Profile {profile_id} not found")


@app.post("/profiles/{profile_id}/save")
async def save_profile(profile_id: int):
    for p in _profiles:
        if p["id"] == profile_id:
            p["settings"] = copy.deepcopy(_state["settings"])
            return {"ok": True, "id": p["id"], "name": p["name"]}
    raise HTTPException(404, f"Profile {profile_id} not found")


# ── Chip-load Calculator ─────────────────────────────────

@app.post("/calc-params")
async def calc_params(req: CalcParamsRequest):
    return calc_t6_params(req.D, req.z, req.tool_type, req.pass_type, req.doc)


# ── Nesting ──────────────────────────────────────────────

@app.post("/nest")
async def nest():
    if not _state["doors"]:
        raise HTTPException(400, "No parts to nest")

    s = _state["settings"]
    result = do_nesting(
        doors=_state["doors"],
        sheet_w=s["sheet_w"], sheet_h=s["sheet_h"],
        margin=s["margin"], kerf=s["kerf"],
        allow_rotation=s["allow_rotation"],
        small_part_threshold=s["small_part_threshold"],
    )
    _state["nesting_result"] = result
    return result


# ── Labels ───────────────────────────────────────────────

from fastapi.responses import Response

@app.post("/labels/pdf")
async def create_labels_pdf(req: LabelRequest):
    pdf_buffer = generate_labels_pdf(req)
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=labels_{req.order_id}.pdf"}
    )

@app.get("/labels/pdf")
async def create_labels_pdf_get():
    order_id = _state["settings"].get("order_id", "")
    req = LabelRequest(
        order_id=order_id,
        doors=_state["doors"],
        edge_banding={}
    )
    pdf_buffer = generate_labels_pdf(req)
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=labels_{order_id}.pdf"}
    )


# ── G-code Generation ────────────────────────────────────

@app.post("/generate-gcode")
async def generate_gcode(req: GenerateRequest):
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
    for idx in indices:
        gcode = generate_gcode_for_sheet(
            sheet_doors=sheets[idx],
            sheet_idx=idx,
            total_sheets=len(sheets),
            sheet_w=s["sheet_w"], sheet_h=s["sheet_h"],
            mat_z=s["mat_z"], margin=s["margin"],
            frame_w=s["frame_w"],
            pocket_depth=s["pocket_depth"],
            pocket_depth2=s["pocket_depth2"],
            pocket_step_offset=s["pocket_step_offset"],
            chamfer_depth=s["chamfer_depth"],
            outer_chamfer_depth=s["outer_chamfer_depth"],
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
        line_count = len([l for l in gcode.split("\n") if l.strip() and not l.startswith("(")])
        results.append({
            "sheet_index": idx,
            "gcode": gcode,
            "stats": {
                "line_count": line_count,
                "parts_on_sheet": len(sheets[idx]),
                "sheet_w": s["sheet_w"],
                "sheet_h": s["sheet_h"],
            },
        })

    return {"sheets": results}


# ════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
