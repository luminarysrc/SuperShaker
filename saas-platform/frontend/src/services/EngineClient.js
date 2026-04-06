/**
 * EngineClient.js — API bridge for SuperShaker SaaS
 * Handles all communication with the FastAPI backend.
 */

const API_BASE = "/api";

// ═══════════════════════════════════════════════════════════
//  Doors CRUD
// ═══════════════════════════════════════════════════════════

export async function listDoors() {
  const r = await fetch(`${API_BASE}/doors`);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function addDoor(door) {
  const r = await fetch(`${API_BASE}/doors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(door),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function updateDoor(id, door) {
  const r = await fetch(`${API_BASE}/doors/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(door),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function deleteDoor(id) {
  const r = await fetch(`${API_BASE}/doors/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function clearDoors() {
  const r = await fetch(`${API_BASE}/doors`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function uploadBatchExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  const r = await fetch(`${API_BASE}/jobs/import-batch`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${r.status}`);
  }
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  Offcuts
// ═══════════════════════════════════════════════════════════

export async function listOffcuts() {
  const r = await fetch(`${API_BASE}/offcuts`);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function addOffcut(offcut) {
  const r = await fetch(`${API_BASE}/offcuts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(offcut),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function deleteOffcut(id) {
  const r = await fetch(`${API_BASE}/offcuts/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  Settings
// ═══════════════════════════════════════════════════════════

export async function getSettings() {
  const r = await fetch(`${API_BASE}/settings`);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function updateSettings(settings) {
  const r = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  Machine Profiles
// ═══════════════════════════════════════════════════════════

export async function listProfiles() {
  const r = await fetch(`${API_BASE}/profiles`);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function createProfile(name) {
  const r = await fetch(`${API_BASE}/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function renameProfile(id, name) {
  const r = await fetch(`${API_BASE}/profiles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function deleteProfile(id) {
  const r = await fetch(`${API_BASE}/profiles/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function loadProfile(id) {
  const r = await fetch(`${API_BASE}/profiles/${id}/load`, { method: "POST" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function saveProfile(id) {
  const r = await fetch(`${API_BASE}/profiles/${id}/save`, { method: "POST" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  Chip-load Calculator
// ═══════════════════════════════════════════════════════════

export async function calcParams(params) {
  const r = await fetch(`${API_BASE}/calc-params`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  Labels
// ═══════════════════════════════════════════════════════════

export async function downloadLabelsPdf() {
  // First we need orderId and doors
  const [settings, doors] = await Promise.all([
    getSettings(),
    listDoors()
  ]);

  const orderId = settings.order_id || "ORDER";

  const payload = {
    order_id: orderId,
    doors: doors
  };

  const r = await fetch(`${API_BASE}/labels/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    throw new Error(`API error: ${r.status}`);
  }

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `labels_${orderId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadCuttingMapPdf() {
  const settings = await getSettings();
  const orderId = settings.order_id || "ORDER";

  const r = await fetch(`${API_BASE}/cutting-map/pdf`);
  if (!r.ok) {
    throw new Error(`API error: ${r.status}`);
  }

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CuttingMap_${orderId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
//  Nesting
// ═══════════════════════════════════════════════════════════

export async function runNesting() {
  const r = await fetch(`${API_BASE}/nest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${r.status}`);
  }
  return r.json();
}

export async function updateNestingResult(customLayout) {
  const r = await fetch(`${API_BASE}/update-nesting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(customLayout),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${r.status}`);
  }
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  G-code Generation
// ═══════════════════════════════════════════════════════════

export async function generateFullGcode(sheetIndex = -1) {
  const r = await fetch(`${API_BASE}/generate-gcode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet_index: sheetIndex }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${r.status}`);
  }
  return r.json();
}

// ═══════════════════════════════════════════════════════════
//  G-code Parsing (client-side for Three.js)
// ═══════════════════════════════════════════════════════════

export function parseGcode(gcodeText) {
  const lines = gcodeText.split("\n");
  let x = 0, y = 0, z = 0;
  let mode = 0; // 0=rapid, 1=cut, 2=CW, 3=CCW
  const rapid = [];
  const cutByGroup = {
    "Shaker": [],
    "Shaker Step": [],
    "Slab": [],
    "default": [],
  };
  let currentType = "default";

  for (const raw of lines) {
    if (raw.includes("(TYPE: ")) {
      const match = raw.match(/\(TYPE:\s*([^ |]+(?:\s+[^ |]+)*)/);
      if (match) {
        const t = match[1].trim();
        if (cutByGroup[t] !== undefined) currentType = t;
        else currentType = "default";
      }
    }

    const line = raw.split(";")[0].split("(")[0].trim();
    if (!line) continue;

    const gMatch = line.match(/G(\d+)/);
    if (gMatch) {
      const g = parseInt(gMatch[1], 10);
      if (g === 0) mode = 0;
      else if (g === 1 || g === 2 || g === 3) mode = g;
    }

    const xMatch = line.match(/X([+-]?\d*\.?\d+)/);
    const yMatch = line.match(/Y([+-]?\d*\.?\d+)/);
    const zMatch = line.match(/Z([+-]?\d*\.?\d+)/);
    const iMatch = line.match(/I([+-]?\d*\.?\d+)/);
    const jMatch = line.match(/J([+-]?\d*\.?\d+)/);

    const nx = xMatch ? parseFloat(xMatch[1]) : x;
    const ny = yMatch ? parseFloat(yMatch[1]) : y;
    const nz = zMatch ? parseFloat(zMatch[1]) : z;
    const iVal = iMatch ? parseFloat(iMatch[1]) : 0;
    const jVal = jMatch ? parseFloat(jMatch[1]) : 0;

    if (nx !== x || ny !== y || nz !== z) {
      if (mode === 0 || mode === 1) {
        const segment = [x, y, z, nx, ny, nz];
        if (mode === 0) rapid.push(segment);
        else cutByGroup[currentType].push(segment);
      } else {
        // G2 / G3 Circular Arc
        const cx = x + iVal;
        const cy = y + jVal;
        const r = Math.sqrt(iVal * iVal + jVal * jVal);
        
        if (r > 0.001) {
          let angle1 = Math.atan2(y - cy, x - cx);
          let angle2 = Math.atan2(ny - cy, nx - cx);
          let deltaAngle = angle2 - angle1;
          
          if (mode === 2 && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
          else if (mode === 3 && deltaAngle < 0) deltaAngle += 2 * Math.PI;
          
          if (Math.abs(deltaAngle) < 1e-5) {
             deltaAngle = mode === 2 ? -2 * Math.PI : 2 * Math.PI;
          }

          // Segments per full circle (e.g. 180 segments = 2 degrees per segment)
          const segments = Math.max(4, Math.abs(Math.ceil((deltaAngle / (2 * Math.PI)) * 180)));
          const angleStep = deltaAngle / segments;
          
          let curX = x, curY = y, curZ = z;
          for (let i = 1; i <= segments; i++) {
            const curAngle = angle1 + i * angleStep;
            const ptX = cx + r * Math.cos(curAngle);
            const ptY = cy + r * Math.sin(curAngle);
            const t = i / segments;
            const ptZ = z + (nz - z) * t;
            
            cutByGroup[currentType].push([curX, curY, curZ, ptX, ptY, ptZ]);
            curX = ptX; curY = ptY; curZ = ptZ;
          }
        } else {
          // Fallback to linear
          cutByGroup[currentType].push([x, y, z, nx, ny, nz]);
        }
      }
      x = nx; y = ny; z = nz;
    }
  }
  return { rapid, cutByGroup };
}

// ═══════════════════════════════════════════════════════════
//  File I/O
// ═══════════════════════════════════════════════════════════

export function readGcodeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function downloadGcode(gcodeText, filename = "toolpath.gcode") {
  const blob = new Blob([gcodeText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
