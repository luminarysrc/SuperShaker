"""
Time Estimator — G-code Machining Time Analysis
=================================================
Parses a completed G-code string and calculates:
  - Rapid (G0) travel distance & time
  - Cutting (G1/G2/G3) distance & time
  - Tool change count
  - Human-readable total time

Rapid traverse speed defaults to 30 000 mm/min (typical for
Biesse / SCM / Homag industrial CNC routers).
"""
import math
import re

# Default rapid traverse rate (mm/min) — most industrial routers
DEFAULT_RAPID_SPEED = 30_000.0


def estimate_machining_time(gcode_text: str,
                            rapid_speed: float = DEFAULT_RAPID_SPEED) -> dict:
    """
    Walk every G-code line, accumulate distances for rapid vs. cut moves,
    and compute estimated machining time.

    Returns a dict with all metrics.
    """
    x, y, z = 0.0, 0.0, 0.0
    mode = 0          # 0 = rapid, 1 = cut
    feed = 1000.0     # current F word (mm/min), sensible default
    tool_changes = 0

    rapid_dist = 0.0
    cut_dist = 0.0

    for raw in gcode_text.split("\n"):
        # Strip comments and inline semicolons
        line = re.sub(r"\(.*?\)", "", raw)
        line = line.split(";")[0].strip().upper()
        if not line:
            continue

        # Detect tool changes (e.g.  T2 M6, T3 M6)
        if "M6" in line:
            tool_changes += 1

        # Parse G mode
        g_match = re.search(r"G(\d+)", line)
        if g_match:
            g = int(g_match.group(1))
            if g == 0:
                mode = 0
            elif g in (1, 2, 3):
                mode = 1

        # Parse F word (feed rate)
        f_match = re.search(r"F([+-]?\d*\.?\d+)", line)
        if f_match:
            f_val = float(f_match.group(1))
            if f_val > 0:
                feed = f_val

        # Parse coordinates
        x_match = re.search(r"X([+-]?\d*\.?\d+)", line)
        y_match = re.search(r"Y([+-]?\d*\.?\d+)", line)
        z_match = re.search(r"Z([+-]?\d*\.?\d+)", line)

        nx = float(x_match.group(1)) if x_match else x
        ny = float(y_match.group(1)) if y_match else y
        nz = float(z_match.group(1)) if z_match else z

        if nx != x or ny != y or nz != z:
            dist = math.sqrt((nx - x) ** 2 + (ny - y) ** 2 + (nz - z) ** 2)
            if mode == 0:
                rapid_dist += dist
            else:
                cut_dist += dist
            x, y, z = nx, ny, nz

    total_dist = rapid_dist + cut_dist

    # Time calculations (distance / speed → minutes → seconds)
    rapid_time_sec = (rapid_dist / rapid_speed) * 60.0 if rapid_speed > 0 else 0.0
    cut_time_sec = (cut_dist / feed) * 60.0 if feed > 0 else 0.0

    # More accurate: accumulate cut time per-segment with its own feed.
    # We also get the accurate distance here since it handles arc geometry natively instead of point-to-point.
    cut_time_sec, cut_dist = _accurate_cut_time(gcode_text)
    total_dist = rapid_dist + cut_dist

    total_time_sec = rapid_time_sec + cut_time_sec

    # Human-readable format
    total_time_formatted = _format_time(total_time_sec)

    return {
        "rapid_distance_mm": round(rapid_dist, 1),
        "cut_distance_mm": round(cut_dist, 1),
        "total_distance_mm": round(total_dist, 1),
        "rapid_time_sec": round(rapid_time_sec, 1),
        "cut_time_sec": round(cut_time_sec, 1),
        "total_time_sec": round(total_time_sec, 1),
        "total_time_formatted": total_time_formatted,
        "tool_changes": tool_changes,
    }


def _accurate_cut_time(gcode_text: str) -> tuple[float, float]:
    """
    Walk the G-code a second time, accumulating cut time per-segment
    using the feed rate that was active at each segment.
    Correctly calculates arc lengths for G2/G3.
    Returns: (cut_time_seconds, cut_distance_mm)
    """
    x, y, z = 0.0, 0.0, 0.0
    mode = 0  # 0: rapid, 1: linear cut, 2: CW arc, 3: CCW arc
    feed = 1000.0
    total_sec = 0.0
    total_dist = 0.0

    for raw in gcode_text.split("\n"):
        line = re.sub(r"\(.*?\)", "", raw)
        line = line.split(";")[0].strip().upper()
        if not line:
            continue

        g_match = re.search(r"G(\d+)", line)
        if g_match:
            g = int(g_match.group(1))
            if g == 0:
                mode = 0
            elif g == 1:
                mode = 1
            elif g == 2:
                mode = 2
            elif g == 3:
                mode = 3

        f_match = re.search(r"F([+-]?\d*\.?\d+)", line)
        if f_match:
            f_val = float(f_match.group(1))
            if f_val > 0:
                feed = f_val

        x_match = re.search(r"X([+-]?\d*\.?\d+)", line)
        y_match = re.search(r"Y([+-]?\d*\.?\d+)", line)
        z_match = re.search(r"Z([+-]?\d*\.?\d+)", line)
        i_match = re.search(r"I([+-]?\d*\.?\d+)", line)
        j_match = re.search(r"J([+-]?\d*\.?\d+)", line)

        nx = float(x_match.group(1)) if x_match else x
        ny = float(y_match.group(1)) if y_match else y
        nz = float(z_match.group(1)) if z_match else z
        i_val = float(i_match.group(1)) if i_match else 0.0
        j_val = float(j_match.group(1)) if j_match else 0.0

        if nx != x or ny != y or nz != z:
            if feed > 0:
                if mode == 1:
                    dist = math.sqrt((nx - x) ** 2 + (ny - y) ** 2 + (nz - z) ** 2)
                    total_dist += dist
                    total_sec += (dist / feed) * 60.0
                elif mode == 2 or mode == 3:
                    cx = x + i_val
                    cy = y + j_val
                    r = math.sqrt(i_val**2 + j_val**2)
                    if r > 0.001:
                        angle1 = math.atan2(y - cy, x - cx)
                        angle2 = math.atan2(ny - cy, nx - cx)
                        delta_angle = angle2 - angle1

                        if mode == 2 and delta_angle > 0:
                            delta_angle -= 2 * math.pi
                        elif mode == 3 and delta_angle < 0:
                            delta_angle += 2 * math.pi
                            
                        # Handle full circle edge case (start == end usually doesn't trigger nx != x, but just in case)
                        if abs(delta_angle) < 1e-5:
                            delta_angle = 2 * math.pi

                        dist = r * abs(delta_angle)
                        # Add Z travel via Pythagoras (helical interpolation)
                        if nz != z:
                            dist = math.sqrt(dist**2 + (nz - z)**2)
                            
                        total_dist += dist
                        total_sec += (dist / feed) * 60.0
                    else:
                        # Fallback to linear if radius is invalid
                        dist = math.sqrt((nx - x) ** 2 + (ny - y) ** 2 + (nz - z) ** 2)
                        total_dist += dist
                        total_sec += (dist / feed) * 60.0

            x, y, z = nx, ny, nz

    return total_sec, total_dist


def _format_time(seconds: float) -> str:
    """Format seconds into a human-readable string like '2m 34s' or '1h 12m'."""
    if seconds < 0:
        return "0s"
    total = int(round(seconds))
    if total < 60:
        return f"{total}s"
    minutes = total // 60
    secs = total % 60
    if minutes < 60:
        return f"{minutes}m {secs:02d}s"
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours}h {mins:02d}m"
