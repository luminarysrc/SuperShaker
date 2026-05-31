import sys
sys.path.append('.')
from engine import generate_gcode_for_sheet

door = {
    'id': 1,
    'type': 'Shaker',
    'x': 0, 'y': 0,
    'w': 400, 'h': 600,
    'orig_w': 400, 'orig_h': 600,
    'is_small': False
}

gcode = generate_gcode_for_sheet(
    sheet_doors=[door],
    sheet_idx=0,
    total_sheets=1,
    sheet_w=1220, sheet_h=2440, mat_z=19, margin=10,
    frame_w=50, pocket_depth=6.35,
    pocket_strategy="Snake"
)

with open('test_gcode.txt', 'w') as f:
    f.write(gcode)
