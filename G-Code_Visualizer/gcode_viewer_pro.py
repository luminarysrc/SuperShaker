import re
import os
import tkinter as tk
from tkinter import filedialog, messagebox
import plotly.graph_objects as go
import numpy as np

def parse_gcode_with_tools_and_direction(file_path):
    x, y, z = 0.0, 0.0, 0.0
    mode = 0
    current_tool = "T0"

    tool_data = {}
    tool_order = []

    def ensure_tool(tool):
        if tool not in tool_data:
            tool_data[tool] = {
                'rapid': ([], [], [], []),
                'cut': ([], [], [], [])
            }
            tool_order.append(tool)

    ensure_tool(current_tool)

    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.split(';')[0].split('(')[0].strip()
            if not line: continue

            t_match = re.search(r'\bT(\d+)\b', line)
            if t_match:
                current_tool = f"T{t_match.group(1)}"
                ensure_tool(current_tool)

            g_match = re.search(r'G(\d+)', line)
            if g_match:
                g_val = int(g_match.group(1))
                if g_val == 0: mode = 0
                elif g_val in (1, 2, 3): mode = 1

            x_match = re.search(r'X([+-]?\d*\.?\d+)', line)
            y_match = re.search(r'Y([+-]?\d*\.?\d+)', line)
            z_match = re.search(r'Z([+-]?\d*\.?\d+)', line)

            new_x = float(x_match.group(1)) if x_match else x
            new_y = float(y_match.group(1)) if y_match else y
            new_z = float(z_match.group(1)) if z_match else z

            if new_x != x or new_y != y or new_z != z:
                dx = new_x - x
                dy = new_y - y
                dz = new_z - z

                if dx != 0 or dy != 0:
                    angle = np.degrees(np.arctan2(dy, dx))
                    direction = f"{angle:.0f}°"
                else:
                    direction = "Z"

                rapid_xyz_dir = tool_data[current_tool]['rapid']
                cut_xyz_dir = tool_data[current_tool]['cut']

                if mode == 0:
                    rapid_xyz_dir[0].extend([x, new_x, None])
                    rapid_xyz_dir[1].extend([y, new_y, None])
                    rapid_xyz_dir[2].extend([z, new_z, None])
                    rapid_xyz_dir[3].extend([direction, direction, None])
                else:
                    cut_xyz_dir[0].extend([x, new_x, None])
                    cut_xyz_dir[1].extend([y, new_y, None])
                    cut_xyz_dir[2].extend([z, new_z, None])
                    cut_xyz_dir[3].extend([direction, direction, None])

                x, y, z = new_x, new_y, new_z

    return tool_data, tool_order

def visualize_gcode(file_path):
    try:
        tool_data, tool_order = parse_gcode_with_tools_and_direction(file_path)
    except Exception as e:
        messagebox.showerror("Ошибка", f"Не удалось прочитать файл:\n{e}")
        return

    fig = go.Figure()

    colors = ["blue", "red", "green", "orange", "magenta", "cyan", "brown", "purple", "olive", "gray"]

    for idx, tool in enumerate(tool_order):
        color = colors[idx % len(colors)]
        rapid = tool_data[tool]['rapid']
        cut = tool_data[tool]['cut']

        if any(cut[0]):
            fig.add_trace(go.Scatter3d(
                x=cut[0], y=cut[1], z=cut[2],
                mode='lines+markers',
                name=f"{tool} – рабочий ход",
                line=dict(color=color, width=3),
                marker=dict(size=2, color=color, opacity=0.8),
                hovertemplate='<b>%{customdata[0]}</b><br>X: %{x:.1f}<br>Y: %{y:.1f}<br>Z: %{z:.1f}<extra></extra>',
                customdata=cut[3]
            ))

        if any(rapid[0]):
            fig.add_trace(go.Scatter3d(
                x=rapid[0], y=rapid[1], z=rapid[2],
                mode='lines',
                name=f"{tool} – холостой ход",
                line=dict(color=color, width=1, dash='dash'),
                hovertemplate='<b>%{customdata[0]}</b><br>X: %{x:.1f}<br>Y: %{y:.1f}<br>Z: %{z:.1f}<extra></extra>',
                customdata=rapid[3]
            ))

    file_name = os.path.basename(file_path)
    fig.update_layout(
        title=f'3D Визуализация с направлением: {file_name}',
        scene=dict(
            xaxis_title='Ось X (мм)',
            yaxis_title='Ось Y (мм)',
            zaxis_title='Ось Z (мм)',
            aspectmode='data'
        ),
        margin=dict(l=0, r=0, b=0, t=40),
        legend=dict(title="Инструменты", orientation="h", yanchor="bottom", y=0.01, xanchor="left", x=0.01)
    )

    fig.show()

def open_file_dialog():
    file_path = filedialog.askopenfilename(
        title="Выберите файл G-кода",
        filetypes=(("G-code файлы", "*.nc *.gcode *.tap *.txt"), ("Все файлы", "*.*"))
    )
    if file_path:
        visualize_gcode(file_path)

def main():
    root = tk.Tk()
    root.title("G-Code 3D Viewer Pro")

    window_width = 450
    window_height = 220
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    center_x = int(screen_width/2 - window_width / 2)
    center_y = int(screen_height/2 - window_height / 2)
    root.geometry(f'{window_width}x{window_height}+{center_x}+{center_y}')

    label = tk.Label(
        root,
        text="3D визуализация G-кода с инструментами и НАПРАВЛЕНИЕМ движения\\n"
             "Наведите мышь на линию — увидите угол движения",
        font=("Arial", 11),
        pady=20,
        justify=tk.CENTER
    )
    label.pack()

    btn = tk.Button(
        root,
        text="📁 Загрузить файл G-кода",
        font=("Arial", 12, "bold"),
        bg="#4CAF50",
        fg="white",
        command=open_file_dialog,
        padx=20,
        pady=12
    )
    btn.pack(pady=15)

    root.mainloop()

if __name__ == "__main__":
    main()
