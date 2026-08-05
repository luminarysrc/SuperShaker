"""
ikea_geometry.py — IKEA Kitchen Planner geometry conversion
=============================================================
Converts IKEA nominal (cabinet opening) dimensions to CNC-ready
finished part sizes, accounting for:
  • 1/8" (3.175 mm) standard gap on each side
  • Edge banding thickness
  • Fuging (jointing) allowance

Also handles:
  • Drawer width alignment (over two doors)
  • SEKTION reveals (facade offset from frame holes)
"""

from __future__ import annotations
import math

# ─────────────────────────────────────────────────────────
#  Constants
# ─────────────────────────────────────────────────────────

INCH_TO_MM = 25.4

# Standard IKEA gap between facade and adjacent facade / cabinet edge
# 1/8" per side = 3.175 mm per side, total 6.35 mm per dimension
IKEA_GAP_EACH_SIDE_MM = 25.4 / 8          # 3.175 mm
IKEA_GAP_TOTAL_MM = IKEA_GAP_EACH_SIDE_MM * 2   # 6.35 mm

# SEKTION/AXSTAD system hole pitch (1¼" = 31.75 mm)
SEKTION_PITCH_MM = 31.75


# ─────────────────────────────────────────────────────────
#  Default reveal configuration (IKEA standard)
# ─────────────────────────────────────────────────────────

DEFAULT_REVEALS = {
    "top":    1.5,    # mm — gap between top of facade and cabinet top rail
    "bottom": 1.5,    # mm — gap between bottom of facade and cabinet bottom rail
    "left":   2.0,    # mm — gap on left side
    "right":  2.0,    # mm — gap on right side
}


# ─────────────────────────────────────────────────────────
#  Core Size Conversion
# ─────────────────────────────────────────────────────────

def nominal_to_cnc(
    nominal_w_mm: float,
    nominal_h_mm: float,
    edge_thickness_mm: float = 0.4,
    fuging_allowance_mm: float = 0.0,
    gap_each_side_mm: float = IKEA_GAP_EACH_SIDE_MM,
) -> dict:
    """
    Convert IKEA nominal (opening) size to finished CNC part size.

    Formula per dimension:
        CNC = Nominal - (gap_each_side * 2) - (edge_thickness * 2) + (fuging_allowance * 2)

    The edge banding is applied to both W and H (all 4 sides typically banded).
    Fuging allowance adds material back (the jointer removes a sliver, so the
    blank must be slightly oversized).

    Parameters
    ----------
    nominal_w_mm : float   Width of cabinet opening (mm)
    nominal_h_mm : float   Height of cabinet opening (mm)
    edge_thickness_mm : float  Edge band thickness applied per side (mm)
    fuging_allowance_mm : float  Extra material per side for jointing (mm)
    gap_each_side_mm : float  Gap per side (default 3.175 mm = 1/8")

    Returns
    -------
    dict with keys: cnc_w, cnc_h, nominal_w, nominal_h, reductions
    """
    reduction_w = (gap_each_side_mm * 2) + (edge_thickness_mm * 2) - (fuging_allowance_mm * 2)
    reduction_h = (gap_each_side_mm * 2) + (edge_thickness_mm * 2) - (fuging_allowance_mm * 2)

    cnc_w = round(nominal_w_mm - reduction_w, 1)
    cnc_h = round(nominal_h_mm - reduction_h, 1)

    return {
        "cnc_w": max(cnc_w, 0.0),
        "cnc_h": max(cnc_h, 0.0),
        "nominal_w": nominal_w_mm,
        "nominal_h": nominal_h_mm,
        "reduction_per_dim": round(reduction_w, 3),
        "gap_each_side": gap_each_side_mm,
        "edge_thickness": edge_thickness_mm,
        "fuging_allowance": fuging_allowance_mm,
    }


def nominal_inches_to_cnc(
    nominal_w_in: float,
    nominal_h_in: float,
    edge_thickness_mm: float = 0.4,
    fuging_allowance_mm: float = 0.0,
) -> dict:
    """Convenience wrapper accepting nominal size in inches."""
    return nominal_to_cnc(
        nominal_w_mm=nominal_w_in * INCH_TO_MM,
        nominal_h_mm=nominal_h_in * INCH_TO_MM,
        edge_thickness_mm=edge_thickness_mm,
        fuging_allowance_mm=fuging_allowance_mm,
    )


# ─────────────────────────────────────────────────────────
#  Drawer Width Alignment
# ─────────────────────────────────────────────────────────

def align_drawer_width(
    door_widths_mm: list[float],
    middle_stile_mm: float = 3.0,
) -> float:
    """
    Calculate drawer width for a drawer spanning multiple door openings.

    IKEA rule: when a drawer is above 2 doors, its width equals the sum
    of the two door facade widths plus the middle stile (divider panel) width.

    Parameters
    ----------
    door_widths_mm : list[float]  Finished CNC widths of the doors below the drawer
    middle_stile_mm : float       Width of the cabinet divider between doors (mm)

    Returns
    -------
    float — finished drawer facade width (mm)
    """
    if not door_widths_mm:
        raise ValueError("door_widths_mm must not be empty")
    if len(door_widths_mm) == 1:
        return door_widths_mm[0]
    # Sum of door widths + (n-1) stile gaps
    total = sum(door_widths_mm) + (len(door_widths_mm) - 1) * middle_stile_mm
    return round(total, 1)


# ─────────────────────────────────────────────────────────
#  Reveals → Drilling Grid Offset
# ─────────────────────────────────────────────────────────

def reveal_to_drilling_offset(reveals: dict | None = None) -> dict:
    """
    Convert facade reveal values to drilling grid offsets.

    The SEKTION frame has a fixed hole grid (31.75 mm pitch starting at
    a base position). The facade sits in front of the frame with a certain
    reveal (gap). The drilling in the facade must be shifted so that the
    hardware (hinges, drawer runners) aligns with the frame holes.

    Parameters
    ----------
    reveals : dict  Keys: "top", "bottom", "left", "right" (mm)
                    Defaults to DEFAULT_REVEALS if None.

    Returns
    -------
    dict with offset_x, offset_y in mm to shift the drilling grid
    on the facade relative to the frame baseline.
    """
    if reveals is None:
        reveals = DEFAULT_REVEALS

    # Vertical offset: the facade top edge is shifted DOWN by reveal_top
    # relative to the frame top rail, so the hole row moves down by reveal_top.
    offset_y = reveals.get("top", DEFAULT_REVEALS["top"])

    # Horizontal offset: the facade left edge shifted right by reveal_left.
    offset_x = reveals.get("left", DEFAULT_REVEALS["left"])

    return {
        "offset_x": offset_x,
        "offset_y": offset_y,
        "reveal_top": reveals.get("top", DEFAULT_REVEALS["top"]),
        "reveal_bottom": reveals.get("bottom", DEFAULT_REVEALS["bottom"]),
        "reveal_left": reveals.get("left", DEFAULT_REVEALS["left"]),
        "reveal_right": reveals.get("right", DEFAULT_REVEALS["right"]),
    }


# ─────────────────────────────────────────────────────────
#  SEKTION Hinge Center Calculator
# ─────────────────────────────────────────────────────────

def sektion_hinge_positions(
    facade_height_mm: float,
    reveal_top_mm: float = 1.5,
    reveal_bottom_mm: float = 1.5,
    pitch_mm: float = SEKTION_PITCH_MM,
    hinge_offset_from_edge_mm: float = 37.0,   # IKEA standard cup hole center from edge
    num_hinges: int | None = None,
) -> list[float]:
    """
    Calculate hinge cup center Y-positions on the facade (from facade bottom edge).

    SEKTION frame holes start at a fixed distance from the bottom rail.
    Hinges snap to the nearest hole on the 31.75 mm grid.

    Parameters
    ----------
    facade_height_mm : float      Finished facade height
    reveal_top_mm : float         Reveal at top (shifts the grid)
    reveal_bottom_mm : float      Reveal at bottom
    pitch_mm : float              System hole pitch (default 31.75 mm)
    hinge_offset_from_edge_mm : float  Hinge cup center distance from top/bottom edge
    num_hinges : int | None       Force number of hinges (auto if None)

    Returns
    -------
    list[float] — Y positions from facade bottom, sorted ascending
    """
    # Auto determine number of hinges based on height
    if num_hinges is None:
        if facade_height_mm <= 400:
            num_hinges = 2
        elif facade_height_mm <= 900:
            num_hinges = 2
        elif facade_height_mm <= 1300:
            num_hinges = 3
        else:
            num_hinges = 4

    positions = []

    # Bottom hinge: snap to nearest grid row above hinge_offset_from_edge
    bottom_y = reveal_bottom_mm + hinge_offset_from_edge_mm
    # Snap to grid (round up to nearest pitch multiple)
    grid_row_bottom = math.ceil(bottom_y / pitch_mm)
    bottom_snapped = grid_row_bottom * pitch_mm
    positions.append(round(bottom_snapped, 3))

    # Top hinge: snap to nearest grid row below (facade_h - hinge_offset)
    top_y = facade_height_mm - reveal_top_mm - hinge_offset_from_edge_mm
    grid_row_top = math.floor(top_y / pitch_mm)
    top_snapped = grid_row_top * pitch_mm
    positions.append(round(top_snapped, 3))

    # Middle hinges: distribute evenly between bottom and top
    if num_hinges > 2:
        span = top_snapped - bottom_snapped
        for i in range(1, num_hinges - 1):
            mid_y = bottom_snapped + span * i / (num_hinges - 1)
            # Snap to nearest grid row
            grid_row_mid = round(mid_y / pitch_mm)
            mid_snapped = grid_row_mid * pitch_mm
            positions.append(round(mid_snapped, 3))

    return sorted(set(positions))


# ─────────────────────────────────────────────────────────
#  Edge Banding Length Calculator (for Cutting Map)
# ─────────────────────────────────────────────────────────

def calc_edge_banding_length(parts: list[dict]) -> dict:
    """
    Calculate total edge banding length required for all parts.

    Parameters
    ----------
    parts : list[dict]  Each dict must have: w (mm), h (mm), qty (int)
                        Optionally: edge_sides (int, default 4)

    Returns
    -------
    dict with total_mm, total_m, per_part breakdown
    """
    total_mm = 0.0
    breakdown = []

    for part in parts:
        w = part.get("w", 0)
        h = part.get("h", 0)
        qty = part.get("qty", 1)
        edge_sides = part.get("edge_sides", 4)

        if edge_sides == 4:
            perimeter = 2 * (w + h)
        elif edge_sides == 2:
            # Long sides only (e.g. shelves)
            perimeter = 2 * max(w, h)
        elif edge_sides == 1:
            perimeter = max(w, h)
        else:
            perimeter = 2 * (w + h)

        part_total = perimeter * qty
        total_mm += part_total
        breakdown.append({
            "id": part.get("id"),
            "w": w, "h": h, "qty": qty,
            "perimeter_mm": round(perimeter, 1),
            "total_mm": round(part_total, 1),
        })

    return {
        "total_mm": round(total_mm, 1),
        "total_m": round(total_mm / 1000, 2),
        "breakdown": breakdown,
    }
