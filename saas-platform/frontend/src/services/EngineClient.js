/**
 * EngineClient.js — Bridge between React frontend and FastAPI backend
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This service handles all communication with the backend API.
 * It is the SINGLE point where frontend ↔ backend integration happens.
 *
 * ARCHITECTURE:
 *   React Component  →  EngineClient.js  →  FastAPI  →  Python Core
 *   (UI / Three.js)     (this file)         (main.py)    (your engine)
 *
 * ──────────────────────────────────────────────────────────────────────
 * TODO: INTEGRATION POINT — API Base URL
 * In production, change this to your deployed API URL, e.g.:
 *   const API_BASE = "https://api.supershaker.com"
 * For now, Vite's proxy forwards /api/* → localhost:8000/*
 * ──────────────────────────────────────────────────────────────────────
 */

const API_BASE = "/api";

// ═══════════════════════════════════════════════════════════════════════
//  G-CODE GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Request G-code generation from the backend API.
 *
 * @param {Object} params - Generation parameters
 * @param {number} params.width       - Part width in mm (default: 100)
 * @param {number} params.height      - Part height in mm (default: 100)
 * @param {number} params.depth       - Pocket depth in mm (default: 3)
 * @param {number} params.tool_diameter - Tool diameter in mm (default: 6)
 * @param {number} params.feed_rate   - Feed rate in mm/min (default: 6000)
 * @param {number} params.spindle_rpm - Spindle RPM (default: 18000)
 * @param {string} params.pattern     - "spiral" | "square" | "pocket"
 *
 * @returns {Promise<{gcode: string, stats: Object}>}
 *
 * ──────────────────────────────────────────────────────────────────
 * TODO: INTEGRATION POINT
 * If you switch to a WebSocket-based approach for long-running
 * generation jobs, replace this fetch call with a WS connection:
 *
 *   const ws = new WebSocket("ws://localhost:8000/ws/generate");
 *   ws.onmessage = (event) => { ... handle progress + final result };
 * ──────────────────────────────────────────────────────────────────
 */
export async function generateGcode(params = {}) {
  const payload = {
    width: params.width ?? 100,
    height: params.height ?? 100,
    depth: params.depth ?? 3.0,
    tool_diameter: params.tool_diameter ?? 6.0,
    feed_rate: params.feed_rate ?? 6000,
    spindle_rpm: params.spindle_rpm ?? 18000,
    pattern: params.pattern ?? "spiral",
  };

  const response = await fetch(`${API_BASE}/generate-gcode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════
//  G-CODE PARSING (Client-side — runs in the browser)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Parse a G-code string into 3D line segments for Three.js rendering.
 *
 * This runs entirely client-side. It extracts G0 (rapid) and G1 (cut)
 * moves and returns arrays of vertex coordinates.
 *
 * @param {string} gcodeText - Raw G-code string
 * @returns {{ rapid: number[][], cut: number[][] }}
 *   rapid = [[x1,y1,z1, x2,y2,z2], ...] — rapid moves (dashed blue)
 *   cut   = [[x1,y1,z1, x2,y2,z2], ...] — cutting moves (solid green)
 *
 * ──────────────────────────────────────────────────────────────────
 * TODO: INTEGRATION POINT — Web Worker
 * For files > 1M lines, move this parser into a Web Worker:
 *
 *   // In EngineClient.js:
 *   const worker = new Worker(
 *     new URL("../workers/gcode-parser.worker.js", import.meta.url)
 *   );
 *   worker.postMessage(gcodeText);
 *   worker.onmessage = (e) => { const { rapid, cut } = e.data; };
 *
 * This keeps the main thread responsive during heavy parsing.
 * ──────────────────────────────────────────────────────────────────
 */
export function parseGcode(gcodeText) {
  const lines = gcodeText.split("\n");

  // Current machine state
  let x = 0, y = 0, z = 0;
  let mode = 0; // 0 = G0 (rapid), 1 = G1/G2/G3 (cut)

  // Output arrays: each segment = [x1,y1,z1, x2,y2,z2]
  const rapid = [];
  const cut = [];

  for (const raw of lines) {
    // Strip comments: (...) and ;...
    const line = raw.split(";")[0].split("(")[0].trim();
    if (!line) continue;

    // Detect G-code mode changes
    const gMatch = line.match(/G(\d+)/);
    if (gMatch) {
      const g = parseInt(gMatch[1], 10);
      if (g === 0) mode = 0;
      else if (g >= 1 && g <= 3) mode = 1;
    }

    // Parse axis coordinates
    const xMatch = line.match(/X([+-]?\d*\.?\d+)/);
    const yMatch = line.match(/Y([+-]?\d*\.?\d+)/);
    const zMatch = line.match(/Z([+-]?\d*\.?\d+)/);

    const nx = xMatch ? parseFloat(xMatch[1]) : x;
    const ny = yMatch ? parseFloat(yMatch[1]) : y;
    const nz = zMatch ? parseFloat(zMatch[1]) : z;

    // Only create a segment if position actually changed
    if (nx !== x || ny !== y || nz !== z) {
      const segment = [x, y, z, nx, ny, nz];
      if (mode === 0) {
        rapid.push(segment);
      } else {
        cut.push(segment);
      }
      x = nx;
      y = ny;
      z = nz;
    }
  }

  return { rapid, cut };
}

// ═══════════════════════════════════════════════════════════════════════
//  FILE I/O
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read a .nc / .gcode file from the user's filesystem as text.
 *
 * @param {File} file - A File object from <input type="file"> or drag-drop
 * @returns {Promise<string>} The raw G-code text content
 */
export function readGcodeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Download a G-code string as a .nc file.
 *
 * @param {string} gcodeText - The G-code content
 * @param {string} filename  - Output filename (default: "toolpath.nc")
 */
export function downloadGcode(gcodeText, filename = "toolpath.nc") {
  const blob = new Blob([gcodeText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════
//  NESTING (future)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Call the nesting endpoint.
 *
 * ──────────────────────────────────────────────────────────────────
 * TODO: INTEGRATION POINT
 * The /nest endpoint is ready in the backend (main.py).
 * Connect this when building the nesting UI.
 * ──────────────────────────────────────────────────────────────────
 */
export async function runNesting(sheetWidth, sheetHeight, parts) {
  const response = await fetch(`${API_BASE}/nest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sheet_width: sheetWidth,
      sheet_height: sheetHeight,
      parts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Nesting API error: ${response.status}`);
  }

  return response.json();
}
