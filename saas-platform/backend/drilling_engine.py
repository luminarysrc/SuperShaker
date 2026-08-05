"""
drilling_engine.py — Smart Drilling Module
===========================================
Generates hole coordinates for:
  1. IKEA MAXIMERA drawer boxes (fixed-pitch template, auto-mirrored)
  2. IKEA SEKTION facade hinges (dynamic, 31.75 mm grid)
  3. Dowel (шкант) holes for facade installation (8 mm dia)

All coordinates are in mm relative to the BOTTOM-LEFT corner of the facade
(CNC origin = bottom-left, X right, Y up).

Output format per hole:
  { "x": float, "y": float, "d": float, "depth": float, "type": str }
"""

from __future__ import annotations
import math
from ikea_geometry import (
    sektion_hinge_positions,
    reveal_to_drilling_offset,
    DEFAULT_REVEALS,
    SEKTION_PITCH_MM,
)

# ─────────────────────────────────────────────────────────
#  MAXIMERA Drawer Runner Templates
# ─────────────────────────────────────────────────────────
# Coordinates are (x_from_left, y_from_bottom) for the LEFT side mounting holes.
# Right side is auto-mirrored: x_right = panel_width - x_left
# Y reference: from facade bottom edge.
#
# Source: IKEA MAXIMERA mounting instruction (article 602.046.32, 702.046.31, 802.046.30)
# Pitch along Y: 32 mm (Blum Tandem standard); IKEA uses a 19 mm sub-pitch for the
# runner side-mount holes.
#
# NOTE: If you have the official IKEA mounting sheet, replace these with exact values.
# These are industry-standard approximations for MAXIMERA / METOD 2-runner system.

MAXIMERA_HOLE_DIA = 5.0     # mm — runner mounting screw hole
MAXIMERA_HOLE_DEPTH = 12.0  # mm — blind hole depth

MAXIMERA_TEMPLATES: dict[str, dict] = {
    # ── IKEA MAXIMERA official mounting positions ──────────────────────────────
    # Source: IKEA instruction sheet 602.046.32 / 702.046.31 / 802.046.30
    # The drawer front mounting clip (IKEA part 109947) attaches to the facade
    # via two screws. The clips sit on the top rail of the drawer box body.
    #
    # Hole positions: X = 37 mm from left/right edge of facade
    #                 Y = measured from BOTTOM of facade
    # Y positions follow a 19 mm pitch sub-grid (IKEA METOD system).
    # The first hole is at 37 mm from bottom (clip top rail ref + reveal offset).
    # Second hole (same clip) is 19 mm above first.
    #
    # TODO: Replace with exact coordinates from physical IKEA mounting sheet
    #       when official PDF is available. Current values based on IKEA METOD
    #       system specification and field measurements.

    # Low drawer — MAXIMERA LOW (body height 100 mm)
    # Single mounting level, 2 holes per clip × 2 sides = 4 holes total
    "low": {
        "runner_y_from_bottom": [37.0, 56.0],   # first clip Y positions (from facade bottom)
        "runner_x_from_edge": 37.0,              # IKEA standard: 37 mm from facade edge
        "pitch": 19.0,
        "description": "MAXIMERA Low — body 100 mm (IKEA 602.046.32)",
    },

    # Medium drawer — MAXIMERA MEDIUM (body height 200 mm)
    # Two clips per side at 19 mm pitch
    "medium": {
        "runner_y_from_bottom": [37.0, 56.0, 75.0, 94.0],
        "runner_x_from_edge": 37.0,
        "pitch": 19.0,
        "description": "MAXIMERA Medium — body 200 mm (IKEA 702.046.31)",
    },

    # High drawer — MAXIMERA HIGH (body height 300 mm)
    # Three clip positions per side
    "high": {
        "runner_y_from_bottom": [37.0, 56.0, 75.0, 94.0, 113.0, 132.0],
        "runner_x_from_edge": 37.0,
        "pitch": 19.0,
        "description": "MAXIMERA High — body 300 mm (IKEA 802.046.30)",
    },
}


def maximera_holes(
    facade_width_mm: float,
    facade_height_mm: float,
    drawer_size: str = "medium",
    reveals: dict | None = None,
) -> list[dict]:
    """
    Generate MAXIMERA runner mounting holes for a drawer facade.

    Holes are generated symmetrically on left and right sides.
    Y positions are adjusted by the bottom reveal offset.

    Parameters
    ----------
    facade_width_mm : float    CNC-finished facade width
    facade_height_mm : float   CNC-finished facade height
    drawer_size : str          "low" | "medium" | "high"
    reveals : dict | None      Reveal offsets (see ikea_geometry.DEFAULT_REVEALS)

    Returns
    -------
    list[dict] — list of hole dicts with x, y, d, depth, type
    """
    tmpl = MAXIMERA_TEMPLATES.get(drawer_size, MAXIMERA_TEMPLATES["medium"])
    offsets = reveal_to_drilling_offset(reveals)
    y_base_offset = offsets["offset_y"]   # shifts the whole grid down by reveal_top
    x_inset = tmpl["runner_x_from_edge"]

    holes = []
    for y_raw in tmpl["runner_y_from_bottom"]:
        y = round(y_raw + y_base_offset, 3)
        if y <= 0 or y >= facade_height_mm:
            continue  # Skip out-of-bounds holes

        # Left side hole
        holes.append({
            "x": round(x_inset, 3),
            "y": y,
            "d": MAXIMERA_HOLE_DIA,
            "depth": MAXIMERA_HOLE_DEPTH,
            "type": "maximera_left",
        })
        # Right side — mirrored
        holes.append({
            "x": round(facade_width_mm - x_inset, 3),
            "y": y,
            "d": MAXIMERA_HOLE_DIA,
            "depth": MAXIMERA_HOLE_DEPTH,
            "type": "maximera_right",
        })

    return holes


# ─────────────────────────────────────────────────────────
#  SEKTION Hinge Holes
# ─────────────────────────────────────────────────────────

HINGE_CUP_DIA = 35.0       # mm — standard Blum/IKEA hinge cup bore
HINGE_CUP_DEPTH = 13.0     # mm — hinge cup bore depth
HINGE_CUP_X_FROM_EDGE = 22.5  # mm — cup center from facade edge (Blum standard)

HINGE_MOUNTING_DIA = 5.0   # mm — hinge plate screw holes
HINGE_MOUNTING_DEPTH = 12.0
HINGE_MOUNTING_OFFSET_Y = 37.0  # mm — distance from cup center to plate screw hole (vertical)
HINGE_MOUNTING_OFFSET_X = 0.0   # mm — horizontal offset of screw from cup center


def sektion_hinge_holes(
    facade_width_mm: float,
    facade_height_mm: float,
    hinge_side: str = "left",      # "left" | "right"
    reveals: dict | None = None,
    num_hinges: int | None = None,
) -> list[dict]:
    """
    Generate SEKTION hinge cup and mounting holes for a door facade.

    Parameters
    ----------
    facade_width_mm : float    CNC-finished facade width
    facade_height_mm : float   CNC-finished facade height
    hinge_side : str           Which side the hinges mount on ("left" or "right")
    reveals : dict | None      Reveal settings
    num_hinges : int | None    Auto-calculated if None

    Returns
    -------
    list[dict] — hole list
    """
    if reveals is None:
        reveals = DEFAULT_REVEALS

    reveal_top = reveals.get("top", DEFAULT_REVEALS["top"])
    reveal_bottom = reveals.get("bottom", DEFAULT_REVEALS["bottom"])

    # Get Y positions (from bottom of facade)
    hinge_y_positions = sektion_hinge_positions(
        facade_height_mm=facade_height_mm,
        reveal_top_mm=reveal_top,
        reveal_bottom_mm=reveal_bottom,
        num_hinges=num_hinges,
    )

    # X position of hinge cup center
    if hinge_side == "left":
        cup_x = HINGE_CUP_X_FROM_EDGE
        mounting_x = cup_x + HINGE_MOUNTING_OFFSET_X
    else:
        cup_x = facade_width_mm - HINGE_CUP_X_FROM_EDGE
        mounting_x = cup_x - HINGE_MOUNTING_OFFSET_X

    holes = []
    for y_cup in hinge_y_positions:
        # Main hinge cup bore (large diameter)
        holes.append({
            "x": round(cup_x, 3),
            "y": round(y_cup, 3),
            "d": HINGE_CUP_DIA,
            "depth": HINGE_CUP_DEPTH,
            "type": "hinge_cup",
        })
        # Mounting plate screw hole (above cup center)
        y_mount = y_cup + HINGE_MOUNTING_OFFSET_Y
        if 0 < y_mount < facade_height_mm:
            holes.append({
                "x": round(mounting_x, 3),
                "y": round(y_mount, 3),
                "d": HINGE_MOUNTING_DIA,
                "depth": HINGE_MOUNTING_DEPTH,
                "type": "hinge_mount",
            })

    return holes


# ─────────────────────────────────────────────────────────
#  Dowel (Шкант) Holes — 8 mm
# ─────────────────────────────────────────────────────────

DOWEL_DIA = 8.0
DOWEL_DEPTH = 15.0

def dowel_holes(
    facade_width_mm: float,
    facade_height_mm: float,
    reveals: dict | None = None,
    pitch_mm: float = SEKTION_PITCH_MM,
) -> list[dict]:
    """
    Generate 8 mm dowel hole positions on the SEKTION grid.
    Dowels help align the facade during installation.

    Two dowels per facade: at top-center and bottom-center,
    snapped to the nearest 31.75 mm grid row.
    """
    if reveals is None:
        reveals = DEFAULT_REVEALS

    cx = round(facade_width_mm / 2.0, 3)

    # Bottom dowel: first grid row above bottom inset
    bottom_y_raw = reveals.get("bottom", DEFAULT_REVEALS["bottom"]) + 20.0
    bottom_row = math.ceil(bottom_y_raw / pitch_mm)
    bottom_y = round(bottom_row * pitch_mm, 3)

    # Top dowel: last grid row below top inset
    top_y_raw = facade_height_mm - reveals.get("top", DEFAULT_REVEALS["top"]) - 20.0
    top_row = math.floor(top_y_raw / pitch_mm)
    top_y = round(top_row * pitch_mm, 3)

    holes = []
    for y in sorted({bottom_y, top_y}):
        if 0 < y < facade_height_mm:
            holes.append({
                "x": cx,
                "y": y,
                "d": DOWEL_DIA,
                "depth": DOWEL_DEPTH,
                "type": "dowel",
            })
    return holes


# ─────────────────────────────────────────────────────────
#  Master Drilling Plan Generator
# ─────────────────────────────────────────────────────────

def generate_drilling_plan(
    part: dict,
    template: str = "sektion_door",
    reveals: dict | None = None,
    drawer_size: str = "medium",
    hinge_side: str = "left",
    num_hinges: int | None = None,
    include_dowels: bool = True,
) -> list[dict]:
    """
    Generate a complete drilling plan for a facade part.

    Parameters
    ----------
    part : dict          Must have: w (mm), h (mm), skip_drilling (bool)
    template : str       "sektion_door" | "maximera_drawer" | "none"
    reveals : dict       Reveal settings
    drawer_size : str    For maximera: "low" | "medium" | "high"
    hinge_side : str     For sektion_door: "left" | "right"
    num_hinges : int     Override auto hinge count
    include_dowels : bool  Add dowel holes

    Returns
    -------
    list[dict] — all holes for this part, empty if skip_drilling=True
    """
    if part.get("skip_drilling", False):
        return []

    w = part["w"]
    h = part["h"]
    holes = []

    if template == "sektion_door":
        holes.extend(sektion_hinge_holes(
            facade_width_mm=w,
            facade_height_mm=h,
            hinge_side=hinge_side,
            reveals=reveals,
            num_hinges=num_hinges,
        ))
        if include_dowels:
            holes.extend(dowel_holes(w, h, reveals))

    elif template == "maximera_drawer":
        holes.extend(maximera_holes(
            facade_width_mm=w,
            facade_height_mm=h,
            drawer_size=drawer_size,
            reveals=reveals,
        ))

    elif template == "none":
        holes = []

    return holes


# ─────────────────────────────────────────────────────────
#  G-code Generator for Drilling OP
# ─────────────────────────────────────────────────────────

def drilling_holes_to_gcode(
    holes: list[dict],
    part_x_offset: float,
    part_y_offset: float,
    mat_z: float,
    drill_tool: str = "T4",
    drill_spindle: int = 18000,
    drill_feed: int = 1500,
    z_safe: float = 30.0,
    peck_depth: float = 5.0,    # mm per peck (chip clearing)
) -> list[str]:
    """
    Generate G-code lines for a set of drilling holes.

    The hole coordinates are LOCAL to the facade (bottom-left = 0,0).
    Part offsets (from nesting) are added to get sheet coordinates.

    Parameters
    ----------
    holes : list[dict]      Holes with x, y, d, depth, type
    part_x_offset : float   Part X position on sheet (from nesting)
    part_y_offset : float   Part Y position on sheet
    mat_z : float           Material top surface Z
    drill_tool : str        Tool ID (e.g. "T4")
    drill_spindle : int     Spindle RPM
    drill_feed : int        Plunge feed rate (mm/min)
    z_safe : float          Z safe height for rapid moves
    peck_depth : float      Depth per peck cycle (G83 Q parameter)

    Returns
    -------
    list[str] — G-code lines (NO header/footer, just the hole cycles)
    """
    if not holes:
        return []

    cl = []
    cl.append(f"({drill_tool} DRILLING — {len(holes)} holes)")
    cl.append(f"{drill_tool} M6")
    cl.append(f"S{drill_spindle} M3")
    cl.append(f"G0 Z{z_safe}")

    for h in holes:
        abs_x = round(part_x_offset + h["x"], 3)
        abs_y = round(part_y_offset + h["y"], 3)
        z_bottom = round(mat_z - h["depth"], 3)
        z_top_surface = mat_z

        cl.append(f"(Hole type={h['type']} d={h['d']}mm depth={h['depth']}mm)")
        cl.append(f"G0 X{abs_x:.3f} Y{abs_y:.3f}")
        cl.append(f"G0 Z{z_top_surface + 2.0:.3f}")

        if peck_depth and h["depth"] > peck_depth:
            # G83 peck drilling cycle
            cl.append(f"G83 Z{z_bottom:.3f} Q{peck_depth:.3f} F{drill_feed} R{z_top_surface + 0.5:.3f}")
            cl.append("G80")
        else:
            # Simple G1 plunge
            cl.append(f"G1 Z{z_bottom:.3f} F{drill_feed}")
            cl.append(f"G0 Z{z_safe}")

    cl.append(f"G0 Z{z_safe}")
    return cl
