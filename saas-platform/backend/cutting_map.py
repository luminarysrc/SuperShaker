"""
Cutting Map PDF — Operator Reference Sheet Generator
======================================================
Generates a B&W printable cutting map PDF with one page per sheet.
Each page shows:
  - Header with date, order, material, part counts
  - Legend (Shaker=gray, Slab=bold border, Small=hatch)
  - Full-scale sheet layout with labeled parts
  - Coordinate axes and footer
"""
import io
import datetime
import math
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm


def _hatch_rect(c, rx, ry, rw, rh, spacing=4.5, lw=0.35):
    """Diagonal 45° hatch clipped to rect (B&W print support)."""
    c.saveState()
    p = c.beginPath()
    p.rect(rx, ry, rw, rh)
    c.clipPath(p, stroke=0, fill=0)
    c.setLineWidth(lw)
    c.setStrokeGray(0.35)
    d = rw + rh
    x = rx - rh
    while x < rx + rw:
        c.line(x, ry, x + d, ry + d)
        x += spacing
    c.restoreState()


def generate_cutting_map_pdf(sheets, sheets_meta, mat_z, margin, order_id=""):
    """
    Generate a B&W operator cutting map PDF.

    sheets: list of sheets, each sheet is a list of placed parts
    sheets_meta: list of metadata dicts containing width and height for each sheet
    Returns: io.BytesIO buffer with PDF data
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    pw, ph = letter
    n_sheets = len(sheets)
    order_str = order_id or "—"

    pm = 36  # page margin
    header_h = 85
    footer_h = 18

    for si, sheet in enumerate(sheets):
        meta = sheets_meta[si]
        sheet_w = meta["w"]
        sheet_h = meta["h"]
        is_offcut = meta.get("is_offcut", False)

        scale = min((pw - 2 * pm) / sheet_w, (ph - pm - header_h - footer_h) / sheet_h)
        dw = sheet_w * scale
        dh = sheet_h * scale
        sx = (pw - dw) / 2
        sy = footer_h + (ph - pm - header_h - footer_h - dh) / 2

        tp = len(sheet)
        am = sum(d['orig_w'] * d['orig_h'] for d in sheet) / 1e6
        am_sf = am * 10.7639
        n_small = sum(1 for d in sheet if d.get('is_small'))

        # ── Header ──────────────────────────────────────────────
        c.setFillGray(0)
        c.setFont("Helvetica-Bold", 16)
        title_suffix = " (Offcut Re-use)" if is_offcut else ""
        c.drawString(pm, ph - pm - 14,
                     f"Cutting Map  —  Sheet {si + 1} of {n_sheets}{title_suffix}")
        c.setFont("Helvetica", 9)
        c.setFillGray(0.25)
        c.drawString(pm, ph - pm - 26,
                     f"Date: {datetime.datetime.now().strftime('%m/%d/%Y %H:%M')}")
        c.drawString(pm + 180, ph - pm - 26,
                     f"Order: {order_str}")
        c.drawString(pm, ph - pm - 38,
                     f"Sheet: {sheet_w:.0f} x {sheet_h:.0f} mm  |  MDF {mat_z:.1f} mm")
        c.drawString(pm, ph - pm - 50,
                     f"Parts: {tp}  (small: {n_small})  |  Area: {am:.3f} m\u00b2  ({am_sf:.2f} sq.ft)")

        # ── Legend ──────────────────────────────────────────────
        leg_y = ph - pm - 64
        lx = pm
        SZ = 9

        # Shaker — gray
        c.setFillGray(0.72)
        c.setStrokeGray(0)
        c.setLineWidth(0.6)
        c.rect(lx, leg_y, SZ, SZ, fill=1)
        c.setFillGray(0)
        c.setFont("Helvetica", 7)
        c.drawString(lx + SZ + 3, leg_y + 1, "Shaker  (gray fill)")
        lx += 74

        # Slab — bold border
        c.setFillGray(1)
        c.setStrokeGray(0)
        c.setLineWidth(1.8)
        c.rect(lx, leg_y, SZ, SZ, fill=1)
        c.setLineWidth(0.6)
        c.setFillGray(0)
        c.drawString(lx + SZ + 3, leg_y + 1, "Slab  (bold border)")
        lx += 74

        # Small — hatch
        c.setFillGray(1)
        c.setStrokeGray(0)
        c.setLineWidth(0.6)
        c.rect(lx, leg_y, SZ, SZ, fill=1)
        _hatch_rect(c, lx, leg_y, SZ, SZ, spacing=3.0, lw=0.4)
        c.setStrokeGray(0)
        c.setLineWidth(0.6)
        c.rect(lx, leg_y, SZ, SZ, fill=0)
        c.setFillGray(0)
        c.drawString(lx + SZ + 3, leg_y + 1, "Small part  (hatch)")

        # ── Sheet frame ────────────────────────────────────────
        c.setStrokeColorRGB(0, 0, 0)
        c.setFillColorRGB(0.96, 0.96, 0.96)
        c.setLineWidth(1.5)
        c.rect(sx, sy, dw, dh, fill=1)

        # Margin zone — dashed
        ms = margin * scale
        c.setStrokeGray(0.4)
        c.setLineWidth(0.4)
        c.setDash([3, 3], 0)
        c.rect(sx + ms, sy + ms, dw - 2 * ms, dh - 2 * ms, fill=0)
        c.setDash([], 0)

        # ── Parts (B&W) ───────────────────────────────────────
        for d in sheet:
            rx = sx + d['x'] * scale
            ry = sy + d['y'] * scale
            rw = d['w'] * scale
            rh = d['h'] * scale
            is_small = d.get('is_small', False)
            is_shaker = 'Shaker' in d.get('type', '')

            if is_shaker:
                c.setFillGray(0.72)
                c.setStrokeGray(0)
                c.setLineWidth(0.6)
                c.rect(rx, ry, rw, rh, fill=1)
            else:
                c.setFillGray(1)
                c.setStrokeGray(0)
                c.setLineWidth(1.8)
                c.rect(rx, ry, rw, rh, fill=1)
                c.setLineWidth(0.6)

            if is_small:
                _hatch_rect(c, rx, ry, rw, rh, spacing=5.0, lw=0.35)
                c.setStrokeGray(0)
                c.setLineWidth(0.6)
                c.rect(rx, ry, rw, rh, fill=0)

            # Text inside part
            fs_id = min(9, max(5, int(min(rw, rh) * 0.25)))
            c.setFillColorRGB(0, 0, 0)
            c.setFont("Helvetica-Bold", fs_id)
            c.drawCentredString(rx + rw / 2, ry + rh / 2 + fs_id * 0.4,
                                f"ID:{d['id']}")
            fs_sz = max(4, fs_id - 1)
            c.setFont("Helvetica", fs_sz)
            c.drawCentredString(rx + rw / 2, ry + rh / 2 - fs_sz * 0.8,
                                f"{d['orig_w']:.0f}x{d['orig_h']:.0f}")
            if d['w'] != d['orig_w']:
                c.setFont("Helvetica-Oblique", max(4, fs_sz - 1))
                c.drawCentredString(rx + rw / 2, ry + rh / 2 - fs_sz * 2.0, "(R)")

        # ── Coordinate axes ───────────────────────────────────
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.setFont("Helvetica", 7)
        c.drawCentredString(sx + dw / 2, sy - 12, f"X  0 → {sheet_w:.0f} mm")
        c.saveState()
        c.translate(sx - 12, sy + dh / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, f"Y  0 → {sheet_h:.0f} mm")
        c.restoreState()

        # ── Footer ────────────────────────────────────────────
        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.setFont("Helvetica", 6)
        c.drawString(pm, 10,
                     f"SuperShaker  |  Sheet {si + 1}/{n_sheets}  |  {order_str}  |  {mat_z:.1f} mm MDF")

        c.showPage()

    c.save()
    buf.seek(0)
    return buf
