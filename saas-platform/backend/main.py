"""
SuperShaker SaaS — FastAPI Backend
===================================
This is the REST API bridge between the React frontend and
the proprietary Python CNC/G-code engine.

Run with:
    uvicorn main:app --reload --port 8000
"""

import math
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ──────────────────────────────────────────────────────────────────────
# TODO: INTEGRATE CORE HERE
# ──────────────────────────────────────────────────────────────────────
# When you're ready to plug in your real engine, uncomment the import
# below and replace the mock functions in this file:
#
#   import sys
#   sys.path.insert(0, "/path/to/supershaker_core")
#   from supershaker_core.nesting import MaxRectsPacker, do_nesting
#   from supershaker_core.gcode_generator import generate_gcode
#   from supershaker_core.chipload import calc_t6_params
#
# Each endpoint below has a "# TODO: INTEGRATE CORE HERE" comment
# indicating exactly where the mock should be replaced.
# ──────────────────────────────────────────────────────────────────────


# ════════════════════════════════════════════════════════════════════════
#  FastAPI Application Setup
# ════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="SuperShaker SaaS API",
    description="CNC G-code generation & nesting engine API",
    version="0.1.0-beta",
)

# Allow the React dev server (localhost:5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # Alternative dev port
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════════════════
#  Pydantic Models (Request / Response schemas)
# ════════════════════════════════════════════════════════════════════════

class GcodeRequest(BaseModel):
    """Parameters the frontend sends to generate G-code."""
    width: float = Field(100.0, description="Part width in mm")
    height: float = Field(100.0, description="Part height in mm")
    depth: float = Field(3.0, description="Pocket depth in mm")
    tool_diameter: float = Field(6.0, description="Tool diameter in mm")
    feed_rate: int = Field(6000, description="Feed rate in mm/min")
    spindle_rpm: int = Field(18000, description="Spindle speed in RPM")
    pattern: str = Field("spiral", description="Toolpath pattern: 'spiral', 'square', or 'pocket'")


class GcodeResponse(BaseModel):
    """The generated G-code returned to the frontend."""
    gcode: str
    stats: dict


class NestingRequest(BaseModel):
    """Parts + sheet params for nesting."""
    sheet_width: float = Field(1245.0, description="Sheet width in mm")
    sheet_height: float = Field(2466.0, description="Sheet height in mm")
    parts: list[dict] = Field(
        default=[{"width": 400, "height": 600, "qty": 4}],
        description="List of parts with width, height, qty",
    )


class NestingResponse(BaseModel):
    """Nesting result with placements."""
    sheets: list[list[dict]]
    total_sheets: int
    yield_percentage: float


# ════════════════════════════════════════════════════════════════════════
#  Mock G-code Generation Functions
# ════════════════════════════════════════════════════════════════════════
# These mocks produce valid G-code for demonstration.
# Replace them with calls to your proprietary engine.

def _mock_generate_spiral(width: float, height: float, depth: float,
                          tool_dia: float, feed: int, rpm: int) -> str:
    """
    Generate a spiral pocket toolpath (mock).

    # ──────────────────────────────────────────────────────────────
    # TODO: INTEGRATE CORE HERE
    # Replace this entire function body with:
    #
    #   from supershaker_core.gcode_generator import generate_gcode
    #   result = generate_gcode(
    #       parts=[...],
    #       sheet_config={...},
    #       tool_config={...},
    #   )
    #   return "\n".join(result)
    # ──────────────────────────────────────────────────────────────
    """
    lines = []
    lines.append("(SuperShaker SaaS — Generated G-code)")
    lines.append(f"(Pattern: Spiral  Part: {width}x{height}mm  Depth: {depth}mm)")
    lines.append(f"(Tool: D{tool_dia}mm  RPM: {rpm}  Feed: {feed}mm/min)")
    lines.append("G21 G90 G17 G40 G80")
    lines.append(f"S{rpm} M3")
    lines.append("G0 Z30.0")

    # Generate an inward rectangular spiral
    step = tool_dia * 0.5  # 50% stepover
    z_safe = 5.0
    cx, cy = width / 2, height / 2  # center
    margin = tool_dia / 2

    x_min, x_max = margin, width - margin
    y_min, y_max = margin, height - margin

    # Ramp entry
    lines.append(f"G0 X{x_min:.3f} Y{y_min:.3f}")
    lines.append(f"G0 Z{z_safe:.1f}")
    ramp_end_x = min(x_min + 60.0, x_max)
    lines.append(f"G1 X{ramp_end_x:.3f} Z{-depth:.3f} F800")
    lines.append(f"G1 X{x_min:.3f} F{feed}")

    # Spiral inward
    layer = 0
    while x_min < x_max and y_min < y_max:
        lines.append(f"G1 X{x_max:.3f} F{feed}")
        lines.append(f"G1 Y{y_max:.3f}")
        lines.append(f"G1 X{x_min:.3f}")
        lines.append(f"G1 Y{y_min:.3f}")
        x_min += step
        x_max -= step
        y_min += step
        y_max -= step
        layer += 1

    # Retract and end
    lines.append("G0 Z30.0")
    lines.append("G0 X0.000 Y0.000")
    lines.append("M5")
    lines.append("M30")
    lines.append("%")

    return "\n".join(lines)


def _mock_generate_square(width: float, height: float, depth: float,
                          tool_dia: float, feed: int, rpm: int) -> str:
    """
    Generate a simple contour (outline cut) toolpath (mock).

    # ──────────────────────────────────────────────────────────────
    # TODO: INTEGRATE CORE HERE
    # Same pattern — replace body with proprietary core call.
    # ──────────────────────────────────────────────────────────────
    """
    r = tool_dia / 2  # tool radius compensation
    lines = []
    lines.append("(SuperShaker SaaS — Generated G-code)")
    lines.append(f"(Pattern: Square Contour  Part: {width}x{height}mm)")
    lines.append("G21 G90 G17 G40 G80")
    lines.append(f"S{rpm} M3")
    lines.append("G0 Z30.0")

    # Move to start (bottom-left corner with offset)
    x0, y0 = -r, -r
    x1, y1 = width + r, height + r

    lines.append(f"G0 X{x0:.3f} Y{y0:.3f}")
    lines.append("G0 Z2.0")
    lines.append(f"G1 Z{-depth:.3f} F400")  # plunge

    # CW contour
    lines.append(f"G1 X{x1:.3f} F{feed}")
    lines.append(f"G1 Y{y1:.3f}")
    lines.append(f"G1 X{x0:.3f}")
    lines.append(f"G1 Y{y0:.3f}")

    # Retract
    lines.append("G0 Z30.0")
    lines.append("M5")
    lines.append("M30")
    lines.append("%")

    return "\n".join(lines)


def _mock_generate_pocket(width: float, height: float, depth: float,
                          tool_dia: float, feed: int, rpm: int) -> str:
    """
    Generate a snake/zigzag pocket toolpath (mock).

    # ──────────────────────────────────────────────────────────────
    # TODO: INTEGRATE CORE HERE
    # Replace with: supershaker_core.gcode_generator.generate_gcode(...)
    # ──────────────────────────────────────────────────────────────
    """
    step = tool_dia * 0.5
    margin = tool_dia / 2
    lines = []
    lines.append("(SuperShaker SaaS — Generated G-code)")
    lines.append(f"(Pattern: Pocket Snake  Part: {width}x{height}mm)")
    lines.append("G21 G90 G17 G40 G80")
    lines.append(f"S{rpm} M3")
    lines.append("G0 Z30.0")

    x_min, x_max = margin, width - margin
    y_min, y_max = margin, height - margin

    # Ramp entry
    lines.append(f"G0 X{x_min:.3f} Y{y_min:.3f}")
    lines.append("G0 Z5.0")
    ramp_x = min(x_min + 60.0, x_max)
    lines.append(f"G1 X{ramp_x:.3f} Z{-depth:.3f} F800")
    lines.append(f"G1 X{x_min:.3f} F{feed}")

    # Zigzag fill
    cur_y = y_min
    direction = 1
    while cur_y <= y_max:
        if direction == 1:
            lines.append(f"G1 X{x_max:.3f} F{feed}")
        else:
            lines.append(f"G1 X{x_min:.3f} F{feed}")
        next_y = min(cur_y + step, y_max)
        if next_y > cur_y:
            lines.append(f"G1 Y{next_y:.3f}")
        cur_y = next_y + 0.001  # avoid infinite loop
        direction *= -1

    # Contour finish pass
    lines.append(f"G0 Z2.0")
    lines.append(f"G0 X{x_min:.3f} Y{y_min:.3f}")
    lines.append(f"G1 Z{-depth:.3f} F800")
    lines.append(f"G1 X{x_max:.3f} F{feed}")
    lines.append(f"G1 Y{y_max:.3f}")
    lines.append(f"G1 X{x_min:.3f}")
    lines.append(f"G1 Y{y_min:.3f}")

    lines.append("G0 Z30.0")
    lines.append("M5")
    lines.append("M30")
    lines.append("%")

    return "\n".join(lines)


def _mock_nesting(sheet_w, sheet_h, parts):
    """
    Simple row-based nesting mock.

    # ──────────────────────────────────────────────────────────────
    # TODO: INTEGRATE CORE HERE
    # Replace with:
    #   from supershaker_core.nesting import MaxRectsPacker, do_nesting
    #   result = do_nesting(sheet_w, sheet_h, parts, margin=10, kerf=6)
    #   return result.sheets, result.yield_pct
    # ──────────────────────────────────────────────────────────────
    """
    margin = 10
    sheets = []
    current_sheet = []
    cur_x, cur_y = margin, margin
    row_h = 0

    for part in parts:
        for _ in range(part.get("qty", 1)):
            pw, ph = part["width"], part["height"]
            if cur_x + pw + margin > sheet_w:
                cur_x = margin
                cur_y += row_h + margin
                row_h = 0
            if cur_y + ph + margin > sheet_h:
                sheets.append(current_sheet)
                current_sheet = []
                cur_x, cur_y = margin, margin
                row_h = 0
            current_sheet.append({
                "x": cur_x, "y": cur_y,
                "width": pw, "height": ph,
            })
            cur_x += pw + margin
            row_h = max(row_h, ph)

    if current_sheet:
        sheets.append(current_sheet)

    total_part_area = sum(p["width"] * p["height"] for s in sheets for p in s)
    total_sheet_area = len(sheets) * sheet_w * sheet_h
    yield_pct = (total_part_area / total_sheet_area * 100) if total_sheet_area else 0

    return sheets, yield_pct


# ════════════════════════════════════════════════════════════════════════
#  API Endpoints
# ════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Simple health check for monitoring."""
    return {"status": "ok", "version": "0.1.0-beta"}


@app.post("/generate-gcode", response_model=GcodeResponse)
async def generate_gcode(req: GcodeRequest):
    """
    Generate G-code for a given part and toolpath pattern.

    # ──────────────────────────────────────────────────────────────
    # TODO: INTEGRATE CORE HERE
    # This endpoint is the main bridge. To integrate your core:
    #
    # 1. Import your extracted Python core library
    # 2. Map the request params into your core's expected format
    # 3. Call your engine (e.g., generate_gcode(...))
    # 4. Return the G-code string + stats
    #
    # For async heavy computation, consider using:
    #   from fastapi import BackgroundTasks
    #   or a Redis-based task queue (ARQ / Celery)
    # ──────────────────────────────────────────────────────────────
    """
    generators = {
        "spiral": _mock_generate_spiral,
        "square": _mock_generate_square,
        "pocket": _mock_generate_pocket,
    }

    gen_func = generators.get(req.pattern)
    if not gen_func:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown pattern '{req.pattern}'. Use: {list(generators.keys())}",
        )

    gcode = gen_func(
        width=req.width,
        height=req.height,
        depth=req.depth,
        tool_dia=req.tool_diameter,
        feed=req.feed_rate,
        rpm=req.spindle_rpm,
    )

    line_count = len([l for l in gcode.split("\n") if l.strip() and not l.startswith("(")])
    stats = {
        "pattern": req.pattern,
        "line_count": line_count,
        "part_size": f"{req.width}x{req.height}mm",
        "tool": f"D{req.tool_diameter}mm",
        "estimated_time_min": round(line_count * 0.002, 1),  # rough estimate
    }

    return GcodeResponse(gcode=gcode, stats=stats)


@app.post("/nest", response_model=NestingResponse)
async def nest_parts(req: NestingRequest):
    """
    Run nesting algorithm on a list of parts.

    # ──────────────────────────────────────────────────────────────
    # TODO: INTEGRATE CORE HERE
    # Replace _mock_nesting() with your MaxRectsPacker-based nesting
    # from supershaker_core.nesting
    # ──────────────────────────────────────────────────────────────
    """
    sheets, yield_pct = _mock_nesting(req.sheet_width, req.sheet_height, req.parts)

    return NestingResponse(
        sheets=sheets,
        total_sheets=len(sheets),
        yield_percentage=round(yield_pct, 1),
    )


# ════════════════════════════════════════════════════════════════════════
#  Run directly with: python main.py
# ════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
