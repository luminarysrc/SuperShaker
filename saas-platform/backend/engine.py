"""
SuperShaker Engine — Pure computational core
=============================================
Extracted from SuperShaker_v5.4.2.py — no Tkinter dependencies.
Contains: MaxRectsPacker, nesting, G-code generation, calc_t6_params.
"""
import math
import re

RU_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}
SUBS_MAP = {'\u2014': '-', '\u2013': '-', '\u2192': '->', '\u21d2': '=>',
            '\u2026': '...', '\u22c5': '*'}

def _make_gcode_trans_table():
    table = {ord(u): r for u, r in SUBS_MAP.items()}
    for u, r in RU_MAP.items():
        table[ord(u)] = r
        table[ord(u.upper())] = r.upper()
    return table

_GCODE_TRANS_TABLE = _make_gcode_trans_table()


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
               allow_rotation=True, small_part_threshold=0.05,
               nesting_iterations=100, sheet_grain="None", offcuts=None):
    """
    Run MaxRects Monte Carlo nesting optimizer.
    doors: list of {'id', 'w', 'h', 'qty', 'type'}
    nesting_iterations: number of random permutations to try (first 6 are deterministic).
    Returns: dict with "sheets" and "sheets_meta".
    """
    import random
    
    available_offcuts = []
    if offcuts:
        for o in offcuts:
            for _ in range(o.get('qty', 1)):
                available_offcuts.append({"w": o["w"], "h": o["h"], "id": o["id"], "is_offcut": True})
        # Sort largest offcuts first
        available_offcuts.sort(key=lambda x: x["w"] * x["h"], reverse=True)


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
                'grain': d.get('grain', 'None'),
                'rail_position': d.get('rail_position'),
            })

    base_funcs = [
        lambda w, h: w * h,
        lambda w, h: max(w, h),
        lambda w, h: w + h,
    ]

    best_sheets = []
    min_sheets = float('inf')
    best_free_last = -1

    iterations = max(6, nesting_iterations)

    for i in range(iterations):
        # First 6 iterations are deterministic (backward-compatible)
        is_deterministic = i < 6
        sf_idx = (i % 6) // 2
        pref_rot = (i % 2) == 1 if is_deterministic else random.choice([False, True])

        items = []
        for item in flat_list:
            w, h = item['w'], item['h']
            
            can_rotate = allow_rotation
            must_rotate = False
            part_grain = item['grain']
            if sheet_grain != "None" and part_grain != "None":
                can_rotate = False
                if sheet_grain != part_grain:
                    must_rotate = True

            weight = base_funcs[sf_idx](w, h)

            final_w, final_h = w, h
            if not can_rotate:
                if must_rotate:
                    final_w, final_h = h, w
            else:
                if allow_rotation and pref_rot and w < h:
                    final_w, final_h = h, w
                elif allow_rotation and not pref_rot and h < w:
                    final_w, final_h = h, w

            if not is_deterministic:
                weight *= random.uniform(0.7, 1.3)  # Mutate priority ±30%
                if can_rotate and random.random() < 0.15:
                    final_w, final_h = final_h, final_w  # Individual rotation flip 15% chance

            items.append({
                'id': item['id'], 'type': item['type'],
                'w': final_w, 'h': final_h,
                'orig_w': item['orig_w'], 'orig_h': item['orig_h'],
                'sort_weight': weight,
                'can_rotate': can_rotate,
            })

        work_cx = work_w / 2
        work_cy = work_h / 2
        large_items = sorted(
            [it for it in items if it['orig_w'] * it['orig_h'] >= thr_mm2],
            key=lambda x: x['sort_weight'], reverse=True)
        small_items = sorted(
            [it for it in items if it['orig_w'] * it['orig_h'] < thr_mm2],
            key=lambda x: x['sort_weight'], reverse=True)

        packed_sheets = []
        packed_sheets_meta = []
        offcut_pool = available_offcuts[:]

        while large_items or small_items:
            s_w, s_h = sheet_w, sheet_h
            is_offcut = False
            o_id = None
            if offcut_pool:
                off = offcut_pool.pop(0)
                s_w, s_h = off["w"], off["h"]
                is_offcut = True
                o_id = off["id"]

            work_w = max(0, s_w - 2 * margin)
            work_h = max(0, s_h - 2 * margin)
            
            if work_w <= 0 or work_h <= 0:
                if is_offcut:
                    continue
                else:
                    break

            packer = MaxRectsPacker(work_w, work_h)
            work_cx = work_w / 2
            work_cy = work_h / 2
            cur = []
            rem_l = []
            rem_s = []

            for item in large_items:
                pos = packer.pack(item['w'], item['h'])
                if pos is None and item['can_rotate']:
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
                if pos is None and item['can_rotate']:
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
                if is_offcut:
                    continue
                else:
                    break
            packed_sheets.append(cur)
            packed_sheets_meta.append({"w": s_w, "h": s_h, "is_offcut": is_offcut, "offcut_id": o_id})
            large_items = rem_l
            small_items = rem_s

        # Selection: metric should maximize yield or minimize waste
        # Simple for now: fewest standard sheets, then maximize free area on last sheet
        free_last = 0
        if packed_sheets_meta:
            used_last = sum((r['w'] + kerf) * (r['h'] + kerf) for r in packed_sheets[-1])
            free_last = (packed_sheets_meta[-1]['w'] * packed_sheets_meta[-1]['h']) - used_last

        num_std_sheets = sum(1 for m in packed_sheets_meta if not m['is_offcut'])

        if num_std_sheets < min_sheets:
            min_sheets = num_std_sheets
            best_sheets = packed_sheets
            best_sheets_meta = packed_sheets_meta
            best_free_last = free_last
        elif num_std_sheets == min_sheets and free_last > best_free_last:
            best_sheets = packed_sheets
            best_sheets_meta = packed_sheets_meta
            best_free_last = free_last

    # Calculate stats
    total_parts = sum(len(s) for s in best_sheets)
    total_area = sum(d['orig_w'] * d['orig_h'] for s in best_sheets for d in s) / 1e6
    total_avail = sum(m['w'] * m['h'] for m in best_sheets_meta) / 1e6 if best_sheets_meta else 0
    yield_pct = (total_area / total_avail * 100) if total_avail else 0

    # Calculate offcut suggestions
    for i, sheet in enumerate(best_sheets):
        m = best_sheets_meta[i]
        if not sheet or m.get('is_offcut'):
            m['offcut_suggestions'] = []
            continue
        
        sw, sh = m['w'], m['h']
        max_x = max(p['x'] + p['w'] + kerf for p in sheet)
        max_y = max(p['y'] + p['h'] + kerf for p in sheet)
        
        min_dim = 200.0
        
        # Option A: Vertical cut first
        # Offcut 1: Right of max_x
        o_v1 = {'w': sw - max_x, 'h': sh, 'x': max_x, 'y': 0}
        # Offcut 2: Top of max_y, limited to max_x width
        o_v2 = {'w': max_x, 'h': sh - max_y, 'x': 0, 'y': max_y}
        
        # Option B: Horizontal cut first
        # Offcut 1: Top of max_y
        o_h1 = {'w': sw, 'h': sh - max_y, 'x': 0, 'y': max_y}
        # Offcut 2: Right of max_x, limited to max_y height
        o_h2 = {'w': sw - max_x, 'h': max_y, 'x': max_x, 'y': 0}
        
        def get_valid(o1, o2):
            v = []
            if o1['w'] >= min_dim and o1['h'] >= min_dim: v.append(o1)
            if o2['w'] >= min_dim and o2['h'] >= min_dim: v.append(o2)
            return v
            
        opt_a = get_valid(o_v1, o_v2)
        opt_b = get_valid(o_h1, o_h2)
        
        def max_area(opts):
            return max([o['w'] * o['h'] for o in opts] + [0])
            
        suggestions = opt_a if max_area(opt_a) >= max_area(opt_b) else opt_b
        m['offcut_suggestions'] = [{'w': round(s['w'], 1), 'h': round(s['h'], 1), 'x': round(s['x'], 1), 'y': round(s['y'], 1)} for s in suggestions]

    return {
        "sheets": best_sheets,
        "sheets_meta": best_sheets_meta,
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

    def clean_comment(text):
        return text.translate(_GCODE_TRANS_TABLE).encode('ascii', 'ignore').decode().replace(' / ', ' + ')

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
#  Helper: Tab / Bridge Insertion
# ════════════════════════════════════════════════════════════════════════

def _insert_tabs_on_segment(cl, axis, p0, p1, z_cut, tab_h, tab_w, n_tabs, cut_feed, tab_feed):
    """
    Emit G-code for a single axis-aligned straight segment that includes
    raised tabs (bridges) to keep the work-piece on the vacuum table.

    cl        – G-code line list to append to
    axis      – 'X' or 'Y'
    p0, p1    – start and end coordinate along 'axis' (monotonic, either direction)
    z_cut     – Z depth of normal cut (e.g. -0.2)
    tab_h     – how far the cutter rises ABOVE z_cut for the bridge (e.g. 0.4 mm)
    tab_w     – width of each bridge (mm)
    n_tabs    – number of tabs to insert on this segment
    cut_feed  – feedrate for normal cutting
    tab_feed  – feedrate for the slow Z lift / traverse / lower over the tab
    """
    seg_len = abs(p1 - p0)
    direction = 1 if p1 >= p0 else -1

    # Spacing between tab centres
    if n_tabs < 1 or seg_len < tab_w * 3:
        # Segment too short for tabs — cut straight through
        if axis == 'X':
            cl.append(f"G1 X{p1:.3f} F{cut_feed}")
        else:
            cl.append(f"G1 Y{p1:.3f} F{cut_feed}")
        return

    spacing = seg_len / (n_tabs + 1)
    pos = p0
    z_tab = round(z_cut + tab_h, 3)

    for i in range(n_tabs):
        tab_center = p0 + direction * spacing * (i + 1)
        tab_start  = tab_center - direction * tab_w / 2
        tab_end    = tab_center + direction * tab_w / 2

        # Cut up to tab start
        if axis == 'X':
            cl.append(f"G1 X{tab_start:.3f} F{cut_feed}")
            cl.append(f"G1 Z{z_tab:.3f} F{tab_feed}")
            cl.append(f"G1 X{tab_end:.3f} F{tab_feed}")
            cl.append(f"G1 Z{z_cut:.3f} F{tab_feed}")
        else:
            cl.append(f"G1 Y{tab_start:.3f} F{cut_feed}")
            cl.append(f"G1 Z{z_tab:.3f} F{tab_feed}")
            cl.append(f"G1 Y{tab_end:.3f} F{tab_feed}")
            cl.append(f"G1 Z{z_cut:.3f} F{tab_feed}")
        pos = tab_end

    # Final cut to end of segment
    if axis == 'X':
        cl.append(f"G1 X{p1:.3f} F{cut_feed}")
    else:
        cl.append(f"G1 Y{p1:.3f} F{cut_feed}")


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
    rabbet_w=12.7, rabbet_d=6.35,
    # T6 params
    t6_name="T6", t6_dia=31.75, t6_type="PCD",
    t6_spindle=18000, t6_feed=6000,
    pocket_strategy="Snake", spiral_overlap=50.0,
    # Flags
    do_pocket=True, do_corners_rest=True,
    do_french_miter=True, do_cutout=True, do_rough_pass=False,
    common_line=False,
    # Tabs (bridges) for small parts
    do_tabs=True, tab_height=0.4, tab_width=4.0, tab_min_area=50000.0,
    # Other tools
    kerf=6.0, corner_r=1.0, feed_xy=8000,
    t2_tool_t="T2", t2_spindle=18000, t2_feed=6000,
    t3_tool_t="T3", t3_spindle=18000, t3_feed=8000,
    t5_tool_t="T5", t5_spindle=18000, t5_feed=8000,
    t7_tool_t="T7", t7_spindle=18000, t7_feed=6000,
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

    # Small Part Auto-correction
    for d in sheet_doors:
        if d['type'] in ('Shaker', 'Shaker Step', 'Shaker Rail', 'Beaded Shaker'):
            local_frame_w = frame_w
            pw = d['w'] - 2 * local_frame_w
            ph = d['h'] - 2 * local_frame_w
            if pw < t6_dia or ph < t6_dia:
                d['type'] = 'Slab'

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

        shaker_doors = [d for d in sheet_doors if d['type'] in ('Shaker', 'Shaker Step', 'Beaded Shaker', 'Shaker Rail')]
        for d in optimize_path(shaker_doors, curr_x, curr_y):
            local_frame_w = frame_w
            _b_px_min = d['x'] + local_frame_w
            _b_px_max = d['x'] + d['w'] - local_frame_w
            _b_py_min = d['y'] + local_frame_w
            _b_py_max = d['y'] + d['h'] - local_frame_w
            if d['type'] == 'Shaker Rail':
                _rp_op1  = d.get('rail_position', d['h'] / 2.0)
                _rt_op1  = d['y'] + _rp_op1 + local_frame_w / 2.0
                _rb_op1  = d['y'] + _rp_op1 - local_frame_w / 2.0
                _op1_pkt = []
                if _rb_op1 - _b_py_min > t6_r * 2:
                    _op1_pkt.append((_b_px_min, _b_px_max, _b_py_min, _rb_op1))
                if _b_py_max - _rt_op1 > t6_r * 2:
                    _op1_pkt.append((_b_px_min, _b_px_max, _rt_op1, _b_py_max))
            else:
                _op1_pkt = [(_b_px_min, _b_px_max, _b_py_min, _b_py_max)]

            for _op1_pi, (_pm1, _pM1, _qm1, _qM1) in enumerate(_op1_pkt):
                px_min = _pm1; px_max = _pM1; py_min = _qm1; py_max = _qM1
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
    
                _op1_is_ring = (d['type'] == 'Shaker Step' and pocket_depth2 > 0)
                for pass_idx in range(num_passes):
                    current_z = z_top - pass_depth * (pass_idx + 1)
                    current_z = max(current_z, z_bottom)
    
                    is_rough = (pass_idx == 0) and (num_passes > 1)
                    active_strategy = "Snake" if is_rough else pocket_strategy
                    current_step = (t6_dia * 0.90) if is_rough else step_finish
    
                    if _op1_is_ring:
                        import math as _math
                        n_ring = max(1, _math.ceil(pocket_step_offset / current_step))
                        first_ring = True
                        for ri in range(n_ring):
                            off_i = ri * current_step
                            rx0 = cx_min + off_i;  rx1 = cx_max - off_i
                            ry0 = cy_min + off_i;  ry1 = cy_max - off_i
                            if rx1 < rx0 or ry1 < ry0: break
                            if first_ring:
                                cl.append(f"G0 Z{z_top + 5.0}")
                                cl.append(f"G0 X{rx0:.3f} Y{ry0:.3f}")
                                cl.append(f"G1 Z{z_top + 0.5:.3f} F2000")
                                ramp_x = min(rx0 + 60.0, rx1)
                                cl.append(f"G1 X{ramp_x:.3f} Z{current_z:.3f} F800")
                                if ramp_x > rx0:
                                    cl.append(f"G1 X{rx0:.3f} F{t6_feed}")
                                first_ring = False
                            else:
                                cl.append(f"G1 X{rx0:.3f} Y{ry0:.3f} F{t6_feed}")
                            cl.append(f"G1 X{rx1:.3f} F{t6_feed}")
                            cl.append(f"G1 Y{ry1:.3f}")
                            cl.append(f"G1 X{rx0:.3f}")
                            cl.append(f"G1 Y{ry0:.3f}")
                        fin_x0 = cx_min + n_ring * current_step
                        fin_y0 = cy_min + n_ring * current_step
                        fin_x1 = cx_max - n_ring * current_step
                        fin_y1 = cy_max - n_ring * current_step
                        if fin_x1 >= fin_x0 and fin_y1 >= fin_y0:
                            cl.append(f"G1 X{fin_x0:.3f} Y{fin_y0:.3f} F{t6_feed}")
                            cl.append(f"G1 X{fin_x1:.3f} F{t6_feed}")
                            cl.append(f"G1 Y{fin_y1:.3f}")
                            cl.append(f"G1 X{fin_x0:.3f}")
                            cl.append(f"G1 Y{fin_y0:.3f}")
                    elif "Snake" in active_strategy:
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


    # ── OP1b: GLASS — rabbet (T3) + through opening (T3) ──────────────
    glass_doors = [d for d in sheet_doors if d['type'] == 'Glass']
    if glass_doors:
        _t3_r_gl  = kerf / 2.0
        _t3_d_gl  = kerf
        _t3s_gl   = t3_spindle
        _t3f_gl   = t3_feed_cut
        _t3fp_gl  = max(200, _t3f_gl // 6)
        # Use parameterized rabbet_w and rabbet_d
        z_rabbet = z_top - rabbet_d

        cl.append("(--- OP1b-A: GLASS RABBET T3 [from frame_w inward by rabbet_w] ---)")
        cl.append(f"{t3_tool_t} M6")
        cl.append(f"S{_t3s_gl} M3")
        cl.append("")

        for d in optimize_path(glass_doors, curr_x, curr_y):
            _fw   = frame_w
            _rbw  = rabbet_w
            _rbd  = rabbet_d
            _zrbt = z_rabbet

            import math
            _n_passes  = max(1, int(math.ceil(_rbw / _t3_d_gl)))
            _step_pass = _rbw / _n_passes

            cl.append(f"(GLASS RABBET ID {d['id']} {d['orig_w']:.0f}x{d['orig_h']:.0f}"
                      f"  frame_w={_fw:.1f} rabbet_w={_rbw:.1f} rabbet_d={_rbd:.1f}"
                      f"  Z={_zrbt:.3f}  passes={_n_passes})")

            for _pi in range(_n_passes):
                _off = (_fw - _rbw) + _pi * _step_pass + _t3_r_gl
                _rx0 = d['x'] + _off
                _rx1 = d['x'] + d['w'] - _off
                _ry0 = d['y'] + _off
                _ry1 = d['y'] + d['h'] - _off
                if _rx1 <= _rx0 or _ry1 <= _ry0:
                    break
                _ramp_x1 = round(min(_rx0 + 60.0, _rx1), 3)
                cl.append(f"(  pass {_pi+1}/{_n_passes} offset={_off:.2f})")
                cl.append(f"G0 X{_rx0:.3f} Y{_ry0:.3f} Z{z_safe:.1f}")
                cl.append(f"G1 Z{z_top:.3f} F{_t3fp_gl}")
                cl.append(f"G1 X{_ramp_x1:.3f} Z{_zrbt:.3f} F800")
                cl.append(f"G1 X{_rx0:.3f} F{_t3f_gl}")
                cl.append(f"G1 X{_rx1:.3f} F{_t3f_gl}")
                cl.append(f"G1 Y{_ry1:.3f}")
                cl.append(f"G1 X{_rx0:.3f}")
                cl.append(f"G1 Y{_ry0:.3f}")
                cl.append(f"G0 Z{z_safe:.1f}")
            curr_x = d['x'] + _fw; curr_y = d['y'] + _fw

        cl.append("")
        cl.append("(--- OP1b-B: GLASS OPENING through-cut T3 [1 pass Z=-0.2] ---)")
        cl.append("")

        for d in optimize_path(glass_doors, curr_x, curr_y):
            _fw  = frame_w
            _ox0 = d['x'] + _fw + _t3_r_gl
            _ox1 = d['x'] + d['w'] - _fw - _t3_r_gl
            _oy0 = d['y'] + _fw + _t3_r_gl
            _oy1 = d['y'] + d['h'] - _fw - _t3_r_gl
            if _ox1 <= _ox0 or _oy1 <= _oy0:
                continue
            _ramp_x1_o = round(min(_ox0 + 60.0, _ox1), 3)
            cl.append(f"(GLASS OPENING ID {d['id']} {d['orig_w']:.0f}x{d['orig_h']:.0f} Z=-0.200)")
            cl.append(f"G0 X{_ox0:.3f} Y{_oy0:.3f} Z{z_safe:.1f}")
            cl.append(f"G1 Z{z_top:.3f} F{_t3fp_gl}")
            cl.append(f"G1 X{_ramp_x1_o:.3f} Z{-0.2:.3f} F800")
            cl.append(f"G1 X{_ox0:.3f} F{_t3f_gl}")
            cl.append(f"G1 X{_ox1:.3f} F{_t3f_gl}")
            cl.append(f"G1 Y{_oy1:.3f}")
            cl.append(f"G1 X{_ox0:.3f}")
            cl.append(f"G1 Y{_oy0:.3f}")
            cl.append(f"G0 Z{z_safe:.1f}")
            curr_x = _ox0; curr_y = _oy0

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

        shaker_doors = [d for d in sheet_doors if d['type'] in ('Shaker', 'Shaker Step', 'Beaded Shaker', 'Thin Rail Shaker')]
        for d in optimize_path(shaker_doors, curr_x, curr_y):
            local_frame_w = frame_w
            px_min = d['x'] + local_frame_w
            px_max = d['x'] + d['w'] - local_frame_w
            py_min = d['y'] + local_frame_w
            py_max = d['y'] + d['h'] - local_frame_w
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
            local_frame_w = frame_w
            px_min = d['x'] + local_frame_w
            px_max = d['x'] + d['w'] - local_frame_w
            py_min = d['y'] + local_frame_w
            py_max = d['y'] + d['h'] - local_frame_w
            ox_min = d['x']
            ox_max = d['x'] + d['w']
            oy_min = d['y']
            oy_max = d['y'] + d['h']
            t5_buf = []
            if d['type'] in ('Shaker', 'Shaker Step', 'Beaded Shaker'):
                if do_french_miter or _do_inner:
                    _z_cham1 = z_chamfer if _do_inner else z_top
                    curr_x, curr_y = _combined_miter_chamfer(
                        t5_buf, px_min, px_max, py_min, py_max,
                        z_start=z_top, z_end=z_bottom, z_cham=_z_cham1,
                        depth=pocket_depth, z_safe=z_safe,
                        feed_cut=4000, feed_plunge=1000,
                        cx=curr_x, cy=curr_y)
            elif d['type'] == 'Grooved Slab':
                # Generate vertical grooves with T5
                t5_buf.append(f"(TYPE: Grooved Slab | T5 GROOVES ID {d['id']})")
                num_grooves = int(d['w'] / 100.0)
                if num_grooves > 0:
                    spacing = d['w'] / (num_grooves + 1)
                    groove_margin_y = 50.0  # safe margin from top/bottom edges
                    z_groove = z_top - 3.0  # plunge 3mm
                    g_start_y = oy_min + groove_margin_y
                    g_end_y = oy_max - groove_margin_y
                    if g_end_y > g_start_y:
                        t5_buf.append(f"G0 Z{z_safe}")
                        for i in range(1, num_grooves + 1):
                            gx = ox_min + i * spacing
                            t5_buf.append(f"G0 X{gx:.3f} Y{g_start_y:.3f}")
                            t5_buf.append(f"G1 Z{z_groove:.3f} F1000")
                            t5_buf.append(f"G1 Y{g_end_y:.3f} F4000")
                            t5_buf.append(f"G0 Z{z_safe}")
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

    # ── OP3.5: BEAD DETAIL T7 ──────────────────────────────────────
    beaded_doors = [d for d in sheet_doors if d['type'] == 'Beaded Shaker']
    if beaded_doors:
        cl.append("(--- OP3.5: BEAD DETAIL T7 ---)")
        cl.append(f"{t7_tool_t} M6")
        cl.append(f"S{t7_spindle} M3")
        cl.append("")
        for d in optimize_path(beaded_doors, curr_x, curr_y):
            local_frame_w = frame_w # Beaded Shaker uses standard frame_w
            px_min = d['x'] + local_frame_w
            px_max = d['x'] + d['w'] - local_frame_w
            py_min = d['y'] + local_frame_w
            py_max = d['y'] + d['h'] - local_frame_w
            if px_max > px_min and py_max > py_min:
                z_bead = z_top - 4.0 # default 4mm plunge for bead
                cl.append(f"(TYPE: Beaded Shaker | T7 BEAD ID {d['id']})")
                cl.append(f"G0 X{px_min:.3f} Y{py_min:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_bead:.3f} F1000")
                cl.append(f"G1 X{px_max:.3f} F{t7_feed}")
                cl.append(f"G1 Y{py_max:.3f}")
                cl.append(f"G1 X{px_min:.3f}")
                cl.append(f"G1 Y{py_min:.3f}")
                cl.append(f"G0 Z{z_safe}")
            curr_x, curr_y = d['x'] + d['w'] / 2, d['y'] + d['h'] / 2
        cl.append("")
    # ── OP4: CUTOUT T3 ─────────────────────────────────────────────
    if do_cutout:
        if common_line:
            cl.extend(_generate_common_line_cutout(
                sheet_doors, sheet_w, sheet_h, margin,
                t3_tool_t, t3_spindle, t3_feed, kerf, z_top, z_safe, curr_x, curr_y
            ))
            cl += ["G0 Z50.0", "G0 Y3000.0", "M5", "M30", "%"]
            cl = _sanitize_gcode(cl)
            return "\n".join(cl)

        cl.append("(--- OP4: CUTOUT T3 D6 ---)")
        cl.append(f"{t3_tool_t} M6")
        cl.append(f"S{t3_spindle} M3")
        cl.append("")
        mg_val = margin

        # Tab / bridge precomputed values
        _tab_feed = max(300, t3_feed_cut // 6)
        _z_cut = -0.2

        # Shared-side detection
        def _get_shared(d, all_doors, kerf, tol):
            sh = {'L': False, 'R': False, 'T': False, 'B': False}
            for nb in all_doors:
                if nb['id'] == d['id']: continue
                ov_y = nb['y'] < d['y']+d['h'] and nb['y']+nb['h'] > d['y']
                ov_x = nb['x'] < d['x']+d['w'] and nb['x']+nb['w'] > d['x']
                if ov_y and abs(nb['x'] - (d['x']+d['w']+kerf)) < tol:   sh['R'] = True
                if ov_y and abs((nb['x']+nb['w']) - (d['x']-kerf)) < tol: sh['L'] = True
                if ov_x and abs(nb['y'] - (d['y']+d['h']+kerf)) < tol:   sh['T'] = True
                if ov_x and abs((nb['y']+nb['h']) - (d['y']-kerf)) < tol: sh['B'] = True
            return sh
        
        _shared_cache = {d['id']: _get_shared(d, sheet_doors, kerf, 0.5) for d in sheet_doors}
        
        def _sort_key(d):
            sc = sum(_shared_cache[d['id']].values())
            return (sc, d['orig_w'] * d['orig_h'])
            
        doors_sorted = sorted(sheet_doors, key=_sort_key)
        for d in optimize_path(doors_sorted, curr_x, curr_y):
            ox_min = d['x'] - 3.0
            ox_max = d['x'] + d['w'] + 3.0
            oy_min = d['y'] - 3.0
            oy_max = d['y'] + d['h'] + 3.0
            rx = out_r + 3.0

            _part_area = d['orig_w'] * d['orig_h']
            _use_tabs = (
                do_tabs
                and d.get('is_small', False)
                and _part_area <= tab_min_area
            )
            _n_tabs = 1 if _part_area <= tab_min_area * 0.25 else 2

            sh = _shared_cache[d['id']]
            dl = d['x'] - mg_val
            dr = (sheet_w - mg_val) - (d['x'] + d['w'])
            db = d['y'] - mg_val
            dt = (sheet_h - mg_val) - (d['y'] + d['h'])
            
            side_priority = sorted([('R', dl), ('L', dr), ('T', db), ('B', dt)], key=lambda x: x[1])
            es = side_priority[0][0]
            for _side, _dist in side_priority:
                if not sh[_side]:
                    es = _side
                    break

            _tab_note = " [TABS]" if _use_tabs else ""
            cl.append(f"(TYPE: {d['type']} | T3 ID {d['id']}  entry={es}{_tab_note})")

            _t3d = kerf
            ramp_len = round(min(max(4.0 * _t3d, 24.0), 60.0), 1)
            ramp_dz = round(min(_t3d * 0.5, ramp_len * 0.087, 3.0), 2)
            ramp_feed = max(600, t3_feed_cut // 5)

            def zigzag(cl, axis, p0, p1, z_start, z_target, ramp_len, ramp_dz, ramp_feed):
                z = z_start
                direction = 1 if p1 >= p0 else -1  # FIX v5.4.3: handle R/B entry
                pos = p0
                while z > z_target:
                    z_next = max(z - ramp_dz, z_target)
                    pos_next = pos + direction * ramp_len
                    lo, hi = min(p0, p1), max(p0, p1)  # FIX: works for both directions
                    pos_next = max(lo, min(pos_next, hi))
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

            # ── Helper: emit one straight segment, optionally with tabs ──
            def cut_seg(axis, p0, p1):
                if _use_tabs:
                    _insert_tabs_on_segment(
                        cl, axis, p0, p1, _z_cut,
                        tab_height, tab_width, _n_tabs,
                        t3_feed_cut, _tab_feed
                    )
                else:
                    if axis == 'X':
                        cl.append(f"G1 X{p1:.3f} F{t3_feed_cut}")
                    else:
                        cl.append(f"G1 Y{p1:.3f} F{t3_feed_cut}")

            if es == 'L':
                sy_s = oy_min + rx
                p1_ramp = min(sy_s + 999.0, oy_max - rx)
                cl.append(f"G0 X{ox_min:.3f} Y{sy_s:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'Y', sy_s, p1_ramp, z_top, _z_cut, ramp_len, ramp_dz, ramp_feed)
                cut_seg('Y', sy_s, oy_max - rx)
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cut_seg('X', ox_min + rx, ox_max - rx)
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cut_seg('Y', oy_max - rx, oy_min + rx)
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cut_seg('X', ox_max - rx, ox_min + rx)
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cut_seg('Y', oy_min + rx, sy_s)
            elif es == 'R':
                sy_s = oy_max - rx
                p1_ramp = max(sy_s - 999.0, oy_min + rx)
                cl.append(f"G0 X{ox_max:.3f} Y{sy_s:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'Y', sy_s, p1_ramp, z_top, _z_cut, ramp_len, ramp_dz, ramp_feed)
                cut_seg('Y', sy_s, oy_min + rx)
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cut_seg('X', ox_max - rx, ox_min + rx)
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cut_seg('Y', oy_min + rx, oy_max - rx)
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cut_seg('X', ox_min + rx, ox_max - rx)
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cut_seg('Y', oy_max - rx, sy_s)
            elif es == 'T':
                sx_s = ox_min + rx
                p1_ramp = min(sx_s + 999.0, ox_max - rx)
                cl.append(f"G0 X{sx_s:.3f} Y{oy_max:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'X', sx_s, p1_ramp, z_top, _z_cut, ramp_len, ramp_dz, ramp_feed)
                cut_seg('X', sx_s, ox_max - rx)
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cut_seg('Y', oy_max - rx, oy_min + rx)
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cut_seg('X', ox_max - rx, ox_min + rx)
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cut_seg('Y', oy_min + rx, oy_max - rx)
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cut_seg('X', ox_min + rx, sx_s)
            else:  # 'B'
                sx_s = ox_max - rx
                p1_ramp = max(sx_s - 999.0, ox_min + rx)
                cl.append(f"G0 X{sx_s:.3f} Y{oy_min:.3f} Z{z_top + 5.0}")
                cl.append(f"G1 Z{z_top:.3f} F2000")
                zigzag(cl, 'X', sx_s, p1_ramp, z_top, _z_cut, ramp_len, ramp_dz, ramp_feed)
                cut_seg('X', sx_s, ox_min + rx)
                cl.append(f"G2 X{ox_min:.3f} Y{oy_min + rx:.3f} R{rx}")
                cut_seg('Y', oy_min + rx, oy_max - rx)
                cl.append(f"G2 X{ox_min + rx:.3f} Y{oy_max:.3f} R{rx}")
                cut_seg('X', ox_min + rx, ox_max - rx)
                cl.append(f"G2 X{ox_max:.3f} Y{oy_max - rx:.3f} R{rx}")
                cut_seg('Y', oy_max - rx, oy_min + rx)
                cl.append(f"G2 X{ox_max - rx:.3f} Y{oy_min:.3f} R{rx}")
                cut_seg('X', ox_max - rx, sx_s)
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


# ════════════════════════════════════════════════════════════════════════
#  Helper: Common Line Cutting
# ════════════════════════════════════════════════════════════════════════

def _generate_common_line_cutout(sheet_doors, sheet_w, sheet_h, margin, t3_tool_t, t3_spindle, t3_feed_cut, kerf, z_top, z_safe, curr_x, curr_y):
    # Small Part Auto-correction
    for d in sheet_doors:
        if d['type'] in ('Shaker', 'Shaker Step', 'Shaker Rail', 'Beaded Shaker'):
            local_frame_w = frame_w
            pw = d['w'] - 2 * local_frame_w
            ph = d['h'] - 2 * local_frame_w
            if pw < t6_dia or ph < t6_dia:
                d['type'] = 'Slab'

    cl = []
    cl.append("(--- OP4: CUTOUT T3 D6 [COMMON LINE] ---)")
    cl.append(f"{t3_tool_t} M6")
    cl.append(f"S{t3_spindle} M3")
    cl.append("")
    
    lines_h = []
    lines_v = []
    
    # 1. Collect all straight line segments
    for d in sheet_doors:
        ox_min = round(d['x'] - 3.0, 3)
        ox_max = round(d['x'] + d['w'] + 3.0, 3)
        oy_min = round(d['y'] - 3.0, 3)
        oy_max = round(d['y'] + d['h'] + 3.0, 3)
        
        lines_h.append({'y': oy_min, 'x0': ox_min, 'x1': ox_max})
        lines_h.append({'y': oy_max, 'x0': ox_min, 'x1': ox_max})
        lines_v.append({'x': ox_min, 'y0': oy_min, 'y1': oy_max})
        lines_v.append({'x': ox_max, 'y0': oy_min, 'y1': oy_max})
        
    # 2. Merge collinear segments
    def merge_segments(segments, axis):
        merged = []
        groups = {}
        for seg in segments:
            k = round(seg['y'] if axis == 'h' else seg['x'], 3)
            groups.setdefault(k, []).append(seg)
            
        for key, items in groups.items():
            if axis == 'h':
                items.sort(key=lambda s: s['x0'])
            else:
                items.sort(key=lambda s: s['y0'])
                
            cur = items[0].copy()
            for i in range(1, len(items)):
                nxt = items[i]
                if axis == 'h':
                    if nxt['x0'] <= cur['x1'] + 0.5:
                        cur['x1'] = max(cur['x1'], nxt['x1'])
                    else:
                        merged.append(cur)
                        cur = nxt.copy()
                else:
                    if nxt['y0'] <= cur['y1'] + 0.5:
                        cur['y1'] = max(cur['y1'], nxt['y1'])
                    else:
                        merged.append(cur)
                        cur = nxt.copy()
            merged.append(cur)
        return merged
        
    merged_h = merge_segments(lines_h, 'h')
    merged_v = merge_segments(lines_v, 'v')
    
    paths = []
    for h in merged_h:
        paths.append({'x0': h['x0'], 'y0': h['y'], 'x1': h['x1'], 'y1': h['y']})
    for v in merged_v:
        paths.append({'x0': v['x'], 'y0': v['y0'], 'x1': v['x'], 'y1': v['y1']})
        
    # 3. Optimize path (nearest neighbor)
    unvisited = list(paths)
    optimized_paths = []
    while unvisited:
        best_path = None
        best_dist = float('inf')
        reverse = False
        
        for p in unvisited:
            d0 = (p['x0'] - curr_x)**2 + (p['y0'] - curr_y)**2
            d1 = (p['x1'] - curr_x)**2 + (p['y1'] - curr_y)**2
            if d0 < best_dist:
                best_dist, best_path, reverse = d0, p, False
            if d1 < best_dist:
                best_dist, best_path, reverse = d1, p, True
                
        if reverse:
            optimized_paths.append({'x0': best_path['x1'], 'y0': best_path['y1'], 'x1': best_path['x0'], 'y1': best_path['y0']})
            curr_x, curr_y = best_path['x0'], best_path['y0']
        else:
            optimized_paths.append({'x0': best_path['x0'], 'y0': best_path['y0'], 'x1': best_path['x1'], 'y1': best_path['y1']})
            curr_x, curr_y = best_path['x1'], best_path['y1']
        unvisited.remove(best_path)
            
    # 4. Generate segment instructions
    ramp_feed = max(600, t3_feed_cut // 5)
    for p in optimized_paths:
        cl.append(f"G0 X{p['x0']:.3f} Y{p['y0']:.3f} Z{z_top + 5.0}")
        cl.append(f"G1 Z{z_top:.3f} F2000")
        
        # Simple ramp-in
        dist = math.sqrt((p['x1'] - p['x0'])**2 + (p['y1'] - p['y0'])**2)
        ramp_len = min(24.0, dist / 2.0)
        dx = (p['x1'] - p['x0']) / dist if dist > 0 else 0
        dy = (p['y1'] - p['y0']) / dist if dist > 0 else 0
        
        rx = p['x0'] + dx * ramp_len
        ry = p['y0'] + dy * ramp_len
        cl.append(f"G1 X{rx:.3f} Y{ry:.3f} Z{-0.2:.3f} F{ramp_feed}")
        cl.append(f"G1 X{p['x1']:.3f} Y{p['y1']:.3f} F{t3_feed_cut}")
        cl.append(f"G0 Z{z_safe}")
        
    cl.append("")
    return cl
