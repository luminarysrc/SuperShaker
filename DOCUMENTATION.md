# SuperShaker Platform Documentation

Welcome to the official documentation for the **SuperShaker SaaS Platform**. This guide provides an in-depth look at the system architecture, core algorithms, and user workflows.

---

## 🏗️ System Architecture

The SuperShaker platform is built on a decoupled, two-tier architecture designed for high performance and scalability in industrial CNC environments.

### 1. Backend: Python Computational Engine (FastAPI)
The backend acts as the "brain," handling all geometric and mathematical computations.
- **`engine.py`**: The core logic engine. It uses a custom **MaxRects** packing algorithm for 2D nesting and a parametric G-code writer to formulate toolpaths directly in the CNC dialect.
- **`label_generator.py`**: Uses `ReportLab` to precisely lay out Avery-compliant label sheets with dynamically generated **Code 128** barcodes.
- **API (FastAPI)**: Provides RESTful endpoints for part CRUD, machine profile management, and job generation.

### 2. Frontend: High-Fidelity UI (React + Three.js)
The frontend provides a real-time, interactive environment.
- **React 18**: Manages application state and the two-panel layout.
- **Three.js Viewer**: Renders thousands of G-code segments in a 3D WebGL context, allowing users to verify toolpaths before cutting.
- **Unit Conversion Layer**: A global state that handles on-the-fly conversion between Metric (mm) and Imperial (in) units across all input fields.

---

## 📐 Core Algorithms

### 2D Nesting (MaxRects)
The platform uses the **Maximal Rectangles** heuristic to pack part rectangles into a larger sheet.
- **Rotation**: Parts can be rotated 90° if the "Allow Rotation" setting is enabled.
- **Margin & Kerf**: The algorithm accounts for sheet margins and the "kerf" (tool diameter width) to prevent part overlapping and ensure clean cutouts.
- **Multi-Sheet Support**: If parts exceed a single sheet, the algorithm intelligently overflows into additional sheets.

### G-Code Generation Strategies
- **Snake (Zig-Zag)**: For efficient large-area material removal with minimal air-travel.
- **Spiral (Pocketing)**: Ideal for high-speed machining in rounder or complex pockets.
- **Rest Machining**: Automatically detects corners where the primary tool (T6) cannot reach due to its radius and generates paths for a smaller secondary tool (T2/T3).

---

## 🛠️ User Manual

### Part Management
1. **Workflow Tab**: Add parts by specifying width, height, and quantity.
2. **Facade Types**:
   - **Shaker**: Standard frame-and-panel.
   - **Shaker Step**: Layered Shaker design with an additional internal step.
   - **Slab**: Simple contour cutout.

### Machine Profiles
- Use the **Gear Icon (⚙️)** in the sidebar to manage CNC configurations.
- **Save**: Captures all current settings (tools, sheet sizes, strategies) into a named profile.
- **Load**: Instantly switches your entire configuration to another saved machine setup.

### Exporting Results
- **PDF Labels**: Generates an Avery 5160 PDF with part barcodes to help with shop-floor identification.
- **G-Code (.nc/.gcode)**: The final CNC file. Download it from the top-right button in the 3D Viewer.

---

## 📋 Technical Reference (Common Settings)

| Parameter | Default | Description |
| :--- | :--- | :--- |
| **Material Z** | 19.2 mm | The precise thickness of the MDF sheet. |
| **Kerf** | 6.0 mm | The tool diameter used for the final perimeter cutout. |
| **PCD Feed XY** | 8000 mm/min | The standard traverse/cut speed for PCD tooling. |
| **Frame Width** | 65.0 mm | The distance from the part edge to the start of the pocket. |

---

## ⚠️ Troubleshooting

### "Backend not available" Error
- Ensure the server is running by checking the terminal output of `start_prototype.sh`.
- Verify that port **8000** is not being blocked by a local firewall.

### "Nesting Failed"
- Check that no single part is larger than the specified sheet dimensions.
- Ensure the sheet margin is not so large that it leaves no room for parts.

---

*© 2026 SuperShaker Platform. All rights reserved. PROPRIETARY AND CONFIDENTIAL.*
