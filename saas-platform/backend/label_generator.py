import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm

def generate_labels_pdf(request, settings):
    buffer = io.BytesIO()
    
    order_id = request.order_id or "ORDER"
    doors = request.doors

    label_format = settings.get("label_format", "Roll Printer")

    if label_format == "Roll Printer":
        label_w_mm = settings.get("label_w", 62.0)
        label_h_mm = settings.get("label_h", 29.0)
        page_width = label_w_mm * mm
        page_height = label_h_mm * mm
        label_width = page_width
        label_height = page_height
        margin_left = 0
        margin_top = 0
        gutter_x = 0
        cols = 1
        rows = 1
    else:
        # Default Avery 5160
        page_width, page_height = letter
        label_width = 2.625 * inch
        label_height = 1.0 * inch
        margin_left = 0.19 * inch
        margin_top = 0.5 * inch
        gutter_x = 0.125 * inch
        cols = 3
        rows = 10

    labels_per_page = cols * rows

    c = canvas.Canvas(buffer, pagesize=(page_width, page_height))
    
    # Flatten doors based on qty
    labels_to_print = []
    for door in doors:
        qty = door.get("qty", 1)
        for _ in range(qty):
            labels_to_print.append(door)

    for i, door in enumerate(labels_to_print):
        if i > 0 and i % labels_per_page == 0:
            c.showPage()

        pos_in_page = i % labels_per_page
        col = pos_in_page % cols
        row = pos_in_page // cols

        # Calculate x, y origin for this label (bottom-left of label)
        x = margin_left + col * (label_width + gutter_x)
        y = page_height - margin_top - (row + 1) * label_height

        draw_label(c, x, y, label_width, label_height, door, order_id)

    c.save()
    buffer.seek(0)
    return buffer

def draw_label(c, x, y, width, height, door, order_id):
    # Padding inside label
    pad = 0.05 * inch

    door_id = door.get("id", 0)

    # 1. Order ID + Part ID at the top
    c.setFont("Helvetica-Bold", 8)
    # Centered at the top
    c.drawCentredString(x + width / 2.0, y + height - pad - 0.1 * inch, f"Order: {order_id}  |  Part: P{door_id}")

    # 2. Dimensions in the middle, prominently
    w_mm = door.get("w", 0)
    h_mm = door.get("h", 0)
    w_in = w_mm / 25.4
    h_in = h_mm / 25.4

    c.setFont("Helvetica-Bold", 14)
    # roughly center Y
    mid_y = y + height / 2.0
    c.drawCentredString(x + width / 2.0, mid_y, f"{w_mm} x {h_mm} mm")
    
    c.setFont("Helvetica", 7)
    c.drawCentredString(x + width / 2.0, mid_y - 0.15 * inch, f"({w_in:.2f} x {h_in:.2f} in)")

    # 3. Type & Qty at the bottom
    type_str = door.get("type", "Shaker")
    qty = door.get("qty", 1)

    c.setLineWidth(0)
    if type_str == "Shaker":
        c.setFillColorRGB(0.23, 0.51, 0.96) # sky-blue
    elif type_str == "Shaker Step":
        c.setFillColorRGB(0.13, 0.77, 0.36) # green
    elif type_str == "Slab":
        c.setFillColorRGB(0.96, 0.62, 0.04) # amber
    else:
        c.setFillColorRGB(0.5, 0.5, 0.5)

    badge_w = 1.0 * inch
    badge_h = 0.2 * inch
    # Centered badged at the bottom
    badge_x = x + (width - badge_w) / 2.0
    badge_y = y + pad + 0.02 * inch
    
    c.roundRect(badge_x, badge_y, badge_w, badge_h, 2, fill=1, stroke=0)

    # Badge text
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(badge_x + badge_w/2, badge_y + 0.06*inch, f"Q:{qty} {type_str}")

    # Reset color
    c.setFillColorRGB(0, 0, 0)
