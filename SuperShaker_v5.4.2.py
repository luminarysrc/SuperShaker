import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import pandas as pd
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import letter
import datetime
import json
import os
import math
import re


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

    def _split(self, fn, un):
        if (un['x'] >= fn['x'] + fn['w'] or un['x'] + un['w'] <= fn['x'] or
                un['y'] >= fn['y'] + fn['h'] or un['y'] + un['h'] <= fn['y']):
            return False
        if un['y'] > fn['y'] and un['y'] < fn['y'] + fn['h']:
            nn = fn.copy(); nn['h'] = un['y'] - nn['y']; self.free_rectangles.append(nn)
        if un['y'] + un['h'] < fn['y'] + fn['h']:
            nn = fn.copy(); nn['y'] = un['y'] + un['h']; nn['h'] = fn['y'] + fn['h'] - (un['y'] + un['h']); self.free_rectangles.append(nn)
        if un['x'] > fn['x'] and un['x'] < fn['x'] + fn['w']:
            nn = fn.copy(); nn['w'] = un['x'] - nn['x']; self.free_rectangles.append(nn)
        if un['x'] + un['w'] < fn['x'] + fn['w']:
            nn = fn.copy(); nn['x'] = un['x'] + un['w']; nn['w'] = fn['x'] + fn['w'] - (un['x'] + un['w']); self.free_rectangles.append(nn)
        return True

    def _prune(self):
        i = 0
        while i < len(self.free_rectangles):
            j = i + 1
            while j < len(self.free_rectangles):
                if self._in(self.free_rectangles[i], self.free_rectangles[j]):
                    self.free_rectangles.pop(i); i -= 1; break
                if self._in(self.free_rectangles[j], self.free_rectangles[i]):
                    self.free_rectangles.pop(j); j -= 1
                j += 1
            i += 1

    def _in(self, a, b):
        return (a['x'] >= b['x'] and a['y'] >= b['y'] and
                a['x'] + a['w'] <= b['x'] + b['w'] and
                a['y'] + a['h'] <= b['y'] + b['h'])

    def pack_biased(self, w, h, cx, cy):
        """Минимизирует расстояние центра детали до (cx,cy) — для мелких деталей."""
        best_node = None; best_dist = float('inf')
        for fr in self.free_rectangles:
            if fr['w'] >= w and fr['h'] >= h:
                d = (fr['x']+w/2-cx)**2 + (fr['y']+h/2-cy)**2
                if d < best_dist: best_node = {'x': fr['x'], 'y': fr['y'], 'w': w, 'h': h}; best_dist = d
        if best_node is None: return None
        num = len(self.free_rectangles); i = 0
        while i < num:
            if self._split(self.free_rectangles[i], best_node): self.free_rectangles.pop(i); num -= 1
            else: i += 1
        self._prune()
        return best_node


class AdvancedNestingGUI:


    @staticmethod
    def _sanitize_gcode(lines):
        """
        Strip non-ASCII and unsafe chars from G-code comment tokens (parentheses).
        Rules:
          em/en dash  → -
          arrow →     → ->
          ' / '       → ' + '
          '/'         -> '-'  (inside comments only)
          non-ASCII   → transliterated or dropped
        Applied only to comment segments inside ( ... ).
        """
        RU = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
            'ж':'zh','з':'z','и':'i','й':'j','к':'k','л':'l','м':'m',
            'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
            'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
            'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        }
        SUBS = {
            '\u2014': '-', '\u2013': '-',   # em/en dash
            '\u2192': '->',                    # →
            '\u21d2': '=>',                    # ⇒
            '\u2026': '...',                   # …
            '\u22c5': '*',                     # ⋅
        }

        def clean_comment(text):
            # apply known substitutions
            for u, r in SUBS.items():
                text = text.replace(u, r)
            # transliterate Cyrillic
            out = []
            for ch in text:
                lo = ch.lower()
                if lo in RU:
                    tr = RU[lo]
                    out.append(tr.upper() if ch.isupper() else tr)
                elif ord(ch) > 127:
                    pass   # drop remaining non-ASCII silently
                else:
                    out.append(ch)
            # ' / ' → ' + '
            result = ''.join(out).replace(' / ', ' + ')
            return result

        sanitized = []
        for line in lines:
            # G-code comments are wrapped in ( ... )
            # Replace every (...) segment in the line
            def repl(m):
                inner = clean_comment(m.group(1))
                return f"({inner})"
            line = re.sub(r'\(([^)]*)\)', repl, line)
            sanitized.append(line)
        return sanitized

    @staticmethod
    def _fval(sv):
        """float() from StringVar, accepts both "." and "," as decimal separator."""
        return float(sv.get().replace(',', '.'))

    def __init__(self, root):
        self.root = root
        self.root.title("CNC Fasady PRO  ·  MaxRects Nesting")
        self.root.geometry("1540x980")
        self.doors = []
        self.sheets = []
        import os as _os
        self.settings_file = _os.path.join(
            _os.path.dirname(_os.path.abspath(__file__)), 'cnc_settings.json')
        self.setup_ui()
        self.load_settings()
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    # ─── ПАРАМЕТРЫ ИНСТРУМЕНТА ─────────────────────────────────────────────
    # T6 limits
    T6_RPM_MAX  = 18000
    T6_RPM_MIN  = 1000
    T6_FEED_MAX = 24000
    T6_FEED_MIN = 100

    def get_pocket_tool_params(self):
        """Reads RPM and Feed from UI fields, clamped to limits."""
        try: rpm  = int(self._fval(self.t6_spindle_var))
        except Exception: rpm  = 18000
        try: feed = int(self._fval(self.t6_feed_var))
        except Exception: feed = 6000
        rpm  = max(self.T6_RPM_MIN,  min(self.T6_RPM_MAX,  rpm))
        feed = max(self.T6_FEED_MIN, min(self.T6_FEED_MAX, feed))
        return rpm, feed

    def _auto_t6_params(self, *_):
        """Auto: chip-load algorithm → sets RPM and Feed."""
        dia_str = self.pocket_tool_dia.get().strip()
        if not dia_str:
            messagebox.showerror("Tool diameter required",
                "Please enter tool diameter (D) before using Auto.")
            return
        try:
            d = float(dia_str.replace(',', '.'))
        except ValueError:
            messagebox.showerror("Invalid diameter",
                f"Cannot parse diameter value: '{dia_str}'\nUse digits and . or ,")
            return

        try:    z = int(self.pocket_tool_z.get())
        except: z = 2
        t_type   = self.pocket_tool_type.get()
        try:    doc = float(self.pocket_depth.get().replace(',', '.'))
        except: doc = 3.0

        # Use finish pass params by default (conservative)
        r = self.calc_t6_params(d, z, t_type, "finish", doc)
        self.t6_spindle_var.set(str(r["n_rec"]))
        self.t6_feed_var.set(str(r["f_rec"]))
        self.update_tool_params_label()

    def _validate_t6_field(self, var, val_min, val_max, default):
        """Clamp field to [val_min, val_max]; return (clamped_val, was_in_range)."""
        try:
            v = int(float(var.get()))
        except Exception:
            var.set(str(default)); return default, False
        clamped = max(val_min, min(val_max, v))
        if clamped != v:
            var.set(str(clamped))
            return clamped, False
        return clamped, True


    @staticmethod
    def calc_t6_params(D, z, tool_type, pass_type, doc):
        """
        Режимы резания МДФ/HDF — ТЗ v2 (9 кВт шпиндель, D до 57 мм).
        D         – диаметр мм          tool_type – "PCD" или "TCT"
        z         – число зубьев        pass_type – "rough" / "finish"
        doc       – глубина врезания мм
        """
        import math
        S_MAX = 18000; F_MAX = 24000

        # ── Таблица 1: Vc (м/с) ──────────────────────────────────────
        if tool_type == "PCD":
            vc_rec, vc_max = 50.0, 90.0
        else:                         # TCT
            vc_rec, vc_max = 25.0, 40.0

        # ── Таблица 2: fz (мм/зуб) для МДФ/HDF ──────────────────────
        if D <= 4:
            fz_lo = fz_hi = 0.10
        elif D <= 10:
            fz_lo = fz_hi = 0.15
        elif D <= 20:
            fz_lo = fz_hi = 0.25
        else:                         # 20 < D ≤ 57
            fz_lo = 0.30              # finish
            fz_hi = 0.40              # rough
        fz_mid = fz_lo if pass_type == "finish" else fz_hi

        # ── Шаг 1: Обороты n = Vc·60000 / (π·D) ─────────────────────
        def rpm_from_vc(vc):
            return vc * 60_000 / (math.pi * D)

        n_rec = rpm_from_vc(vc_rec)
        n_lo  = rpm_from_vc(vc_rec)   # нижняя граница = рек. Vc
        n_hi  = rpm_from_vc(vc_max)   # верхняя граница = макс. Vc

        spindle_warn = ""; low_rpm_warn = ""
        if D > 40 and tool_type != "PCD":   # центробежный лимит (только TCT)
            n_rec = min(n_rec, 18000)
            n_hi  = min(n_hi,  18000)
            spindle_warn = f"⚠ D > 40 мм (TCT) → n ≤ 18 000 RPM"
        n_rec = min(n_rec, S_MAX);  n_lo = min(n_lo, S_MAX);  n_hi = min(n_hi, S_MAX)
        n_rec = round(n_rec / 100) * 100
        n_lo  = round(n_lo  / 100) * 100
        n_hi  = round(n_hi  / 100) * 100
        if n_rec < 6000:
            low_rpm_warn = "⚠ n < 6 000 RPM — возможна потеря момента!"

        # ── Шаг 2: Подача F = n · z · fz ─────────────────────────────
        f_rec = n_rec * z * fz_mid
        f_lo  = n_lo  * z * fz_lo
        f_hi  = n_hi  * z * fz_hi

        # ── Шаг 3: Коррекция по глубине (DOC) ────────────────────────
        doc_warn = ""
        if doc > 1.5 * D:
            K = 0.8
            doc_note = f"DOC {doc:.1f} > 1.5D — рекомендуется 2 прохода!"
            doc_warn = "⚠ " + doc_note
        elif doc > 1.0 * D:
            K = 0.8
            doc_note = f"DOC {doc:.1f} > D — подача ×0.80"
        else:
            K = 1.0
            doc_note = f"DOC {doc:.1f} ≤ D — K = 1.0 (полная подача)"
        doc_factor = K
        f_rec *= K;  f_lo *= K;  f_hi *= K

        # ── Шаг 4: Поправка PCD (+25 %, лимит fz ≤ 0.50) ────────────
        fz_limit_warn = ""
        if tool_type == "PCD":
            f_rec *= 1.25;  f_lo *= 1.25;  f_hi *= 1.25
            fz_check = f_rec / (n_rec * z) if n_rec > 0 else 0
            if fz_check > 0.50:
                f_rec = n_rec * z * 0.50
                fz_limit_warn = "⚠ PCD fz ограничен до 0.50 мм/зуб"

        # ── Машинные лимиты ───────────────────────────────────────────
        f_rec = min(round(f_rec / 10) * 10, F_MAX)
        f_lo  = min(round(f_lo  / 10) * 10, F_MAX)
        f_hi  = min(round(f_hi  / 10) * 10, F_MAX)

        # ── Параметры стратегии ───────────────────────────────────────
        strategy = ("Climb (попутное, обязательно)"
                    if tool_type == "PCD"
                    else "Climb (предпочт.) / Conventional")
        plunge_feed     = max(100, round(f_rec * 0.25 / 10) * 10)
        stepover_rough  = round(D * 0.70, 1)   # 70% D
        stepover_finish = round(D * 0.30, 1)   # 30% D
        stepover        = stepover_rough if pass_type == "rough" else stepover_finish

        # ── Back-calc ─────────────────────────────────────────────────
        fz_actual  = f_rec / (n_rec * z) if n_rec > 0 else 0
        vc_actual  = n_rec * math.pi * D / 60_000

        return {
            # совместимость со старым кодом
            "fz_lo": fz_lo, "fz_hi": fz_hi, "fz_mid": fz_mid,
            "vc_lo": vc_rec, "vc_hi": vc_max, "vc_actual": vc_actual,
            "n_lo": n_lo, "n_hi": n_hi, "n_rec": n_rec,
            "f_lo": f_lo, "f_hi": f_hi, "f_rec": f_rec,
            "doc_factor": doc_factor, "doc_note": doc_note,
            "fz_actual": fz_actual,
            # новые ключи ТЗ v2
            "plunge_feed":      plunge_feed,
            "stepover":         stepover,
            "stepover_rough":   stepover_rough,
            "stepover_finish":  stepover_finish,
            "strategy":         strategy,
            "ramp_deg":         "2°–5°",
            "doc_warn":         doc_warn,
            "spindle_warn":     spindle_warn,
            "low_rpm_warn":     low_rpm_warn,
            "fz_limit_warn":    fz_limit_warn,
        }


    def open_param_calculator(self):
        """Opens Chip-Load Calculator dialog for T6."""
        win = tk.Toplevel(self.root)
        win.title("T6 Parameter Calculator (MDF/HDF)")
        win.resizable(False, False)
        win.grab_set()

        pad = dict(padx=8, pady=4)

        # ── Inputs ──────────────────────────────────────────────
        frm_in = ttk.LabelFrame(win, text="Tool parameters")
        frm_in.pack(fill="x", padx=10, pady=6)

        def row(parent, label, var, w=8):
            f = ttk.Frame(parent); f.pack(fill="x", padx=6, pady=2)
            ttk.Label(f, text=label, width=22, anchor="w").pack(side="left")
            ttk.Entry(f, textvariable=var, width=w).pack(side="left")
            return f

        # Pre-fill from main UI
        try:    _d = self._fval(self.pocket_tool_dia)
        except: _d = 31.75
        try:    _doc = self._fval(self.pocket_depth)
        except: _doc = 3.0

        v_dia  = tk.StringVar(value=str(_d))
        v_z    = tk.StringVar(value="2")
        v_doc  = tk.StringVar(value=str(_doc))
        v_type = tk.StringVar(value=self.pocket_tool_type.get())
        v_pass = tk.StringVar(value="finish")

        row(frm_in, "Diameter D (mm):",     v_dia)
        row(frm_in, "Teeth z:",             v_z)
        row(frm_in, "DOC (mm):",            v_doc)

        f_type = ttk.Frame(frm_in); f_type.pack(fill="x", padx=6, pady=2)
        ttk.Label(f_type, text="Tool material:", width=22, anchor="w").pack(side="left")
        ttk.Radiobutton(f_type, text="TCT (Carbide)", variable=v_type, value="TCT").pack(side="left")
        ttk.Radiobutton(f_type, text="PCD (Diamond)", variable=v_type, value="PCD").pack(side="left", padx=8)

        f_pass = ttk.Frame(frm_in); f_pass.pack(fill="x", padx=6, pady=2)
        ttk.Label(f_pass, text="Pass type:", width=22, anchor="w").pack(side="left")
        ttk.Radiobutton(f_pass, text="Finish (low fz)", variable=v_pass, value="finish").pack(side="left")
        ttk.Radiobutton(f_pass, text="Rough (high fz)", variable=v_pass, value="rough").pack(side="left", padx=8)

        # ── Results ──────────────────────────────────────────────
        frm_out = ttk.LabelFrame(win, text="Calculation results")
        frm_out.pack(fill="both", padx=10, pady=4, expand=True)

        txt = tk.Text(frm_out, width=54, height=18, font=("Courier", 9),
                      bg="#f8f8f8", relief="flat", state="disabled")
        txt.pack(padx=6, pady=6)
        txt.tag_config("head",  font=("Courier", 9, "bold"))
        txt.tag_config("rec",   foreground="#005500", font=("Courier", 9, "bold"))
        txt.tag_config("warn",  foreground="#cc0000")
        txt.tag_config("note",  foreground="#555555")

        v_n_result   = tk.StringVar()
        v_f_result   = tk.StringVar()

        def calculate(*_):
            try:
                D   = float(v_dia.get().replace(",", "."))
                z   = int(v_z.get())
                doc = float(v_doc.get().replace(",", "."))
            except Exception as e:
                txt.config(state="normal"); txt.delete("1.0","end")
                txt.insert("end", f"Input error: {e}", "warn"); txt.config(state="disabled"); return

            r = self.calc_t6_params(D, z, v_type.get(), v_pass.get(), doc)

            lines_out = [
                ("═"*52 + "\n",                                        "head"),
                (f"  РЕЖИМЫ РЕЗАНИЯ — D={D}mm  z={z}\n",              "head"),
                ("═"*52 + "\n",                                        "head"),
                (f"  Материал: {'PCD (Алмаз)' if v_type.get()=='PCD' else 'TCT (Твердосплав)'}\n", ""),
                (f"  Проход:   {'Черновой (fz макс.)' if v_pass.get()=='rough' else 'Чистовой (fz мин.)'}\n", ""),
                (f"  DOC:      {doc:.2f} мм\n", ""),
                ("\n",""),
                ("  ┌─ Шаг 1: Обороты n ────────────────────────┐\n","head"),
                (f"  │  Vc рек.:   {r['vc_lo']:.0f} м/с   Vc макс.: {r['vc_hi']:.0f} м/с\n",""),
                (f"  │  n (Vc рек.): {r['n_lo']:,} RPM\n",""),
                (f"  │  n (Vc макс.): {r['n_hi']:,} RPM\n",""),
                (f"  │  ▶ n расч.:  {r['n_rec']:,} RPM\n","rec"),
                (f"  │  Vc факт.:  {r['vc_actual']:.1f} м/с\n","note"),
                ("  └────────────────────────────────────────────┘\n",""),
                ("  ┌─ Шаг 2: Нагрузка на зуб fz ───────────────┐\n","head"),
                (f"  │  Чистовой: {r['fz_lo']:.2f}  Черновой: {r['fz_hi']:.2f} мм/зуб\n",""),
                (f"  │  ▶ Целевой fz: {r['fz_mid']:.3f} мм/зуб\n","rec"),
                ("  └────────────────────────────────────────────┘\n",""),
                ("  ┌─ Шаг 3: Подача F = n · z · fz ────────────┐\n","head"),
                (f"  │  Диапазон: {r['f_lo']:,} – {r['f_hi']:,} мм/мин\n",""),
                (f"  │  ▶ Рек. подача: {r['f_rec']:,} мм/мин\n","rec"),
                ("  └────────────────────────────────────────────┘\n",""),
                ("  ┌─ Шаг 4: Коррекция DOC ────────────────────┐\n","head"),
                (f"  │  {r['doc_note']}\n","note"),
                (f"  │  K = {r['doc_factor']:.2f}\n",""),
                ("  └────────────────────────────────────────────┘\n",""),
                ("  ┌─ Стратегия & врезание ────────────────────┐\n","head"),
                (f"  │  Траектория: {r['strategy']}\n",""),
                (f"  │  Ramp: {r['ramp_deg']}\n",""),
                (f"  │  Подача врезания: {r['plunge_feed']:,} мм/мин\n",""),
                (f"  │  Шаг черновой:   {r['stepover_rough']:.1f} мм (70% D)\n",""),
                (f"  │  Шаг чистовой:   {r['stepover_finish']:.1f} мм (30% D)\n",""),
                ("  └────────────────────────────────────────────┘\n",""),
                ("\n",""),
                (f"  ✔ fz факт. (контроль): {r['fz_actual']:.3f} мм/зуб\n","rec"),
            ]
            for warn_key in ("spindle_warn","low_rpm_warn","doc_warn","fz_limit_warn"):
                if r.get(warn_key):
                    lines_out.append((f"  {r[warn_key]}\n","warn"))
            if r['n_rec'] >= 18000:
                lines_out.append(("  ⚠ RPM = машинный максимум (18 000)\n","warn"))
            if r['f_rec'] >= 24000:
                lines_out.append(("  ⚠ Подача = машинный максимум (24 000)\n","warn"))

            txt.config(state="normal"); txt.delete("1.0","end")
            for text_part, tag in lines_out:
                txt.insert("end", text_part, tag)
            txt.config(state="disabled")
            v_n_result.set(str(r["n_rec"]))
            v_f_result.set(str(r["f_rec"]))

        # ── Buttons ──────────────────────────────────────────────
        frm_btn = ttk.Frame(win); frm_btn.pack(fill="x", padx=10, pady=6)
        ttk.Button(frm_btn, text="▶  Calculate",
                   command=calculate).pack(side="left", padx=4)
        def apply_vals():
            if not v_n_result.get(): return
            self.t6_spindle_var.set(v_n_result.get())
            self.t6_feed_var.set(v_f_result.get())
            self.update_tool_params_label()
            win.destroy()
        ttk.Button(frm_btn, text="✔  Apply to T6",
                   command=apply_vals).pack(side="left", padx=4)
        ttk.Button(frm_btn, text="Close",
                   command=win.destroy).pack(side="right", padx=4)

        calculate()   # авто-расчёт при открытии

    def update_tool_params_label(self, *_):
        rpm,  rpm_ok  = self._validate_t6_field(
            self.t6_spindle_var, self.T6_RPM_MIN, self.T6_RPM_MAX, 18000)
        feed, feed_ok = self._validate_t6_field(
            self.t6_feed_var, self.T6_FEED_MIN, self.T6_FEED_MAX, 6000)
        ok = rpm_ok and feed_ok
        color = "#cc0000" if not ok else "#0055aa"
        warn  = ("  ⚠ clamped to limits" if not ok else "")
        self.tool_params_label.config(
            text=(
                f"  → Spindle: {rpm} RPM  |  Feed: {feed} mm/min{warn}\n"
                f"     limits: RPM ≤ 18 000  |  Feed ≤ 24 000 mm/min"
            ),
            foreground=color)

    # ─── UI ────────────────────────────────────────────────────────────────
    # ─── CLEAN INDUSTRIAL THEME ───────────────────────────────────────────
    # Palette
    C_BG      = '#F5F7F9'   # window background
    C_CARD    = '#FFFFFF'   # card / panel background
    C_BORDER  = '#E0E4E8'   # card border
    C_ACCENT  = '#0055AA'   # cobalt blue  — primary action
    C_TEXT    = '#4A5568'   # steel grey   — labels
    C_TEXT2   = '#1A202C'   # dark         — headings
    C_SUCCESS = '#276749'   # deep green
    C_WARN    = '#B45309'   # amber
    C_IDLE    = '#374151'   # graphite
    C_BTN_FG  = '#FFFFFF'

    def _apply_theme(self):
        s = ttk.Style()
        s.theme_use('clam')

        s.configure('.',
            background=self.C_BG, foreground=self.C_TEXT,
            font=('Segoe UI', 9), borderwidth=0)

        s.configure('TFrame',   background=self.C_BG)
        s.configure('Card.TFrame', background=self.C_CARD,
                    relief='flat', borderwidth=1)

        s.configure('TLabelframe',
            background=self.C_CARD, foreground=self.C_TEXT,
            font=('Segoe UI', 9, 'bold'),
            bordercolor=self.C_BORDER, borderwidth=1, relief='solid')
        s.configure('TLabelframe.Label',
            background=self.C_CARD, foreground=self.C_ACCENT,
            font=('Segoe UI', 9, 'bold'))

        s.configure('TLabel',
            background=self.C_CARD, foreground=self.C_TEXT,
            font=('Segoe UI', 9))
        s.configure('Heading.TLabel',
            background=self.C_BG, foreground=self.C_TEXT2,
            font=('Segoe UI', 10, 'bold'))
        s.configure('KPI.TLabel',
            background=self.C_IDLE, foreground='#FFFFFF',
            font=('Consolas', 11, 'bold'), padding=(10, 4))
        s.configure('KPIVal.TLabel',
            background=self.C_IDLE, foreground='#93C5FD',
            font=('Consolas', 13, 'bold'), padding=(10, 4))

        s.configure('TButton',
            background=self.C_CARD, foreground=self.C_TEXT,
            font=('Segoe UI', 9), borderwidth=1,
            relief='flat', padding=(8, 4))
        s.map('TButton',
            background=[('active', self.C_BORDER), ('pressed', '#CBD5E0')],
            foreground=[('active', self.C_TEXT2)])

        s.configure('TEntry',
            fieldbackground=self.C_CARD, foreground=self.C_TEXT2,
            bordercolor=self.C_BORDER, borderwidth=1,
            font=('Consolas', 9))

        s.configure('TCombobox',
            fieldbackground=self.C_CARD, foreground=self.C_TEXT2,
            bordercolor=self.C_BORDER, font=('Segoe UI', 9))
        s.map('TCombobox',
            fieldbackground=[('readonly', self.C_CARD)])

        s.configure('TCheckbutton',
            background=self.C_CARD, foreground=self.C_TEXT,
            font=('Segoe UI', 9))
        s.map('TCheckbutton', background=[('active', self.C_CARD)])

        s.configure('TRadiobutton',
            background=self.C_CARD, foreground=self.C_TEXT,
            font=('Segoe UI', 9))
        s.map('TRadiobutton', background=[('active', self.C_CARD)])

        s.configure('Treeview',
            background=self.C_CARD, fieldbackground=self.C_CARD,
            foreground=self.C_TEXT2, font=('Consolas', 9),
            rowheight=22, borderwidth=0)
        s.configure('Treeview.Heading',
            background=self.C_BG, foreground=self.C_ACCENT,
            font=('Segoe UI', 9, 'bold'), relief='flat')
        s.map('Treeview', background=[('selected', '#DBEAFE')],
              foreground=[('selected', self.C_ACCENT)])

        s.configure('TScrollbar',
            background=self.C_BORDER, troughcolor=self.C_BG,
            borderwidth=0, arrowsize=12)

        # Root window
        self.root.configure(bg=self.C_BG)

    def _build_status_bar(self):
        """Top KPI bar: title | order | Yield | Sheets | Est.Time"""
        bar = tk.Frame(self.root, bg=self.C_IDLE, height=44)
        bar.pack(side='top', fill='x')
        bar.pack_propagate(False)

        # App title
        tk.Label(bar, text='  CNC Fasady PRO',
                 bg=self.C_IDLE, fg='#E2E8F0',
                 font=('Segoe UI', 11, 'bold')).pack(side='left', padx=4)

        sep = tk.Frame(bar, bg='#4B5563', width=1)
        sep.pack(side='left', fill='y', padx=6, pady=6)

        # KPI blocks: (label, var_attr, default)
        kpi_defs = [
            ('ORDER',  '_kpi_order',  '—'),
            ('YIELD',  '_kpi_yield',  '— %'),
            ('SHEETS', '_kpi_sheets', '—'),
            ('PARTS',  '_kpi_parts',  '—'),
        ]
        for lbl, attr, dflt in kpi_defs:
            blk = tk.Frame(bar, bg=self.C_IDLE)
            blk.pack(side='left', padx=2)
            tk.Label(blk, text=lbl,
                     bg=self.C_IDLE, fg='#9CA3AF',
                     font=('Segoe UI', 7, 'bold')).pack(anchor='w')
            var = tk.StringVar(value=dflt)
            setattr(self, attr, var)
            tk.Label(blk, textvariable=var,
                     bg=self.C_IDLE, fg='#93C5FD',
                     font=('Consolas', 11, 'bold')).pack(anchor='w')
            sep2 = tk.Frame(bar, bg='#4B5563', width=1)
            sep2.pack(side='left', fill='y', padx=6, pady=6)

    def update_kpi(self):
        """Refresh status bar KPIs after nesting."""
        if not self.sheets: return
        try:
            sw = float(self.sheet_w.get().replace(',','.'))
            sh = float(self.sheet_h.get().replace(',','.'))
        except Exception:
            sw, sh = 1245, 2466
        sheet_area = sw * sh / 1e6  # m²
        total_sheets = len(self.sheets)
        total_parts  = sum(len(s) for s in self.sheets)
        used_area    = sum(d['orig_w']*d['orig_h'] for s in self.sheets for d in s) / 1e6
        total_avail  = sheet_area * total_sheets
        yield_pct    = used_area / total_avail * 100 if total_avail else 0

        self._kpi_order.set(self.order_id.get().strip() or '—')
        self._kpi_yield.set(f'{yield_pct:.1f}%')
        self._kpi_sheets.set(str(total_sheets))
        self._kpi_parts.set(str(total_parts))

    def _build_canvas_tooltip(self):
        """Hover tooltip on nesting canvas."""
        self._tip_win = None
        self._tip_lbl = None

        def on_motion(event):
            cx, cy = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
            tip_text = None
            for item in self.canvas.find_overlapping(cx-1, cy-1, cx+1, cy+1):
                tag_data = self.canvas.gettags(item)
                for t in tag_data:
                    if t.startswith('part:'):
                        tip_text = t[5:].replace('|', '\n')
                        break
                if tip_text: break

            if tip_text:
                if self._tip_win is None:
                    self._tip_win = tk.Toplevel(self.root)
                    self._tip_win.overrideredirect(True)
                    self._tip_win.configure(bg='#1A202C')
                    self._tip_lbl = tk.Label(
                        self._tip_win, text='', justify='left',
                        bg='#1A202C', fg='#E2E8F0',
                        font=('Consolas', 8), padx=8, pady=4,
                        relief='flat')
                    self._tip_lbl.pack()
                self._tip_lbl.config(text=tip_text)
                x = event.x_root + 14
                y = event.y_root - 10
                self._tip_win.geometry(f'+{x}+{y}')
                self._tip_win.deiconify()
            else:
                if self._tip_win:
                    self._tip_win.withdraw()

        def on_leave(_):
            if self._tip_win:
                self._tip_win.withdraw()

        self.canvas.bind('<Motion>', on_motion)
        self.canvas.bind('<Leave>',  on_leave)

    def setup_ui(self):
        self._apply_theme()
        self._build_status_bar()

        main = ttk.Frame(self.root)
        main.pack(side='top', fill='both', expand=True)

        left   = ttk.Frame(main, width=270)
        left.pack(side='left', fill='y', padx=(8,4), pady=6)
        left.pack_propagate(False)

        center = ttk.Frame(main)
        center.pack(side='left', fill='both', expand=True, padx=4, pady=6)

        right  = ttk.Frame(main, width=368)
        right.pack(side='right', fill='y', padx=(4,8), pady=6)
        right.pack_propagate(False)

        # ── LEFT: order + workflow ────────────────────────────────────────
        of = ttk.LabelFrame(left, text="Order")
        of.pack(fill="x", pady=(0,4))
        self.create_entry(of, "Order #:", "", "order_id")

        wf = ttk.LabelFrame(left, text="Workflow")
        wf.pack(fill="x", pady=4)
        ttk.Button(wf, text="1.  Load Excel",
                   command=self.load_excel).pack(fill="x", padx=6, pady=(6,2))
        ttk.Button(wf, text="2.  Run Nesting",
                   command=self.do_nesting).pack(fill="x", padx=6, pady=2)
        tk.Button(wf, text="3.  GENERATE G-CODE",
            bg=self.C_ACCENT, fg=self.C_BTN_FG,
            font=("Segoe UI", 10, "bold"),
            relief="flat", pady=7, cursor="hand2",
            activebackground="#003D7A", activeforeground="white",
            command=self.generate_gcode
        ).pack(fill="x", padx=6, pady=(4,6))

        pf = ttk.LabelFrame(left, text="Export & Print")
        pf.pack(fill="x", pady=4)
        pg = ttk.Frame(pf); pg.pack(fill="x", padx=6, pady=6)
        pg.columnconfigure(0, weight=1); pg.columnconfigure(1, weight=1)
        ttk.Button(pg, text="Labels PDF",
                   command=self.generate_pdf_labels).grid(
                   row=0, column=0, padx=2, pady=2, sticky="ew")
        ttk.Button(pg, text="Cut Map PDF",
                   command=self.generate_operator_pdf).grid(
                   row=0, column=1, padx=2, pady=2, sticky="ew")

        self.stats_label = ttk.Label(left,
            text="  Load Excel then Run Nesting",
            foreground=self.C_ACCENT, font=("Segoe UI", 8, "bold"),
            wraplength=250, justify="left")
        self.stats_label.pack(fill="x", padx=6, pady=4)

        # ── CENTER: table + canvas ────────────────────────────────────────
        tc = ttk.Frame(center); tc.pack(fill="x", pady=(0,4))
        cols = ('ID', 'W', 'H', 'Qty', 'Type', 'Placed', 'Left')
        self.tree = ttk.Treeview(tc, columns=cols, show='headings', height=6)
        for col, w in zip(cols, [45,65,65,45,70,60,55]):
            self.tree.heading(col, text=col)
            self.tree.column(col, width=w, anchor="center", minwidth=w)
        self.tree.pack(fill="x", pady=2)
        tb = ttk.Frame(tc); tb.pack(fill="x", pady=2)
        ttk.Button(tb, text="Add",     command=self.add_door).pack(side="left", padx=2)
        ttk.Button(tb, text="Edit",    command=self.edit_door).pack(side="left", padx=2)
        ttk.Button(tb, text="Remove",  command=self.delete_door).pack(side="left", padx=2)
        ttk.Button(tb, text="Clear",   command=self.clear_doors).pack(side="right", padx=2)

        cf = ttk.LabelFrame(center, text="Nesting Preview  (click sheet to expand)")
        cf.pack(fill="both", expand=True, pady=(2,0))
        self.canvas_scroll = tk.Scrollbar(cf, orient="vertical")
        self.canvas_scroll.pack(side="right", fill="y")
        self.canvas = tk.Canvas(cf, bg=self.C_BG, yscrollcommand=self.canvas_scroll.set)
        self._build_canvas_tooltip()
        self.canvas.pack(side="left", fill="both", expand=True)
        self.canvas_scroll.config(command=self.canvas.yview)
        self.canvas.bind("<Configure>", lambda e: self.draw_preview_thumbnails())

        # ── RIGHT: scrollable engineering panel ──────────────────────────
        rscroll = tk.Scrollbar(right, orient="vertical")
        rscroll.pack(side="right", fill="y")
        rc = tk.Canvas(right, bg=self.C_BG, yscrollcommand=rscroll.set,
                       highlightthickness=0)
        rc.pack(side="left", fill="both", expand=True)
        rscroll.config(command=rc.yview)
        rinner = ttk.Frame(rc)
        rc_win = rc.create_window((0,0), window=rinner, anchor="nw")
        def _conf(e):
            rc.configure(scrollregion=rc.bbox("all"))
            rc.itemconfig(rc_win, width=rc.winfo_width())
        rinner.bind("<Configure>", _conf)
        rc.bind("<Configure>", lambda e: rc.itemconfig(rc_win, width=e.width))
        rc.bind("<MouseWheel>", lambda e: rc.yview_scroll(int(-1*(e.delta/120)), "units"))
        R = rinner

        mf = ttk.LabelFrame(R, text="Material & Sheet")
        mf.pack(fill="x", pady=(0,4), padx=2)
        self.create_entry(mf, "Sheet W, mm:",      "1245",  "sheet_w")
        self.create_entry(mf, "Sheet H, mm:",      "2466",  "sheet_h")
        self.create_entry(mf, "Thickness Z, mm:",  "19.2",  "mat_z")
        self.create_entry(mf, "Edge margin, mm:",  "10",    "margin")

        df = ttk.LabelFrame(R, text="Facade Parameters")
        df.pack(fill="x", pady=4, padx=2)
        self.create_entry(df, "Frame width, mm:",       "25",   "frame_w")
        self.create_entry(df, "1st pocket depth, mm:",  "3.0",  "pocket_depth")
        self.create_entry(df, "2nd pocket depth, mm:",  "0.0",  "pocket_depth2")
        self.create_entry(df, "2nd pocket offset, mm:", "5.0",  "pocket_step_offset")
        self.create_entry(df, "Inner chamfer depth, mm:", "0.5",  "chamfer_depth")
        self.create_entry(df, "Outer chamfer depth, mm:", "0.5",  "outer_chamfer_depth")

        tf = ttk.LabelFrame(R, text="T6 Pocket Cutter")
        tf.pack(fill="x", pady=4, padx=2)

        r1 = ttk.Frame(tf); r1.pack(fill="x", padx=5, pady=2)
        ttk.Label(r1, text="T-number:", width=15).pack(side="left")
        self.pocket_tool_t = tk.StringVar(value="T6")
        ttk.Combobox(r1, textvariable=self.pocket_tool_t,
                     values=[f"T{i}" for i in range(1,10)],
                     state="readonly", width=5).pack(side="left", padx=4)
        ttk.Label(r1, text="Type:").pack(side="left", padx=(8,2))
        self.pocket_tool_type = tk.StringVar(value="PCD")
        cb_type = ttk.Combobox(r1, textvariable=self.pocket_tool_type,
                               values=["PCD","TCT"], state="readonly", width=5)
        cb_type.pack(side="left")
        cb_type.bind("<<ComboboxSelected>>", self.update_tool_params_label)

        r2 = ttk.Frame(tf); r2.pack(fill="x", padx=5, pady=2)
        ttk.Label(r2, text="Diameter D, mm:", width=15).pack(side="left")
        self.pocket_tool_dia = tk.StringVar(value="")
        e_dia = ttk.Entry(r2, textvariable=self.pocket_tool_dia, width=7)
        e_dia.pack(side="left", padx=4)
        e_dia.bind("<FocusOut>", self.update_tool_params_label)
        e_dia.bind("<Return>",   self.update_tool_params_label)

        r2b = ttk.Frame(tf); r2b.pack(fill="x", padx=5, pady=2)
        ttk.Label(r2b, text="Teeth z:", width=15).pack(side="left")
        self.pocket_tool_z = tk.StringVar(value="2")
        ttk.Combobox(r2b, textvariable=self.pocket_tool_z,
                     values=["1","2","3","4"], state="readonly", width=5).pack(side="left", padx=4)

        r3 = ttk.Frame(tf); r3.pack(fill="x", padx=5, pady=2)
        ttk.Label(r3, text="Spindle, RPM:", width=15).pack(side="left")
        self.t6_spindle_var = tk.StringVar(value="18000")
        e_rpm = ttk.Entry(r3, textvariable=self.t6_spindle_var, width=8)
        e_rpm.pack(side="left", padx=4)
        e_rpm.bind("<FocusOut>", self.update_tool_params_label)
        e_rpm.bind("<Return>",   self.update_tool_params_label)

        r4 = ttk.Frame(tf); r4.pack(fill="x", padx=5, pady=2)
        ttk.Label(r4, text="Feed, mm/min:", width=15).pack(side="left")
        self.t6_feed_var = tk.StringVar(value="6000")
        e_feed = ttk.Entry(r4, textvariable=self.t6_feed_var, width=8)
        e_feed.pack(side="left", padx=4)
        e_feed.bind("<FocusOut>", self.update_tool_params_label)
        e_feed.bind("<Return>",   self.update_tool_params_label)
        ttk.Button(r4, text="Auto", width=6,
                   command=self._auto_t6_params).pack(side="left", padx=4)

        self.tool_params_label = ttk.Label(tf, text="",
            foreground=self.C_ACCENT, font=("Segoe UI", 8, "bold"), wraplength=330)
        self.tool_params_label.pack(fill="x", padx=5, pady=2)

        rs = ttk.Frame(tf); rs.pack(fill="x", padx=5, pady=2)
        ttk.Label(rs, text="Strategy:", width=15).pack(side="left")
        self.pocket_strategy = tk.StringVar(value="Snake")
        ttk.Combobox(rs, textvariable=self.pocket_strategy,
                     values=["Snake", "Spiral", "Climb (CCW)"],
                     state="readonly", width=16).pack(side="left")

        rs2 = ttk.Frame(tf); rs2.pack(fill="x", padx=5, pady=2)
        ttk.Label(rs2, text="Step-over (%):", width=15).pack(side="left")
        self.spiral_overlap = tk.StringVar(value="50")
        ttk.Entry(rs2, textvariable=self.spiral_overlap, width=8).pack(side="left", padx=4)

        # ── Settings button ──────────────────────────────────────────────
        ttk.Button(R, text="⚙  Settings",
                   command=self.open_settings_dialog).pack(fill="x", padx=4, pady=(8,4))

        # hidden vars (used in nesting / gcode, not shown on main UI)
        self.kerf                 = tk.StringVar(value="6")
        self.small_part_threshold = tk.StringVar(value="0.05")
        self.corner_r             = tk.StringVar(value="1.0")
        self.feed_xy              = tk.StringVar(value="8000")
        self.allow_rotation       = tk.BooleanVar(value=True)
        self.do_pocket            = tk.BooleanVar(value=True)
        self.do_corners_rest      = tk.BooleanVar(value=True)
        self.do_french_miter      = tk.BooleanVar(value=True)
        self.do_cutout            = tk.BooleanVar(value=True)
        self.do_rough_pass        = tk.BooleanVar(value=False)
        self.pocket_step_depth    = tk.StringVar(value="3.0")

        # Fixed tool feeds (T2 / T3 / T5)
        self.feed_t2      = 6000
        self.feed_t3      = 8000
        self.feed_t5      = 8000
        # T2 / T3 / T5 tool numbers (editable in Settings)
        self.t2_tool_t    = tk.StringVar(value="T2")
        self.t3_tool_t    = tk.StringVar(value="T3")
        self.t5_tool_t    = tk.StringVar(value="T5")
        self.t2_spindle   = tk.StringVar(value="18000")
        self.t3_spindle   = tk.StringVar(value="18000")
        self.t5_spindle   = tk.StringVar(value="18000")
        self.t2_feed_var  = tk.StringVar(value="6000")
        self.t3_feed_var  = tk.StringVar(value="8000")
        self.t5_feed_var  = tk.StringVar(value="8000")

    def open_settings_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("Settings")
        win.geometry("420x680")
        win.resizable(False, True)
        win.grab_set()

        sc = tk.Scrollbar(win, orient="vertical")
        sc.pack(side="right", fill="y")
        cv = tk.Canvas(win, yscrollcommand=sc.set, highlightthickness=0)
        cv.pack(side="left", fill="both", expand=True)
        sc.config(command=cv.yview)
        fr = ttk.Frame(cv)
        cv_win = cv.create_window((0,0), window=fr, anchor="nw")
        fr.bind("<Configure>", lambda e: cv.configure(
            scrollregion=cv.bbox("all")))
        cv.bind("<Configure>", lambda e: cv.itemconfig(cv_win, width=e.width))
        cv.bind("<MouseWheel>", lambda e: cv.yview_scroll(int(-1*(e.delta/120)), "units"))

        def row(parent, label, var, w=10):
            f = ttk.Frame(parent); f.pack(fill="x", padx=6, pady=2)
            ttk.Label(f, text=label, width=24, anchor="w").pack(side="left")
            ttk.Entry(f, textvariable=var, width=w).pack(side="left")

        def cb_row(parent, label, var):
            f = ttk.Frame(parent); f.pack(fill="x", padx=6, pady=2)
            ttk.Checkbutton(f, text=label, variable=var).pack(side="left")

        def tool_block(parent, title, t_var, spindle_var, feed_var):
            blk = ttk.LabelFrame(parent, text=title)
            blk.pack(fill="x", padx=6, pady=4)
            row(blk, "T-number:",     t_var)
            row(blk, "Spindle, RPM:", spindle_var)
            row(blk, "Feed, mm/min:", feed_var)

        # ── Nesting ───────────────────────────────────────────────
        nf = ttk.LabelFrame(fr, text="Nesting")
        nf.pack(fill="x", padx=6, pady=4)
        row(nf, "Kerf (T3 dia), mm:", self.kerf)
        row(nf, "Small part <= m2:",  self.small_part_threshold)
        cb_row(nf, "Allow rotation",  self.allow_rotation)

        # ── Facade details ─────────────────────────────────────────
        ff = ttk.LabelFrame(fr, text="Facade Details")
        ff.pack(fill="x", padx=6, pady=4)
        row(ff, "Corner radius, mm:", self.corner_r)

        # ── Tools ─────────────────────────────────────────────────
        tool_block(fr, "T2  D4  Corner rest",      self.t2_tool_t, self.t2_spindle, self.t2_feed_var)
        tool_block(fr, "T3  D6  Contour cut",      self.t3_tool_t, self.t3_spindle, self.t3_feed_var)
        tool_block(fr, "T5  Chamfer / Miter",      self.t5_tool_t, self.t5_spindle, self.t5_feed_var)

        # ── Operations ────────────────────────────────────────────
        of = ttk.LabelFrame(fr, text="Operations (enable/disable)")
        of.pack(fill="x", padx=6, pady=4)
        cb_row(of, "1. Pocket cutter (T6)",   self.do_pocket)
        cb_row(of, "2. Corner rest (T2)",      self.do_corners_rest)
        cb_row(of, "3. French miter (T5)",     self.do_french_miter)
        cb_row(of, "6. Contour cut (T3)",      self.do_cutout)

        ttk.Button(fr, text="✔  Close", command=win.destroy).pack(pady=10)

    def create_entry(self, parent, label, default, attr_name):
        f = ttk.Frame(parent); f.pack(fill="x", padx=5, pady=2)
        ttk.Label(f, text=label, width=28).pack(side="left")
        var = tk.StringVar(value=default)
        setattr(self, attr_name, var)
        ttk.Entry(f, textvariable=var, width=10).pack(side="right")

    def save_settings(self):
        settings = {
            'order_id': self.order_id.get(),
            'sheet_w': self.sheet_w.get(), 'sheet_h': self.sheet_h.get(),
            'mat_z': self.mat_z.get(), 'margin': self.margin.get(),
            'kerf': self.kerf.get(),
            'small_part_threshold': self.small_part_threshold.get(),
            'spiral_overlap': self.spiral_overlap.get(),
            'corner_r': self.corner_r.get(),
            't6_spindle': self.t6_spindle_var.get(),
            't6_feed':    self.t6_feed_var.get(),
            't2_tool_t':  self.t2_tool_t.get(), 't2_spindle': self.t2_spindle.get(), 't2_feed_var': self.t2_feed_var.get(),
            't3_tool_t':  self.t3_tool_t.get(), 't3_spindle': self.t3_spindle.get(), 't3_feed_var': self.t3_feed_var.get(),
            't5_tool_t':  self.t5_tool_t.get(), 't5_spindle': self.t5_spindle.get(), 't5_feed_var': self.t5_feed_var.get(),
            'frame_w': self.frame_w.get(),
            'pocket_depth':  self.pocket_depth.get(),
            'pocket_depth2': self.pocket_depth2.get(),
            'pocket_step_offset': self.pocket_step_offset.get(),
            'chamfer_depth': self.chamfer_depth.get(),
            'outer_chamfer_depth': self.outer_chamfer_depth.get(),
            'pocket_tool_t': self.pocket_tool_t.get(),
            'pocket_tool_type': self.pocket_tool_type.get(),
            'pocket_tool_dia': self.pocket_tool_dia.get(),
            'pocket_strategy': self.pocket_strategy.get(),
            'do_pocket': self.do_pocket.get(), 'do_corners_rest': self.do_corners_rest.get(),
            'do_french_miter': self.do_french_miter.get(),
            'do_cutout': self.do_cutout.get(),
            'allow_rotation': self.allow_rotation.get(),
        }   # FIX: закрывающая скобка словаря
        try:
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=2)
        except Exception as _e:
            import traceback as _tb
            messagebox.showerror('Settings save error',
                f'Could not save settings:\n{_e}\n\n{_tb.format_exc()[-600:]}')

    def load_settings(self):
        if os.path.exists(self.settings_file):
            try:
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    s = json.load(f)
                for k, v in s.items():
                    if hasattr(self, k):
                        getattr(self, k).set(v)
                self.update_tool_params_label()
            except Exception as _e:
                messagebox.showerror('Settings load error',
                    f'Could not load settings:\n{_e}')

    def on_closing(self):
        self.save_settings()
        self.root.destroy()

    def get_next_id(self):
        return max([d['id'] for d in self.doors] + [0]) + 1

    def check_is_slab(self, w, h):
        try:
            fw = self._fval(self.frame_w)
        except Exception:
            fw = 22.0
        return min(w, h) <= (fw * 2 + 15)

    def refresh_tree(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        for d in self.doors:
            placed = d.get('placed', 0)
            self.tree.insert('', 'end', values=(
                d['id'], d['w'], d['h'], d['qty'], d['type'], placed, d['qty'] - placed))

    def add_door(self):  self.open_door_dialog("Добавить фасад", None)
    def edit_door(self):
        sel = self.tree.selection()
        if not sel: return messagebox.showwarning("Внимание", "Выберите фасад")
        item_id = int(self.tree.item(sel[0], 'values')[0])
        door = next((d for d in self.doors if d['id'] == item_id), None)
        if door: self.open_door_dialog("Изменить фасад", door)
    def delete_door(self):
        sel = self.tree.selection()
        if not sel: return
        item_id = int(self.tree.item(sel[0], 'values')[0])
        self.doors = [d for d in self.doors if d['id'] != item_id]
        self.refresh_tree()
    def clear_doors(self):
        if messagebox.askyesno("Очистить", "Удалить все фасады?"):
            self.doors = []; self.refresh_tree()

    def open_door_dialog(self, title, door_obj):
        dlg = tk.Toplevel(self.root); dlg.title(title)
        dlg.geometry("320x260"); dlg.transient(self.root); dlg.grab_set()
        for lbl, key, default in [
            ("Ширина (мм):", 'w', ""), ("Высота (мм):", 'h', ""),
            ("Количество:", 'qty', "1")]:
            ttk.Label(dlg, text=lbl).pack(pady=(5, 0))
            var = tk.StringVar(value=str(door_obj[key]) if door_obj else default)
            setattr(dlg, f'var_{key}', var)
            tk.Entry(dlg, textvariable=var).pack()
        ttk.Label(dlg, text="Тип:").pack(pady=(5, 0))
        var_type = tk.StringVar(value=door_obj['type'] if door_obj else "Shaker")
        cb = ttk.Combobox(dlg, textvariable=var_type, values=["Shaker", "Shaker Step", "Гладкий (Slab)"], state="readonly")
        cb.pack()
        def on_save():
            try:
                w = float(dlg.var_w.get()); h = float(dlg.var_h.get())
                q = int(dlg.var_qty.get()); t = var_type.get()
                if door_obj is None and t == "Shaker" and self.check_is_slab(w, h):
                    t = "Гладкий (Slab)"
                    messagebox.showinfo("Авто-коррекция", "Назначен тип: Гладкий (Slab)")
                if door_obj is not None: door_obj.update({'w': w, 'h': h, 'qty': q, 'type': t})
                else: self.doors.append({'id': self.get_next_id(), 'w': w, 'h': h, 'qty': q, 'type': t, 'placed': 0})
                self.refresh_tree(); dlg.destroy()
            except Exception: messagebox.showerror("Ошибка", "Введите корректные числа")
        ttk.Button(dlg, text="Сохранить", command=on_save).pack(pady=12)

    def load_excel(self):
        filename = filedialog.askopenfilename(filetypes=[("Excel", "*.xlsx *.xls")])
        if not filename: return
        try:
            # ── Новый формат: строка 1 = Order: <номер>, строка 2 = заголовки ──
            raw = pd.read_excel(filename, header=None)
            order_num = ""
            header_row = 0
            # Ищем строку с "Order:" в A1
            for ri in range(min(3, len(raw))):
                cell_a = str(raw.iloc[ri, 0]).strip().lower()
                cell_b = str(raw.iloc[ri, 1]).strip() if raw.shape[1] > 1 else ""
                if 'order' in cell_a:
                    order_num = cell_b
                    header_row = ri + 1
                    break
            # Читаем таблицу начиная с header_row
            df = pd.read_excel(filename, header=header_row)
            cols = [str(c).strip().lower() for c in df.columns]
            def find_col(keywords):
                for kw in keywords:
                    for i, c in enumerate(cols):
                        if kw in c: return df.columns[i]
                raise ValueError(f"Столбец не найден: {keywords}")
            w_col = find_col(['width', 'ширина'])
            h_col = find_col(['height', 'высота', 'длина'])
            q_col = find_col(['quantity', 'qty', 'кол', 'count'])
            # Type column (опционально)
            try:
                t_col = find_col(['type', 'тип'])
                has_type = True
            except Exception:
                has_type = False
            # Маппинг Type → внутренний dtype
            type_map = {
                'shaker': 'Shaker',
                'step':   'Shaker Step',
                'slab':   'Гладкий (Slab)',
            }
            added = 0; type_counts = {}
            for _, row in df.iterrows():
                try:
                    w = float(row[w_col]); h = float(row[h_col]); qty = int(row[q_col])
                except Exception:
                    continue  # пропускаем пустые строки
                if has_type:
                    raw_type = str(row[t_col]).strip().lower()
                    dtype = type_map.get(raw_type, 'Shaker')
                else:
                    dtype = 'Гладкий (Slab)' if self.check_is_slab(w, h) else 'Shaker'
                self.doors.append({'id': self.get_next_id(), 'w': w, 'h': h, 'qty': qty, 'type': dtype, 'placed': 0})
                type_counts[dtype] = type_counts.get(dtype, 0) + 1
                added += 1
            # Подставляем номер заказа в поле Order #
            if order_num:
                self.order_id.set(order_num)
            self.refresh_tree()
            msg = f"Загружено {added} позиций."
            if order_num: msg += f"\nOrder: {order_num}"
            for t, cnt in type_counts.items():
                msg += f"\n  {t}: {cnt} шт."
            messagebox.showinfo("Успех", msg)
        except Exception as e:
            messagebox.showerror("Ошибка", f"Проверьте файл.\n{e}")

    # ─── NESTING ──────────────────────────────────────────────────────────
    def do_nesting(self):
        if not self.doors: return messagebox.showwarning("Пусто", "Нет деталей!")
        sheet_w = self._fval(self.sheet_w); sheet_h = self._fval(self.sheet_h)
        margin = self._fval(self.margin); kerf = self._fval(self.kerf)
        work_w = sheet_w - 2 * margin; work_h = sheet_h - 2 * margin
        flat_list = []
        for d in self.doors:
            for _ in range(d['qty']):
                flat_list.append({'id': d['id'], 'type': d['type'],
                                   'w': d['w'] + kerf, 'h': d['h'] + kerf,
                                   'orig_w': d['w'], 'orig_h': d['h']})
        sort_funcs = [lambda x: x['w'] * x['h'], lambda x: max(x['w'], x['h']), lambda x: x['w'] + x['h']]
        best_sheets = []; min_sheets = float('inf'); best_density = 0
        for sf in sort_funcs:
            for pref_rot in [False, True]:
                items = []
                for item in flat_list:
                    w, h = item['w'], item['h']
                    if self.allow_rotation.get() and pref_rot and w < h: w, h = h, w
                    elif self.allow_rotation.get() and not pref_rot and h < w: w, h = h, w
                    items.append({'id': item['id'], 'type': item['type'], 'w': w, 'h': h,
                                  'orig_w': item['orig_w'], 'orig_h': item['orig_h']})
                # Двухфазная раскладка: крупные (BSSF) → мелкие (центр-приоритет)
                try:
                    thr_mm2 = self._fval(self.small_part_threshold) * 1e6
                except Exception:
                    thr_mm2 = 50000.0
                work_cx = work_w / 2; work_cy = work_h / 2
                large_items = sorted([i for i in items if i['orig_w']*i['orig_h'] >= thr_mm2],
                                     key=sf, reverse=True)
                small_items = sorted([i for i in items if i['orig_w']*i['orig_h'] < thr_mm2],
                                     key=sf, reverse=True)
                packed_sheets = []
                while large_items or small_items:
                    packer = MaxRectsPacker(work_w, work_h)
                    cur = []; rem_l = []; rem_s = []
                    # Фаза 1: крупные — стандартный BSSF (заполняют периметр)
                    for item in large_items:
                        pos = packer.pack(item['w'], item['h'])
                        if pos is None and self.allow_rotation.get():
                            pos = packer.pack(item['h'], item['w'])
                            if pos is not None: item['w'], item['h'] = item['h'], item['w']
                        if pos is not None:
                            cur.append({'id': item['id'], 'type': item['type'],
                                        'x': pos['x']+margin, 'y': pos['y']+margin,
                                        'w': item['w']-kerf, 'h': item['h']-kerf,
                                        'orig_w': item['orig_w'], 'orig_h': item['orig_h'],
                                        'is_small': False})
                        else: rem_l.append(item)
                    # Фаза 2: мелкие — центр-биased (минимизируем F = dist² от центра листа)
                    for item in small_items:
                        pos = packer.pack_biased(item['w'], item['h'], work_cx, work_cy)
                        if pos is None: pos = packer.pack(item['w'], item['h'])
                        if pos is None and self.allow_rotation.get():
                            pos = packer.pack_biased(item['h'], item['w'], work_cx, work_cy)
                            if pos is None: pos = packer.pack(item['h'], item['w'])
                            if pos is not None: item['w'], item['h'] = item['h'], item['w']
                        if pos is not None:
                            cur.append({'id': item['id'], 'type': item['type'],
                                        'x': pos['x']+margin, 'y': pos['y']+margin,
                                        'w': item['w']-kerf, 'h': item['h']-kerf,
                                        'orig_w': item['orig_w'], 'orig_h': item['orig_h'],
                                        'is_small': True})
                        else: rem_s.append(item)
                    if not cur: break
                    packed_sheets.append(cur)
                    large_items = rem_l; small_items = rem_s
                density = 0
                if packed_sheets:
                    au = sum((r['w'] + kerf) * (r['h'] + kerf) for r in packed_sheets[0])
                    density = au / (work_w * work_h)
                if len(packed_sheets) < min_sheets:
                    min_sheets = len(packed_sheets); best_sheets = packed_sheets; best_density = density
                elif len(packed_sheets) == min_sheets and density > best_density:
                    best_sheets = packed_sheets; best_density = density
        self.sheets = best_sheets
        pc = {d['id']: 0 for d in self.doors}
        for s in self.sheets:
            for r in s: pc[r['id']] += 1
        for d in self.doors: d['placed'] = pc.get(d['id'], 0)
        self.refresh_tree()
        tp = sum(len(s) for s in self.sheets)
        am = sum(sum(d['orig_w'] * d['orig_h'] for d in s) for s in self.sheets) / 1e6
        self.stats_label.config(
            text=f"  {tp} parts  |  {am:.2f} m²  ({am*10.7639:.2f} sq.ft)")
        self.update_kpi()
        self.draw_preview_thumbnails()
        messagebox.showinfo("Готово", f"Раскладка завершена! Листов: {len(self.sheets)}")

    # ─── PREVIEW ──────────────────────────────────────────────────────────
    def draw_preview_thumbnails(self):
        self.canvas.delete("all")
        if not self.sheets: return
        cw = self.canvas.winfo_width()
        if cw < 50: return
        sw = self._fval(self.sheet_w); sh = self._fval(self.sheet_h)
        margin = self._fval(self.margin)
        thumb_w = 280; thumb_h = thumb_w * (sh / sw); padding = 20
        cols = max(1, int(cw // (thumb_w + padding)))
        for i, sheet in enumerate(self.sheets):
            row = i // cols; col = i % cols
            xo = col * (thumb_w + padding) + padding
            yo = row * (thumb_h + padding + 30) + padding + 10
            self.canvas.create_text(xo + thumb_w / 2, yo - 10,
                                    text=f"Лист {i+1}", font=("Arial", 10, "bold"))
            self.canvas.create_rectangle(xo, yo, xo + thumb_w, yo + thumb_h,
                                         fill='#e0e0e0', outline='black', width=2,
                                         tags=(f"s{i}",))
            ms = margin * (thumb_w / sw)
            self.canvas.create_rectangle(xo + ms, yo + ms, xo + thumb_w - ms, yo + thumb_h - ms,
                                         outline='red', dash=(2, 2), tags=(f"s{i}",))
            scale = thumb_w / sw
            for d in sheet:
                # FIX: Y-ось совпадает с G-кодом (Y=0 внизу)
                x1 = xo + d['x'] * scale
                y1 = yo + thumb_h - (d['y'] + d['h']) * scale
                x2 = xo + (d['x'] + d['w']) * scale
                y2 = yo + thumb_h - d['y'] * scale
                color = '#DBEAFE' if d['type'] == 'Shaker' else '#D1FAE5' if d['type'] == 'Shaker Step' else '#FEF3C7'
                tip = f"ID: {d['id']}|{d['orig_w']:.0f} × {d['orig_h']:.0f} mm|Type: {d['type']}"
                ptag = (f"s{i}", f"part:{tip}")
                self.canvas.create_rectangle(x1, y1, x2, y2, fill=color, outline='#0055aa', tags=ptag)
                # --- Shaker profile overlay ---
                if d['type'] in ('Shaker', 'Shaker Step'):
                    try:
                        fw = self._fval(self.frame_w) * scale
                        off2 = self._fval(self.pocket_step_offset) * scale
                    except Exception:
                        fw = 25 * scale; off2 = 5 * scale
                    if (x2 - x1) > 2 * fw + 4 and (y2 - y1) > 2 * fw + 4:
                        self.canvas.create_rectangle(
                            x1 + fw, y1 + fw, x2 - fw, y2 - fw,
                            outline='#0055aa', width=1, dash=(3, 2), tags=ptag)
                    if d['type'] == 'Shaker Step':
                        fw2 = fw + off2
                        if (x2 - x1) > 2 * fw2 + 4 and (y2 - y1) > 2 * fw2 + 4:
                            self.canvas.create_rectangle(
                                x1 + fw2, y1 + fw2, x2 - fw2, y2 - fw2,
                                outline='#cc5500', width=1, dash=(2, 3), tags=ptag)
                self.canvas.create_text((x1+x2)/2, (y1+y2)/2, text=f"ID:{d['id']}",
                                        font=("Arial", 7), tags=ptag)
            self.canvas.tag_bind(f"s{i}", "<Button-1>", lambda e, idx=i: self.show_full_sheet(idx))
        total_h = ((len(self.sheets) - 1) // cols + 1) * (thumb_h + padding + 30) + padding
        self.canvas.config(scrollregion=(0, 0, cw, total_h))

    def show_full_sheet(self, idx):
        if idx < 0 or idx >= len(self.sheets): return
        top = tk.Toplevel(self.root); top.title(f"Лист {idx+1}"); top.geometry("1000x780")
        c = tk.Canvas(top, bg='white'); c.pack(fill="both", expand=True, padx=10, pady=10)
        def draw(_=None):
            c.delete("all"); cw, ch = c.winfo_width(), c.winfo_height()
            sw = self._fval(self.sheet_w); sh = self._fval(self.sheet_h)
            if cw < 10 or sw <= 0: return
            scale = min((cw-20)/sw, (ch-20)/sh); ox, oy = 10, 10
            c.create_rectangle(ox, oy, ox+sw*scale, oy+sh*scale, fill='#e0e0e0', outline='black', width=2)
            for d in self.sheets[idx]:
                x1 = ox + d['x']*scale; y1 = oy + sh*scale - (d['y']+d['h'])*scale
                x2 = ox + (d['x']+d['w'])*scale; y2 = oy + sh*scale - d['y']*scale
                color = '#DBEAFE' if d['type'] == 'Shaker' else '#D1FAE5' if d['type'] == 'Shaker Step' else '#FEF3C7'
                c.create_rectangle(x1, y1, x2, y2, fill=color, outline='#0055aa')
                # --- Shaker profile overlay ---
                if d['type'] in ('Shaker', 'Shaker Step'):
                    try:
                        fw = self._fval(self.frame_w) * scale
                        off2 = self._fval(self.pocket_step_offset) * scale
                    except Exception:
                        fw = 25 * scale; off2 = 5 * scale
                    if (x2 - x1) > 2 * fw + 4 and (y2 - y1) > 2 * fw + 4:
                        c.create_rectangle(
                            x1 + fw, y1 + fw, x2 - fw, y2 - fw,
                            outline='#0055aa', width=1, dash=(3, 2))
                    if d['type'] == 'Shaker Step':
                        fw2 = fw + off2
                        if (x2 - x1) > 2 * fw2 + 4 and (y2 - y1) > 2 * fw2 + 4:
                            c.create_rectangle(
                                x1 + fw2, y1 + fw2, x2 - fw2, y2 - fw2,
                                outline='#cc5500', width=1, dash=(2, 3))
                rot = " (R)" if d['w'] != d['orig_w'] else ""
                c.create_text((x1+x2)/2, (y1+y2)/2,
                              text=f"ID:{d['id']}{rot}\n{int(d['orig_w'])}x{int(d['orig_h'])}",
                              font=("Arial", 10, "bold"))
        c.bind("<Configure>", draw); draw()

    def get_filename_prefix(self):
        order = self.order_id.get().strip()
        return order + "_" if order else ""

    # ─── PDF LABELS ───────────────────────────────────────────────────────
    def generate_pdf_labels(self):
        """
        Label layout (100 x 75 mm):
        ┌──────────────────────────────────────────────────┐
        │ Left info panel (54mm)  │  Right mini-map (41mm) │
        │  ID / Sheet             │  All parts: white       │
        │  Type / Size            │  THIS part: BLACK fill  │
        │  Order / Material       │  (inverse highlight)    │
        └──────────────────────────────────────────────────┘
        """
        if not self.sheets: return messagebox.showwarning("Error", "Run nesting first!")
        prefix = self.get_filename_prefix()
        filename = filedialog.asksaveasfilename(initialfile=f"{prefix}Labels.pdf",
                    defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
        if not filename: return

        PAGE_W, PAGE_H = 100*mm, 75*mm
        c = canvas.Canvas(filename, pagesize=(PAGE_W, PAGE_H))

        sw = self._fval(self.sheet_w); sh = self._fval(self.sheet_h)
        try: mat_z = self._fval(self.mat_z)
        except Exception: mat_z = 19.0
        n_sheets = len(self.sheets)
        order_str = self.order_id.get().strip() or "—"

        # Зоны на наклейке
        PAD   = 3*mm          # отступ от краёв
        DIV_X = 55*mm         # вертикальный разделитель текст / карта
        # Текстовая панель: PAD ... DIV_X-2mm
        TX = PAD + 3*mm; TW = DIV_X - TX - 2*mm
        # Карта: DIV_X+2mm ... PAGE_W-PAD
        MAP_X = DIV_X + 2*mm; MAP_Y = PAD + 1*mm
        MAP_W = PAGE_W - PAD - MAP_X; MAP_H = PAGE_H - 2*(PAD+1*mm)

        for si, sheet_doors in enumerate(self.sheets):
            # Масштаб карты — одинаков для всего листа
            scale = min(MAP_W / sw, MAP_H / sh)
            draw_w = sw * scale; draw_h = sh * scale
            # Центрируем карту в зоне
            mx = MAP_X + (MAP_W - draw_w) / 2
            my = MAP_Y + (MAP_H - draw_h) / 2

            for d in sheet_doors:
                rot = " (R)" if d['w'] != d['orig_w'] else ""
                d_type = 'SHAKER' if 'Shaker' in d['type'] else 'SLAB'
                small_mark = " *" if d.get('is_small') else ""

                # ── Рамка страницы ───────────────────────────────────────
                c.setStrokeColorRGB(0, 0, 0)
                c.setLineWidth(0.8)
                c.setFillColorRGB(1, 1, 1)
                c.rect(PAD, PAD, PAGE_W-2*PAD, PAGE_H-2*PAD, fill=1)

                # ── Вертикальный разделитель ─────────────────────────────
                c.setLineWidth(0.4)
                c.line(DIV_X, PAD+2*mm, DIV_X, PAGE_H-PAD-2*mm)

                # ── Текстовая панель ─────────────────────────────────────
                # Строка 1: крупный ID
                c.setFont("Helvetica-Bold", 16)
                c.setFillColorRGB(0, 0, 0)
                c.drawString(TX, PAGE_H - PAD - 11*mm, f"ID: {d['id']}{small_mark}")

                # Строка 2: Sheet N / M
                c.setFont("Helvetica", 8)
                c.drawString(TX, PAGE_H - PAD - 17*mm, f"Sheet {si+1} of {n_sheets}")

                # Горизонтальная черта под заголовком
                c.setLineWidth(0.3)
                c.line(TX, PAGE_H - PAD - 19*mm, DIV_X - 3*mm, PAGE_H - PAD - 19*mm)

                # Строка 3: SIZE
                c.setFont("Helvetica-Bold", 10)
                c.drawString(TX, PAGE_H - PAD - 26*mm, f"{d['orig_w']:.0f} x {d['orig_h']:.0f} mm{rot}")

                # Строка 4: TYPE
                c.setFont("Helvetica", 8)
                c.drawString(TX, PAGE_H - PAD - 33*mm, f"Type: {d_type}")

                # Строка 5: Material
                c.drawString(TX, PAGE_H - PAD - 40*mm, f"Mat: MDF {mat_z:.1f} mm")

                # Горизонтальная черта
                c.line(TX, PAGE_H - PAD - 43*mm, DIV_X - 3*mm, PAGE_H - PAD - 43*mm)

                # Строка 6: Order
                c.setFont("Helvetica-Bold", 8)
                c.drawString(TX, PAGE_H - PAD - 49*mm, f"Order:")
                c.setFont("Helvetica", 8)
                c.drawString(TX + 16*mm, PAGE_H - PAD - 49*mm, order_str[:12])

                # Строка 7: Parts on sheet
                c.setFont("Helvetica", 7)
                c.setFillColorRGB(0.4, 0.4, 0.4)
                c.drawString(TX, PAD + 4*mm, f"Sheet parts: {len(sheet_doors)}")

                # ── Мини-карта ───────────────────────────────────────────
                # Фон листа
                c.setFillColorRGB(0.92, 0.92, 0.92)
                c.setStrokeColorRGB(0.3, 0.3, 0.3)
                c.setLineWidth(0.5)
                c.rect(mx, my, draw_w, draw_h, fill=1)

                # Детали: сначала все белые, затем поверх — чёрная (текущая)
                # Сначала рисуем не-текущие
                for od in sheet_doors:
                    if od is d: continue   # пропустим — нарисуем поверх
                    px = mx + od['x'] * scale
                    py = my + od['y'] * scale
                    pw = od['w'] * scale;  ph_ = od['h'] * scale
                    c.setFillColorRGB(1, 1, 1)
                    c.setStrokeColorRGB(0.5, 0.5, 0.5)
                    c.setLineWidth(0.3)
                    c.rect(px, py, pw, ph_, fill=1)

                # Текущая деталь — ЧЁРНАЯ (инверсная подсветка)
                px = mx + d['x'] * scale
                py = my + d['y'] * scale
                pw = d['w'] * scale;  ph_ = d['h'] * scale
                c.setFillColorRGB(0, 0, 0)
                c.setStrokeColorRGB(0, 0, 0)
                c.setLineWidth(0.5)
                c.rect(px, py, pw, ph_, fill=1)

                c.showPage()

        c.save()
        messagebox.showinfo("Labels saved", f"{sum(len(s) for s in self.sheets)} labels saved to:\n{filename}")

    # ─── PDF CUTTING MAP ─────────────────────────────────────────────────────
    def generate_operator_pdf(self):
        if not self.sheets: return messagebox.showwarning("Error", "Run nesting first!")
        prefix = self.get_filename_prefix()
        filename = filedialog.asksaveasfilename(initialfile=f"{prefix}Map.pdf",
                    defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
        if not filename: return

        order_str = self.order_id.get().strip() or "—"
        c = canvas.Canvas(filename, pagesize=letter)
        pw, ph = letter
        sw = self._fval(self.sheet_w); sh = self._fval(self.sheet_h)
        try: mat_z = self._fval(self.mat_z)
        except Exception: mat_z = 19.0
        margin_val = self._fval(self.margin)
        pm = 36; header_h = 85; footer_h = 18
        scale = min((pw - 2*pm) / sw, (ph - pm - header_h - footer_h) / sh)
        dw = sw * scale; dh = sh * scale
        sx = (pw - dw) / 2
        sy = footer_h + (ph - pm - header_h - footer_h - dh) / 2

        # B&W схема:
        #   Shaker  → серый (0.75)  + обычный контур
        #   Slab    → белый (1.0)   + жирный контур (1.8pt) + мелкий пунктир внутри
        #   Small * → косая штриховка (hatch) поверх белого

        for si, sheet in enumerate(self.sheets):
            tp  = len(sheet)
            am  = sum(d['orig_w'] * d['orig_h'] for d in sheet) / 1e6
            am_sf = am * 10.7639
            n_small = sum(1 for d in sheet if d.get('is_small'))

            # ── Заголовок ────────────────────────────────────────────────
            c.setFillGray(0); c.setFont("Helvetica-Bold", 16)
            c.drawString(pm, ph - pm - 14,
                         f"Cutting Map  —  Sheet {si+1} of {len(self.sheets)}")
            c.setFont("Helvetica", 9); c.setFillGray(0.25)
            # Строка 2: дата слева, заказ справа
            c.drawString(pm, ph - pm - 26,
                         f"Date: {datetime.datetime.now().strftime('%m/%d/%Y %H:%M')}")
            c.drawString(pm + 180, ph - pm - 26,
                         f"Order: {self.order_id.get() or chr(8212)}")
            # Строка 3: размер листа + материал
            c.drawString(pm, ph - pm - 38,
                         f"Sheet: {sw:.0f} x {sh:.0f} mm  |  MDF {mat_z:.1f} mm")
            # Строка 4: кол-во деталей + площадь — отдельная строка (не пересекается)
            c.drawString(pm, ph - pm - 50,
                         f"Parts: {tp}  (small: {n_small})  |  Area: {am:.3f} m\u00b2  ({am_sf:.2f} sq.ft)")

            # ── Легенда (B&W) ─────────────────────────────────────────────
            # Символы: [░░]=Shaker  [ ]=Slab (жирный контур)  [///]=Small *
            leg_y = ph - pm - 64; lx = pm
            SZ = 9   # размер квадрата легенды

            # Shaker — серый
            c.setFillGray(0.72); c.setStrokeGray(0); c.setLineWidth(0.6)
            c.rect(lx, leg_y, SZ, SZ, fill=1)
            c.setFillGray(0); c.setFont("Helvetica", 7)
            c.drawString(lx + SZ + 3, leg_y + 1, "Shaker  (gray fill)"); lx += 74

            # Slab — белый с жирным контуром
            c.setFillGray(1); c.setStrokeGray(0); c.setLineWidth(1.8)
            c.rect(lx, leg_y, SZ, SZ, fill=1)
            c.setLineWidth(0.6); c.setFillGray(0)
            c.drawString(lx + SZ + 3, leg_y + 1, "Slab  (bold border)"); lx += 74

            # Small — штриховка
            c.setFillGray(1); c.setStrokeGray(0); c.setLineWidth(0.6)
            c.rect(lx, leg_y, SZ, SZ, fill=1)
            self._hatch_rect(c, lx, leg_y, SZ, SZ, spacing=3.0, lw=0.4)
            c.setStrokeGray(0); c.setLineWidth(0.6)
            c.rect(lx, leg_y, SZ, SZ, fill=0)
            c.setFillGray(0)
            c.drawString(lx + SZ + 3, leg_y + 1, "Small part  (hatch)")

            pm = 36   # сброс

            # ── Рамка листа ──────────────────────────────────────────────
            c.setStrokeColorRGB(0, 0, 0)
            c.setFillColorRGB(0.96, 0.96, 0.96)
            c.setLineWidth(1.5)
            c.rect(sx, sy, dw, dh, fill=1)

            # Отступная зона (margin) — пунктир
            ms = margin_val * scale
            c.setStrokeGray(0.4)
            c.setLineWidth(0.4)
            c.setDash([3, 3], 0)
            c.rect(sx + ms, sy + ms, dw - 2*ms, dh - 2*ms, fill=0)
            c.setDash([], 0)

            # ── Детали (B&W) ─────────────────────────────────────────────
            for d in sheet:
                rx = sx + d['x'] * scale; ry = sy + d['y'] * scale
                rw = d['w'] * scale;      rh = d['h'] * scale
                is_small = d.get('is_small', False)
                is_shaker = 'Shaker' in d['type']

                if is_shaker:
                    # Серая заливка, тонкий контур
                    c.setFillGray(0.72); c.setStrokeGray(0); c.setLineWidth(0.6)
                    c.rect(rx, ry, rw, rh, fill=1)
                else:
                    # Slab: белый + жирный контур
                    c.setFillGray(1); c.setStrokeGray(0); c.setLineWidth(1.8)
                    c.rect(rx, ry, rw, rh, fill=1)
                    c.setLineWidth(0.6)

                # Поверх: мелкие детали — штриховка
                if is_small:
                    self._hatch_rect(c, rx, ry, rw, rh, spacing=5.0, lw=0.35)
                    c.setStrokeGray(0); c.setLineWidth(0.6)
                    c.rect(rx, ry, rw, rh, fill=0)   # восстановить контур

                # Текст внутри детали
                fs_id = min(9, max(5, int(min(rw, rh) * 0.25)))
                c.setFillColorRGB(0, 0, 0)
                c.setFont("Helvetica-Bold", fs_id)
                c.drawCentredString(rx + rw/2, ry + rh/2 + fs_id*0.4,
                                    f"ID:{d['id']}")
                fs_sz = max(4, fs_id - 1)
                c.setFont("Helvetica", fs_sz)
                c.drawCentredString(rx + rw/2, ry + rh/2 - fs_sz*0.8,
                                    f"{d['orig_w']:.0f}x{d['orig_h']:.0f}")
                if d['w'] != d['orig_w']:   # rotated indicator
                    c.setFont("Helvetica-Oblique", max(4, fs_sz-1))
                    c.drawCentredString(rx + rw/2, ry + rh/2 - fs_sz*2.0, "(R)")

            # ── Координатные оси (X/Y подписи сторон листа) ──────────────
            c.setFillColorRGB(0.4, 0.4, 0.4)
            c.setFont("Helvetica", 7)
            c.drawCentredString(sx + dw/2, sy - 12, f"X  0 → {sw:.0f} mm")
            c.saveState()
            c.translate(sx - 12, sy + dh/2)
            c.rotate(90)
            c.drawCentredString(0, 0, f"Y  0 → {sh:.0f} mm")
            c.restoreState()

            # ── Нижний колонтитул ─────────────────────────────────────────
            c.setFillColorRGB(0.5, 0.5, 0.5)
            c.setFont("Helvetica", 6)
            c.drawString(pm, 10,
                f"CNC Fasady PRO  |  Sheet {si+1}/{len(self.sheets)}  |  {order_str}  |  {mat_z:.1f} mm MDF")

            c.showPage()

        c.save()
        messagebox.showinfo("Cutting Map saved",
                            f"{len(self.sheets)} sheet(s) saved to:\n{filename}")

    # ─── B&W HATCH HELPER ────────────────────────────────────────────────
    @staticmethod
    def _hatch_rect(c, rx, ry, rw, rh, spacing=4.5, lw=0.35):
        """Diagonal 45° hatch clipped to rect (B&W print support)."""
        c.saveState()
        p = c.beginPath(); p.rect(rx, ry, rw, rh)
        c.clipPath(p, stroke=0, fill=0)
        c.setLineWidth(lw); c.setStrokeGray(0.35)
        d = rw + rh
        x = rx - rh
        while x < rx + rw:
            c.line(x, ry, x + d, ry + d)
            x += spacing
        c.restoreState()

    # ─── TSP OPTIMIZER ────────────────────────────────────────────────────
    def optimize_path(self, doors, cx, cy):
        unvisited = list(doors); path = []
        while unvisited:
            nearest = min(unvisited, key=lambda d: (d['x']+d['w']/2-cx)**2 + (d['y']+d['h']/2-cy)**2)
            path.append(nearest); cx = nearest['x']+nearest['w']/2; cy = nearest['y']+nearest['h']/2
            unvisited.remove(nearest)
        return path

    # ─── G-CODE GENERATOR ─────────────────────────────────────────────────
    def generate_gcode(self):
        if not self.sheets: return messagebox.showwarning("Ошибка", "Сначала раскладка!")
        prefix = self.get_filename_prefix()
        # FIX: закрывающая скобка filedialog
        base_filename = filedialog.asksaveasfilename(
            initialfile=f"{prefix}Gcode.nc",
            defaultextension=".nc",
            filetypes=[("G-Code", "*.nc")]
        )
        if not base_filename: return

        try:
            z_top    = self._fval(self.mat_z)

            def _corners_ccw(xmin, xmax, ymin, ymax):
                # SW SE NE NW
                return [(xmin,ymin,1,1),(xmax,ymin,-1,1),(xmax,ymax,-1,-1),(xmin,ymax,1,-1)]

            def _nearest_corners(corners_list, start_x, start_y):
                # Nearest-neighbor обход 4 углов, старт с ближайшего
                remaining = list(corners_list); ordered = []
                cx_, cy_ = start_x, start_y
                while remaining:
                    nearest = min(remaining, key=lambda c: (c[0]-cx_)**2 + (c[1]-cy_)**2)
                    ordered.append(nearest); cx_, cy_ = nearest[0], nearest[1]
                    remaining.remove(nearest)
                return ordered

            def _nearest_start(corners, cx, cy):
                # Вернуть индекс ближайшего угла как стартовую точку CCW обхода
                dists = [(c[0]-cx)**2 + (c[1]-cy)**2 for c in corners]
                return dists.index(min(dists))

            def _combined_miter_chamfer(buf, xmin, xmax, ymin, ymax,
                                         z_start, z_end, z_cham, depth,
                                         z_safe, feed_cut, feed_plunge, cx, cy):
                """
                Объединённый маршрут: угловой срез + переход по стенке на z_cham.
                Порядок: ближайший угол первым, затем CCW.
                После возврата из угла — НЕ подъём, а сразу движение по стенке на z_cham
                до следующего угла, затем подъём на z_start и срез.
                """
                corners = _corners_ccw(xmin, xmax, ymin, ymax)
                si = _nearest_start(corners, cx, cy)
                order = [(si + i) % 4 for i in range(4)]
                # Переходные координаты между углами (по стенкам CCW)
                # SW→SE: двигаться к SE.x, оставаться на SW.y (нижняя стенка)
                # SE→NE: двигаться к NE.y, оставаться на SE.x (правая стенка)
                # NE→NW: двигаться к NW.x, оставаться на NE.y (верхняя стенка)
                # NW→SW(замыкание): двигаться к SW.y, оставаться на NW.x (левая стенка)
                def _transit(c_from, c_to):
                    # Возвращает (X, Y) промежуточной точки — угол следующего угла
                    return c_to[0], c_to[1]

                for i, idx in enumerate(order):
                    xc, yc, dx, dy = corners[idx]
                    next_idx = order[(i + 1) % 4]
                    xn, yn = corners[next_idx][0], corners[next_idx][1]

                    if i == 0:
                        # Первый угол: подъезд с safe
                        buf.append(f"G0 X{xc:.3f} Y{yc:.3f} Z{z_safe:.1f}")
                        buf.append(f"G1 Z{z_start:.3f} F{feed_plunge}")
                    else:
                        # Уже у стенки на z_cham — подъём на z_start перед срезом
                        buf.append(f"G1 Z{z_start:.3f} F{feed_plunge}")

                    # Срез угла
                    buf.append(f"G1 X{xc+depth*dx:.3f} Y{yc+depth*dy:.3f} Z{z_end:.3f} F{feed_plunge}")
                    buf.append(f"G1 X{xc:.3f} Y{yc:.3f} Z{z_start:.3f} F{feed_plunge*3}")

                    # Переход к следующему углу по стенке на z_cham
                    buf.append(f"G1 Z{z_cham:.3f} F{feed_plunge}")
                    if xc == xn:
                        buf.append(f"G1 Y{yn:.3f} F{feed_cut}")
                    elif yc == yn:
                        buf.append(f"G1 X{xn:.3f} F{feed_cut}")
                    else:
                        # диагональный переход (не должно быть, но на всякий случай)
                        buf.append(f"G1 X{xn:.3f} Y{yn:.3f} F{feed_cut}")

                # После последнего угла — замыкаем периметр к первому углу и поднимаемся
                # (последний переход уже довёл до стартового угла)
                buf.append(f"G0 Z{z_safe:.1f}")
                # Возвращаем позицию последнего угла для curr_x/curr_y
                last = corners[order[-1]]
                return last[0], last[1]

            z_bottom = z_top - self._fval(self.pocket_depth)
            z_chamfer       = z_top - self._fval(self.chamfer_depth)
            z_chamfer_outer = z_top - self._fval(self.outer_chamfer_depth)
            z_safe   = 30.0
            frame_w  = self._fval(self.frame_w)
            feed     = int(self.feed_xy.get())
            # ── Режимы T2 (D4 фреза, МДФ) ──────────────────────────────
            # DOC = pocket_depth (3мм, 0.75×D) → консервативные режимы
            feed_t2         = int(self.t2_feed_var.get())  # from Settings
            feed_t2_corner  = max(300, feed_t2 // 7)
            feed_t2_plunge  = max(100, feed_t2 // 17)
            # blend_t2 удалён — причина перереза углов (см. OP2 fix)
            out_r    = self._fval(self.corner_r)
        except ValueError:
            return messagebox.showerror("Error", "Check numeric parameters.")
        except Exception as _ex:
            import traceback as _tb
            return messagebox.showerror("G-code Error",
                f"Unexpected error:\n{_ex}\n\n{_tb.format_exc()[-800:]}")

        # Параметры инструмента выборки
        t6_name         = self.pocket_tool_t.get()
        _t6_dia_raw = self.pocket_tool_dia.get().strip()
        if not _t6_dia_raw:
            return messagebox.showerror(
                "T6 Diameter missing",
                "Please enter tool diameter D (mm) in the T6 Pocket Cutter block.")
        try:
            t6_dia = float(_t6_dia_raw.replace(',', '.'))
        except ValueError:
            return messagebox.showerror(
                "T6 Diameter invalid",
                f"Cannot parse diameter value: '{_t6_dia_raw}'\nUse digits and . or ,")
        if t6_dia <= 0:
            return messagebox.showerror("T6 Diameter invalid", "Diameter must be > 0.")
        t6_r            = t6_dia / 2.0
        t6_spindle, t6_feed = self.get_pocket_tool_params()
        t6_type         = self.pocket_tool_type.get()
        selected_strategy = self.pocket_strategy.get()

        try:
            overlap_pct = self._fval(self.spiral_overlap)
        except Exception:
            overlap_pct = 50.0

        # Шаг для финишного прохода
        step_finish = (t6_dia * (100.0 - overlap_pct) / 100.0)
        if step_finish <= 0: step_finish = t6_r

        # T2 параметры
        t2_d = 4.0; t2_r = 2.0

        # Предупреждение о маленьких фасадах
        tool_d = t6_dia
        small_count = sum(
            1 for sheet in self.sheets for d in sheet
            if d['type'] == 'Shaker' and
               (d['w'] - 2*frame_w < tool_d or d['h'] - 2*frame_w < tool_d))
        if small_count:
            ans = messagebox.askyesnocancel(
                "Внимание",
                f"Найдено {small_count} фасад(ов), где карман меньше фрезы ({tool_d:.0f}мм).\n"
                "Нажмите Да — пометить их как Гладкий (Slab) и продолжить.\n"
                "Нет/Отмена — прервать генерацию.")
            if ans:
                for sheet in self.sheets:
                    for d in sheet:
                        if d['type'] == 'Shaker':
                            pw = d['w'] - 2*frame_w; ph = d['h'] - 2*frame_w
                            if pw < tool_d or ph < tool_d:
                                d['type'] = 'Гладкий (Slab)'  # FIX: единообразный тип
                self.draw_preview_thumbnails()
            else:
                return

        # Безопасный split имени файла (защита от отсутствия расширения)
        _fn_base = base_filename if '.' in base_filename.replace('\\','/').split('/')[-1]                    else base_filename + '.nc'
        _fn_parts = _fn_base.rsplit('.', 1)

        for sheet_idx, sheet_doors in enumerate(self.sheets):
            filename = f"{_fn_parts[0]}_Sheet{sheet_idx+1}.{_fn_parts[1]}"
            cl = []
            cl.append("%")
            cl.append(f"(NESTED FASADY — SHEET {sheet_idx+1}/{len(self.sheets)})")
            if self.order_id.get().strip(): cl.append(f"(ORDER: {self.order_id.get()})")
            cl.append(f"(SHEET: {self.sheet_w.get()}x{self.sheet_h.get()}  Z_TOP={z_top}  Z_BOTTOM={z_bottom:.3f})")
            cl.append(f"(POCKET TOOL: {t6_name} D{t6_dia:.2f} {t6_type}  RPM={t6_spindle}  FEED={t6_feed})")
            cl.append(f"(STRATEGY: {selected_strategy})")
            cl.append("G21 G90 G17 G40 G80")
            cl.append(f"G0 Z{z_safe}"); cl.append("")
            curr_x, curr_y = 0.0, 0.0

            # ── OP1: POCKET ─────────────────────────────────────────────
            if self.do_pocket.get():
                cl.append(f"(--- OP1: POCKETS {t6_name} D{t6_dia:.2f} {t6_type} ---)")
                cl.append(f"{t6_name} M6")
                cl.append(f"S{t6_spindle} M3"); cl.append("")

                shaker_doors = [d for d in sheet_doors if d['type'] in ('Shaker', 'Shaker Step')]
                for d in self.optimize_path(shaker_doors, curr_x, curr_y):
                    px_min = d['x'] + frame_w; px_max = d['x'] + d['w'] - frame_w
                    py_min = d['y'] + frame_w; py_max = d['y'] + d['h'] - frame_w
                    cx_min = px_min + t6_r;    cx_max = px_max - t6_r
                    cy_min = py_min + t6_r;    cy_max = py_max - t6_r
                    if cx_max < cx_min or cy_max < cy_min: continue

                    pocket_depth_val = z_top - z_bottom
                    if not self.do_rough_pass.get():
                        num_passes = 1
                        pass_depth = pocket_depth_val  # full depth
                    else:
                        num_passes = 2
                        pass_depth = pocket_depth_val / 2.0
                    cl.append(f"(POCKET ID {d['id']}  {d['orig_w']:.0f}x{d['orig_h']:.0f})")

                    for pass_idx in range(num_passes):
                        current_z = z_top - pass_depth * (pass_idx + 1)
                        # Проверка: второй проход не выходит глубже z_bottom  # FIX: clamp
                        current_z = max(current_z, z_bottom)

                        # pass 0 из 2 = черновой (Змейка, шаг 90%)
                        # pass 0 из 1 = финишный (стратегия из UI)
                        is_rough = (pass_idx == 0) and (num_passes > 1)
                        active_strategy = "Snake" if is_rough else selected_strategy
                        current_step = (t6_dia * 0.90) if is_rough else step_finish

                        # ── Змейка ──────────────────────────────────────
                        if "Snake" in active_strategy or "Zmejka" in active_strategy or "Змейка" in active_strategy:
                            cl.append(f"G0 Z{z_top + 5.0}")
                            cl.append(f"G0 X{cx_min:.3f} Y{cy_min:.3f}")
                            cl.append(f"G1 Z{z_top + 0.5} F2000")
                            ramp_x = min(cx_min + 60.0, cx_max)
                            cl.append(f"G1 X{ramp_x:.3f} Z{current_z:.3f} F800")
                            if ramp_x > cx_min: cl.append(f"G1 X{cx_min:.3f} F{t6_feed}")
                            cur_y = cy_min; direction = 1
                            while cur_y <= cy_max:
                                if direction == 1: cl.append(f"G1 X{cx_max:.3f} F{t6_feed}")
                                else:              cl.append(f"G1 X{cx_min:.3f} F{t6_feed}")
                                next_y = cur_y + current_step
                                if next_y > cy_max and cur_y < cy_max: next_y = cy_max
                                if next_y <= cy_max or cur_y < cy_max:
                                    cl.append(f"G1 Y{next_y:.3f} F{t6_feed}")
                                cur_y = next_y; direction *= -1

                            # Контурный проход T6 после змейки (оба слоя).
                            # Инструмент уже на current_z — обходим периметр CCW без подъёма.
                            cl.append(f"(-- Snake contour pass layer {pass_idx+1} at Z{current_z:.3f} --)")
                            cl.append(f"G0 Z{z_top + 2.0}")
                            cl.append(f"G0 X{cx_min:.3f} Y{cy_min:.3f}")
                            cl.append(f"G1 Z{current_z:.3f} F800")
                            cl.append(f"G1 X{cx_max:.3f} F{t6_feed}")  # → вправо
                            cl.append(f"G1 Y{cy_max:.3f}")
                            cl.append(f"G1 X{cx_min:.3f}")
                            cl.append(f"G1 Y{cy_min:.3f}")

                        # ── Спираль (изнутри наружу) ─────────────────────
                        elif "Spiral" in active_strategy or "Спираль" in active_strategy:
                            sp = []
                            sx0, sx1, sy0, sy1 = cx_min, cx_max, cy_min, cy_max
                            while sx0 <= sx1 and sy0 <= sy1:
                                sp.append((sx0, sx1, sy0, sy1))
                                sx0 += current_step; sx1 -= current_step
                                sy0 += current_step; sy1 -= current_step
                            sp.reverse()  # центр → наружу
                            for i, (xn, xx, yn, yx) in enumerate(sp):
                                if i == 0:
                                    cl.append(f"G0 Z{z_top + 5.0}")
                                    cl.append(f"G0 X{xn:.3f} Y{yn:.3f}")
                                    cl.append(f"G1 Z{z_top + 0.5} F2000")
                                    rl = min(60.0, xx-xn) if xx > xn else 0
                                    if rl > 5:
                                        cl.append(f"G1 X{xn+rl:.3f} Z{current_z:.3f} F800")
                                        cl.append(f"G1 X{xn:.3f} F{t6_feed}")
                                    else:
                                        cl.append(f"G1 Z{current_z:.3f} F400")
                                else:
                                    cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                                if xn == xx and yn == yx: cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                                elif xn == xx: cl.append(f"G1 Y{yx:.3f} F{t6_feed}"); cl.append(f"G1 Y{yn:.3f}")
                                elif yn == yx: cl.append(f"G1 X{xx:.3f} F{t6_feed}"); cl.append(f"G1 X{xn:.3f}")
                                else:
                                    cl.append(f"G1 X{xx:.3f} F{t6_feed}"); cl.append(f"G1 Y{yx:.3f}")
                                    cl.append(f"G1 X{xn:.3f}");             cl.append(f"G1 Y{yn:.3f}")

                        # ── Попутное (снаружи внутрь, CCW) ───────────────
                        # FIX: НЕ делаем reverse() — настоящее climb (outside-in)
                        elif "Climb" in active_strategy or "Попутное" in active_strategy or "CCW" in active_strategy:
                            sp = []
                            sx0, sx1, sy0, sy1 = cx_min, cx_max, cy_min, cy_max
                            while sx0 <= sx1 and sy0 <= sy1:
                                sp.append((sx0, sx1, sy0, sy1))
                                sx0 += current_step; sx1 -= current_step
                                sy0 += current_step; sy1 -= current_step
                            # NO reverse() — наружу → внутрь = попутное
                            for i, (xn, xx, yn, yx) in enumerate(sp):
                                if i == 0:
                                    cl.append(f"G0 Z{z_top + 5.0}")
                                    cl.append(f"G0 X{xn:.3f} Y{yn:.3f}")
                                    cl.append(f"G1 Z{z_top + 0.5} F2000")
                                    rl = min(60.0, xx-xn) if xx > xn else 0
                                    if rl > 5:
                                        cl.append(f"G1 X{xn+rl:.3f} Z{current_z:.3f} F800")
                                        cl.append(f"G1 X{xn:.3f} F{t6_feed}")
                                    else:
                                        cl.append(f"G1 Z{current_z:.3f} F400")
                                else:
                                    cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                                # CCW прямоугольник
                                cl.append(f"G1 X{xx:.3f} F{t6_feed}"); cl.append(f"G1 Y{yx:.3f}")
                                cl.append(f"G1 X{xn:.3f}");             cl.append(f"G1 Y{yn:.3f}")

                        if pass_idx == 0 and num_passes > 1:
                            cl.append(f"G0 Z{z_top + 5.0}")  # inter-pass retract

                    cl.append(f"G0 Z{z_safe}")
                    curr_x, curr_y = d['x'] + d['w']/2, d['y'] + d['h']/2
                    cl.append("")

                    # 2nd pocket (Shaker Step or pocket_depth2 > 0)
                    try:
                        _pd2 = float(self.pocket_depth2.get().replace(',', '.'))
                    except Exception:
                        _pd2 = 0.0
                    _is_step = d['type'] == 'Shaker Step'
                    if _is_step and _pd2 > 0:
                        try:
                            step_off = float(self.pocket_step_offset.get().replace(',', '.'))
                        except Exception:
                            step_off = 5.0
                        sx_min = px_min + step_off; sx_max = px_max - step_off
                        sy_min = py_min + step_off; sy_max = py_max - step_off
                        cx2_min = sx_min + t6_r;   cx2_max = sx_max - t6_r
                        cy2_min = sy_min + t6_r;   cy2_max = sy_max - t6_r
                        if cx2_max > cx2_min and cy2_max > cy2_min:
                            z_step = z_bottom - _pd2  # дно 1-го кармана минус глубина 2-го
                            cl.append(f"(2ND POCKET ID {d['id']} off={step_off:.1f} depth={_pd2:.1f})")
                            current_z2 = z_step
                            current_step2 = step_finish
                            # helper: emit one CCW rectangle pass at given Z
                            def _ccw_rect2(x0, x1, y0, y1, z):
                                cl.append(f"G0 Z{z_top + 5.0}")
                                cl.append(f"G0 X{x0:.3f} Y{y0:.3f}")
                                cl.append(f"G1 Z{z_top + 0.5} F2000")
                                ramp = min(x0 + 60.0, x1)
                                cl.append(f"G1 X{ramp:.3f} Z{z:.3f} F800")
                                if ramp > x0: cl.append(f"G1 X{x0:.3f} F{t6_feed}")
                                cl.append(f"G1 X{x1:.3f} F{t6_feed}")
                                cl.append(f"G1 Y{y1:.3f}")
                                cl.append(f"G1 X{x0:.3f}")
                                cl.append(f"G1 Y{y0:.3f}")

                            if 'Spiral' in selected_strategy or 'Спираль' in selected_strategy:
                                sp2 = []
                                sx0, sx1, sy0, sy1 = cx2_min, cx2_max, cy2_min, cy2_max
                                while sx0 <= sx1 and sy0 <= sy1:
                                    sp2.append((sx0, sx1, sy0, sy1))
                                    sx0 += current_step2; sx1 -= current_step2
                                    sy0 += current_step2; sy1 -= current_step2
                                sp2.reverse()
                                for si, (xn, xx, yn, yx) in enumerate(sp2):
                                    if si == 0:
                                        cl.append(f"G0 Z{z_top + 5.0}")
                                        cl.append(f"G0 X{xn:.3f} Y{yn:.3f}")
                                        cl.append(f"G1 Z{z_top + 0.5} F2000")
                                    else:
                                        cl.append(f"G1 X{xn:.3f} Y{yn:.3f} F{t6_feed}")
                                    cl.append(f"G1 X{xx:.3f} F{t6_feed}")
                                    cl.append(f"G1 Y{yx:.3f}")
                                    cl.append(f"G1 X{xn:.3f}")
                                    cl.append(f"G1 Y{yn:.3f}")
                            elif 'Snake' in selected_strategy or 'Змейка' in selected_strategy:
                                # snake fill + contour pass
                                cuy = cy2_min; drn = 1
                                cl.append(f"G0 Z{z_top + 5.0}")
                                cl.append(f"G0 X{cx2_min:.3f} Y{cy2_min:.3f}")
                                cl.append(f"G1 Z{z_top + 0.5} F2000")
                                ramp_x2 = min(cx2_min + 60.0, cx2_max)
                                cl.append(f"G1 X{ramp_x2:.3f} Z{current_z2:.3f} F800")
                                if ramp_x2 > cx2_min: cl.append(f"G1 X{cx2_min:.3f} F{t6_feed}")
                                while cuy <= cy2_max:
                                    if drn == 1: cl.append(f"G1 X{cx2_max:.3f} F{t6_feed}")
                                    else:        cl.append(f"G1 X{cx2_min:.3f} F{t6_feed}")
                                    ny = cuy + current_step2
                                    if ny > cy2_max and cuy < cy2_max: ny = cy2_max
                                    if ny <= cy2_max or cuy < cy2_max:
                                        cl.append(f"G1 Y{ny:.3f} F{t6_feed}")
                                    cuy = ny; drn *= -1
                                # contour pass
                                _ccw_rect2(cx2_min, cx2_max, cy2_min, cy2_max, current_z2)
                            else:  # Climb (CCW) — contour spiral inward
                                cur_x0, cur_x1 = cx2_min, cx2_max
                                cur_y0, cur_y1 = cy2_min, cy2_max
                                first2 = True
                                while cur_x0 <= cur_x1 and cur_y0 <= cur_y1:
                                    if first2:
                                        cl.append(f"G0 Z{z_top + 5.0}")
                                        cl.append(f"G0 X{cur_x0:.3f} Y{cur_y0:.3f}")
                                        cl.append(f"G1 Z{z_top + 0.5} F2000")
                                        ramp = min(cur_x0 + 60.0, cur_x1)
                                        cl.append(f"G1 X{ramp:.3f} Z{current_z2:.3f} F800")
                                        if ramp > cur_x0: cl.append(f"G1 X{cur_x0:.3f} F{t6_feed}")
                                        first2 = False
                                    else:
                                        cl.append(f"G1 X{cur_x0:.3f} Y{cur_y0:.3f} F{t6_feed}")
                                    cl.append(f"G1 X{cur_x1:.3f} F{t6_feed}")
                                    cl.append(f"G1 Y{cur_y1:.3f}")
                                    cl.append(f"G1 X{cur_x0:.3f}")
                                    cl.append(f"G1 Y{cur_y0:.3f}")
                                    cur_x0 += current_step2; cur_x1 -= current_step2
                                    cur_y0 += current_step2; cur_y1 -= current_step2
                            cl.append(f"G0 Z{z_top + 5.0}")


            # ── OP2: PERIMETER + CORNERS T2 D4 ──────────────────────────
            # Логика:
            #  1. Всегда — чистовой обход периметра кармана (контурный проход)
            #  2. Змейка  — дополнительный проход чуть дальше от стенки
            #     (snake не делает контурный проход T6, нужна подчистка по периметру)
            #  3. Всегда — L-проходы в 4 углах (T6 оставляет R=t6_r)
            if self.do_corners_rest.get():
                cl.append("(--- OP2: PERIMETER + CORNERS REST T2 D4 ---)")
                cl.append(f"(    feed={feed_t2} mm/min  plunge={feed_t2_plunge} mm/min  corner={feed_t2_corner} mm/min)")
                cl.append(f"{self.t2_tool_t.get()} M6"); cl.append("S18000 M3"); cl.append("")

                # Шаги углов: от (t6_r - t2_d) до t2_r, шаг = t2_d
                offsets_t2 = []
                off = t6_r - t2_d
                while off > t2_r:
                    offsets_t2.append(round(off, 1))
                    off -= t2_d
                offsets_t2.append(t2_r)

                shaker_doors = [d for d in sheet_doors if d['type'] in ('Shaker', 'Shaker Step')]
                for d in self.optimize_path(shaker_doors, curr_x, curr_y):
                    px_min = d['x'] + frame_w; px_max = d['x'] + d['w'] - frame_w
                    py_min = d['y'] + frame_w; py_max = d['y'] + d['h'] - frame_w
                    if (px_max - px_min) < 2*t2_r or (py_max - py_min) < 2*t2_r: continue

                    cl.append(f"(T2 ID {d['id']}  T6_R={t6_r:.1f}  steps={len(offsets_t2)}  strategy={selected_strategy[:5]})")

                    # ── 2a. Snake pre-pass: зачистка стенок (только для Змейки) ──
                    # Snake не делает контурный проход T6. T2 сначала подчищает
                    # зону вдоль стенок шириной t6_r диагональным CCW-прямоугольником.
                    if "Snake" in selected_strategy or "Змейка" in selected_strategy:
                        snake_off = t6_r
                        if (px_max - px_min - 2*snake_off) > 0 and (py_max - py_min - 2*snake_off) > 0:
                            sx1 = px_min + snake_off; sx2 = px_max - snake_off
                            cl.append("(-- Snake wall strip: CCW at t6_r offset --)")
                            cl.append(f"G0 X{sx1:.3f} Y{py_min + t2_r:.3f} Z{z_top + 5.0}")
                            cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                            cl.append(f"G1 X{sx2:.3f} F{feed_t2}")
                            cl.append(f"G1 Y{py_max - t2_r:.3f}")
                            cl.append(f"G1 X{sx1:.3f}")
                            cl.append(f"G1 Y{py_min + t2_r:.3f}")
                            cl.append(f"G0 Z{z_top + 3.0}")

                    # ── 2b. Финишный контурный проход периметра (всегда) ──────────
                    # CCW = попутное фрезерование (climb) для M3 шпинделя.
                    # Подача feed_t2 — безопасный режим для D4.
                    cl.append("(-- Perimeter finish pass: CCW at t2_r offset --)")
                    pp_x1 = px_min + t2_r; pp_x2 = px_max - t2_r
                    pp_y1 = py_min + t2_r; pp_y2 = py_max - t2_r
                    cl.append(f"G0 X{pp_x1:.3f} Y{pp_y1:.3f} Z{z_top + 5.0}")
                    cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                    cl.append(f"G1 X{pp_x2:.3f} F{feed_t2}")
                    cl.append("G4 P0")     # остановка в углу периметра
                    cl.append(f"G1 Y{pp_y2:.3f} F{feed_t2}")
                    cl.append("G4 P0")
                    cl.append(f"G1 X{pp_x1:.3f} F{feed_t2}")
                    cl.append("G4 P0")
                    cl.append(f"G1 Y{pp_y1:.3f} F{feed_t2}")
                    cl.append(f"G0 Z{z_top + 3.0}")

                    # ── 2c. Угловые L-проходы (ИСПРАВЛЕНО) ───────────────────────
                    # ПРИЧИНА БРАКА: diagonal blend двигал центр фрезы ближе чем t2_r
                    # к стенке, когда off был мал (последний проход off=t2_r=2мм).
                    # При blend=1.5: цель Y = py_min+0.5 → край фрезы = py_min-1.5 → перерез!
                    #
                    # РЕШЕНИЕ:
                    # 1. Diagonal blend УДАЛЁН — только чистый прямоугольный L-проход.
                    # 2. Скорость перед поворотом: feed_t2_corner (900 мм/мин).
                    # 3. G4 P0 в точке поворота: NK280B тормозит до нуля →
                    #    исключает controller corner-smoothing overshoot.
                    # 4. Вырожденный последний проход (off == t2_r) — ПРОПУСКАЕТСЯ
                    #    (он ничего не добавляет: все координаты = те же, что у периметра).
                    # 5. Все координаты ГАРАНТИРОВАННО ≥ t2_r от стенки.
                    #    Математика: x_end = cx_ + dx*t2_r → edge = cx_ + dx*t2_r - t2_r = cx_
                    #                y_end = cy_ + dy*off  → off ≥ t2_r → ok
                    cl.append("(-- Corner L-passes  [FIXED: no diagonal, G4P0 at turn] --)")
                    corners_cfg = [
                        (px_min, py_min, +1, +1),   # левый нижний
                        (px_max, py_min, -1, +1),   # правый нижний
                        (px_max, py_max, -1, -1),   # правый верхний
                        (px_min, py_max, +1, -1),   # левый верхний
                    ]
                    # Nearest-neighbor: стартуем с ближайшего угла к текущей позиции
                    _si_t2 = min(range(4), key=lambda i: (corners_cfg[i][0]-curr_x)**2 + (corners_cfg[i][1]-curr_y)**2)
                    corners_cfg = corners_cfg[_si_t2:] + corners_cfg[:_si_t2]
                    for j_c, (cx_, cy_, dx, dy) in enumerate(corners_cfg):
                        for j, off in enumerate(offsets_t2):
                            # Пропускаем вырожденный проход (off=t2_r → L нулевого размера)
                            if off <= t2_r: continue
                            x_start = cx_ + dx * off     # центр: off от угла по X
                            y_start = cy_ + dy * t2_r    # центр: t2_r от стенки по Y ← SAFE
                            x_end   = cx_ + dx * t2_r    # центр: t2_r от стенки по X ← SAFE
                            y_end   = cy_ + dy * off     # центр: off от угла по Y
                            # Позиционирование: первый шаг угла — с воздуха, остальные — на глубине
                            if j == 0:
                                cl.append(f"G0 X{x_start:.3f} Y{y_start:.3f}")
                                cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                            else:
                                cl.append(f"G0 Z{z_top + 3.0}")  # FIX retract
                                cl.append(f"G0 X{x_start:.3f} Y{y_start:.3f}")
                                cl.append(f"G1 Z{z_bottom} F{feed_t2_plunge}")
                            # Y-ход к повороту — ЗАМЕДЛЕНИЕ перед углом
                            cl.append(f"G1 Y{y_end:.3f} F{feed_t2_corner}")
                            # G4 P0 — форсированная остановка перед поворотом на 90°
                            # NK280B: контроллер не «скругляет» угол, нет overshoot
                            cl.append("G4 P0")
                            # X-ход к стенке — нормальная подача
                            cl.append(f"G1 X{x_end:.3f} F{feed_t2}")
                        # Подъём между углами
                        cl.append(f"G0 Z{z_top + 3.0}")
                        curr_x, curr_y = cx_, cy_  # обновляем позицию после каждого угла T2

                    cl.append(f"G0 Z{z_safe}")
                    curr_x, curr_y = d['x'] + d['w']/2, d['y'] + d['h']/2
                    cl.append("")

                    # ── 2nd pocket corners T2 (Shaker Step only) ────────────
                    if d['type'] == 'Shaker Step':
                        try:
                            _pd2_t2 = float(self.pocket_depth2.get().replace(',', '.'))
                            _so_t2  = float(self.pocket_step_offset.get().replace(',', '.'))
                        except Exception:
                            _pd2_t2 = 0.0; _so_t2 = 5.0
                        if _pd2_t2 > 0:
                            z_step_t2 = z_bottom - _pd2_t2
                            sx_min2 = px_min + _so_t2; sx_max2 = px_max - _so_t2
                            sy_min2 = py_min + _so_t2; sy_max2 = py_max - _so_t2
                            if (sx_max2 - sx_min2) > 2*t2_r and (sy_max2 - sy_min2) > 2*t2_r:
                                cl.append(f"(T2 2ND-POCKET ID {d['id']}  Z={z_step_t2:.3f})")
                                # периметр 2-го кармана
                                pp2_x1 = sx_min2 + t2_r; pp2_x2 = sx_max2 - t2_r
                                pp2_y1 = sy_min2 + t2_r; pp2_y2 = sy_max2 - t2_r
                                cl.append(f"G0 X{pp2_x1:.3f} Y{pp2_y1:.3f} Z{z_top + 5.0}")
                                cl.append(f"G1 Z{z_step_t2:.3f} F{feed_t2_plunge}")
                                cl.append(f"G1 X{pp2_x2:.3f} F{feed_t2}"); cl.append("G4 P0")
                                cl.append(f"G1 Y{pp2_y2:.3f} F{feed_t2}"); cl.append("G4 P0")
                                cl.append(f"G1 X{pp2_x1:.3f} F{feed_t2}"); cl.append("G4 P0")
                                cl.append(f"G1 Y{pp2_y1:.3f} F{feed_t2}")
                                cl.append(f"G0 Z{z_top + 3.0}")
                                # угловые L-проходы 2-го кармана
                                corners2 = [
                                    (sx_min2, sy_min2, +1, +1),
                                    (sx_max2, sy_min2, -1, +1),
                                    (sx_max2, sy_max2, -1, -1),
                                    (sx_min2, sy_max2, +1, -1),
                                ]
                                _si2 = min(range(4), key=lambda i: (corners2[i][0]-curr_x)**2 + (corners2[i][1]-curr_y)**2)
                                corners2 = corners2[_si2:] + corners2[:_si2]
                                for cx2_, cy2_, dx2, dy2 in corners2:
                                    _first2 = True
                                    for off2 in offsets_t2:
                                        if off2 <= t2_r: continue
                                        x2s = cx2_ + dx2 * off2
                                        y2s = cy2_ + dy2 * t2_r
                                        x2e = cx2_ + dx2 * t2_r
                                        y2e = cy2_ + dy2 * off2
                                        if _first2:
                                            cl.append(f"G0 X{x2s:.3f} Y{y2s:.3f}")
                                            cl.append(f"G1 Z{z_step_t2:.3f} F{feed_t2_plunge}")
                                            _first2 = False
                                        else:
                                            cl.append(f"G0 Z{z_top + 3.0}")
                                            cl.append(f"G0 X{x2s:.3f} Y{y2s:.3f}")
                                            cl.append(f"G1 Z{z_step_t2:.3f} F{feed_t2_plunge}")
                                        cl.append(f"G1 Y{y2e:.3f} F{feed_t2_corner}")
                                        cl.append("G4 P0")
                                        cl.append(f"G1 X{x2e:.3f} F{feed_t2}")
                                    cl.append(f"G0 Z{z_top + 3.0}")
                                    curr_x, curr_y = cx2_, cy2_
                                cl.append(f"G0 Z{z_safe}")

            # ── OP3: T5 MITERS / CHAMFERS ────────────────────────────────
            _do_inner = self._fval(self.chamfer_depth) > 0
            _do_outer = self._fval(self.outer_chamfer_depth) > 0
            _has_step = any(d['type'] == 'Shaker Step' for d in sheet_doors)
            if self.do_french_miter.get() or _do_inner or _do_outer or _has_step:
                cl.append("(--- OP3: MITERS & CHAMFERS T5 V90 ---)"); cl.append(f"{self.t5_tool_t.get()} M6"); cl.append("S18000 M3"); cl.append("")
                depth = self._fval(self.pocket_depth)
                for d in self.optimize_path(sheet_doors, curr_x, curr_y):
                    px_min = d['x']+frame_w; px_max = d['x']+d['w']-frame_w
                    py_min = d['y']+frame_w; py_max = d['y']+d['h']-frame_w
                    ox_min = d['x'];          ox_max = d['x']+d['w']
                    oy_min = d['y'];          oy_max = d['y']+d['h']
                    t5_buf = []  # буфер — (T5 ID x) выводим только если есть G-код
                    if d['type'] in ('Shaker', 'Shaker Step'):
                        if self.do_french_miter.get() or _do_inner:
                            # Объединённый маршрут: угловые срезы + фаска по стенке между углами
                            _z_cham1 = z_chamfer if _do_inner else z_top
                            curr_x, curr_y = _combined_miter_chamfer(
                                t5_buf,
                                px_min, px_max, py_min, py_max,
                                z_start=z_top, z_end=z_bottom, z_cham=_z_cham1,
                                depth=depth, z_safe=z_safe,
                                feed_cut=4000, feed_plunge=1000,
                                cx=curr_x, cy=curr_y
                            )
                        # ── T5 для 2nd pocket (Shaker Step) ─────────────────
                        if d['type'] == 'Shaker Step':
                            try:
                                _pd2_t5 = float(self.pocket_depth2.get().replace(',', '.'))
                                _so_t5  = float(self.pocket_step_offset.get().replace(',', '.'))
                            except Exception:
                                _pd2_t5 = 0.0; _so_t5 = 5.0
                            if _pd2_t5 > 0:
                                z_step_t5  = z_bottom - _pd2_t5   # дно 2го кармана
                                z_cham2    = z_bottom - self._fval(self.chamfer_depth)  # фаска на стенке уступа (от z_bottom вниз)
                                sx_min_t5 = px_min + _so_t5; sx_max_t5 = px_max - _so_t5
                                sy_min_t5 = py_min + _so_t5; sy_max_t5 = py_max - _so_t5
                                if sx_max_t5 > sx_min_t5 and sy_max_t5 > sy_min_t5:
                                    t5_buf.append(f"(T5 2ND-POCKET french miter ID {d['id']})")
                                    # Объединённый маршрут 2го кармана: угловые срезы + фаска уступа
                                    _z_cham2_use = z_cham2 if _do_inner else z_bottom
                                    curr_x, curr_y = _combined_miter_chamfer(
                                        t5_buf,
                                        sx_min_t5, sx_max_t5, sy_min_t5, sy_max_t5,
                                        z_start=z_bottom, z_end=z_step_t5, z_cham=_z_cham2_use,
                                        depth=depth, z_safe=z_safe,
                                        feed_cut=4000, feed_plunge=1000,
                                        cx=curr_x, cy=curr_y
                                    )
                    # ── Наружная фаска: для ВСЕХ типов (Shaker, Shaker Step, Slab) ──
                    if _do_outer:
                        t5_buf.append(f"(T5 OUTER CHAMFER ID {d['id']}  type={d['type']})")
                        t5_buf.append(f"G0 X{ox_min:.3f} Y{oy_min+out_r:.3f} Z{z_top+5}")
                        t5_buf.append(f"G1 Z{z_chamfer_outer} F1000")
                        t5_buf.append(f"G1 Y{oy_max-out_r:.3f} F4000")
                        t5_buf.append(f"G2 X{ox_min+out_r:.3f} Y{oy_max:.3f} R{out_r}")
                        t5_buf.append(f"G1 X{ox_max-out_r:.3f}")
                        t5_buf.append(f"G2 X{ox_max:.3f} Y{oy_max-out_r:.3f} R{out_r}")
                        t5_buf.append(f"G1 Y{oy_min+out_r:.3f}")
                        t5_buf.append(f"G2 X{ox_max-out_r:.3f} Y{oy_min:.3f} R{out_r}")
                        t5_buf.append(f"G1 X{ox_min+out_r:.3f}")
                        t5_buf.append(f"G2 X{ox_min:.3f} Y{oy_min+out_r:.3f} R{out_r}")
                        t5_buf.append(f"G0 Z{z_safe}")
                    # Выводим заголовок + буфер только если есть реальный G-код
                    if t5_buf:
                        cl.append(f"(T5 ID {d['id']})")
                        cl.extend(t5_buf)
                    curr_x, curr_y = d['x']+d['w']/2, d['y']+d['h']/2
                cl.append("")

            # ── OP4: CUTOUT T3 ─────────────────────────────────────────────
            # Очерёдность: мелкие детали ПЕРВЫМИ (вакуум максимален).
            # Точка входа: на стороне, максимально удалённой от ближайшего края листа
            # → вектор силы резания в момент замыкания направлен к центру листа.
            if self.do_cutout.get():
                cl.append("(--- OP4: CUTOUT T3 D6  [мелкие→крупные / entry к центру] ---)")
                t3_spindle_val = int(self._fval(self.t3_spindle))
                t3_feed_cut    = int(self._fval(self.t3_feed_var))
                cl.append(f"{self.t3_tool_t.get()} M6")
                cl.append(f"S{t3_spindle_val} M3")
                cl.append("")
                # Сортируем: мелкие первыми (меньше площадь), затем крупные
                sw_val = self._fval(self.sheet_w); sh_val = self._fval(self.sheet_h)
                mg_val = self._fval(self.margin)
                doors_sorted = sorted(sheet_doors, key=lambda d: d['orig_w']*d['orig_h'])
                for d in self.optimize_path(doors_sorted, curr_x, curr_y):
                    ox_min = d['x']-3.0; ox_max = d['x']+d['w']+3.0
                    oy_min = d['y']-3.0; oy_max = d['y']+d['h']+3.0
                    rx = out_r + 3.0
                    # Определяем сторону входа — противоположную ближайшему краю листа
                    dl = d['x'] - mg_val
                    dr = (sw_val - mg_val) - (d['x'] + d['w'])
                    db = d['y'] - mg_val
                    dt = (sh_val - mg_val) - (d['y'] + d['h'])
                    mn = min(dl, dr, db, dt)
                    if   mn == dl: es = 'R'   # ближе к левому краю → вход справа
                    elif mn == dr: es = 'L'   # ближе к правому → вход слева
                    elif mn == db: es = 'T'   # ближе к нижнему → вход сверху
                    else:          es = 'B'   # ближе к верхнему → вход снизу

                    cl.append(f"(CUTOUT ID {d['id']}  {d['orig_w']:.0f}x{d['orig_h']:.0f}  entry={es})")
                    # CW-контур (G2 дуги) с адаптивной точкой входа:
                    # LEFT  (9ч): ↑ → arc_TL → → arc_TR → ↓ → arc_BR → ← → arc_BL → ↑close
                    # RIGHT (3ч): ↓ → arc_BR → ← → arc_BL → ↑ → arc_TL → → arc_TR → ↓close
                    # TOP   (12ч): → → arc_TR → ↓ → arc_BR → ← → arc_BL → ↑ → arc_TL → →close
                    # BOTTOM(6ч): ← → arc_BL → ↑ → arc_TL → → arc_TR → ↓ → arc_BR → ←close
                    # ── Зигзаг-рампа T3: врезание вдоль первой стенки контура ──────
                    # ramp_len: длина одного зига вдоль стенки
                    # ramp_dz:  опускание за один зиг по Z
                    # ── v5.4.2: ramp из настроек (T3 dia + mat_z) ──────────
                    _t3d       = self._fval(self.kerf)           # T3 диаметр мм
                    _z_range   = z_top + 0.2                     # полный диапазон Z
                    # длина одного зига: мин. 4×D, но не более 60 мм
                    ramp_len   = round(min(max(4.0 * _t3d, 24.0), 60.0), 1)
                    # шаг по Z: угол ≤ 5° (tan5°=0.0875), и не более 0.5×D
                    ramp_dz    = round(min(_t3d * 0.5, ramp_len * 0.087, 3.0), 2)
                    ramp_feed  = max(600, t3_feed_cut // 5)

                    def zigzag(cl, axis, p0, p1, z_start, z_target, ramp_len, ramp_dz, ramp_feed):
                        """Зигзаг вдоль оси axis ('X' или 'Y') между p0 и p1 от z_start до z_target."""
                        z = z_start
                        direction = 1  # +1 к p1, -1 к p0
                        pos = p0
                        while z > z_target:
                            z_next = max(z - ramp_dz, z_target)
                            pos_next = pos + direction * ramp_len
                            # Ограничиваем в пределах [p0, p1]
                            pos_next = max(min(pos_next, p1), p0)
                            if axis == 'Y':
                                cl.append(f"G1 Y{pos_next:.3f} Z{z_next:.3f} F{ramp_feed}")
                            else:
                                cl.append(f"G1 X{pos_next:.3f} Z{z_next:.3f} F{ramp_feed}")
                            z = z_next
                            pos = pos_next
                            direction *= -1
                        # Возврат в точку входа на финальной глубине
                        if axis == 'Y':
                            cl.append(f"G1 Y{p0:.3f} F{ramp_feed}")
                        else:
                            cl.append(f"G1 X{p0:.3f} F{ramp_feed}")

                    if es == 'L':
                        sy_s = oy_min + rx
                        p1_ramp = min(sy_s + 999.0, oy_max - rx)
                        cl.append(f"G0 X{ox_min:.3f} Y{sy_s:.3f} Z{z_top+5.0}")
                        cl.append(f"G1 Z{z_top:.3f} F2000")
                        zigzag(cl, 'Y', sy_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                        cl.append(f"G1 Y{oy_max-rx:.3f} F{t3_feed_cut}")
                        cl.append(f"G2 X{ox_min+rx:.3f} Y{oy_max:.3f} R{rx}")
                        cl.append(f"G1 X{ox_max-rx:.3f}")
                        cl.append(f"G2 X{ox_max:.3f} Y{oy_max-rx:.3f} R{rx}")
                        cl.append(f"G1 Y{oy_min+rx:.3f}")
                        cl.append(f"G2 X{ox_max-rx:.3f} Y{oy_min:.3f} R{rx}")
                        cl.append(f"G1 X{ox_min+rx:.3f}")
                        cl.append(f"G2 X{ox_min:.3f} Y{oy_min+rx:.3f} R{rx}")
                        cl.append(f"G1 Y{sy_s:.3f}")
                    elif es == 'R':
                        sy_s = oy_max - rx
                        p1_ramp = max(sy_s - 999.0, oy_min + rx)
                        cl.append(f"G0 X{ox_max:.3f} Y{sy_s:.3f} Z{z_top+5.0}")
                        cl.append(f"G1 Z{z_top:.3f} F2000")
                        zigzag(cl, 'Y', sy_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                        cl.append(f"G1 Y{oy_min+rx:.3f} F{t3_feed_cut}")
                        cl.append(f"G2 X{ox_max-rx:.3f} Y{oy_min:.3f} R{rx}")
                        cl.append(f"G1 X{ox_min+rx:.3f}")
                        cl.append(f"G2 X{ox_min:.3f} Y{oy_min+rx:.3f} R{rx}")
                        cl.append(f"G1 Y{oy_max-rx:.3f}")
                        cl.append(f"G2 X{ox_min+rx:.3f} Y{oy_max:.3f} R{rx}")
                        cl.append(f"G1 X{ox_max-rx:.3f}")
                        cl.append(f"G2 X{ox_max:.3f} Y{oy_max-rx:.3f} R{rx}")
                        cl.append(f"G1 Y{sy_s:.3f}")
                    elif es == 'T':
                        sx_s = ox_min + rx
                        p1_ramp = min(sx_s + 999.0, ox_max - rx)
                        cl.append(f"G0 X{sx_s:.3f} Y{oy_max:.3f} Z{z_top+5.0}")
                        cl.append(f"G1 Z{z_top:.3f} F2000")
                        zigzag(cl, 'X', sx_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                        cl.append(f"G1 X{ox_max-rx:.3f} F{t3_feed_cut}")
                        cl.append(f"G2 X{ox_max:.3f} Y{oy_max-rx:.3f} R{rx}")
                        cl.append(f"G1 Y{oy_min+rx:.3f}")
                        cl.append(f"G2 X{ox_max-rx:.3f} Y{oy_min:.3f} R{rx}")
                        cl.append(f"G1 X{ox_min+rx:.3f}")
                        cl.append(f"G2 X{ox_min:.3f} Y{oy_min+rx:.3f} R{rx}")
                        cl.append(f"G1 Y{oy_max-rx:.3f}")
                        cl.append(f"G2 X{ox_min+rx:.3f} Y{oy_max:.3f} R{rx}")
                        cl.append(f"G1 X{sx_s:.3f}")
                    else:  # es == 'B'
                        sx_s = ox_max - rx
                        p1_ramp = max(sx_s - 999.0, ox_min + rx)
                        cl.append(f"G0 X{sx_s:.3f} Y{oy_min:.3f} Z{z_top+5.0}")
                        cl.append(f"G1 Z{z_top:.3f} F2000")
                        zigzag(cl, 'X', sx_s, p1_ramp, z_top, -0.2, ramp_len, ramp_dz, ramp_feed)
                        cl.append(f"G1 X{ox_min+rx:.3f} F{t3_feed_cut}")
                        cl.append(f"G2 X{ox_min:.3f} Y{oy_min+rx:.3f} R{rx}")
                        cl.append(f"G1 Y{oy_max-rx:.3f}")
                        cl.append(f"G2 X{ox_min+rx:.3f} Y{oy_max:.3f} R{rx}")
                        cl.append(f"G1 X{ox_max-rx:.3f}")
                        cl.append(f"G2 X{ox_max:.3f} Y{oy_max-rx:.3f} R{rx}")
                        cl.append(f"G1 Y{oy_min+rx:.3f}")
                        cl.append(f"G2 X{ox_max-rx:.3f} Y{oy_min:.3f} R{rx}")
                        cl.append(f"G1 X{sx_s:.3f}")
                    cl.append(f"G0 Z{z_safe}")
                    curr_x, curr_y = d['x']+d['w']/2, d['y']+d['h']/2
                cl.append("")

            cl += ["G0 Z50.0", "G0 Y3000.0", "M5", "M30", "%"]
            try:
                with open(filename, 'w', encoding='utf-8') as f:
                    cl = self._sanitize_gcode(cl)
                    f.write("\n".join(cl))
            except OSError as _oe:
                messagebox.showerror("Save Error",
                    f"Sheet {sheet_idx+1}: cannot write file\n{filename}\n\n{_oe}")
                return

        messagebox.showinfo("Done",
            f"G-code saved: {len(self.sheets)} sheet(s)\n" +
            "\n".join(f"  {_fn_parts[0]}_Sheet{si+1}.{_fn_parts[1]}"
                       for si in range(len(self.sheets))))


if __name__ == "__main__":
    root = tk.Tk()
    app = AdvancedNestingGUI(root)
    root.mainloop()