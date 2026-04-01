/**
 * SuperShakerPanel.jsx — Left panel: full SuperShaker workflow
 * Order input, parts table, material/tool config, nesting, G-code generation.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  listDoors, addDoor, deleteDoor, clearDoors, updateDoor,
  getSettings, updateSettings, runNesting, generateFullGcode,
  parseGcode, downloadGcode, downloadLabelsPdf
} from "../services/EngineClient.js";

export default function SuperShakerPanel({ onGcodeGenerated, onNestingDone, settingsVersion, doorsVersion }) {
  // ── State ─────────────────────────────────────────────
  const [doors, setDoors] = useState([]);
  const [settings, setSettings] = useState(null);
  const [nestingResult, setNestingResult] = useState(null);
  const [isLoading, setIsLoading] = useState("");
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("workflow");
  const canvasRef = useRef(null);

  // Add door form state
  const [newDoor, setNewDoor] = useState({ w: 400, h: 600, qty: 4, type: "Shaker" });
  // Inline editing: { id, field }
  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  // Unit system: false = mm, true = inch
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

  // ── Reload settings when profile changes ──────────────
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

  // ── Reload doors when doorsVersion changes ────────────
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

  // ── Settings update helper ────────────────────────────
  const handleSettingsChange = useCallback(async (key, value) => {
    const updated = { [key]: value };
    try {
      const s = await updateSettings(updated);
      setSettings(s);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // ── Add door ──────────────────────────────────────────
  const handleAddDoor = useCallback(async () => {
    try {
      const d = await addDoor(newDoor);
      setDoors(prev => [...prev, d]);
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, [newDoor]);

  // ── Delete door ───────────────────────────────────────
  const handleDeleteDoor = useCallback(async (id) => {
    try {
      await deleteDoor(id);
      setDoors(prev => prev.filter(d => d.id !== id));
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);



  // ── Clear all ─────────────────────────────────────────
  const handleClear = useCallback(async () => {
    try {
      await clearDoors();
      setDoors([]);
      setNestingResult(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // ── Inline edit cell ──────────────────────────────────
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

  // ── Run Nesting ───────────────────────────────────────
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

  // ── Generate Labels PDF ───────────────────────────────
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

  // ── Generate G-code ───────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setIsLoading("generating");
    setError(null);
    try {
      const result = await generateFullGcode(-1); // all sheets
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

    sheets.forEach((sheet, si) => {
      const xo = (cw - thumbW) / 2;
      const yo = si * (thumbH + 40) + 28;
      const scale = thumbW / sw;

      // Sheet label
      ctx.font = "bold 11px Inter, system-ui";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText(`Sheet ${si + 1}`, xo + thumbW / 2, yo - 8);

      // Sheet background
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1.5;
      ctx.fillRect(xo, yo, thumbW, thumbH);
      ctx.strokeRect(xo, yo, thumbW, thumbH);

      // Margin
      const ms = settings.margin * scale;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(xo + ms, yo + ms, thumbW - 2 * ms, thumbH - 2 * ms);
      ctx.setLineDash([]);

      // Parts
      const colors = {
        "Shaker": "#3b82f6",
        "Shaker Step": "#22c55e",
        "Slab": "#f59e0b",
      };
      sheet.forEach(d => {
        const x1 = xo + d.x * scale;
        // FIX: Y-axis aligns with G-code (Y=0 at the bottom)
        const y1 = yo + thumbH - (d.y + d.h) * scale;
        const w = d.w * scale;
        const h = d.h * scale;
        const c = colors[d.type] || "#6366f1";
        ctx.fillStyle = c + "30";
        ctx.strokeStyle = c;
        ctx.lineWidth = 1;
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);

        // ID label
        if (w > 18 && h > 12) {
          ctx.font = "bold 8px JetBrains Mono, monospace";
          ctx.fillStyle = "#e2e8f0";
          ctx.textAlign = "center";
          ctx.fillText(`${d.id}`, x1 + w / 2, y1 + h / 2 + 3);
        }
      });
    });
  }, [nestingResult, settings]);

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full text-cnc-text-muted">
        <p>Connecting to backend...</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  return (
    <div className="h-full overflow-y-auto bg-transparent" id="supershaker-panel">
      <div className="p-4 space-y-4">

        {/* ── KPI Bar ───────────────────────────────────── */}
        {nestingResult && (
          <div className="grid grid-cols-4 gap-2 animate-fade-in" id="kpi-bar">
            {[
              { label: "SHEETS", value: nestingResult.total_sheets, color: "text-sky-400" },
              { label: "PARTS", value: nestingResult.total_parts, color: "text-green-400" },
              { label: "YIELD", value: `${nestingResult.yield_percentage}%`, color: "text-cnc-accent [text-shadow:0_0_10px_rgba(198,243,33,0.3)]" },
              { label: "AREA", value: `${nestingResult.total_area_m2}m²`, color: "text-purple-400" },
            ].map(k => (
              <div key={k.label} className="bg-cnc-card rounded-lg p-2 text-center border border-cnc-border">
                <p className="text-[9px] text-cnc-text-muted font-semibold tracking-widest">{k.label}</p>
                <p className={`text-sm font-bold font-mono ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Section Tabs ──────────────────────────────── */}
        <div className="flex gap-1 bg-cnc-card rounded-lg p-1 border border-cnc-border">
          {[
            { key: "workflow", label: "Workflow" },
            { key: "params", label: "Parameters" },
            { key: "tool", label: "Tool T6" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all
                ${activeSection === tab.key
                  ? "bg-cnc-accent/15 text-cnc-accent"
                  : "text-cnc-text-muted hover:text-cnc-text"}`}
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
              <span className="text-[10px] font-mono text-cnc-text-muted uppercase tracking-widest">Units</span>
              <div className="relative flex items-center bg-[#0a0a0a] rounded-lg p-1 border border-white/10 w-[120px] cursor-pointer shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                <div 
                  className="absolute top-1 bottom-1 w-[54px] rounded-md bg-[#1a1a1a] border border-white/5 shadow-[0_2px_6px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out"
                  style={{ transform: useInch ? "translateX(56px)" : "translateX(0px)" }}
                />
                <button onClick={() => setUseInch(false)}
                  className={`relative z-10 flex-1 text-center text-[10px] font-mono font-bold py-1 transition-all select-none ${!useInch ? 'text-[#C6F321] drop-shadow-[0_0_6px_rgba(198,243,33,0.5)]' : 'text-gray-600 hover:text-gray-400'}`}>
                  MM
                </button>
                <button onClick={() => setUseInch(true)}
                  className={`relative z-10 flex-1 text-center text-[10px] font-mono font-bold py-1 transition-all select-none ${useInch ? 'text-[#00FFFF] drop-shadow-[0_0_6px_rgba(0,255,255,0.5)]' : 'text-gray-600 hover:text-gray-400'}`}>
                  INCH
                </button>
              </div>
            </div>

            {/* Order # */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-cnc-text-muted whitespace-nowrap w-16">Order #</label>
              <input
                type="text"
                value={settings.order_id}
                onChange={e => handleSettingsChange("order_id", e.target.value)}
                className="cnc-input flex-1 text-xs"
                placeholder="e.g. ORD-2026-001"
              />
            </div>

            {/* Add door */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-[10px] font-mono font-semibold text-cnc-text-muted uppercase tracking-widest whitespace-nowrap">
                  Add Part
                </h3>
                <hr className="flex-1 border-white/5" />
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_1.8fr] gap-2">
                <div>
                  <label className="text-[10px] text-cnc-text-muted block mb-0.5">W {unitLabel}</label>
                  <input type="number" value={toDisplay(newDoor.w)}
                    onChange={e => setNewDoor(p => ({...p, w: fromDisplay(parseFloat(e.target.value) || 0)}))}
                    className="cnc-input w-full text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-cnc-text-muted block mb-0.5">H {unitLabel}</label>
                  <input type="number" value={toDisplay(newDoor.h)}
                    onChange={e => setNewDoor(p => ({...p, h: fromDisplay(parseFloat(e.target.value) || 0)}))}
                    className="cnc-input w-full text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-cnc-text-muted block mb-0.5">Qty</label>
                  <input type="number" value={newDoor.qty}
                    onChange={e => setNewDoor(p => ({...p, qty: parseInt(e.target.value) || 1}))}
                    className="cnc-input w-full text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-cnc-text-muted block mb-0.5">Type</label>
                  <select value={newDoor.type}
                    onChange={e => setNewDoor(p => ({...p, type: e.target.value}))}
                    className="cnc-input w-full text-xs py-[7px]">
                    <option className="bg-[#1A1A1A] text-white">Shaker</option>
                    <option className="bg-[#1A1A1A] text-white">Shaker Step</option>
                    <option className="bg-[#1A1A1A] text-white">Slab</option>
                  </select>
                </div>
              </div>

              {/* Facade Type Preview Card */}
              <div className="bg-[#111113] border border-white/5 rounded-lg p-3 flex gap-3 items-start animate-fade-in" key={newDoor.type}>
                {/* SVG Diagram */}
                <div className="w-24 h-20 flex-shrink-0 bg-[#0a0a0a] rounded border border-white/5 flex items-center justify-center">
                  {newDoor.type === "Shaker" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Outer frame */}
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.6"/>
                      {/* Inner panel (raised) */}
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#38bdf8" strokeWidth="1" fill="#38bdf8" fillOpacity="0.05"/>
                      {/* Frame grooves */}
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Shaker Step" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Outer frame */}
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#4ade80" strokeWidth="1.5" strokeOpacity="0.6"/>
                      {/* Inner panel */}
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#4ade80" strokeWidth="1" fill="#4ade80" fillOpacity="0.05"/>
                      {/* Step groove (second inner rect) */}
                      <rect x="20" y="17" width="40" height="22" rx="1" stroke="#4ade80" strokeWidth="0.8" strokeDasharray="2 1" strokeOpacity="0.4"/>
                      {/* Corner lines */}
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#4ade80" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#4ade80" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#4ade80" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#4ade80" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Slab" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Flat slab — just a simple rectangle with subtle edge bevel */}
                      <rect x="4" y="4" width="72" height="48" rx="1" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.6" fill="#f59e0b" fillOpacity="0.03"/>
                      {/* Edge chamfer lines */}
                      <line x1="4" y1="4" x2="8" y2="8" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="76" y1="4" x2="72" y2="8" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="4" y1="52" x2="8" y2="48" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="76" y1="52" x2="72" y2="48" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <text x="40" y="30" textAnchor="middle" fill="#f59e0b" fillOpacity="0.3" fontSize="8" fontFamily="monospace">FLAT</text>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-mono font-bold mb-1 ${
                    newDoor.type === "Shaker" ? "text-sky-400" :
                    newDoor.type === "Shaker Step" ? "text-green-400" : "text-amber-400"
                  }`}>{newDoor.type.toUpperCase()}</p>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    {newDoor.type === "Shaker" && "Classic frame-and-panel facade. A pocket is milled around the inner panel perimeter, creating a clean raised step."}
                    {newDoor.type === "Shaker Step" && "Two-step facade. An additional inner contour adds depth, requiring two milling passes for a layered profile."}
                    {newDoor.type === "Slab" && "Flat facade with no frame or panel. Contour cut only, no pocket milling. Minimal machining time."}
                  </p>
                </div>
              </div>

              <button onClick={handleAddDoor}
                className="cnc-btn-ghost w-full text-xs py-1.5">
                + Add Part
              </button>
            </section>

            {/* Parts table */}
            {doors.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-mono font-semibold text-cnc-text-muted uppercase tracking-widest whitespace-nowrap">
                    Parts ({doors.length})
                  </h3>
                  <hr className="flex-1 border-white/5" />
                  <button onClick={handleClear}
                    className="text-[10px] text-cnc-text-muted hover:text-red-400 transition-colors">
                    Clear All
                  </button>
                </div>
                <div className="overflow-x-auto max-h-40 overflow-y-auto rounded-lg border border-cnc-border">
                  <table className="w-full text-xs" id="parts-table">
                    <thead className="bg-cnc-card sticky top-0">
                      <tr className="text-cnc-text-muted">
                        <th className="py-1.5 px-2 text-left font-medium">ID</th>
                        <th className="py-1.5 px-2 text-center font-medium">W</th>
                        <th className="py-1.5 px-2 text-center font-medium">H</th>
                        <th className="py-1.5 px-2 text-center font-medium">Qty</th>
                        <th className="py-1.5 px-2 text-center font-medium">Type</th>
                        <th className="py-1.5 px-1 w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cnc-border/30">
                      {doors.map(d => {
                        const isEditing = (field) => editingCell?.id === d.id && editingCell?.field === field;
                        const cellCls = "py-0 px-0";
                        const numCell = (field) => isEditing(field) ? (
                          <input
                            autoFocus
                            type="number"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => commitEdit(d.id, field, editingValue)}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") commitEdit(d.id, field, editingValue); }}
                            className="w-full h-8 text-center font-mono text-xs bg-[#1a1a1a] text-[#C6F321] outline-none border-b border-[#C6F321]/60 px-1"
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(d.id, field, (field === "w" || field === "h") ? toDisplay(d[field]) : d[field])}
                            className="block w-full h-8 leading-8 text-center font-mono cursor-text hover:bg-white/5 hover:text-[#C6F321] transition-colors px-2"
                          >{(field === "w" || field === "h") ? toDisplay(d[field]) : d[field]}</span>
                        );

                        return (
                        <tr key={d.id} className="hover:bg-cnc-card/50 transition-colors">
                          <td className="py-1.5 px-2 font-mono text-cnc-accent">{d.id}</td>
                          <td className={cellCls}>{numCell("w")}</td>
                          <td className={cellCls}>{numCell("h")}</td>
                          <td className={cellCls}>{numCell("qty")}</td>
                          <td className="py-0 px-0 text-center">
                            {isEditing("type") ? (
                              <select
                                autoFocus
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(d.id, "type", editingValue)}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(d.id, "type", editingValue); }}
                                className="w-full h-8 text-center font-mono text-xs bg-[#1a1a1a] text-[#C6F321] outline-none border-b border-[#C6F321]/60 px-1"
                              >
                                <option className="bg-[#1A1A1A] text-white">Shaker</option>
                                <option className="bg-[#1A1A1A] text-white">Shaker Step</option>
                                <option className="bg-[#1A1A1A] text-white">Slab</option>
                              </select>
                            ) : (
                              <span
                                onClick={() => startEdit(d.id, "type", d.type)}
                                className={`inline-block cursor-pointer text-[10px] px-1.5 py-0.5 rounded-full border m-1
                                  hover:ring-1 hover:ring-white/30 transition-all
                                  ${d.type === "Shaker" ? "text-sky-400 border-sky-500/30 bg-sky-500/10" :
                                    d.type === "Shaker Step" ? "text-green-400 border-green-500/30 bg-green-500/10" :
                                    "text-amber-400 border-amber-500/30 bg-amber-500/10"}`}>
                                {d.type}
                              </span>
                            )}
                          </td>

                          <td className="py-1.5 px-1">
                            <button onClick={() => handleDeleteDoor(d.id)}
                              className="text-cnc-text-muted hover:text-red-400 text-xs transition-colors">
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
                className="cnc-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2">
                {isLoading === "nesting" ? (
                  <><Spinner /> Running Nesting...</>
                ) : (
                  <>
                    Run Nesting
                  </>
                )}
              </button>

              <button onClick={handleGenerateLabels}
                disabled={!!isLoading || doors.length === 0}
                className="cnc-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2 mt-2 text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10">
                {isLoading === "labels" ? (
                  <><Spinner /> Generating PDF...</>
                ) : (
                  <>Export PDF Labels</>
                )}
              </button>

              <button onClick={handleGenerate}
                disabled={!!isLoading || !nestingResult}
                className="cnc-btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2 mt-2 shadow-lg shadow-cnc-accent/10">
                {isLoading === "generating" ? (
                  <><Spinner /> Generating...</>
                ) : (
                  <>
                    Generate G-code
                  </>
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3
                              text-xs text-red-400 animate-fade-in">
                <p className="font-semibold mb-0.5">Error</p>
                <p>{error}</p>
              </div>
            )}

            {/* Nesting preview */}
            {nestingResult && (
              <section className="space-y-2 animate-fade-in">
                <h3 className="text-xs font-semibold text-cnc-text-muted uppercase tracking-wider
                               border-b border-cnc-border pb-1">
                  Nesting Preview
                </h3>
                <div className="rounded-lg border border-cnc-border overflow-hidden bg-cnc-bg">
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
              <CheckField label="Rough Pass" checked={settings.do_rough_pass}
                onChange={v => handleSettingsChange("do_rough_pass", v)} />
              <CheckField label="Allow Rotation" checked={settings.allow_rotation}
                onChange={v => handleSettingsChange("allow_rotation", v)} />
            </ParamSection>
          </div>
        )}

        {/* ── TOOL T6 TAB ──────────────────────────────── */}
        {activeSection === "tool" && settings && (
          <div className="space-y-4 animate-fade-in">
            <ParamSection title="T6 Pocket Cutter">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-cnc-text-muted w-28">T-number</label>
                <select value={settings.t6_name}
                  onChange={e => handleSettingsChange("t6_name", e.target.value)}
                  className="cnc-input text-xs py-1.5 flex-1">
                  {Array.from({length: 9}, (_, i) => `T${i+1}`).map(t =>
                    <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-cnc-text-muted w-28">Type</label>
                <div className="flex gap-3">
                  {["PCD", "TCT"].map(t => (
                    <label key={t} className="flex items-center gap-1.5 text-xs text-cnc-text cursor-pointer">
                      <input type="radio" name="toolType" value={t}
                        checked={settings.t6_type === t}
                        onChange={() => handleSettingsChange("t6_type", t)}
                        className="accent-cnc-accent" />
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
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all border
                      ${settings.pocket_strategy === s
                        ? "bg-cnc-accent/15 text-cnc-accent border-cnc-accent/30"
                        : "bg-cnc-card text-cnc-text-muted border-cnc-border hover:border-cnc-accent/20"}`}>
                    {s}
                  </button>
                ))}
              </div>
              <ParamField label="Step-over (%)" value={settings.spiral_overlap}
                onChange={v => handleSettingsChange("spiral_overlap", v)} />
            </ParamSection>

            <ParamSection title="Other Tools">
              <div className="grid grid-cols-3 gap-2 text-[10px] text-cnc-text-muted">
                <div className="bg-cnc-card rounded-lg p-2 border border-cnc-border">
                  <p className="font-semibold text-cnc-text mb-1">{settings.t2_tool_t} D4</p>
                  <p>Corner rest</p>
                  <p className="font-mono text-cnc-text">{toFeedDisplay(settings.t2_feed)} {feedLabel}</p>
                </div>
                <div className="bg-cnc-card rounded-lg p-2 border border-cnc-border">
                  <p className="font-semibold text-cnc-text mb-1">{settings.t3_tool_t} D6</p>
                  <p>Contour cut</p>
                  <p className="font-mono text-cnc-text">{toFeedDisplay(settings.t3_feed)} {feedLabel}</p>
                </div>
                <div className="bg-cnc-card rounded-lg p-2 border border-cnc-border">
                  <p className="font-semibold text-cnc-text mb-1">{settings.t5_tool_t} V90</p>
                  <p>Chamfer/Miter</p>
                  <p className="font-mono text-cnc-text">{toFeedDisplay(settings.t5_feed)} {feedLabel}</p>
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
      <h3 className="text-xs font-semibold text-cnc-text-muted uppercase tracking-wider
                     border-b border-cnc-border pb-1">{title}</h3>
      {children}
    </section>
  );
}

function ParamField({ label, value, onChange, step = "1", type = "number" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-cnc-text-muted whitespace-nowrap">{label}</label>
      <input type={type} value={value ?? ""} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="cnc-input w-24 text-right text-xs" />
    </div>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-cnc-accent w-3.5 h-3.5" />
      <span className="text-xs text-cnc-text-muted group-hover:text-cnc-text transition-colors">
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
