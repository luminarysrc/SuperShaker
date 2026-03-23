"""
SuperShaker Engine — Pure computational core
=============================================
Extracted from SuperShaker_v5.4.2.py — no Tkinter dependencies.
Contains: MaxRectsPacker, nesting, G-code generation, calc_t6_params.
"""
import math
import re


# ════════════════════════════════════════════════════════════════════════
#  MaxRects Bin Packing (Best Short Side Fit)
# ════════════════════════════════════════════════════════════════════════

class MaxRectsPacker:
    """MaxRects algorithm (Best Short Side Fit)."""
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.free_rectangles = [{'x': 0, 'y': 0, 'w': width, 'h': height}]

    def pack(self, w, h):
        best_node = None
        best_short = float('inf')
        best_long = float('inf')
        for fr in self.free_rectangles:
            if fr['w'] >= w and fr['h'] >= h:
                lw = fr['w'] - w
                lh = fr['h'] - h
                s = min(lw, lh)
                lo = max(lw, lh)
                if s < best_short or (s == best_short and lo < best_long):
                    best_node = {'x': fr['x'], 'y': fr['y'], 'w': w, 'h': h}
                    best_short = s
                    best_long = lo
        if best_node is None:
            return None
        num = len(self.free_rectangles)
        i = 0
        while i < num:
            if self._split(self.free_rectangles[i], best_node):
                self.free_rectangles.pop(i)
                num -= 1
            else:
                i += 1
        self._prune()
        return best_node

    def pack_biased(self, w, h, cx, cy):
        """Minimizes distance of part center to (cx,cy) — for small parts."""
        best_node = None
        best_dist = float('inf')
        for fr in self.free_rectangles:
            if fr['w'] >= w and fr['h'] >= h:
                d = (fr['x'] + w / 2 - cx) ** 2 + (fr['y'] + h / 2 - cy) ** 2
                if d < best_dist:
                    best_node = {'x': fr['x'], 'y': fr['y'], 'w': w, 'h': h}
                    best_dist = d
        if best_node is None:
            return None
        num = len(self.free_rectangles)
        i = 0
        while i < num:
            if self._split(self.free_rectangles[i], best_node):
                self.free_rectangles.pop(i)
                num -= 1
            else:
                i += 1
        self._prune()
        return best_node

    def _split(self, fn, un):
        if (un['x'] >= fn['x'] + fn['w'] or un['x'] + un['w'] <= fn['x'] or
                un['y'] >= fn['y'] + fn['h'] or un['y'] + un['h'] <= fn['y']):
            return False
        if un['y'] > fn['y'] and un['y'] < fn['y'] + fn['h']:
            nn = fn.copy()
            nn['h'] = un['y'] - nn['y']
            self.free_rectangles.append(nn)
        if un['y'] + un['h'] < fn['y'] + fn['h']:
            nn = fn.copy()
            nn['y'] = un['y'] + un['h']
            nn['h'] = fn['y'] + fn['h'] - (un['y'] + un['h'])
            self.free_rectangles.append(nn)
        if un['x'] > fn['x'] and un['x'] < fn['x'] + fn['w']:
            nn = fn.copy()
            nn['w'] = un['x'] - nn['x']
            self.free_rectangles.append(nn)
        if un['x'] + un['w'] < fn['x'] + fn['w']:
            nn = fn.copy()
            nn['x'] = un['x'] + un['w']
            nn['w'] = fn['x'] + fn['w'] - (un['x'] + un['w'])
            self.free_rectangles.append(nn)
        return True

    def _prune(self):
        i = 0
        while i < len(self.free_rectangles):
            j = i + 1
            while j < len(self.free_rectangles):
                if self._in(self.free_rectangles[i], self.free_rectangles[j]):
                    self.free_rectangles.pop(i)
                    i -= 1
                    break
                if self._in(self.free_rectangles[j], self.free_rectangles[i]):
                    self.free_rectangles.pop(j)
                    j -= 1
                j += 1
            i += 1

    @staticmethod
    def _in(a, b):
        return (a['x'] >= b['x'] and a['y'] >= b['y'] and
                a['x'] + a['w'] <= b['x'] + b['w'] and
                a['y'] + a['h'] <= b['y'] + b['h'])


# ════════════════════════════════════════════════════════════════════════
#  Chip-Load Calculator
# ════════════════════════════════════════════════════════════════════════

def calc_t6_params(D, z, tool_type, pass_type, doc):
    """
    Cutting parameters for MDF/HDF (9kW spindle, D up to 57mm).
    D         – diameter mm        tool_type – "PCD" or "TCT"
    z         – number of teeth    pass_type – "rough" / "finish"
    doc       – depth of cut mm
    """
    S_MAX = 18000
    F_MAX = 24000

    if tool_type == "PCD":
        vc_rec, vc_max = 50.0, 90.0
    else:
        vc_rec, vc_max = 25.0, 40.0

    if D <= 4:
        fz_lo = fz_hi = 0.10
    elif D <= 10:
        fz_lo = fz_hi = 0.15
    elif D <= 20:
        fz_lo = fz_hi = 0.25
    else:
        fz_lo = 0.30
        fz_hi = 0.40
    fz_mid = fz_lo if pass_type == "finish" else fz_hi

    def rpm_from_vc(vc):
        return vc * 60_000 / (math.pi * D)

    n_rec = rpm_from_vc(vc_rec)
    n_lo = rpm_from_vc(vc_rec)
    n_hi = rpm_from_vc(vc_max)

    spindle_warn = ""
    low_rpm_warn = ""
    if D > 40 and tool_type != "PCD":
        n_rec = min(n_rec, 18000)
        n_hi = min(n_hi, 18000)
        spindle_warn = f"D > 40mm (TCT) -> n <= 18,000 RPM"
    n_rec = min(n_rec, S_MAX)
    n_lo = min(n_lo, S_MAX)
    n_hi = min(n_hi, S_MAX)
    n_rec = round(n_rec / 100) * 100
    n_lo = round(n_lo / 100) * 100
    n_hi = round(n_hi / 100) * 100
    if n_rec < 6000:
        low_rpm_warn = "n < 6,000 RPM — possible torque loss!"

    f_rec = n_rec * z * fz_mid
    f_lo = n_lo * z * fz_lo
    f_hi = n_hi * z * fz_hi

    doc_warn = ""
    if doc > 1.5 * D:
        K = 0.8
        doc_note = f"DOC {doc:.1f} > 1.5D — 2 passes recommended!"
        doc_warn = doc_note
    elif doc > 1.0 * D:
        K = 0.8
        doc_note = f"DOC {doc:.1f} > D — feed x0.80"
    else:
        K = 1.0
        doc_note = f"DOC {doc:.1f} <= D — K = 1.0 (full feed)"
    doc_factor = K
    f_rec *= K
    f_lo *= K
    f_hi *= K

    fz_limit_warn = ""
    if tool_type == "PCD":
        f_rec *= 1.25
        f_lo *= 1.25
        f_hi *= 1.25
        fz_check = f_rec / (n_rec * z) if n_rec > 0 else 0
        if fz_check > 0.50:
            f_rec = n_rec * z * 0.50
            fz_limit_warn = "PCD fz limited to 0.50 mm/tooth"

    f_rec = min(round(f_rec / 10) * 10, F_MAX)
    f_lo = min(round(f_lo / 10) * 10, F_MAX)
    f_hi = min(round(f_hi / 10) * 10, F_MAX)

    strategy = ("Climb (required)" if tool_type == "PCD"
                else "Climb (preferred) / Conventional")
    plunge_feed = max(100, round(f_rec * 0.25 / 10) * 10)
    stepover_rough = round(D * 0.70, 1)
    stepover_finish = round(D * 0.30, 1)
    stepover = stepover_rough if pass_type == "rough" else stepover_finish

    fz_actual = f_rec / (n_rec * z) if n_rec > 0 else 0
    vc_actual = n_rec * math.pi * D / 60_000

    return {
        "fz_lo": fz_lo, "fz_hi": fz_hi, "fz_mid": fz_mid,
        "vc_lo": vc_rec, "vc_hi": vc_max, "vc_actual": round(vc_actual, 1),
        "n_lo": int(n_lo), "n_hi": int(n_hi), "n_rec": int(n_rec),
        "f_lo": int(f_lo), "f_hi": int(f_hi), "f_rec": int(f_rec),
        "doc_factor": doc_factor, "doc_note": doc_note,
        "fz_actual": round(fz_actual, 3),
        "plunge_feed": int(plunge_feed),
        "stepover": stepover,
        "stepover_rough": stepover_rough,
        "stepover_finish": stepover_finish,
        "strategy": strategy,
        "ramp_deg": "2-5 deg",
        "doc_warn": doc_warn,
        "spindle_warn": spindle_warn,
        "low_rpm_warn": low_rpm_warn,
        "fz_limit_warn": fz_limit_warn,
    }


# ════════════════════════════════════════════════════════════════════════
#  Nesting
# ════════════════════════════════════════════════════════════════════════

def do_nesting(doors, sheet_w, sheet_h, margin, kerf,
               allow_rotation=True, small_part_threshold=0.05):
    """
    Run MaxRects two-phase nesting.
    doors: list of {'id', 'w', 'h', 'qty', 'type'}
    Returns: list of sheets, each sheet is a list of placed parts.
    """
    work_w = sheet_w - 2 * margin
    work_h = sheet_h - 2 * margin
    thr_mm2 = small_part_threshold * 1e6

    flat_list = []
    for d in doors:
        for _ in range(d['qty']):
            flat_list.append({
                'id': d['id'], 'type': d['type'],
                'w': d['w'] + kerf, 'h': d['h'] + kerf,
                'orig_w': d['w'], 'orig_h': d['h'],
            })

    sort_funcs = [
        lambda x: x['w'] * x['h'],
        lambda x: max(x['w'], x['h']),
        lambda x: x['w'] + x['h'],
    ]
    best_sheets = []
    min_sheets = float('inf')
    best_density = 0

    for sf in sort_funcs:
        for pref_rot in [False, True]:
            items = []
            for item in flat_list:
                w, h = item['w'], item['h']
                if allow_rotation and pref_rot and w < h:
                    w, h = h, w
                elif allow_rotation and not pref_rot and h < w:
                    w, h = h, w
                items.append({
                    'id': item['id'], 'type': item['type'],
                    'w': w, 'h': h,
                    'orig_w': item['orig_w'], 'orig_h': item['orig_h'],
                })

            work_cx = work_w / 2
            work_cy = work_h / 2
            large_items = sorted(
                [i for i in items if i['orig_w'] * i['orig_h'] >= thr_mm2],
                key=sf, reverse=True)
            small_items = sorted(
                [i for i in items if i['orig_w'] * i['orig_h'] < thr_mm2],
                key=sf, reverse=True)

            packed_sheets = []
            while large_items or small_items:
                packer = MaxRectsPacker(work_w, work_h)
                cur = []
                rem_l = []
                rem_s = []

                for item in large_items:
                    pos = packer.pack(item['w'], item['h'])
                    if pos is None and allow_rotation:
                        pos = packer.pack(item['h'], item['w'])
                        if pos is not None:
                            item['w'], item['h'] = item['h'], item['w']
                    if pos is not None:
                        cur.append({
                            'id': item['id'], 'type': item['type'],
                            'x': pos['x'] + margin, 'y': pos['y'] + margin,
                            'w': item['w'] - kerf, 'h': item['h'] - kerf,
                            'orig_w': item['orig_w'], 'orig_h': item['orig_h'],
                            'is_small': False,
                        })
                    else:
                        rem_l.append(item)

                for item in small_items:
                    pos = packer.pack_biased(item['w'], item['h'], work_cx, work_cy)
                    if pos is None:
                        pos = packer.pack(item['w'], item['h'])
                    if pos is None and allow_rotation:
                        pos = packer.pack_biased(item['h'], item['w'], work_cx, work_cy)
                        if pos is None:
                            pos = packer.pack(item['h'], item['w'])
                        if pos is not None:
                            item['w'], item['h'] = item['h'], item['w']
                    if pos is not None:
                        cur.append({
                            'id': item['id'], 'type': item['type'],
                            'x': pos['x'] + margin, 'y': pos['y'] + margin,
                            'w': item['w'] - kerf, 'h': item['h'] - kerf,
                            'orig_w': item['orig_w'], 'orig_h': item['orig_h'],
                            'is_small': True,
                        })
                    else:
                        rem_s.append(item)

                if not cur:
                    break
                packed_sheets.append(cur)
                large_items = rem_l
                small_items = rem_s

            density = 0
            if packed_sheets:
                au = sum((r['w'] + kerf) * (r['h'] + kerf) for r in packed_sheets[0])
                density = au / (work_w * work_h)
            if len(packed_sheets) < min_sheets:
                min_sheets = len(packed_sheets)
                best_sheets = packed_sheets
                best_density = density
            elif len(packed_sheets) == min_sheets and density > best_density:
                best_sheets = packed_sheets
                best_density = density

    # Calculate stats
    total_parts = sum(len(s) for s in best_sheets)
    total_area = sum(d['orig_w'] * d['orig_h'] for s in best_sheets for d in s) / 1e6
    sheet_area = sheet_w * sheet_h / 1e6
    total_avail = sheet_area * len(best_sheets)
    yield_pct = (total_area / total_avail * 100) if total_avail else 0

    return {
        "sheets": best_sheets,
        "total_sheets": len(best_sheets),
        "total_parts": total_parts,
        "total_area_m2": round(total_area, 3),
        "yield_percentage": round(yield_pct, 1),
    }


# ════════════════════════════════════════════════════════════════════════
#  G-code Sanitization
# ════════════════════════════════════════════════════════════════════════

def _sanitize_gcode(lines):
    """Strip non-ASCII from G-code comment tokens."""
    RU = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    }
    SUBS = {'\u2014': '-', '\u2013': '-', '\u2192': '->', '\u21d2': '=>',
            '\u2026': '...', '\u22c5': '*'}

    def clean_comment(text):
        for u, r in SUBS.items():
            text = text.replace(u, r)
        out = []
        for ch in text:
            lo = ch.lower()
            if lo in RU:
                tr = RU[lo]
                out.append(tr.upper() if ch.isupper() else tr)
            elif ord(ch) > 127:
                pass
            else:
                out.append(ch)
        return ''.join(out).replace(' / ', ' + ')

    sanitized = []
    for line in lines:
        line = re.sub(r'\(([^)]*)\)', lambda m: f"({clean_comment(m.group(1))})", line)
        sanitized.append(line)
    return sanitized


# ════════════════════════════════════════════════════════════════════════
#  TSP Path Optimizer
# ════════════════════════════════════════════════════════════════════════

def optimize_path(doors, cx, cy):
    """Nearest-neighbor path optimization."""
    unvisited = list(doors)
    path = []
    while unvisited:
        nearest = min(unvisited, key=lambda d: (d['x'] + d['w'] / 2 - cx) ** 2 +
                      (d['y'] + d['h'] / 2 - cy) ** 2)
        path.append(nearest)
        cx = nearest['x'] + nearest['w'] / 2
        cy = nearest['y'] + nearest['h'] / 2
        unvisited.remove(nearest)
    return path


# ════════════════════════════════════════════════════════════════════════
#  G-code Generator
# ════════════════════════════════════════════════════════════════════════

def generate_gcode_for_sheet(
    sheet_doors,
    sheet_idx,
    total_sheets,
    # Material & sheet params
    sheet_w, sheet_h, mat_z, margin,
    # Facade params
    frame_w, pocket_depth, pocket_depth2=0.0, pocket_step_offset=5.0,
    chamfer_depth=0.5, outer_chamfer_depth=0.5,
    # T6 params
    t6_name="T6", t6_dia=31.75, t6_type="PCD",
    t6_spindle=18000, t6_feed=6000,
    pocket_strategy="Snake", spiral_overlap=50.0,
    # Flags
    do_pocket=True, do_corners_rest=True,
    do_french_miter=True, do_cutout=True, do_rough_pass=False,
    # Other tools
    kerf=6.0, corner_r=1.0, feed_xy=8000,
    t2_tool_t="T2", t2_spindle=18000, t2_feed=6000,
    t3_tool_t="T3", t3_spindle=18000, t3_feed=8000,
    t5_tool_t="T5", t5_spindle=18000, t5_feed=8000,
    # Order
    order_id="",
):
    """
    Generate G-code for one nested sheet.
    Returns: G-code string
    """
    z_top = mat_z
    z_bottom = z_top - pocket_depth
    z_chamfer = z_top - chamfer_depth
    z_chamfer_outer = z_top - outer_chamfer_depth
    z_safe = 30.0
    t6_r = t6_dia / 2.0
    t2_d = 4.0
    t2_r = 2.0
    out_r = corner_r

    feed_t2 = t2_feed
    feed_t2_corner = max(300, feed_t2 // 7)
    feed_t2_plunge = max(100, feed_t2 // 17)
    t3_feed_cut = t3_feed

    overlap_pct = spiral_overlap
    step_finish = t6_dia * (100.0 - overlap_pct) / 100.0
    if step_finish <= 0:
        step_finish = t6_r

    cl = []
    cl.append("%")
    cl.append(f"(NESTED FASADY — SHEET {sheet_idx + 1}/{total_sheets})")
    if order_id:
        cl.append(f"(ORDER: {order_id})")
    cl.append(f"(SHEET: {sheet_w}x{sheet_h}  Z_TOP={z_top}  Z_BOTTOM={z_bottom:.3f})")
    cl.append(f"(POCKET TOOL: {t6_name} D{t6_dia:.2f} {t6_type}  RPM={t6_spindle}  FEED={t6_feed})")
    cl.append(f"(STRATEGY: {pocket_strategy})")
    cl.append("G21 G90 G17 G40 G80")
    cl.append(f"G0 Z{z_safe}")
    cl.append("")
    curr_x, curr_y = 0.0, 0.0

    # ── OP1: POCKET ─────────────────────────────────────────────
    if do_pocket:
        cl.append(f"(--- OP1: POCKETS {t6_name} D{t6_dia:.2f} {t6_type} ---)")
        cl.append(f"{t6_name} M6")
        cl.append(f"S{t6_spindle} M3")
        cl.append("")

        shaker_doors = [d for d in sheet_doors if d['type'] in ('Shaker', 'Shaker Step')]
        for d in optimize_path(shaker_doors, curr_x, curr_y):
            px_min = d['x'] + frame_w
            px_max = d['x'] + d['w'] - frame_w
            py_min = d['y'] + frame_w
            py_max = d['y'] + d['h'] - frame_w
            cx_min = px_min + t6_r
            cx_max = px_max - t6_r
            cy_min = py_min + t6_r
            cy_max = py_max - t6_r
            if cx_max < cx_min or cy_max < cy_min:
                continue

            pocket_depth_val = z_top - z_bottom
            if not do_rough_pass:
                num_passes = 1
                pass_depth = pocket_depth_val
            else:
                num_passes = 2
                pass_depth = pocket_depth_val / 2.0

            cl.append(f"(TYPE: {d['type']} | POCKET ID {d['id']}  {d['orig_w']:.0f}x{d['orig_h']:.0f})")

            for pass_idx in range(num_passes):
                current_z = z_top - pass_depth * (pass_idx + 1)
                current_z = max(current_z, z_bottom)

                is_rough = (pass_idx == 0) and (num_passes > 1)
                active_strategy = "Snake" if is_rough else pocket_strategy
                current_step = (t6_dia * 0.90) if is_rough else step_finish

                if "Snake" in active_strategy:
                    cl.append(f"G0 Z{z_top + 5.0}")
                    cl.append(f"G0 X{cx_min:.3f} Y{cy_min:.3f}")
                    cl.append(f"G1 Z{z_top + 0.5} F2000")
                    ramp_x = min(cx_min + 60.0, cx_max)
                    cl.append(f"G1 X{ramp_x:.3f} Z{current_z:.3f} F800")
                    if ramp_x > cx_min:
                        cl.append(f"G1 X{cx_min:.3f} F{t6_feed}")
                    cur_y = cy_min
                    direction = 1
                    while cur_y <= cy_max:
                        if direction == 1:
                            cl.append(f"G1 X{cx_max:.3f} F{t6_feed}")
                        else:
                            cl.append(f"G1 X{cx_min:.3f} F{t6_feed}")
                        next_y = cur_y + current_step
                        if next_y > cy_max and cur_y < cy_max:
                            next_y = cy_max
                        if next_y <= cy_max or cur_y < cy_max:
                            cl.append(f"G1 Y{next_y:.3f} F{t6_feed}")
                        cur_y = next_y
                        direction *= -1
                    # Contour pass
                    cl.append(f"(-- Snake contour pass layer {pass_idx + 1} at Z{current_z:.3f} --)")
                    cl.append(f"G0 Z{z_top + 2.0}")
                    cl.append(f"G0 X{cx_min:.3f} Y{cy_min:.3f}")
                    cl.append(f"G1 Z{current_z:.3f} F800")
                    cl.append(f"G1 X{cx_max:.3f} F{t6_feed}")
                    cl.append(f"G1 Y{cy_max:.3f}")
                    cl.append(f"G1 X{cx_min:.3f}")
                    cl.append(f"G1 Y{cy_min:.3f}")

                elif "Spiral" in active_strategy:
                    sp = []
                    sx0, sx1, sy0, sy1 = cx_min, cx_max, cy_min, cy_max
                    while sx0 <= sx1 and sy0 <= sy1:
                        sp.append((sx0, sx1, sy0, sy1))
                        sx0 += current_step
                        sx1 -= current_step
                        sy0 += current_step
                        sy1 -= current_step
                    sp.reverse()
                    for i, (xn, xx, yn, yx) in enumerate(sp):
                        if i == 0:
                            cl.append(f"G0 Z{z_top + 5.0}")
                            cl.append(f"G0 X{xn:.3f} Y{yn:.3f}")
                            cl.append(f"G1 Z{z_top + 0.5} F2000")
                            rl = min(60.0, xx - xn) if xx > xn else 0
                            if rl > 5:
                                cl.append(f"G1 X{xn + rl:.3f} Z{current_z:.3f} F800")
                                cl.append(f"G1 X{xn:.3f} F{t6_feed}")
                            else:
                                cl.append(f"G1 Z{current_z:.3f} F400")
                        else:
                            cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                        if xn == xx and yn == yx:
                            cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                        elif xn == xx:
                            cl.append(f"G1 Y{yx:.3f} F{t6_feed}")
                            cl.append(f"G1 Y{yn:.3f}")
                        elif yn == yx:
                            cl.append(f"G1 X{xx:.3f} F{t6_feed}")
                            cl.append(f"G1 X{xn:.3f}")
                        else:
                            cl.append(f"G1 X{xx:.3f} F{t6_feed}")
                            cl.append(f"G1 Y{yx:.3f}")
                            cl.append(f"G1 X{xn:.3f}")
                            cl.append(f"G1 Y{yn:.3f}")

                elif "Climb" in active_strategy or "CCW" in active_strategy:
                    sp = []
                    sx0, sx1, sy0, sy1 = cx_min, cx_max, cy_min, cy_max
                    while sx0 <= sx1 and sy0 <= sy1:
                        sp.append((sx0, sx1, sy0, sy1))
                        sx0 += current_step
                        sx1 -= current_step
                        sy0 += current_step
                        sy1 -= current_step
                    for i, (xn, xx, yn, yx) in enumerate(sp):
                        if i == 0:
                            cl.append(f"G0 Z{z_top + 5.0}")
                            cl.append(f"G0 X{xn:.3f} Y{yn:.3f}")
                            cl.append(f"G1 Z{z_top + 0.5} F2000")
                            rl = min(60.0, xx - xn) if xx > xn else 0
                            if rl > 5:
                                cl.append(f"G1 X{xn + rl:.3f} Z{current_z:.3f} F800")
                                cl.append(f"G1 X{xn:.3f} F{t6_feed}")
                            else:
                                cl.append(f"G1 Z{current_z:.3f} F400")
                        else:
                            cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                        cl.append(f"G1 X{xx:.3f} F{t6_feed}")
                        cl.append(f"G1 Y{yx:.3f}")
                        cl.append(f"G1 X{xn:.3f}")
                        cl.append(f"G1 Y{yn:.3f}")

                if pass_idx == 0 and num_passes > 1:
                    cl.append(f"G0 Z{z_top + 5.0}")

            cl.append(f"G0 Z{z_safe}")
            curr_x, curr_y = d['x'] + d['w'] / 2, d['y'] + d['h'] / 2
            cl.append("")

            # 2nd pocket (Shaker Step)
            _is_step = d['type'] == 'Shaker Step'
            if _is_step and pocket_depth2 > 0:
                step_off = pocket_step_offset
                sx_min = px_min + step_off
                sx_max = px_max - step_off
                sy_min = py_min + step_off
                sy_max = py_max - step_off
                cx2_min = sx_min + t6_r
                cx2_max = sx_max - t6_r
                cy2_min = sy_min + t6_r
                cy2_max = sy_max - t6_r
                if cx2_max > cx2_min and cy2_max > cy2_min:
                    z_step = z_bottom - pocket_depth2
                    current_z2 = z_step
                    current_step2 = step_finish
                    cl.append(f"(TYPE: {d['type']} | 2ND POCKET ID {d['id']} off={step_off:.1f} depth={pocket_depth2:.1f})")

                    if 'Snake' in pocket_strategy:
                        cuy = cy2_min
                        drn = 1
                        cl.append(f"G0 Z{z_top + 5.0}")
                        cl.append(f"G0 X{cx2_min:.3f} Y{cy2_min:.3f}")
                        cl.append(f"G1 Z{z_top + 0.5} F2000")
                        ramp_x2 = min(cx2_min + 60.0, cx2_max)
                        cl.append(f"G1 X{ramp_x2:.3f} Z{current_z2:.3f} F800")
                        if ramp_x2 > cx2_min:
                            cl.append(f"G1 X{cx2_min:.3f} F{t6_feed}")
                        while cuy <= cy2_max:
                            if drn == 1:
                                cl.append(f"G1 X{cx2_max:.3f} F{t6_feed}")
                            else:
                                cl.append(f"G1 X{cx2_min:.3f} F{t6_feed}")
                            ny = cuy + current_step2
                            if ny > cy2_max and cuy < cy2_max:
                                ny = cy2_max
                            if ny <= cy2_max or cuy < cy2_max:
                                cl.append(f"G1 Y{ny:.3f} F{t6_feed}")
                            cuy = ny
                            drn *= -1
                        # contour pass 2nd pocket
                        cl.append(f"G0 Z{z_top + 2.0}")
                        cl.append(f"G0 X{cx2_min:.3f} Y{cy2_min:.3f}")
                        cl.append(f"G1 Z{current_z2:.3f} F800")
                        cl.append(f"G1 X{cx2_max:.3f} F{t6_feed}")
                        cl.append(f"G1 Y{cy2_max:.3f}")
                        cl.append(f"G1 X{cx2_min:.3f}")
                        cl.append(f"G1 Y{cy2_min:.3f}")
                    cl.append(f"G0 Z{z_top + 5.0}")

    # ── OP2: PERIMETER + CORNERS T2 D4 ──────────────────────────────
    if do_corners_rest:
        cl.append("(--- OP2: PERIMETER + CORNERS REST T2 D4 ---)")
        cl.append(f"(    feed={feed_t2} mm/min  plunge={feed_t2_plunge} mm/min  corner={feed_t2_corner} mm/min)")
        cl.append(f"{t2_tool_t} M6")
        cl.append(f"S{t2_spindle} M3")
        cl.append("")

        offsets_t2 = []
        off = t6_r - t2_d
        while off > t2_r:
            offsets_t2.append(round(off, 1))
            off -= t2_d
        offsets_t2.append(t2_r)

        shaker_doors = [d for d in sheet_doors if d['type'] in ('Shaker', 'Shaker Step')]
        for d in optimize_path(shaker_doors, curr_x, curr_y):
            px_min = d['x'] + frame_w
            px_max = d['x'] + d['w'] - frame_w
            py_min = d['y'] + frame_w
            py_max = d['y'] + d['h'] - frame_w
            if (px_max - px_min) < 2 * t2_r or (py_max - py_min) < 2 * t2_r:
                continue

            cl.append(f"(TYPE: {d['type']} | T2 ID {d['id']}  T6_R={t6_r:.1f}  steps={len(offsets_t2)})")

            # Snake wall strip
            if "Snake" in pocket_strategy:
                snake_off = t6_r
                if (px_max - px_min - 2 * snake_off) > 0 and (py_max - py_min - 2 * snake_off) > 0:
                    sx1 = px_min + snake_off
                    sx2 = px_max - snake_off
                    cl.append("(-- Snake wall strip: CCW at t6_r offset --)")
                    cl.append(f"G0 X{sx1:.3f} Y{py_min + t2_r:.3f} Z{z_top + 5.0}")
                    cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                    cl.append(f"G1 X{sx2:.3f} F{feed_t2}")
                    cl.append(f"G1 Y{py_max - t2_r:.3f}")
                    cl.append(f"G1 X{sx1:.3f}")
                    cl.append(f"G1 Y{py_min + t2_r:.3f}")
                    cl.append(f"G0 Z{z_top + 3.0}")

            # Perimeter finish pass
            cl.append("(-- Perimeter finish pass: CCW at t2_r offset --)")
            pp_x1 = px_min + t2_r
            pp_x2 = px_max - t2_r
            pp_y1 = py_min + t2_r
            pp_y2 = py_max - t2_r
            cl.append(f"G0 X{pp_x1:.3f} Y{pp_y1:.3f} Z{z_top + 5.0}")
            cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
            cl.append(f"G1 X{pp_x2:.3f} F{feed_t2}")
            cl.append("G4 P0")
            cl.append(f"G1 Y{pp_y2:.3f} F{feed_t2}")
            cl.append("G4 P0")
            cl.append(f"G1 X{pp_x1:.3f} F{feed_t2}")
            cl.append("G4 P0")
            cl.append(f"G1 Y{pp_y1:.3f} F{feed_t2}")
            cl.append(f"G0 Z{z_top + 3.0}")

            # Corner L-passes
            cl.append("(-- Corner L-passes --)")
            corners_cfg = [
                (px_min, py_min, +1, +1),
                (px_max, py_min, -1, +1),
                (px_max, py_max, -1, -1),
                (px_min, py_max, +1, -1),
            ]
            _si_t2 = min(range(4), key=lambda i: (corners_cfg[i][0] - curr_x) ** 2 +
                         (corners_cfg[i][1] - curr_y) ** 2)
            corners_cfg = corners_cfg[_si_t2:] + corners_cfg[:_si_t2]
            for j_c, (cx_, cy_, dx, dy) in enumerate(corners_cfg):
                for j, off_val in enumerate(offsets_t2):
                    if off_val <= t2_r:
                        continue
                    x_start = cx_ + dx * off_val
                    y_start = cy_ + dy * t2_r
                    x_end = cx_ + dx * t2_r
                    y_end = cy_ + dy * off_val
                    if j == 0:
                        cl.append(f"G0 X{x_start:.3f} Y{y_start:.3f}")
                        cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                    else:
                        cl.append(f"G0 Z{z_top + 3.0}")
                        cl.append(f"G0 X{x_start:.3f} Y{y_start:.3f}")
                        cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                    cl.append(f"G1 Y{y_end:.3f} F{feed_t2_corner}")
                    cl.append("G4 P0")
                    cl.append(f"G1 X{x_end:.3f} F{feed_t2}")
                cl.append(f"G0 Z{z_top + 3.0}")
                curr_x, curr_y = cx_, cy_

            cl.append(f"G0 Z{z_safe}")
            curr_x, curr_y = d['x'] + d['w'] / 2, d['y'] + d['h'] / 2
            cl.append("")

    # ── OP3: T5 MITERS / CHAMFERS ────────────────────────────────
    _do_inner = chamfer_depth > 0
    _do_outer = outer_chamfer_depth > 0
    if do_french_miter or _do_inner or _do_outer:
        cl.append("(--- OP3: MITERS & CHAMFERS T5 V90 ---)")
        cl.append(f"{t5_tool_t} M6")
        cl.append(f"S{t5_spindle} M3")
        cl.append("")
        for d in optimize_path(sheet_doors, curr_x, curr_y):
            px_min = d['x'] + frame_w
            px_max = d['x'] + d['w'] - frame_w
            py_min = d['y'] + frame_w
            py_max = d['y'] + d['h'] - frame_w
            ox_min = d['x']
            ox_max = d['x'] + d['w']
            oy_min = d['y']
            oy_max = d['y'] + d['h']
            t5_buf = []
            if d['type'] in ('Shaker', 'Shaker Step'):
                if do_french_miter or _do_inner:
                    _z_cham1 = z_chamfer if _do_inner else z_top
                    curr_x, curr_y = _combined_miter_chamfer(
                        t5_buf, px_min, px_max, py_min, py_max,
                        z_start=z_top, z_end=z_bottom, z_cham=_z_cham1,
                        depth=pocket_depth, z_safe=z_safe,
                        feed_cut=4000, feed_plunge=1000,
                        cx=curr_x, cy=curr_y)
            if _do_outer:
                t5_buf.append(f"(TYPE: {d['type']} | T5 OUTER CHAMFER ID {d['id']})")
                t5_buf.append(f"G0 X{ox_min:.3f} Y{oy_min + out_r:.3f} Z{z_top + 5}")
                t5_buf.append(f"G1 Z{z_chamfer_outer} F1000")
                t5_buf.append(f"G1 Y{oy_max - out_r:.3f} F4000")
                t5_buf.append(f"G2 X{ox_min + out_r:.3f} Y{oy_max:.3f} R{out_r}")
                t5_buf.append(f"G1 X{ox_max - out_r:.3f}")
                t5_buf.append(f"G2 X{ox_max:.3f} Y{oy_max - out_r:.3f} R{out_r}")
                t5_buf.append(f"G1 Y{oy_min + out_r:.3f}")
                t5_buf.append(f"G2 X{ox_max - out_r:.3f} Y{oy_min:.3f} R{out_r}")
                t5_buf.append(f"G1 X{ox_min + out_r:.3f}")
                t5_buf.append(f"G2 X{ox_min:.3f} Y{oy_min + out_r:.3f} R{out_r}")
                t5_buf.append(f"G0 Z{z_safe}")
            if t5_buf:
                cl.append(f"(TYPE: {d['type']} | T5 ID {d['id']})")
                cl.extend(t5_buf)
            curr_x, curr_y = d['x'] + d['w'] / 2, d['y'] + d['h'] / 2
        cl.append("")

    # ── OP4: CUTOUT T3 ─────────────────────────────────────────────
    if do_cutout:
        cl.append("(--- OP4: CUTOUT T3 D6 ---)")
        cl.append(f"{t3_tool_t} M6")
        cl.append(f"S{t3_spindle} M3")
        cl.append("")
        mg_val = margin
        doors_sorted = sorted(sheet_doors, key=lambda d: d['orig_w'] * d['orig_h'])
        for d in optimize_path(doors_sorted, curr_x, curr_y):
            ox_min = d['x'] - 3.0
            ox_max = d['x'] + d['w'] + 3.0
            oy_min = d['y'] - 3.0
            oy_max = d['y'] + d['h'] + 3.0
            rx = out_r + 3.0

            # Entry side detection
            dl = d['x'] - mg_val
            dr = (sheet_w - mg_val) - (d['x'] + d['w'])
            db = d['y'] - mg_val
            dt = (sheet_h - mg_val) - (d['y'] + d['h'])
            mn = min(dl, dr, db, dt)
            if mn == dl:
                es = 'R'
            elif mn == dr:
                es = 'L'
            elif mn == db:
                es = 'T'
            else:
                es = 'B'

            cl.append(f"(TYPE: {d['type']} | T3 ID {d['id']}  entry={es})")

            _t3d = kerf
            ramp_len = round(min(max(4.0 * _t3d, 24.0), 60.0), 1)
            ramp_dz = round(min(_t3d * 0.5, ramp_len * 0.087, 3.0), 2)
            ramp_feed = max(600, t3_feed_cut // 5)

            def zigzag(cl, axis, p0, p1, z_start, z_target, ramp_len, ramp_dz, ramp_feed):
                z = z_start
                direction = 1
                pos = p0
                while z > z_target:
                    z_next = max(z - ramp_dz, z_target)
                    pos_next = pos + direction * ramp_len
                    pos_next = max(min(pos_next, p1), p0)
                    if axis == 'Y':
                        cl.append(f"G1 Y{pos_next:.3f} Z{z_next:.3f} F{ramp_feed}")
                    else:
                        cl.append(f"G1 X{pos_next:.3f} Z{z_next:.3f} F{ramp_feed}")
                    z = z_next
                    pos = pos_next
                    direction *= -1
                if axis == 'Y':
                    cl.append(f"G1 Y{p0:.3f} F{ramp_feed}")
                else:
                    cl.append(f"G1 X{p0:.3f} F{ramp_feed}")

            if es == 'L':
                sy_s = oy_min + rx
                p1_ramp = min(sy_s + 999.0, oy_max - rx)
                cl.append(f"G0 X{ox_min:.3f} Y{sy_s:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'Y', sy_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                cl.append(f"G1 Y{oy_max - rx:.3f} F{t3_feed_cut}")
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cl.append(f"G1 X{ox_max - rx:.3f}")
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cl.append(f"G1 Y{oy_min + rx:.3f}")
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cl.append(f"G1 X{ox_min + rx:.3f}")
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cl.append(f"G1 Y{sy_s:.3f}")
            elif es == 'R':
                sy_s = oy_max - rx
                p1_ramp = max(sy_s - 999.0, oy_min + rx)
                cl.append(f"G0 X{ox_max:.3f} Y{sy_s:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'Y', sy_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                cl.append(f"G1 Y{oy_min + rx:.3f} F{t3_feed_cut}")
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cl.append(f"G1 X{ox_min + rx:.3f}")
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cl.append(f"G1 Y{oy_max - rx:.3f}")
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cl.append(f"G1 X{ox_max - rx:.3f}")
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cl.append(f"G1 Y{sy_s:.3f}")
            elif es == 'T':
                sx_s = ox_min + rx
                p1_ramp = min(sx_s + 999.0, ox_max - rx)
                cl.append(f"G0 X{sx_s:.3f} Y{oy_max:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'X', sx_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                cl.append(f"G1 X{ox_max - rx:.3f} F{t3_feed_cut}")
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cl.append(f"G1 Y{oy_min + rx:.3f}")
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cl.append(f"G1 X{ox_min + rx:.3f}")
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cl.append(f"G1 Y{oy_max - rx:.3f}")
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cl.append(f"G1 X{sx_s:.3f}")
            else:  # 'B'
                sx_s = ox_max - rx
                p1_ramp = max(sx_s - 999.0, ox_min + rx)
                cl.append(f"G0 X{sx_s:.3f} Y{oy_min:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'X', sx_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                cl.append(f"G1 X{ox_min + rx:.3f} F{t3_feed_cut}")
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cl.append(f"G1 Y{oy_max - rx:.3f}")
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cl.append(f"G1 X{ox_max - rx:.3f}")
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cl.append(f"G1 Y{oy_min + rx:.3f}")
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cl.append(f"G1 X{sx_s:.3f}")
            cl.append(f"G0 Z{z_safe}")
            curr_x, curr_y = d['x'] + d['w'] / 2, d['y'] + d['h'] / 2
            cl.append("")

    cl += ["G0 Z50.0", "G0 Y3000.0", "M5", "M30", "%"]
    cl = _sanitize_gcode(cl)
    return "\n".join(cl)


# ════════════════════════════════════════════════════════════════════════
#  Helper: Combined Miter/Chamfer path (OP3 internal)
# ════════════════════════════════════════════════════════════════════════

def _corners_ccw(xmin, xmax, ymin, ymax):
    return [(xmin, ymin, 1, 1), (xmax, ymin, -1, 1),
            (xmax, ymax, -1, -1), (xmin, ymax, 1, -1)]


def _nearest_start(corners, cx, cy):
    dists = [(c[0] - cx) ** 2 + (c[1] - cy) ** 2 for c in corners]
    return dists.index(min(dists))


def _combined_miter_chamfer(buf, xmin, xmax, ymin, ymax,
                            z_start, z_end, z_cham, depth,
                            z_safe, feed_cut, feed_plunge, cx, cy):
    corners = _corners_ccw(xmin, xmax, ymin, ymax)
    si = _nearest_start(corners, cx, cy)
    order = [(si + i) % 4 for i in range(4)]

    for i, idx in enumerate(order):
        xc, yc, dx, dy = corners[idx]
        next_idx = order[(i + 1) % 4]
        xn, yn = corners[next_idx][0], corners[next_idx][1]

        if i == 0:
            buf.append(f"G0 X{xc:.3f} Y{yc:.3f} Z{z_safe:.1f}")
            buf.append(f"G1 Z{z_start:.3f} F{feed_plunge}")
        else:
            buf.append(f"G1 Z{z_start:.3f} F{feed_plunge}")

        buf.append(f"G1 X{xc + depth * dx:.3f} Y{yc + depth * dy:.3f} Z{z_end:.3f} F{feed_plunge}")
        buf.append(f"G1 X{xc:.3f} Y{yc:.3f} Z{z_start:.3f} F{feed_plunge * 3}")
        buf.append(f"G1 Z{z_cham:.3f} F{feed_plunge}")

        if xc == xn:
            buf.append(f"G1 Y{yn:.3f} F{feed_cut}")
        elif yc == yn:
            buf.append(f"G1 X{xn:.3f} F{feed_cut}")
        else:
            buf.append(f"G1 X{xn:.3f} Y{yn:.3f} F{feed_cut}")

    buf.append(f"G0 Z{z_safe:.1f}")
    last = corners[order[-1]]
    return last[0], last[1]
