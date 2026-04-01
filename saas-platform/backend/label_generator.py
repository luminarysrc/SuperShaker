import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.graphics.barcode import code128

# Avery 5160 dimensions
PAGE_WIDTH, PAGE_HEIGHT = letter
LABEL_WIDTH = 2.625 * inch
LABEL_HEIGHT = 1.0 * inch
MARGIN_LEFT = 0.19 * inch
MARGIN_TOP = 0.5 * inch
MARGIN_BOTTOM = 0.5 * inch
GUTTER_X = 0.125 * inch
COLS = 3
ROWS = 10
LABELS_PER_PAGE = COLS * ROWS

def generate_labels_pdf(request):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)

    order_id = request.order_id or "ORDER"
    doors = request.doors

    # Flatten doors based on qty
    labels_to_print = []
    for door in doors:
        qty = door.get("qty", 1)
        for _ in range(qty):
            labels_to_print.append(door)

    for i, door in enumerate(labels_to_print):
        if i > 0 and i % LABELS_PER_PAGE == 0:
            c.showPage()

        pos_in_page = i % LABELS_PER_PAGE
        col = pos_in_page % COLS
        row = pos_in_page // COLS

        # Calculate x, y origin for this label (bottom-left of label)
        x = MARGIN_LEFT + col * (LABEL_WIDTH + GUTTER_X)
        y = PAGE_HEIGHT - MARGIN_TOP - (row + 1) * LABEL_HEIGHT

        draw_label(c, x, y, door, order_id)

    c.save()
    buffer.seek(0)
    return buffer

def draw_label(c, x, y, door, order_id):
    # Padding inside label
    pad = 0.1 * inch

    door_id = door.get("id", 0)
    barcode_value = f"ORD-{order_id}-P{door_id}"

    # 1. Barcode at top
    barcode = code128.Code128(barcode_value, barHeight=0.25*inch, barWidth=0.8)
    # Draw barcode centered roughly
    barcode.drawOn(c, x + pad, y + LABEL_HEIGHT - pad - 0.25*inch)

    # 2. Part ref & Order ID
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + pad, y + LABEL_HEIGHT - pad - 0.35*inch, f"Part P{door_id}")
    c.setFont("Helvetica", 6)
    c.drawString(x + pad, y + LABEL_HEIGHT - pad - 0.45*inch, f"Order: {order_id}")

    # 3. Dimensions
    w_mm = door.get("w", 0)
    h_mm = door.get("h", 0)
    w_in = w_mm / 25.4
    h_in = h_mm / 25.4

    c.setFont("Helvetica", 7)
    c.drawString(x + pad, y + pad + 0.15*inch, f"{w_mm} x {h_mm} mm")
    c.setFont("Helvetica", 6)
    c.drawString(x + pad, y + pad + 0.05*inch, f"({w_in:.2f} x {h_in:.2f} in)")

    # 4. Qty & Type badge
    type_str = door.get("type", "Shaker")
    qty = door.get("qty", 1)

    # Badge background
    c.setLineWidth(0)
    if type_str == "Shaker":
        c.setFillColorRGB(0.23, 0.51, 0.96) # sky-blue
    elif type_str == "Shaker Step":
        c.setFillColorRGB(0.13, 0.77, 0.36) # green
    elif type_str == "Slab":
        c.setFillColorRGB(0.96, 0.62, 0.04) # amber
    else:
        c.setFillColorRGB(0.5, 0.5, 0.5)

    badge_w = 0.8 * inch
    badge_h = 0.2 * inch
    badge_x = x + LABEL_WIDTH - pad - badge_w
    badge_y = y + pad + 0.1 * inch
    c.roundRect(badge_x, badge_y, badge_w, badge_h, 2, fill=1, stroke=0)

    # Badge text
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 6)
    c.drawCentredString(badge_x + badge_w/2, badge_y + 0.06*inch, f"Q:{qty} {type_str}")

    # Reset color
    c.setFillColorRGB(0, 0, 0)
