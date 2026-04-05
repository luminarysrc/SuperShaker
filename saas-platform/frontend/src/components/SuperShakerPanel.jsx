/**
 * SuperShakerPanel.jsx — Left panel: full SuperShaker workflow
 * Order input, parts table, material/tool config, nesting, G-code generation.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider.jsx";
import {
  listDoors, addDoor, deleteDoor, clearDoors, updateDoor,
  getSettings, updateSettings, runNesting, generateFullGcode,
  parseGcode, downloadGcode, downloadLabelsPdf, downloadCuttingMapPdf
} from "../services/EngineClient.js";

export default function SuperShakerPanel({ onGcodeGenerated, onNestingDone, settingsVersion, doorsVersion }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // ── State ─────────────────────────────────────────────
  const [doors, setDoors] = useState([]);
  const [settings, setSettings] = useState(null);
  const [nestingResult, setNestingResult] = useState(null);
  const [isLoading, setIsLoading] = useState("");
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("workflow");
  const canvasRef = useRef(null);

  // Add door form state
  const [newDoor, setNewDoor] = useState({ w: 400, h: 600, qty: 4, type: "Shaker", grain: "None" });
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
        const [d, s] = await Promise.all([listDoors(), getSettings()]);
        setDoors(d);
        setSettings(s);
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

  // ── Draw nesting preview ──────────────────────────────
  useEffect(() => {
    if (!nestingResult || !canvasRef.current || !settings) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { sheets } = nestingResult;
    if (!sheets.length) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.parentElement.clientWidth - 8;
    const sw = settings.sheet_w;
    const sh = settings.sheet_h;
    const thumbW = Math.min(cw - 16, 300);
    const thumbH = thumbW * (sh / sw);
    const totalH = sheets.length * (thumbH + 40) + 16;

    canvas.width = cw * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = totalH + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, totalH);

    const labelColor = isDark ? "#a1a1aa" : "#52525b";
    const sheetBg = isDark ? "#1e293b" : "#e2e8f0";
    const sheetStroke = isDark ? "#334155" : "#94a3b8";
    const partLabelColor = isDark ? "#e2e8f0" : "#1e293b";

    sheets.forEach((sheet, si) => {
      const xo = (cw - thumbW) / 2;
      const yo = si * (thumbH + 40) + 28;
      const scale = thumbW / sw;

      ctx.font = "600 11px Inter, system-ui";
      ctx.fillStyle = labelColor;
      ctx.textAlign = "center";
      ctx.fillText(`Sheet ${si + 1}`, xo + thumbW / 2, yo - 8);

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
      sheet.forEach(d => {
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
  }, [nestingResult, settings, isDark]);

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
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--ss-border)", backgroundColor: "var(--ss-bg)" }}>
                  <canvas ref={canvasRef} id="nesting-canvas" />
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
      <input type={type} value={value ?? ""} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="ss-input w-24 text-right text-xs" />
    </div>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5"
        style={{ accentColor: "var(--ss-accent)" }} />
      <span className="text-xs transition-colors" style={{ color: "var(--ss-text-muted)" }}>
        {label}
      </span>
    </label>
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
