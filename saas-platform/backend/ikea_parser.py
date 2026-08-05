"""
ikea_parser.py — IKEA Kitchen Planner PDF Parser
==================================================
Extracts facade/door parts from IKEA Kitchen Planner PDF export files.

IKEA Kitchen Planner generates PDFs with:
  - Cabinet summary tables (article number, description, quantity)
  - Door/drawer front listings with nominal sizes
  - Cabinet numbers (e.g. "B01", "W02")

The parser uses pdfplumber for text extraction and regex patterns to
identify IKEA article numbers and size specifications.

Usage:
    result = parse_ikea_pdf(pdf_bytes, material_preset=None)
    # Returns: list of part dicts ready for CNC conversion

────────────────────────────────────────────────────────────────
CALIBRATION NOTE (keep in memory / commit note):
────────────────────────────────────────────────────────────────
IKEA Kitchen Planner changes its PDF layout with each software version.
The current parser uses heuristic regex patterns that cover common formats
but MAY MISS parts if the PDF structure differs.

ACTION REQUIRED before production use:
  1. Export a real IKEA Kitchen Planner PDF from the workshop's version.
  2. Share the sample with the developer to calibrate the parser.
  3. The parser will then be retrained on the exact table structure.

Until a real sample is provided, manual review of the import preview
table is MANDATORY before adding parts to the job.
────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
import re
import io
import logging
from typing import Optional

logger = logging.getLogger("supershaker.ikea_parser")

# ─────────────────────────────────────────────────────────
#  Try to import pdfplumber (optional dependency)
# ─────────────────────────────────────────────────────────
try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    logger.warning("pdfplumber not installed. IKEA PDF parsing will be limited. "
                   "Install with: pip install pdfplumber")


# ─────────────────────────────────────────────────────────
#  IKEA Article Number Patterns
# ─────────────────────────────────────────────────────────
# IKEA article numbers format: XXX.XXX.XX (8-10 digits with dots)
ARTICLE_PATTERN = re.compile(r'\b(\d{3}[\.\s]\d{3}[\.\s]\d{2})\b')

# Size patterns: "W x H" in mm or inches
# IKEA Planner usually shows sizes like: "400x720", "400 x 720", "15¾x28⅜"
SIZE_PATTERN_MM = re.compile(r'(\d{2,4})\s*[xXх×]\s*(\d{2,4})')
SIZE_PATTERN_IN = re.compile(r'(\d+[\s\-]?\d+/\d+|\d+(?:\.\d+)?)\s*[xXх×]\s*(\d+[\s\-]?\d+/\d+|\d+(?:\.\d+)?)\s*(?:in|")')

# Cabinet/box number patterns: "B01", "W02", "T03", "SEKTION-01"
CABINET_PATTERN = re.compile(r'\b([BWTbwt]\d{2,3}|SEKTION[\-_]\d+|Cabinet\s*\d+)\b', re.IGNORECASE)

# Door/drawer keywords
DOOR_KEYWORDS = ['door', 'facade', 'front', 'drawer front', 'panel', 'фасад', 'дверь']
DRAWER_KEYWORDS = ['drawer', 'maximera', 'ящик', 'drawers']

# IKEA size in catalog format: e.g. "AXSTAD door, grey, 15x30"
CATALOG_SIZE = re.compile(r'(\d{1,3})\s*[xX×]\s*(\d{1,3})\s*"')

# ─────────────────────────────────────────────────────────
#  Fraction Parser (for imperial sizes like "15¾")
# ─────────────────────────────────────────────────────────

UNICODE_FRACTIONS = {
    '¼': 0.25, '½': 0.5, '¾': 0.75,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
    '⅓': 1/3, '⅔': 2/3,
}

def parse_imperial_size(s: str) -> float | None:
    """Parse imperial size string like '15¾', '15 3/4', '15-3/4' to decimal inches."""
    s = s.strip()
    total = 0.0

    # Replace unicode fractions
    for uf, val in UNICODE_FRACTIONS.items():
        if uf in s:
            s = s.replace(uf, f' {val}')

    # Pattern: "15 3/4" or "15-3/4"
    m = re.match(r'^(\d+)[\s\-]+(\d+)/(\d+)$', s.strip())
    if m:
        whole = int(m.group(1))
        num = int(m.group(2))
        den = int(m.group(3))
        return whole + num / den

    # Pattern: "3/4" (fraction only)
    m = re.match(r'^(\d+)/(\d+)$', s.strip())
    if m:
        return int(m.group(1)) / int(m.group(2))

    # Pattern: "15 0.75" (integer + decimal fraction)
    parts = s.split()
    for p in parts:
        try:
            total += float(p)
        except ValueError:
            pass
    return total if total > 0 else None


# ─────────────────────────────────────────────────────────
#  Core PDF Parser
# ─────────────────────────────────────────────────────────

def parse_ikea_pdf(
    pdf_bytes: bytes,
    material_preset: dict | None = None,
    default_type: str = "Shaker",
) -> dict:
    """
    Parse an IKEA Kitchen Planner PDF and extract part data.

    Parameters
    ----------
    pdf_bytes : bytes      Raw PDF file content
    material_preset : dict  Material preset for size calculations:
                            {edge_thickness, fuging_allowance, gap_each_side}
    default_type : str     Default facade type for extracted parts

    Returns
    -------
    dict with keys:
        "parts" : list of part dicts with w, h, qty, type, cabinet_id, articul
        "raw_items" : list of raw extracted rows (for debugging/preview)
        "warnings" : list of warning messages
        "pages_parsed" : int
    """
    if not PDFPLUMBER_AVAILABLE:
        return {
            "parts": [],
            "raw_items": [],
            "warnings": ["pdfplumber is not installed. Cannot parse PDF. "
                         "Run: pip install pdfplumber"],
            "pages_parsed": 0,
        }

    from ikea_geometry import nominal_to_cnc, IKEA_GAP_EACH_SIDE_MM

    edge_thickness = 0.4
    fuging_allowance = 0.0
    gap_each_side = IKEA_GAP_EACH_SIDE_MM

    if material_preset:
        edge_thickness = material_preset.get("edge_thickness", edge_thickness)
        fuging_allowance = material_preset.get("fuging_allowance", fuging_allowance)

    parts = []
    raw_items = []
    warnings = []
    pages_parsed = 0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages_parsed = len(pdf.pages)

            for page_num, page in enumerate(pdf.pages):
                # ── Try table extraction first ──────────────────────────
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if not row:
                            continue
                        row_text = " | ".join(str(c or "") for c in row)
                        item = _parse_row(
                            row_text, row,
                            edge_thickness, fuging_allowance, gap_each_side,
                            default_type,
                        )
                        if item:
                            raw_items.append({"source": f"table_p{page_num+1}", "row": row_text})
                            parts.append(item)

                # ── Fall back to raw text extraction ────────────────────
                if not tables:
                    text = page.extract_text() or ""
                    for line in text.split('\n'):
                        item = _parse_line(
                            line,
                            edge_thickness, fuging_allowance, gap_each_side,
                            default_type,
                        )
                        if item:
                            raw_items.append({"source": f"text_p{page_num+1}", "line": line})
                            parts.append(item)

    except Exception as e:
        warnings.append(f"PDF parsing error: {str(e)}")
        logger.error(f"IKEA PDF parse error: {e}", exc_info=True)

    # Deduplicate and clean
    parts = _deduplicate(parts)

    if not parts:
        warnings.append(
            "No parts were automatically detected. "
            "The PDF format may differ from IKEA Kitchen Planner standard. "
            "Please add parts manually or provide a sample PDF for calibration."
        )

    return {
        "parts": parts,
        "raw_items": raw_items,
        "warnings": warnings,
        "pages_parsed": pages_parsed,
    }


# ─────────────────────────────────────────────────────────
#  Row / Line Parsers
# ─────────────────────────────────────────────────────────

def _parse_row(
    row_text: str,
    row: list,
    edge_thickness: float,
    fuging_allowance: float,
    gap_each_side: float,
    default_type: str,
) -> dict | None:
    """Try to extract a part from a table row."""
    from ikea_geometry import nominal_to_cnc

    row_lower = row_text.lower()

    # Must contain size information
    size_match = SIZE_PATTERN_MM.search(row_text)
    if not size_match:
        return None

    # Filter out non-door rows (e.g. hardware rows)
    has_door_keyword = any(kw in row_lower for kw in DOOR_KEYWORDS + DRAWER_KEYWORDS)
    has_article = bool(ARTICLE_PATTERN.search(row_text))

    if not (has_door_keyword or has_article):
        # Still try if it has a recognizable size — could be a facade in a size column
        # Be conservative: require at least a size and the row has > 2 cells
        cells = [c for c in row if c and str(c).strip()]
        if len(cells) < 3:
            return None

    # Extract size
    w_raw = float(size_match.group(1))
    h_raw = float(size_match.group(2))

    # Determine units — IKEA Planner typically shows mm in European, inches in US
    # Heuristic: if both dims < 100 → inches; if > 200 → mm
    if w_raw < 100 and h_raw < 100:
        # Likely inches — convert
        w_mm = round(w_raw * 25.4, 1)
        h_mm = round(h_raw * 25.4, 1)
    else:
        w_mm = w_raw
        h_mm = h_raw

    # Extract quantity
    qty = 1
    qty_patterns = [r'\b(\d+)\s*pcs?\b', r'\bqty[\s:]+(\d+)\b', r'\b×\s*(\d+)\b']
    for qp in qty_patterns:
        qm = re.search(qp, row_text, re.IGNORECASE)
        if qm:
            qty = int(qm.group(1))
            break

    # Extract article number
    art_match = ARTICLE_PATTERN.search(row_text)
    articul = art_match.group(1).replace(' ', '.') if art_match else None

    # Extract cabinet ID
    cab_match = CABINET_PATTERN.search(row_text)
    cabinet_id = cab_match.group(1).upper() if cab_match else None

    # Determine type
    part_type = default_type
    row_lower_full = row_text.lower()
    if any(kw in row_lower_full for kw in DRAWER_KEYWORDS):
        part_type = "Slab"  # Drawer fronts are typically slab style

    # Convert to CNC size
    cnc = nominal_to_cnc(
        nominal_w_mm=w_mm,
        nominal_h_mm=h_mm,
        edge_thickness_mm=edge_thickness,
        fuging_allowance_mm=fuging_allowance,
        gap_each_side_mm=gap_each_side,
    )

    return {
        "w": cnc["cnc_w"],
        "h": cnc["cnc_h"],
        "nominal_w": w_mm,
        "nominal_h": h_mm,
        "qty": qty,
        "type": part_type,
        "grain": "None",
        "articul": articul,
        "cabinet_id": cabinet_id,
        "skip_drilling": False,
        "source": "ikea_pdf",
    }


def _parse_line(
    line: str,
    edge_thickness: float,
    fuging_allowance: float,
    gap_each_side: float,
    default_type: str,
) -> dict | None:
    """Try to extract a part from a plain text line."""
    from ikea_geometry import nominal_to_cnc

    line_stripped = line.strip()
    if len(line_stripped) < 5:
        return None

    line_lower = line_stripped.lower()

    # Must have a size
    size_match = SIZE_PATTERN_MM.search(line_stripped)
    if not size_match:
        return None

    # Must have some door-related keyword or article number
    has_door = any(kw in line_lower for kw in DOOR_KEYWORDS + DRAWER_KEYWORDS)
    has_article = bool(ARTICLE_PATTERN.search(line_stripped))
    if not (has_door or has_article):
        return None

    w_raw = float(size_match.group(1))
    h_raw = float(size_match.group(2))

    if w_raw < 100 and h_raw < 100:
        w_mm, h_mm = w_raw * 25.4, h_raw * 25.4
    else:
        w_mm, h_mm = w_raw, h_raw

    art_match = ARTICLE_PATTERN.search(line_stripped)
    articul = art_match.group(1) if art_match else None

    cab_match = CABINET_PATTERN.search(line_stripped)
    cabinet_id = cab_match.group(1).upper() if cab_match else None

    cnc = nominal_to_cnc(
        nominal_w_mm=w_mm,
        nominal_h_mm=h_mm,
        edge_thickness_mm=edge_thickness,
        fuging_allowance_mm=fuging_allowance,
        gap_each_side_mm=gap_each_side,
    )

    return {
        "w": cnc["cnc_w"],
        "h": cnc["cnc_h"],
        "nominal_w": w_mm,
        "nominal_h": h_mm,
        "qty": 1,
        "type": default_type,
        "grain": "None",
        "articul": articul,
        "cabinet_id": cabinet_id,
        "skip_drilling": False,
        "source": "ikea_pdf_text",
    }


# ─────────────────────────────────────────────────────────
#  Deduplication
# ─────────────────────────────────────────────────────────

def _deduplicate(parts: list[dict]) -> list[dict]:
    """
    Merge parts with the same dimensions, type and cabinet_id.
    Sums quantities.
    """
    seen = {}
    for p in parts:
        key = (round(p["w"], 1), round(p["h"], 1), p["type"], p.get("cabinet_id"))
        if key in seen:
            seen[key]["qty"] += p.get("qty", 1)
        else:
            seen[key] = dict(p)
    return list(seen.values())
