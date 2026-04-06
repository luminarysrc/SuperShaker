/**
 * SuperShakerPanel.jsx — Left panel: full SuperShaker workflow
 * Order input, parts table, material/tool config, nesting, G-code generation.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider.jsx";
import { 
  listDoors, getSettings, addDoor, updateDoor, deleteDoor, clearDoors, 
  updateSettings, listProfiles, loadProfile, saveProfile, createProfile, 
  renameProfile, deleteProfile, uploadBatchExcel,
  listOffcuts, addOffcut, deleteOffcut,
  runNesting, generateFullGcode,
  parseGcode, downloadGcode, downloadLabelsPdf, downloadCuttingMapPdf, updateNestingResult
} from "../services/EngineClient.js";

export default function SuperShakerPanel({ onGcodeGenerated, onNestingDone, settingsVersion, doorsVersion }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // ── State ─────────────────────────────────────────────
  const [doors, setDoors] = useState([]);
  const [offcuts, setOffcuts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [nestingResult, setNestingResult] = useState(null);
  const [isLoading, setIsLoading] = useState("");
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("workflow");
  const canvasRef = useRef(null);
  const dragRef = useRef({ isDragging: false });
  const [editingPreviewPart, setEditingPreviewPart] = useState(null);

  // Add door form state
  const [newDoor, setNewDoor] = useState({ w: 400, h: 600, qty: 4, type: "Shaker", grain: "None" });
  const [newOffcut, setNewOffcut] = useState({ w: 600, h: 400, qty: 1 });
  const [showCostSettings, setShowCostSettings] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [useInch, setUseInch] = useState(false);
  const MM_PER_INCH = 25.4;
  const toDisplay = (mm) => useInch ? +(mm / MM_PER_INCH).toFixed(3) : mm;
  const fromDisplay = (val) => useInch ? +(val * MM_PER_INCH).toFixed(2) : val;
  const unitLabel = useInch ? "in" : "mm";
  const feedLabel = useInch ? "in/min" : "mm/min";
  const toFeedDisplay = (mmPerMin) => useInch ? +(mmPerMin / MM_PER_INCH).toFixed(1) : mmPerMin;

  // ── Load initial data ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [d, s, o] = await Promise.all([listDoors(), getSettings(), listOffcuts()]);
        setDoors(d);
        setSettings(s);
        setOffcuts(o);
      } catch (e) {
        setError("Backend not available. Start the server first.");
      }
    })();
  }, []);

  useEffect(() => {
    if (settingsVersion === 0 || settingsVersion === undefined) return;
    (async () => {
      try {
        const s = await getSettings();
        setSettings(s);
      } catch (e) {
        setError("Failed to reload settings");
      }
    })();
  }, [settingsVersion]);

  useEffect(() => {
    if (doorsVersion === 0 || doorsVersion === undefined) return;
    (async () => {
      try {
        const d = await listDoors();
        setDoors(d);
        setNestingResult(null);
      } catch (e) {
        setError("Failed to reload parts from batch import");
      }
    })();
  }, [doorsVersion]);

  const handleSettingsChange = useCallback(async (key, value) => {
    const updated = { [key]: value };
    try {
      const s = await updateSettings(updated);
      setSettings(s);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleAddDoor = useCallback(async () => {
    try {
      const d = await addDoor(newDoor);
      setDoors(prev => [...prev, d]);
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, [newDoor]);

  const handleDeleteDoor = useCallback(async (id) => {
    try {
      await deleteDoor(id);
      setDoors(prev => prev.filter(d => d.id !== id));
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleClear = useCallback(async () => {
    try {
      await clearDoors();
      setDoors([]);
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleAddOffcut = useCallback(async () => {
    try {
      const o = await addOffcut(newOffcut);
      setOffcuts(prev => [...prev, o]);
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, [newOffcut]);

  const handleDeleteOffcut = useCallback(async (id) => {
    try {
      await deleteOffcut(id);
      setOffcuts(prev => prev.filter(o => o.id !== id));
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const startEdit = (id, field, currentValue) => {
    setEditingCell({ id, field });
    setEditingValue(String(currentValue));
  };

  const commitEdit = useCallback(async (id, field, rawValue) => {
    setEditingCell(null);
    const numFields = ["w", "h", "qty"];
    let value;
    if (numFields.includes(field)) {
      const parsed = parseFloat(rawValue) || 0;
      value = (field === "w" || field === "h") ? fromDisplay(parsed) : parsed;
    } else {
      value = rawValue;
    }
    try {
      const door = doors.find(d => d.id === id);
      if (!door) return;
      const updated = await updateDoor(id, { ...door, [field]: value });
      setDoors(prev => prev.map(d => d.id === id ? updated : d));
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, [doors, useInch]);

  const handleNesting = useCallback(async () => {
    setIsLoading("nesting");
    setError(null);
    try {
      const result = await runNesting();
      setNestingResult(result);
      onNestingDone?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading("");
    }
  }, [onNestingDone]);

  const handleSavePreviewPart = async (updatedPart) => {
    try {
      const originalDoor = doors.find(d => d.id === editingPreviewPart.id);
      if (!originalDoor) return;

      if (originalDoor.qty > 1) {
        await updateDoor(originalDoor.id, { ...originalDoor, qty: originalDoor.qty - 1 });
        await addDoor({ 
          w: updatedPart.w, h: updatedPart.h, qty: 1, 
          type: updatedPart.type, grain: updatedPart.grain 
        });
      } else {
        await updateDoor(originalDoor.id, {
          ...originalDoor,
          w: updatedPart.w, h: updatedPart.h,
          type: updatedPart.type, grain: updatedPart.grain
        });
      }
      
      const d = await listDoors();
      setDoors(d);
      setNestingResult(null);
      setEditingPreviewPart(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleGenerateLabels = useCallback(async () => {
    setIsLoading("labels");
    setError(null);
    try {
      await downloadLabelsPdf();
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading("");
    }
  }, []);

  const handleCuttingMap = useCallback(async () => {
    setIsLoading("cuttingmap");
    setError(null);
    try {
      await downloadCuttingMapPdf();
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading("");
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsLoading("generating");
    setError(null);
    try {
      const result = await generateFullGcode(-1);
      if (result.sheets && result.sheets.length > 0) {
        const firstSheet = result.sheets[0];
        const parsed = parseGcode(firstSheet.gcode);
        onGcodeGenerated?.({
          gcodeText: firstSheet.gcode,
          gcodeData: parsed,
          stats: firstSheet.stats,
          allSheets: result.sheets,
          orderId: settings?.order_id || "",
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading("");
    }
  }, [onGcodeGenerated, settings]);

  const getDragTarget = useCallback((cx, cy) => {
    if (!canvasRef.current || !settings || !nestingResult) return null;
    const canvas = canvasRef.current;
    const cw = canvas.parentElement.clientWidth - 8;
    
    let currentY = 28;

    const dRef = dragRef.current;
    let nw = dRef.rotated ? dRef.draggedPart.h : dRef.draggedPart.w;
    let nh = dRef.rotated ? dRef.draggedPart.w : dRef.draggedPart.h;

    for (let si = 0; si < nestingResult.sheets.length; si++) {
      const meta = nestingResult.sheets_meta ? nestingResult.sheets_meta[si] : null;
      const sw = meta ? meta.w : settings.sheet_w;
      const sh = meta ? meta.h : settings.sheet_h;
      
      const thumbW = Math.min(cw - 16, 300);
      const scale = thumbW / sw;
      const thumbH = sh * scale;
      
      const xo = (cw - thumbW) / 2;
      const yo = currentY;
      
      if (cx >= xo && cx <= xo + thumbW && cy >= yo && cy <= yo + thumbH) {
        const x1 = cx - dRef.ox;
        const y1 = cy - dRef.oy;
        
        const rawTx = (x1 - xo) / scale;
        const rawTy = (yo + thumbH - y1) / scale - nh;
        
        return { 
          targetSheetIndex: si, rawTx, rawTy, nw, nh, 
          xo, yo, scale, thumbW, thumbH 
        };
      }
      currentY += thumbH + 40;
    }
    return null;
  }, [nestingResult, settings]);

  const calculateSnap = useCallback((tx, ty, nw, nh, targetSheetIndex) => {
    if (!nestingResult || targetSheetIndex < 0 || targetSheetIndex >= nestingResult.sheets.length) {
      return { tx, ty };
    }
    const margin = settings.margin;
    const kerf = settings.kerf;
    const meta = nestingResult.sheets_meta ? nestingResult.sheets_meta[targetSheetIndex] : null;
    const sw = meta ? meta.w : settings.sheet_w;
    const sh = meta ? meta.h : settings.sheet_h;
    const snapDist = 20;

    let snapTx = tx;
    let snapTy = ty;
    
    let closestXDist = snapDist;
    let closestYDist = snapDist;

    const trySnapX = (targetX) => {
      const dist = Math.abs(tx - targetX);
      if (dist < closestXDist) {
        snapTx = targetX;
        closestXDist = dist;
      }
    };

    const trySnapY = (targetY) => {
      const dist = Math.abs(ty - targetY);
      if (dist < closestYDist) {
        snapTy = targetY;
        closestYDist = dist;
      }
    };

    trySnapX(margin);
    trySnapX(sw - margin - nw);
    trySnapY(margin);
    trySnapY(sh - margin - nh);

    const sheet = nestingResult.sheets[targetSheetIndex];
    const dRef = dragRef.current;
    
    for (let oi = 0; oi < sheet.length; oi++) {
      if (targetSheetIndex === dRef.draggedOrigSheet && oi === dRef.draggedOrigIdx) continue;
      
      const other = sheet[oi];
      const ow = other.rotated ? other.h : other.w;
      const oh = other.rotated ? other.w : other.h;
      
      const overlapY = (ty < other.y + oh + snapDist) && (ty + nh > other.y - snapDist);
      const overlapX = (tx < other.x + ow + snapDist) && (tx + nw > other.x - snapDist);

      if (overlapY) {
        trySnapX(other.x - nw - kerf);
        trySnapX(other.x + ow + kerf);
      }
      
      if (overlapX) {
        trySnapY(other.y - nh - kerf);
        trySnapY(other.y + oh + kerf);
      }
    }

    return { tx: snapTx, ty: snapTy };
  }, [nestingResult, settings]);

  const drawCanvas = useCallback(() => {
    if (!nestingResult || !canvasRef.current || !settings) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { sheets, sheets_meta } = nestingResult;
    if (!sheets.length) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.parentElement.clientWidth - 8;
    
    // First pass to compute metrics and total height
    const metrics = sheets.map((_, si) => {
      const meta = sheets_meta ? sheets_meta[si] : null;
      const sw = meta ? meta.w : settings.sheet_w;
      const sh = meta ? meta.h : settings.sheet_h;
      const isOffcut = meta ? meta.is_offcut : false;
      const thumbW = Math.min(cw - 16, 300);
      const scale = thumbW / sw;
      const thumbH = sh * scale;
      return { sw, sh, isOffcut, thumbW, thumbH, scale };
    });

    let totalH = 16;
    metrics.forEach(m => {
      m.yo = totalH + 28 - 16; // offset padding
      totalH += m.thumbH + 40;
    });

    if (canvas.width !== cw * dpr || canvas.height !== totalH * dpr) {
      canvas.width = cw * dpr;
      canvas.height = totalH * dpr;
      canvas.style.width = cw + "px";
      canvas.style.height = totalH + "px";
      ctx.scale(dpr, dpr);
    }
    
    ctx.clearRect(0, 0, cw, totalH);

    const labelColor = isDark ? "#a1a1aa" : "#52525b";
    const sheetBg = isDark ? "#1e293b" : "#e2e8f0";
    const sheetStroke = isDark ? "#334155" : "#94a3b8";
    const partLabelColor = isDark ? "#e2e8f0" : "#1e293b";

    sheets.forEach((sheet, si) => {
      const { sw, sh, isOffcut, thumbW, thumbH, scale, yo } = metrics[si];
      const xo = (cw - thumbW) / 2;

      ctx.font = "600 11px Inter, system-ui";
      ctx.fillStyle = labelColor;
      ctx.textAlign = "center";
      const suffix = isOffcut ? " (Offcut)" : "";
      ctx.fillText(`Sheet ${si + 1}${suffix}`, xo + thumbW / 2, yo - 8);

      ctx.fillStyle = sheetBg;
      ctx.strokeStyle = sheetStroke;
      ctx.lineWidth = 1.5;
      ctx.fillRect(xo, yo, thumbW, thumbH);
      ctx.strokeRect(xo, yo, thumbW, thumbH);

      const ms = settings.margin * scale;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(xo + ms, yo + ms, thumbW - 2 * ms, thumbH - 2 * ms);
      ctx.setLineDash([]);

      const colors = {
        "Shaker": "#3b82f6",
        "Shaker Step": "#22c55e",
        "Slab": "#f59e0b",
      };
      
      sheet.forEach((d, j) => {
        // Skip dragged part using sheet+index identity
        if (dragRef.current.isDragging 
            && si === dragRef.current.draggedOrigSheet 
            && j === dragRef.current.draggedOrigIdx) return;

        const x1 = xo + d.x * scale;
        const y1 = yo + thumbH - (d.y + d.h) * scale;
        const w = d.w * scale;
        const h = d.h * scale;
        const c = colors[d.type] || "#6366f1";
        ctx.fillStyle = c + "25";
        ctx.strokeStyle = c;
        ctx.lineWidth = 1;
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);

        if (w > 18 && h > 12) {
          ctx.font = "bold 8px JetBrains Mono, monospace";
          ctx.fillStyle = partLabelColor;
          ctx.textAlign = "center";
          ctx.fillText(`${d.id}`, x1 + w / 2, y1 + h / 2 + 3);
        }
      });
    });

    // Draw dragged part on top
    if (dragRef.current.isDragging) {
      const dRef = dragRef.current;
      const targetObj = getDragTarget(dRef.cx, dRef.cy);
      
      let finalCanvasX = dRef.cx - dRef.ox;
      let finalCanvasY = dRef.cy - dRef.oy;
      
      let nw = dRef.rotated ? dRef.draggedPart.h : dRef.draggedPart.w;
      let nh = dRef.rotated ? dRef.draggedPart.w : dRef.draggedPart.h;
      let scale = 1;

      if (targetObj) {
        const { targetSheetIndex, rawTx, rawTy, xo, yo, scale: s, thumbH } = targetObj;
        scale = s;
        nw = targetObj.nw;
        nh = targetObj.nh;
        
        const snapped = calculateSnap(rawTx, rawTy, nw, nh, targetSheetIndex);
        
        finalCanvasX = xo + snapped.tx * scale;
        finalCanvasY = yo + thumbH - (snapped.ty + nh) * scale;
      } else {
        const meta = nestingResult.sheets_meta ? nestingResult.sheets_meta[dRef.draggedOrigSheet] : null;
        const sw = meta ? meta.w : settings.sheet_w;
        scale = Math.min(cw - 16, 300) / sw;
      }
      
      const boxW = nw * scale;
      const boxH = nh * scale;

      const c = "#ef4444"; // Highlight red while floating
      ctx.fillStyle = c + "55";
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.fillRect(finalCanvasX, finalCanvasY, boxW, boxH);
      ctx.strokeRect(finalCanvasX, finalCanvasY, boxW, boxH);
      
      ctx.font = "bold 8px JetBrains Mono, monospace";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(`${dRef.draggedPart.id}`, finalCanvasX + boxW / 2, finalCanvasY + boxH / 2 + 3);
    }
  }, [nestingResult, settings, isDark, getDragTarget, calculateSnap]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // ── Drag & Drop events ──────────────────────────────
  const handlePointerDown = (e) => {
    if (!nestingResult || !canvasRef.current || !settings) return;
    const canvas = canvasRef.current;
    
    // Attempt focus to receive keydown
    canvas.focus({ preventScroll: true });

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const cw = canvas.parentElement.clientWidth - 8;
    let currentY = 28;

    for (let si = 0; si < nestingResult.sheets.length; si++) {
      const sheet = nestingResult.sheets[si];
      const meta = nestingResult.sheets_meta ? nestingResult.sheets_meta[si] : null;
      const sw = meta ? meta.w : settings.sheet_w;
      const sh = meta ? meta.h : settings.sheet_h;
      
      const thumbW = Math.min(cw - 16, 300);
      const scale = thumbW / sw;
      const thumbH = sh * scale;
      
      const xo = (cw - thumbW) / 2;
      const yo = currentY;

      if (mx >= xo && mx <= xo + thumbW && my >= yo && my <= yo + thumbH) {
        // Find part backwards so top part is picked first
        for (let j = sheet.length - 1; j >= 0; j--) {
          const d = sheet[j];
          const x1 = xo + d.x * scale;
          const y1 = yo + thumbH - (d.y + d.h) * scale;
          const w = d.w * scale;
          const h = d.h * scale;
          
          if (mx >= x1 && mx <= x1 + w && my >= y1 && my <= y1 + h) {
            e.target.setPointerCapture(e.pointerId);
            dragRef.current = {
              isDragging: true,
              draggedPart: d,
              draggedOrigSheet: si,
              draggedOrigIdx: j,  // store array index to uniquely identify this placement
              cx: mx, cy: my,
              ox: mx - x1, oy: my - y1,
              rotated: false,
              forcedRotate: false,
              startMx: mx, startMy: my
            };
            drawCanvas();
            return;
          }
        }
      }
      currentY += thumbH + 40;
    }
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.isDragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current.cx = e.clientX - rect.left;
    dragRef.current.cy = e.clientY - rect.top;
    drawCanvas();
  };

  const handlePointerUp = async (e) => {
    if (!dragRef.current.isDragging) return;
    e.target.releasePointerCapture(e.pointerId);
    
    const dRef = dragRef.current;
    dRef.isDragging = false;

    // Check if it was a tiny movement (Click)
    const dist = Math.hypot(dRef.cx - dRef.startMx, dRef.cy - dRef.startMy);
    if (dist < 3 && !dRef.forcedRotate) {
      const originalDoor = doors.find(door => door.id === dRef.draggedPart.id);
      if (originalDoor) {
        setEditingPreviewPart({ ...originalDoor });
      }
      drawCanvas();
      return;
    }

    // Process Drop
    const sw = settings.sheet_w;
    const sh = settings.sheet_h;
    
    let targetSheetIndex = -1;
    let tx = 0; let ty = 0;
    let nw = dRef.rotated ? dRef.draggedPart.h : dRef.draggedPart.w;
    let nh = dRef.rotated ? dRef.draggedPart.w : dRef.draggedPart.h;

    const targetObj = getDragTarget(dRef.cx, dRef.cy);
    if (targetObj) {
      targetSheetIndex = targetObj.targetSheetIndex;
      nw = targetObj.nw;
      nh = targetObj.nh;
      const snapped = calculateSnap(targetObj.rawTx, targetObj.rawTy, nw, nh, targetSheetIndex);
      tx = snapped.tx;
      ty = snapped.ty;
    }

    if (targetSheetIndex !== -1) {
      const meta = nestingResult.sheets_meta ? nestingResult.sheets_meta[targetSheetIndex] : null;
      const tgt_sw = meta ? meta.w : settings.sheet_w;
      const tgt_sh = meta ? meta.h : settings.sheet_h;
      
      const margin = settings.margin;
      const kerf = settings.kerf;
      let collision = false;

      if (tx < margin - 0.1 || ty < margin - 0.1 || tx + nw > tgt_sw - margin + 0.1 || ty + nh > tgt_sh - margin + 0.1) {
        collision = true;
      }

      if (!collision) {
        const sheet = nestingResult.sheets[targetSheetIndex];
        for (let oi = 0; oi < sheet.length; oi++) {
          const other = sheet[oi];
          if (oi === dRef.draggedOrigIdx && targetSheetIndex === dRef.draggedOrigSheet) continue;
          
          if (tx < other.x + other.w + kerf - 0.1 && tx + nw + kerf > other.x + 0.1 &&
              ty < other.y + other.h + kerf - 0.1 && ty + nh + kerf > other.y + 0.1) {
             collision = true;
             break;
          }
        }
      }

      if (!collision) {
        const newSheets = nestingResult.sheets.map(s => [...s]);
        
        newSheets[dRef.draggedOrigSheet] = newSheets[dRef.draggedOrigSheet].filter((_, idx) => idx !== dRef.draggedOrigIdx);
        
        newSheets[targetSheetIndex].push({
          ...dRef.draggedPart,
          x: tx, y: ty, w: nw, h: nh,
          rotated: false
        });

        const newNesting = { ...nestingResult, sheets: newSheets };
        setNestingResult(newNesting);
        try {
          await updateNestingResult(newNesting);
        } catch (e) {
          setError("Failed to sync layout to backend: " + e.message);
        }
        return;
      }
    }

    // Invalid drop
    drawCanvas();
  };

  const handleCanvasKeyDown = (e) => {
    if (e.key === 'r' || e.key === 'R') {
      if (dragRef.current.isDragging) {
         dragRef.current.rotated = !dragRef.current.rotated;
         dragRef.current.forcedRotate = true;
         drawCanvas();
      }
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--ss-text-muted)" }}>
        <p>Connecting to backend…</p>
      </div>
    );
  }

  const typeColors = {
    "Shaker": { text: "#3b82f6", border: "rgba(59,130,246,0.25)", bg: "rgba(59,130,246,0.08)" },
    "Shaker Step": { text: "#22c55e", border: "rgba(34,197,94,0.25)", bg: "rgba(34,197,94,0.08)" },
    "Slab": { text: "#f59e0b", border: "rgba(245,158,11,0.25)", bg: "rgba(245,158,11,0.08)" },
  };

  // ═══════════════════════════════════════════════════════
  return (
    <div className="h-full overflow-y-auto" id="supershaker-panel" style={{ backgroundColor: "transparent" }}>
      <div className="p-4 space-y-4">

        {/* ── KPI Bar ───────────────────────────────────── */}
        {nestingResult && (
          <div className="grid grid-cols-4 gap-2 animate-fade-in" id="kpi-bar">
            {[
              { label: "Sheets", value: nestingResult.total_sheets, color: "#0ea5e9" },
              { label: "Parts", value: nestingResult.total_parts, color: "#22c55e" },
              { label: "Yield", value: `${nestingResult.yield_percentage}%`, color: "var(--ss-accent)" },
              { label: "Area", value: `${nestingResult.total_area_m2}m²`, color: "#a855f7" },
            ].map(k => (
              <div key={k.label} className="rounded-lg p-2 text-center"
                   style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                <p className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--ss-text-muted)" }}>{k.label}</p>
                <p className="text-sm font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Section Tabs ──────────────────────────────── */}
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
          {[
            { key: "workflow", label: "Workflow" },
            { key: "params", label: "Parameters" },
            { key: "tool", label: "Tool T6" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                backgroundColor: activeSection === tab.key ? "var(--ss-accent-soft)" : "transparent",
                color: activeSection === tab.key ? "var(--ss-accent)" : "var(--ss-text-muted)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── WORKFLOW TAB ──────────────────────────────── */}
        {activeSection === "workflow" && (
          <div className="space-y-4 animate-fade-in">

            {/* Unit toggle */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--ss-text-muted)" }}>Units</span>
              <div
                className="relative flex items-center rounded-lg p-1 w-[120px] cursor-pointer"
                style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}
              >
                <div 
                  className="absolute top-1 bottom-1 w-[54px] rounded-md transition-transform duration-300 ease-out"
                  style={{
                    backgroundColor: "var(--ss-accent-soft)",
                    border: "1px solid rgba(132,204,22,0.2)",
                    transform: useInch ? "translateX(56px)" : "translateX(0px)",
                  }}
                />
                <button onClick={() => setUseInch(false)}
                  className="relative z-10 flex-1 text-center text-[10px] font-mono font-bold py-1 transition-all select-none"
                  style={{ color: !useInch ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
                  MM
                </button>
                <button onClick={() => setUseInch(true)}
                  className="relative z-10 flex-1 text-center text-[10px] font-mono font-bold py-1 transition-all select-none"
                  style={{ color: useInch ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
                  INCH
                </button>
              </div>
            </div>

            {/* Order # */}
            <div className="flex items-center gap-2">
              <label className="text-xs whitespace-nowrap w-16" style={{ color: "var(--ss-text-muted)" }}>Order #</label>
              <input
                type="text"
                value={settings.order_id}
                onChange={e => handleSettingsChange("order_id", e.target.value)}
                className="ss-input flex-1 text-xs"
                placeholder="e.g. ORD-2026-001"
              />
            </div>
            
            {/* Cost Settings */}
            <div className="flex flex-col gap-2 p-2 rounded-lg" style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
              <button 
                onClick={() => setShowCostSettings(!showCostSettings)}
                className="flex items-center justify-between text-xs cursor-pointer w-full text-left transition-colors"
                style={{ color: "var(--ss-text-muted)" }}>
                <span className="font-medium tracking-wider text-[10px] uppercase">Job Costing Setup</span>
                <span>{showCostSettings ? '▼' : '▶'}</span>
              </button>
              
              {showCostSettings && (
                <div className="grid grid-cols-2 gap-2 pt-2 animate-fade-in" style={{ borderTop: "1px solid var(--ss-border)" }}>
                  <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: "var(--ss-text-muted)" }}>Sheet Cost ($)</label>
                    <input type="number" 
                      value={settings.sheet_cost ?? 65.0}
                      onChange={e => handleSettingsChange("sheet_cost", parseFloat(e.target.value) || 0)}
                      className="ss-input w-full text-xs py-1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: "var(--ss-text-muted)" }}>Shop Rate ($/hr)</label>
                    <input type="number" 
                      value={settings.shop_rate ?? 85.0}
                      onChange={e => handleSettingsChange("shop_rate", parseFloat(e.target.value) || 0)}
                      className="ss-input w-full text-xs py-1.5" />
                  </div>
                </div>
              )}
            </div>

            {/* Add door */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap"
                    style={{ color: "var(--ss-text-muted)" }}>
                  Add Part
                </h3>
                <hr className="flex-1" style={{ borderColor: "var(--ss-border)" }} />
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_1.8fr] gap-2">
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: "var(--ss-text-muted)" }}>W {unitLabel}</label>
                  <input type="number" value={toDisplay(newDoor.w)}
                    onChange={e => setNewDoor(p => ({...p, w: fromDisplay(parseFloat(e.target.value) || 0)}))}
                    className="ss-input w-full text-xs" />
                </div>
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: "var(--ss-text-muted)" }}>H {unitLabel}</label>
                  <input type="number" value={toDisplay(newDoor.h)}
                    onChange={e => setNewDoor(p => ({...p, h: fromDisplay(parseFloat(e.target.value) || 0)}))}
                    className="ss-input w-full text-xs" />
                </div>
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: "var(--ss-text-muted)" }}>Qty</label>
                  <input type="number" value={newDoor.qty}
                    onChange={e => setNewDoor(p => ({...p, qty: parseInt(e.target.value) || 1}))}
                    className="ss-input w-full text-xs" />
                </div>
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: "var(--ss-text-muted)" }}>Type</label>
                  <select value={newDoor.type}
                    onChange={e => setNewDoor(p => ({...p, type: e.target.value}))}
                    className="ss-input w-full text-xs py-[7px]">
                    <option value="Shaker">Shaker</option>
                    <option value="Shaker Step">Shaker Step</option>
                    <option value="Slab">Slab</option>
                  </select>
                </div>
              </div>

              {/* Facade Preview */}
              <div className="rounded-lg p-3 flex gap-3 items-start animate-fade-in" key={newDoor.type}
                   style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                <div className="w-24 h-20 flex-shrink-0 rounded flex items-center justify-center"
                     style={{ backgroundColor: "var(--ss-input-bg)", border: "1px solid var(--ss-border)" }}>
                  {newDoor.type === "Shaker" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.6"/>
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#3b82f6" strokeWidth="1" fill="#3b82f6" fillOpacity="0.05"/>
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Shaker Step" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.6"/>
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#22c55e" strokeWidth="1" fill="#22c55e" fillOpacity="0.05"/>
                      <rect x="20" y="17" width="40" height="22" rx="1" stroke="#22c55e" strokeWidth="0.8" strokeDasharray="2 1" strokeOpacity="0.4"/>
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Slab" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="1" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.6" fill="#f59e0b" fillOpacity="0.03"/>
                      <line x1="4" y1="4" x2="8" y2="8" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="76" y1="4" x2="72" y2="8" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="4" y1="52" x2="8" y2="48" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="76" y1="52" x2="72" y2="48" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <text x="40" y="30" textAnchor="middle" fill="#f59e0b" fillOpacity="0.3" fontSize="8" fontFamily="monospace">FLAT</text>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold mb-1" style={{ color: typeColors[newDoor.type]?.text }}>{newDoor.type.toUpperCase()}</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--ss-text-muted)" }}>
                    {newDoor.type === "Shaker" && "Classic frame-and-panel facade. A pocket is milled around the inner panel perimeter, creating a clean raised step."}
                    {newDoor.type === "Shaker Step" && "Two-step facade. An additional inner contour adds depth, requiring two milling passes for a layered profile."}
                    {newDoor.type === "Slab" && "Flat facade with no frame or panel. Contour cut only, no pocket milling. Minimal machining time."}
                  </p>
                </div>
              </div>

              <button onClick={handleAddDoor}
                className="ss-btn-ghost w-full text-xs py-1.5">
                + Add Part
              </button>
            </section>

            {/* Parts table */}
            {doors.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap"
                      style={{ color: "var(--ss-text-muted)" }}>
                    Parts ({doors.length})
                  </h3>
                  <hr className="flex-1" style={{ borderColor: "var(--ss-border)" }} />
                  <button onClick={handleClear}
                    className="text-[10px] transition-colors hover:text-red-500"
                    style={{ color: "var(--ss-text-muted)" }}>
                    Clear All
                  </button>
                </div>
                <div className="overflow-x-auto max-h-40 overflow-y-auto rounded-lg" style={{ border: "1px solid var(--ss-border)" }}>
                  <table className="w-full text-xs" id="parts-table">
                    <thead style={{ backgroundColor: "var(--ss-card)" }} className="sticky top-0">
                      <tr style={{ color: "var(--ss-text-muted)" }}>
                        <th className="py-1.5 px-2 text-left font-medium">ID</th>
                        <th className="py-1.5 px-2 text-center font-medium">W</th>
                        <th className="py-1.5 px-2 text-center font-medium">H</th>
                        <th className="py-1.5 px-2 text-center font-medium">Qty</th>
                        <th className="py-1.5 px-2 text-center font-medium">Type</th>
                        <th className="py-1.5 px-1 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {doors.map(d => {
                        const isEditing = (field) => editingCell?.id === d.id && editingCell?.field === field;
                        const numCell = (field) => isEditing(field) ? (
                          <input
                            autoFocus
                            type="number"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => commitEdit(d.id, field, editingValue)}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") commitEdit(d.id, field, editingValue); }}
                            className="w-full h-8 text-center font-mono text-xs outline-none px-1"
                            style={{
                              backgroundColor: "var(--ss-input-bg)",
                              color: "var(--ss-accent)",
                              borderBottom: "2px solid var(--ss-accent)",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(d.id, field, (field === "w" || field === "h") ? toDisplay(d[field]) : d[field])}
                            className="block w-full h-8 leading-8 text-center font-mono cursor-text transition-colors px-2"
                            style={{ color: "var(--ss-text)" }}
                          >{(field === "w" || field === "h") ? toDisplay(d[field]) : d[field]}</span>
                        );

                        return (
                        <tr key={d.id} className="transition-colors" style={{ borderBottom: "1px solid var(--ss-border)" }}>
                          <td className="py-1.5 px-2 font-mono" style={{ color: "var(--ss-accent)" }}>{d.id}</td>
                          <td className="py-0 px-0">{numCell("w")}</td>
                          <td className="py-0 px-0">{numCell("h")}</td>
                          <td className="py-0 px-0">{numCell("qty")}</td>
                          <td className="py-0 px-0 text-center">
                            {isEditing("type") ? (
                              <select
                                autoFocus
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(d.id, "type", editingValue)}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(d.id, "type", editingValue); }}
                                className="w-full h-8 text-center font-mono text-xs outline-none px-1"
                                style={{
                                  backgroundColor: "var(--ss-input-bg)",
                                  color: "var(--ss-accent)",
                                  borderBottom: "2px solid var(--ss-accent)",
                                }}
                              >
                                <option value="Shaker">Shaker</option>
                                <option value="Shaker Step">Shaker Step</option>
                                <option value="Slab">Slab</option>
                              </select>
                            ) : (
                              <span
                                onClick={() => startEdit(d.id, "type", d.type)}
                                className="inline-block cursor-pointer text-[10px] px-1.5 py-0.5 rounded-full m-1 transition-all"
                                style={{
                                  color: typeColors[d.type]?.text,
                                  border: `1px solid ${typeColors[d.type]?.border}`,
                                  backgroundColor: typeColors[d.type]?.bg,
                                }}>
                                {d.type}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-1">
                            <button onClick={() => handleDeleteDoor(d.id)}
                              className="text-xs transition-colors hover:text-red-500"
                              style={{ color: "var(--ss-text-muted)" }}>
                              ✕
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Offcuts Inventory */}
            <section className="space-y-3 pt-3 mt-1" style={{ borderTop: "2px dashed var(--ss-border)" }}>
              <div className="flex items-center justify-between gap-3 px-1">
                <h3 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2"
                    style={{ color: "var(--ss-accent)" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v4"/><polyline points="15 3 21 9 21 21s-1.5-1-4-1-4 1-4 1V9"/><line x1="2" x2="22" y1="9" y2="9"/><line x1="7" x2="7" y1="3" y2="9"/></svg>
                  Offcuts / Remnants Inventory
                </h3>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--ss-accent-soft)", color: "var(--ss-accent)" }}>
                  {offcuts.length} pieces
                </span>
                <hr className="flex-1 opacity-20" style={{ borderColor: "var(--ss-border)" }} />
              </div>

              {/* Add offcut form */}
              <div className="flex items-end gap-2 p-2 rounded-lg" style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                <div className="flex-1">
                  <label className="block text-[9px] font-bold uppercase mb-1" style={{ color: "var(--ss-text-muted)" }}>Width {unitLabel}</label>
                  <input type="number" className="ss-input text-xs py-1 text-center font-mono w-full"
                    placeholder="W"
                    value={toDisplay(newOffcut.w)}
                    onChange={e => setNewOffcut({...newOffcut, w: fromDisplay(parseFloat(e.target.value) || 0)})} />
                </div>
                <div className="flex-1">
                  <label className="block text-[9px] font-bold uppercase mb-1" style={{ color: "var(--ss-text-muted)" }}>Height {unitLabel}</label>
                  <input type="number" className="ss-input text-xs py-1 text-center font-mono w-full"
                    placeholder="H"
                    value={toDisplay(newOffcut.h)}
                    onChange={e => setNewOffcut({...newOffcut, h: fromDisplay(parseFloat(e.target.value) || 0)})} />
                </div>
                <div className="w-16">
                  <label className="block text-[9px] font-bold uppercase mb-1 text-center" style={{ color: "var(--ss-text-muted)" }}>Qty</label>
                  <input type="number" className="ss-input text-xs py-1 text-center font-mono w-full"
                    value={newOffcut.qty}
                    onChange={e => setNewOffcut({...newOffcut, qty: parseInt(e.target.value) || 1})} min="1" />
                </div>
                <button 
                  onClick={handleAddOffcut}
                  className="ss-btn-primary px-3 py-1.5 text-[10px] font-bold active:scale-95 shadow-md shadow-lime-500/10"
                >
                  + Add
                </button>
              </div>

              {offcuts.length > 0 && (
                <div className="overflow-x-auto max-h-32 overflow-y-auto rounded-lg" style={{ border: "1px solid var(--ss-border)" }}>
                  <table className="w-full text-xs">
                    <thead style={{ backgroundColor: "var(--ss-card)" }} className="sticky top-0">
                      <tr style={{ color: "var(--ss-text-muted)" }}>
                        <th className="py-1 px-2 text-left font-medium">Offcut ID</th>
                        <th className="py-1 px-2 text-center font-medium">W</th>
                        <th className="py-1 px-2 text-center font-medium">H</th>
                        <th className="py-1 px-2 text-center font-medium">Qty</th>
                        <th className="py-1 px-1 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {offcuts.map(o => (
                        <tr key={o.id} className="transition-colors" style={{ borderBottom: "1px solid var(--ss-border)" }}>
                          <td className="py-1 px-2 font-mono" style={{ color: "var(--ss-accent)" }}>{o.id}</td>
                          <td className="py-1 px-2 text-center font-mono">{toDisplay(o.w)}</td>
                          <td className="py-1 px-2 text-center font-mono">{toDisplay(o.h)}</td>
                          <td className="py-1 px-2 text-center font-mono">{o.qty}</td>
                          <td className="py-1 px-1 text-center">
                            <button onClick={() => handleDeleteOffcut(o.id)}
                              className="text-xs transition-colors hover:text-red-500"
                              style={{ color: "var(--ss-text-muted)" }}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Workflow buttons */}
            <div className="space-y-2">
              <button onClick={handleNesting}
                disabled={!!isLoading || doors.length === 0}
                className="ss-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2">
                {isLoading === "nesting" ? (
                  <><Spinner /> Running Nesting…</>
                ) : (
                  "Run Nesting"
                )}
              </button>

              <button onClick={handleGenerateLabels}
                disabled={!!isLoading || doors.length === 0}
                className="ss-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2"
                style={{ color: "#0ea5e9" }}>
                {isLoading === "labels" ? (
                  <><Spinner /> Generating PDF…</>
                ) : (
                  "Export PDF Labels"
                )}
              </button>

              <button onClick={handleCuttingMap}
                disabled={!!isLoading || !nestingResult}
                className="ss-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2"
                style={{ color: "#22c55e" }}>
                {isLoading === "cuttingmap" ? (
                  <><Spinner /> Generating PDF…</>
                ) : (
                  "Cutting Map PDF"
                )}
              </button>

              <button onClick={handleGenerate}
                disabled={!!isLoading || !nestingResult}
                className="ss-btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2">
                {isLoading === "generating" ? (
                  <><Spinner /> Generating…</>
                ) : (
                  "Generate G-code"
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg p-3 text-xs animate-fade-in"
                   style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--ss-danger)" }}>
                <p className="font-semibold mb-0.5">Error</p>
                <p>{error}</p>
              </div>
            )}

            {/* Job Estimate */}
            {nestingResult && nestingResult.costing && (
              <section className="rounded-lg p-3 animate-fade-in"
                       style={{
                         backgroundColor: "var(--ss-card)",
                         border: "1px solid rgba(132,204,22,0.2)",
                         boxShadow: "var(--ss-shadow-sm)",
                       }}>
                <h3 className="text-[10px] font-semibold uppercase tracking-widest mb-2 pb-1"
                    style={{ color: "var(--ss-accent)", borderBottom: "1px solid rgba(132,204,22,0.15)" }}>
                  Job Estimate
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="block text-[9px] uppercase" style={{ color: "var(--ss-text-muted)" }}>Material Cost</span>
                    <span className="font-mono" style={{ color: "var(--ss-text)" }}>${nestingResult.costing.material_cost?.toFixed(2)}</span>
                    <span className="ml-1" style={{ color: "var(--ss-text-muted)" }}>({nestingResult.costing.sheet_count} sheet{nestingResult.costing.sheet_count !== 1 ? 's' : ''})</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase" style={{ color: "var(--ss-text-muted)" }}>Machine Labor</span>
                    <span className="font-mono" style={{ color: "var(--ss-text)" }}>${nestingResult.costing.labor_cost?.toFixed(2)}</span>
                    <span className="ml-1" style={{ color: "var(--ss-text-muted)" }}>({nestingResult.costing.machine_time_hours?.toFixed(1)} hrs)</span>
                  </div>
                  <div className="col-span-2 pt-2 mt-1 flex justify-between items-end" style={{ borderTop: "1px solid var(--ss-border)" }}>
                    <span className="text-[10px] uppercase" style={{ color: "var(--ss-text-muted)" }}>Total Quote Price:</span>
                    <span className="font-mono font-bold text-lg" style={{ color: "var(--ss-accent)" }}>${nestingResult.costing.total_estimate?.toFixed(2)}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Nesting preview */}
            {nestingResult && (
              <section className="space-y-2 animate-fade-in">
                <h3 className="text-xs font-semibold uppercase tracking-wider pb-1"
                    style={{ color: "var(--ss-text-muted)", borderBottom: "1px solid var(--ss-border)" }}>
                  Nesting Preview
                </h3>
                <div className="rounded-lg overflow-hidden flex flex-col items-center" style={{ border: "1px solid var(--ss-border)", backgroundColor: "var(--ss-bg)" }}>
                  <canvas 
                    ref={canvasRef} 
                    id="nesting-canvas" 
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onKeyDown={handleCanvasKeyDown}
                    tabIndex={0}
                    className="cursor-pointer outline-none" 
                  />
                  <p className="text-[10px] text-center w-full py-1 opacity-50 block">Drag & Drop to move parts. Press 'R' while dragging to rotate.</p>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── PARAMETERS TAB ───────────────────────────── */}
        {activeSection === "params" && settings && (
          <div className="space-y-4 animate-fade-in">
            <ParamSection title="Material & Sheet">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs w-28" style={{ color: "var(--ss-text-muted)" }}>Sheet Grain</label>
                <select value={settings.sheet_grain || "None"}
                  onChange={e => handleSettingsChange("sheet_grain", e.target.value)}
                  className="ss-input text-xs py-1.5 flex-1">
                  <option value="None">None</option>
                  <option value="Horizontal">Horizontal</option>
                  <option value="Vertical">Vertical</option>
                </select>
              </div>
              <ParamField label={`Sheet W (${unitLabel})`} value={toDisplay(settings.sheet_w)}
                onChange={v => handleSettingsChange("sheet_w", fromDisplay(v))} />
              <ParamField label={`Sheet H (${unitLabel})`} value={toDisplay(settings.sheet_h)}
                onChange={v => handleSettingsChange("sheet_h", fromDisplay(v))} />
              <ParamField label={`Thickness Z (${unitLabel})`} value={toDisplay(settings.mat_z)}
                onChange={v => handleSettingsChange("mat_z", fromDisplay(v))} step="0.1" />
              <ParamField label={`Edge margin (${unitLabel})`} value={toDisplay(settings.margin)}
                onChange={v => handleSettingsChange("margin", fromDisplay(v))} />
              <ParamField label={`Kerf (${unitLabel})`} value={toDisplay(settings.kerf)}
                onChange={v => handleSettingsChange("kerf", fromDisplay(v))} />
            </ParamSection>

            <ParamSection title="Facade Parameters">
              <ParamField label={`Frame width (${unitLabel})`} value={toDisplay(settings.frame_w)}
                onChange={v => handleSettingsChange("frame_w", fromDisplay(v))} />
              <ParamField label={`Pocket depth (${unitLabel})`} value={toDisplay(settings.pocket_depth)}
                onChange={v => handleSettingsChange("pocket_depth", fromDisplay(v))} step="0.1" />
              <ParamField label={`2nd depth (${unitLabel})`} value={toDisplay(settings.pocket_depth2)}
                onChange={v => handleSettingsChange("pocket_depth2", fromDisplay(v))} step="0.1" />
              <ParamField label={`2nd offset (${unitLabel})`} value={toDisplay(settings.pocket_step_offset)}
                onChange={v => handleSettingsChange("pocket_step_offset", fromDisplay(v))} step="0.5" />
              <ParamField label={`Inner chamfer (${unitLabel})`} value={toDisplay(settings.chamfer_depth)}
                onChange={v => handleSettingsChange("chamfer_depth", fromDisplay(v))} step="0.1" />
              <ParamField label={`Outer chamfer (${unitLabel})`} value={toDisplay(settings.outer_chamfer_depth)}
                onChange={v => handleSettingsChange("outer_chamfer_depth", fromDisplay(v))} step="0.1" />
              <ParamField label={`Corner R (${unitLabel})`} value={toDisplay(settings.corner_r)}
                onChange={v => handleSettingsChange("corner_r", fromDisplay(v))} step="0.1" />
            </ParamSection>

            <ParamSection title="Operations">
              <CheckField label="Pocket (T6)" checked={settings.do_pocket}
                onChange={v => handleSettingsChange("do_pocket", v)} />
              <CheckField label="Corner Rest (T2)" checked={settings.do_corners_rest}
                onChange={v => handleSettingsChange("do_corners_rest", v)} />
              <CheckField label="French Miter (T5)" checked={settings.do_french_miter}
                onChange={v => handleSettingsChange("do_french_miter", v)} />
              <CheckField label="Contour Cut (T3)" checked={settings.do_cutout}
                onChange={v => handleSettingsChange("do_cutout", v)} />
              <CheckField label="Common Line" checked={settings.common_line}
                onChange={v => handleSettingsChange("common_line", v)} disabled={!settings.do_cutout} />
              <CheckField label="Rough Pass" checked={settings.do_rough_pass}
                onChange={v => handleSettingsChange("do_rough_pass", v)} />
              <CheckField label="Allow Rotation" checked={settings.allow_rotation}
                onChange={v => handleSettingsChange("allow_rotation", v)} />
              <ParamField label={`Nesting Loops`} value={settings.nesting_iterations || 100}
                onChange={v => handleSettingsChange("nesting_iterations", parseInt(v) || 100)} step="10" />
            </ParamSection>

            <ParamSection title="PDF Labels Export">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs w-28" style={{ color: "var(--ss-text-muted)" }}>Format</label>
                <select value={settings.label_format || "Roll Printer"}
                  onChange={e => handleSettingsChange("label_format", e.target.value)}
                  className="ss-input text-xs py-1.5 flex-1">
                  <option value="Avery 5160">Avery 5160 (Letter)</option>
                  <option value="Roll Printer">Roll Printer</option>
                </select>
              </div>
              {settings.label_format === "Roll Printer" && (
                <>
                  <ParamField label={`Label W (${unitLabel})`} value={toDisplay(settings.label_w ?? 62.0)}
                    onChange={v => handleSettingsChange("label_w", fromDisplay(v))} step="1" />
                  <ParamField label={`Label H (${unitLabel})`} value={toDisplay(settings.label_h ?? 29.0)}
                    onChange={v => handleSettingsChange("label_h", fromDisplay(v))} step="1" />
                </>
              )}
            </ParamSection>
          </div>
        )}

        {/* ── TOOL T6 TAB ──────────────────────────────── */}
        {activeSection === "tool" && settings && (
          <div className="space-y-4 animate-fade-in">
            <ParamSection title="T6 Pocket Cutter">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs w-28" style={{ color: "var(--ss-text-muted)" }}>T-number</label>
                <select value={settings.t6_name}
                  onChange={e => handleSettingsChange("t6_name", e.target.value)}
                  className="ss-input text-xs py-1.5 flex-1">
                  {Array.from({length: 9}, (_, i) => `T${i+1}`).map(t =>
                    <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs w-28" style={{ color: "var(--ss-text-muted)" }}>Type</label>
                <div className="flex gap-3">
                  {["PCD", "TCT"].map(t => (
                    <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--ss-text)" }}>
                      <input type="radio" name="toolType" value={t}
                        checked={settings.t6_type === t}
                        onChange={() => handleSettingsChange("t6_type", t)}
                        style={{ accentColor: "var(--ss-accent)" }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <ParamField label={`Diameter D (${unitLabel})`} value={toDisplay(settings.t6_dia)}
                onChange={v => handleSettingsChange("t6_dia", fromDisplay(v))} step="0.25" />
              <ParamField label="Teeth z" value={settings.t6_teeth}
                onChange={v => handleSettingsChange("t6_teeth", parseInt(v))} type="number" />
              <ParamField label="Spindle RPM" value={settings.t6_spindle}
                onChange={v => handleSettingsChange("t6_spindle", parseInt(v))} />
              <ParamField label={`Feed (${feedLabel})`} value={toFeedDisplay(settings.t6_feed)}
                onChange={v => handleSettingsChange("t6_feed", useInch ? +(v * 25.4).toFixed(0) : parseInt(v))} />
            </ParamSection>

            <ParamSection title="Strategy">
              <div className="grid grid-cols-3 gap-2 mb-2">
                {["Snake", "Spiral", "Climb (CCW)"].map(s => (
                  <button key={s}
                    onClick={() => handleSettingsChange("pocket_strategy", s)}
                    className="px-2 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: settings.pocket_strategy === s ? "var(--ss-accent-soft)" : "var(--ss-card)",
                      color: settings.pocket_strategy === s ? "var(--ss-accent)" : "var(--ss-text-muted)",
                      border: `1px solid ${settings.pocket_strategy === s ? "rgba(132,204,22,0.25)" : "var(--ss-border)"}`,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              <ParamField label="Step-over (%)" value={settings.spiral_overlap}
                onChange={v => handleSettingsChange("spiral_overlap", v)} />
            </ParamSection>

            <ParamSection title="Other Tools">
              <div className="grid grid-cols-3 gap-2 text-[10px]" style={{ color: "var(--ss-text-muted)" }}>
                <div className="rounded-lg p-2" style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                  <p className="font-semibold mb-1" style={{ color: "var(--ss-text)" }}>{settings.t2_tool_t} D4</p>
                  <p>Corner rest</p>
                  <p className="font-mono" style={{ color: "var(--ss-text)" }}>{toFeedDisplay(settings.t2_feed)} {feedLabel}</p>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                  <p className="font-semibold mb-1" style={{ color: "var(--ss-text)" }}>{settings.t3_tool_t} D6</p>
                  <p>Contour cut</p>
                  <p className="font-mono" style={{ color: "var(--ss-text)" }}>{toFeedDisplay(settings.t3_feed)} {feedLabel}</p>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                  <p className="font-semibold mb-1" style={{ color: "var(--ss-text)" }}>{settings.t5_tool_t} V90</p>
                  <p>Chamfer/Miter</p>
                  <p className="font-mono" style={{ color: "var(--ss-text)" }}>{toFeedDisplay(settings.t5_feed)} {feedLabel}</p>
                </div>
              </div>
            </ParamSection>
          </div>
        )}

      </div>

      {editingPreviewPart && (
        <EditPreviewDoorModal
          part={editingPreviewPart}
          onSave={handleSavePreviewPart}
          onCancel={() => setEditingPreviewPart(null)}
          toDisplay={toDisplay}
          fromDisplay={fromDisplay}
          unitLabel={unitLabel}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════════════════

function ParamSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider pb-1"
          style={{ color: "var(--ss-text-muted)", borderBottom: "1px solid var(--ss-border)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ParamField({ label, value, onChange, step = "1", type = "number" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs whitespace-nowrap" style={{ color: "var(--ss-text-muted)" }}>{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="ss-input text-xs w-20 py-1"
      />
    </div>
  );
}

function CheckField({ label, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="text-xs whitespace-nowrap" style={{ color: "var(--ss-text-muted)" }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded"
        style={{ accentColor: "var(--ss-accent)" }}
      />
    </label>
  );
}

const typeColors = {
  "Shaker": { bg: "rgba(59, 130, 246, 0.15)", border: "#3b82f6", text: "#60a5fa" },
  "Shaker Step": { bg: "rgba(34, 197, 94, 0.15)", border: "#22c55e", text: "#4ade80" },
  "Slab": { bg: "rgba(245, 158, 11, 0.15)", border: "#f59e0b", text: "#fbbf24" }
};

function EditPreviewDoorModal({ part, onSave, onCancel, toDisplay, fromDisplay, unitLabel }) {
  const [formData, setFormData] = useState({ ...part });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xs rounded-xl p-6 shadow-2xl" style={{ backgroundColor: "var(--ss-panel)", border: "1px solid var(--ss-border)" }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: "var(--ss-text)" }}>Edit Facade Details</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-[10px] block mb-1 uppercase tracking-wider" style={{ color: "var(--ss-text-muted)" }}>Width ({unitLabel})</label>
            <input 
              type="number" 
              value={toDisplay(formData.w)}
              onChange={e => setFormData(f => ({...f, w: fromDisplay(parseFloat(e.target.value) || 0)}))}
              className="ss-input w-full text-sm" 
            />
          </div>
          <div>
            <label className="text-[10px] block mb-1 uppercase tracking-wider" style={{ color: "var(--ss-text-muted)" }}>Height ({unitLabel})</label>
            <input 
              type="number" 
              value={toDisplay(formData.h)}
              onChange={e => setFormData(f => ({...f, h: fromDisplay(parseFloat(e.target.value) || 0)}))}
              className="ss-input w-full text-sm" 
            />
          </div>
          <div>
            <label className="text-[10px] block mb-1 uppercase tracking-wider" style={{ color: "var(--ss-text-muted)" }}>Type</label>
            <select 
              value={formData.type}
              onChange={e => setFormData(f => ({...f, type: e.target.value}))}
              className="ss-input w-full text-sm"
            >
              <option value="Shaker">Shaker</option>
              <option value="Shaker Step">Shaker Step</option>
              <option value="Slab">Slab</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] block mb-1 uppercase tracking-wider" style={{ color: "var(--ss-text-muted)" }}>Grain Direction</label>
            <select 
              value={formData.grain || "None"}
              onChange={e => setFormData(f => ({...f, grain: e.target.value}))}
              className="ss-input w-full text-sm"
            >
              <option value="None">None</option>
              <option value="Horizontal">Horizontal</option>
              <option value="Vertical">Vertical</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-colors"
            style={{ border: "1px solid var(--ss-border)", color: "var(--ss-text)" }}
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(formData)}
            className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold ss-btn-primary"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}


function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
