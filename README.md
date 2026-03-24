# SuperShaker Platform

**SuperShaker** is a state-of-the-art SaaS application tailored for the CNC woodworking industry, specifically focused on the automated nesting and G-code generation for MDF furniture facades, such as Shaker doors and Slabs.

Originally developed as a standalone Python Tkinter application, SuperShaker has been fully rewritten into a modern web-based architecture featuring a **Python (FastAPI)** mathematical/computational core and a dynamic **React + Three.js** frontend.

---

## ✨ Features

- **Intelligent 2D Nesting (MaxRects algorithm)**: Automatically calculates the most material-efficient layout for an arbitrary list of door dimensions onto standard MDF sheets. Supports advanced parameters like rotation parsing, sheet margins, saw kerfs, and specific thresholds for prioritizing large vs. small parts.
- **Parametric G-Code Generation**: Dynamically writes CNC `.gcode` instructions without relying on external CAM software (like VCarve or ArtCAM). Features fully supported toolpath logic for:
  - Internal pocketing (Snake/Spiral/Climb strategies)
  - Secondary step-pockets (`Shaker Step` design)
  - Rest machining in corners with smaller endmills
  - French Miter & outer corner chamfering (V-bits)
  - Perimeter cutout strategies
- **Calculated Chip-Loads & Speeds**: Automatically calculates safe Spindle RPM, Feeds, and stepovers based on tool type (PCD vs. TCT), tool diameter, and depth-of-cut limits.
- **Interactive 3D Toolpath Visualization**: Uses `react-three-fiber` to render a living 3D preview of the generated `.gcode` lines right in the browser, complete with color-coded operations based on door styles:
  - 🟢 **Green**: Shaker Step profiles
  - 🔵 **Blue**: Standard Shaker profiles
  - 🟡 **Yellow**: Slab profiles
- **Modern User Interface**: A two-panel SaaS architecture. The left panel serves as the primary workspace for adding parts, selecting tooling setups, and running nesting. The right panel serves as the dedicated visualization suite with real-time statistics (yield percentage, rapid moves, etc.).

---

## 🛠️ Tech Stack

### Frontend
- **React 18** + **Vite**: For highly responsive and fast component rendering.
- **Tailwind CSS**: For clean, utility-first styling utilizing a custom dark theme tailored for industrial CNC aesthetics.
- **Three.js** (@react-three/fiber & @react-three/drei): For high-performance 3D canvas rendering of the parsed toolpaths directly in the browser.

### Backend
- **FastAPI**: Provides a lightning-fast RESTful API connecting the frontend UI to the core algorithms.
- **Python 3**: Pure Python algorithms driving the core geometric parsing and mathematical nesting (no heavy C++ or native GUI dependencies).
- **Pydantic**: For strict payload validation between the client and server.

---

## 📂 Project Structure

```text
SuperShaker/
├── saas-platform/
│   ├── backend/                 # Python FastAPI Server
│   │   ├── main.py              # REST API definitions & in-memory DB
│   │   ├── engine.py            # Core engine (MaxRects, G-code gen, Math)
│   │   └── requirements.txt     # Python dependencies
│   │
│   └── frontend/                # React App
│       ├── src/
│       │   ├── components/      # React components (Panels, ThreeViewer)
│       │   ├── services/        # EngineClient.js (API communication)
│       │   ├── App.jsx          # Main Layout
│       │   └── index.css        # Custom industrial Tailwind configuration
│       ├── index.html           # Document root
│       ├── vite.config.js       # Vite build & proxy config
│       └── package.json         # Node.js dependencies
│   
├── start_prototype.sh           # Bash script to boot the entire stack
└── SuperShaker_v5.4.2.py        # Legacy standalone desktop program
```

---

## 🚀 Installation & Setup

1. **Prerequisites**: Ensure you have `Node.js` (v20+) and `Python` (v3.10+) installed on your machine.
2. **Setup the Virtual Environment**:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r saas-platform/backend/requirements.txt
   ```
3. **Install Frontend Dependencies**:
   ```bash
   cd saas-platform/frontend
   npm install
   ```

### Running Locally

To start the full prototype locally (both frontend and backend simultaneously), simply execute the included shell script from the project root:

```bash
./start_prototype.sh
```

- The React frontend will boot at `http://localhost:5173`
- The FastAPI backend will serve on `http://127.0.0.1:8000` (which is proxied by the frontend).

---

## 📖 Usage Guide

1. Open the SaaS application in your browser.
2. **Add Parts**: In the "Workflow" tab on the left, add desired items by specifying Width, Height, Quantity, and Type (e.g., Shaker).
3. **Configure Parameters**: Switch to the "Parameters" and "Tool T6" tabs to adjust your kerf, stepover, tooling feeds/speeds, and chamfer depths.
4. **Run Nesting**: Click `Run Nesting` to view a 2D thumbnail preview of your parts optimally packed onto your configured MDF sheet dimension.
5. **Generate G-Code**: Click `Generate G-code` to process the job. The mathematical engine will formulate thousands of G-code lines in milliseconds and pass them to the 3D Viewer on the right panel.
6. **Export**: Click the download/save icon (`💾`) in the top right to download your ready-to-cut `toolpath_sheet1.gcode` file.

---

## 📅 Roadmap (Phase II)
- **Excel Batch Import**: Drag-and-drop support for `.xlsx` or `.csv` files containing hundreds of cabinet dimensions directly into the workspace.
- **PDF Label Export**: Automated generation of Avery-style barcode labels (using ReportLab) denoting part IDs and edge banding logic.
- **Persistent Database**: Transitioning the temporary in-memory JSON arrays into a PostgreSQL or SQLite backend to save historic jobs and tooling configurations across sessions.
- **Multi-sheet Sub-jobs**: Splitting massive architectural jobs into sequentially numbered `.gcode` sheets for extended routing logic.
---

## ⚖️ License & Terms of Use

**PROPRIETARY AND CONFIDENTIAL**

This software is **strictly proprietary** and is **NOT FREE** to use in either commercial or non-commercial instances. 

- You may not use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software without explicit, written permission from the copyright holder.
- Unauthorized reproduction or distribution of this program, or any portion of it, may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under law.

*All rights reserved.*
