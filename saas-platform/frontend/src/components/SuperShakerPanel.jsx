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
  const [editingPreviewPart, setEditingPreviewPart] = useState(null);

  // Add door form state
  const [newDoor, setNewDoor] = useState({ w: 400, h: 600, qty: 4, type: "Shaker", grain: "None" });
  const [newOffcut, setNewOffcut] = useState({ w: 600, h: 400, qty: 1 });
  const [showCostSettings, setShowCostSettings] = useState(false);
  const [showOffcuts, setShowOffcuts] = useState(false);
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

  // ── Listen for events from InteractiveSheetView ───────
  useEffect(() => {
    const handleEditEvent = (e) => {
      const id = e.detail.id;
      setDoors(currentDoors => {
        const d = currentDoors.find(x => x.id === id);
        if (d) setEditingPreviewPart({ ...d });
        return currentDoors;
      });
    };
    
    const handleUpdateLayout = async (e) => {
      const newSheets = e.detail.sheets;
      setNestingResult(prev => {
        if (!prev) return prev;
        const newNesting = { ...prev, sheets: newSheets };
        updateNestingResult(newNesting).catch(err => console.error("Failed to sync layout", err));
        return newNesting;
      });
    };

    document.addEventListener('edit-door-part', handleEditEvent);
    document.addEventListener('update-nesting-layout', handleUpdateLayout);

    return () => {
      document.removeEventListener('edit-door-part', handleEditEvent);
      document.removeEventListener('update-nesting-layout', handleUpdateLayout);
    };
  }, []);

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--ss-text-muted)" }}>
        <p>Connecting to backend…</p>
      </div>
    );
  }

  const typeColors = {
    "Shaker":           { text: "#60A5FA", border: "rgba(96,165,250,0.3)",  bg: "rgba(96,165,250,0.08)" },
    "Shaker Step":      { text: "#84CC16", border: "rgba(132,204,22,0.3)", bg: "rgba(132,204,22,0.08)" },
    "Slab":             { text: "#F97316", border: "rgba(249,115,22,0.3)", bg: "rgba(249,115,22,0.08)" },
    "Grooved Slab":     { text: "#14B8A6", border: "rgba(20,184,166,0.3)", bg: "rgba(20,184,166,0.08)" },
    "Beaded Shaker":    { text: "#A855F7", border: "rgba(168,85,247,0.3)", bg: "rgba(168,85,247,0.08)" },
    "Thin Rail Shaker": { text: "#F43F5E", border: "rgba(244,63,94,0.3)",  bg: "rgba(244,63,94,0.08)" },
  };

  // ═══════════════════════════════════════════════════════
  return (
    <div className="h-full overflow-y-auto" id="supershaker-panel" style={{ backgroundColor: "transparent" }}>
      <div className="p-4 space-y-4">

        {/* ── KPI Bar ─────────────────────────────────── */}
        {nestingResult && (
          <div className="grid grid-cols-4 gap-2 animate-fade-in" id="kpi-bar">
            {[
              { label: "Sheets", value: nestingResult.total_sheets, borderColor: "var(--ss-violet)" },
              { label: "Parts", value: nestingResult.total_parts, borderColor: "var(--ss-cyan)" },
              { label: "Yield", value: `${nestingResult.yield_percentage}%`, borderColor: "var(--ss-green)", valueColor: "var(--ss-green)" },
              { label: "Area", value: `${nestingResult.total_area_m2}m²`, borderColor: "var(--ss-orange)" },
            ].map(k => (
              <div key={k.label} className="ss-kpi" style={{ borderLeftColor: k.borderColor }}>
                <p className="ss-kpi-label">{k.label}</p>
                <p className="ss-kpi-value" style={{ color: k.valueColor || "var(--ss-text)" }}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Section Tabs ────────────────────────────── */}
        <div className="ss-segment">
          {[
            { key: "workflow", label: "Workflow" },
            { key: "params", label: "Parameters" },
            { key: "tool", label: "Tool T6" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`ss-segment-btn ${activeSection === tab.key ? "active" : ""}`}
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
              <span className="ss-section-title">Units</span>
              <div className="ss-segment w-[120px]">
                <button onClick={() => setUseInch(false)}
                  className={`ss-segment-btn ${!useInch ? "active" : ""}`}
                  style={{ fontSize: 10 }}>
                  MM
                </button>
                <button onClick={() => setUseInch(true)}
                  className={`ss-segment-btn ${useInch ? "active" : ""}`}
                  style={{ fontSize: 10 }}>
                  INCH
                </button>
              </div>
            </div>

            {/* Order # */}
            <div className="flex items-center gap-2">
              <label className="text-xs whitespace-nowrap w-16 flex items-center gap-1" style={{ color: "var(--ss-text-muted)" }}>
                <span style={{ color: "var(--ss-violet)", opacity: 0.6 }}>#</span> Order
              </label>
              <input
                type="text"
                value={settings.order_id}
                onChange={e => handleSettingsChange("order_id", e.target.value)}
                className="ss-input flex-1 text-xs"
                placeholder="e.g. ORD-2026-001"
              />
            </div>
            
            {/* Cost Settings */}
            <div className="flex flex-col gap-2 p-2 rounded-lg" style={{ backgroundColor: "var(--ss-input-bg)", border: "1px solid var(--ss-border)" }}>
              <button 
                onClick={() => setShowCostSettings(!showCostSettings)}
                className="flex items-center justify-between text-xs cursor-pointer w-full text-left transition-colors"
                style={{ color: "var(--ss-text-muted)" }}>
                <span className="ss-section-title">Job Costing Setup</span>
                <span style={{ color: "var(--ss-violet)" }}>{showCostSettings ? '▼' : '▶'}</span>
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
                <h3 className="ss-section-title whitespace-nowrap">Add Part</h3>
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
                    <option value="Grooved Slab">Grooved Slab</option>
                    <option value="Beaded Shaker">Beaded Shaker</option>
                    <option value="Thin Rail Shaker">Thin Rail Shaker</option>
                  </select>
                </div>
              </div>

              {/* Facade Preview */}
              <div className="rounded-lg p-3 flex gap-3 items-start animate-fade-in" key={newDoor.type}
                   style={{ backgroundColor: "var(--ss-input-bg)", border: `1px solid ${typeColors[newDoor.type]?.border || 'var(--ss-border)'}` }}>
                <div className="w-24 h-20 flex-shrink-0 rounded flex items-center justify-center"
                     style={{ backgroundColor: "var(--ss-bg)", border: `1px solid ${typeColors[newDoor.type]?.border || 'var(--ss-border)'}` }}>
                  {newDoor.type === "Shaker" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#60A5FA" strokeWidth="1.5" strokeOpacity="0.6"/>
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#60A5FA" strokeWidth="1" fill="#60A5FA" fillOpacity="0.05"/>
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#60A5FA" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#60A5FA" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#60A5FA" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#60A5FA" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Shaker Step" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#84CC16" strokeWidth="1.5" strokeOpacity="0.6"/>
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#84CC16" strokeWidth="1" fill="#84CC16" fillOpacity="0.05"/>
                      <rect x="20" y="17" width="40" height="22" rx="1" stroke="#84CC16" strokeWidth="0.8" strokeDasharray="2 1" strokeOpacity="0.4"/>
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#84CC16" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#84CC16" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#84CC16" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#84CC16" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Slab" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="1" stroke="#F97316" strokeWidth="1.5" strokeOpacity="0.6" fill="#F97316" fillOpacity="0.03"/>
                      <line x1="4" y1="4" x2="8" y2="8" stroke="#F97316" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="76" y1="4" x2="72" y2="8" stroke="#F97316" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="4" y1="52" x2="8" y2="48" stroke="#F97316" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <line x1="76" y1="52" x2="72" y2="48" stroke="#F97316" strokeWidth="0.5" strokeOpacity="0.25"/>
                      <text x="40" y="30" textAnchor="middle" fill="#F97316" fillOpacity="0.3" fontSize="8" fontFamily="monospace">FLAT</text>
                    </svg>
                  )}
                  {newDoor.type === "Grooved Slab" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="1" stroke="#14B8A6" strokeWidth="1.5" strokeOpacity="0.6" fill="#14B8A6" fillOpacity="0.03"/>
                      <line x1="28" y1="4" x2="28" y2="52" stroke="#14B8A6" strokeWidth="0.8" strokeDasharray="2 1" strokeOpacity="0.5"/>
                      <line x1="40" y1="4" x2="40" y2="52" stroke="#14B8A6" strokeWidth="0.8" strokeDasharray="2 1" strokeOpacity="0.5"/>
                      <line x1="52" y1="4" x2="52" y2="52" stroke="#14B8A6" strokeWidth="0.8" strokeDasharray="2 1" strokeOpacity="0.5"/>
                    </svg>
                  )}
                  {newDoor.type === "Beaded Shaker" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#A855F7" strokeWidth="1.5" strokeOpacity="0.6"/>
                      <rect x="14" y="12" width="52" height="32" rx="1" stroke="#A855F7" strokeWidth="1.5" strokeOpacity="0.8"/>
                      <rect x="16" y="14" width="48" height="28" rx="0.5" stroke="#A855F7" strokeWidth="0.5" strokeOpacity="0.4" fill="#A855F7" fillOpacity="0.05"/>
                      <line x1="14" y1="12" x2="4" y2="4" stroke="#A855F7" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="12" x2="76" y2="4" stroke="#A855F7" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="14" y1="44" x2="4" y2="52" stroke="#A855F7" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="66" y1="44" x2="76" y2="52" stroke="#A855F7" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                  {newDoor.type === "Thin Rail Shaker" && (
                    <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
                      <rect x="4" y="4" width="72" height="48" rx="2" stroke="#F43F5E" strokeWidth="1.5" strokeOpacity="0.6"/>
                      <rect x="10" y="9" width="60" height="38" rx="1" stroke="#F43F5E" strokeWidth="1" fill="#F43F5E" fillOpacity="0.05"/>
                      <line x1="10" y1="9" x2="4" y2="4" stroke="#F43F5E" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="70" y1="9" x2="76" y2="4" stroke="#F43F5E" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="10" y1="47" x2="4" y2="52" stroke="#F43F5E" strokeWidth="0.5" strokeOpacity="0.3"/>
                      <line x1="70" y1="47" x2="76" y2="52" stroke="#F43F5E" strokeWidth="0.5" strokeOpacity="0.3"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold mb-1" style={{ color: typeColors[newDoor.type]?.text }}>{newDoor.type.toUpperCase()}</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--ss-text-muted)" }}>
                    {newDoor.type === "Shaker" && "Classic frame-and-panel facade. A pocket is milled around the inner panel perimeter, creating a clean raised step."}
                    {newDoor.type === "Shaker Step" && "Two-step facade. An additional inner contour adds depth, requiring two milling passes for a layered profile."}
                    {newDoor.type === "Slab" && "Flat facade with no frame or panel. Contour cut only, no pocket milling. Minimal machining time."}
                    {newDoor.type === "Grooved Slab" && "Slab with routed vertical/horizontal grooves. Very trendy in modern kitchens, simple to machine."}
                    {newDoor.type === "Beaded Shaker" && "Existing Shaker + a bead detail routed on the inner frame edge. Popular in traditional/farmhouse styles."}
                    {newDoor.type === "Thin Rail Shaker" && "Same as Shaker but with narrower stiles/rails. Huge in Scandinavian and contemporary design."}
                  </p>
                </div>
              </div>

              <button onClick={handleAddDoor}
                className="w-full text-xs py-2 rounded-lg transition-all cursor-pointer group"
                style={{ border: "1px dashed rgba(108,99,255,0.4)", color: "var(--ss-violet)", backgroundColor: "transparent" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ss-violet)'; e.currentTarget.style.backgroundColor = 'rgba(108,99,255,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(108,99,255,0.4)'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <span className="inline-block transition-transform group-hover:rotate-90">+</span> Add Part
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
              <div 
                className="flex items-center gap-3 px-1 cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => setShowOffcuts(!showOffcuts)}
              >
                <h3 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2"
                    style={{ color: "var(--ss-orange)" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v4"/><polyline points="15 3 21 9 21 21s-1.5-1-4-1-4 1-4 1V9"/><line x1="2" x2="22" y1="9" y2="9"/><line x1="7" x2="7" y1="3" y2="9"/></svg>
                  Offcuts / Remnants Inventory
                </h3>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,140,0,0.15)", color: "var(--ss-orange)" }}>
                  {offcuts.length} pieces
                </span>
                <span className="text-[10px]" style={{ color: "var(--ss-orange)" }}>
                  {showOffcuts ? '▼' : '▶'}
                </span>
                <hr className="flex-1 opacity-20" style={{ borderColor: "var(--ss-border)" }} />
              </div>

              {showOffcuts && (
                <div className="space-y-3 animate-fade-in animate-duration-150">
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
                </div>
              )}
            </section>

            {/* Workflow buttons */}
            <div className="space-y-2">
              <button onClick={handleNesting}
                disabled={!!isLoading || doors.length === 0}
                className="ss-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2"
                style={{ borderColor: "rgba(108,99,255,0.4)", color: "var(--ss-violet)" }}>
                {isLoading === "nesting" ? (
                  <><Spinner /> Running Nesting…</>
                ) : (
                  "Run Nesting"
                )}
              </button>

              <button onClick={handleGenerateLabels}
                disabled={!!isLoading || doors.length === 0}
                className="ss-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2"
                style={{ borderColor: "rgba(0,207,222,0.3)", color: "var(--ss-cyan)" }}>
                {isLoading === "labels" ? (
                  <><Spinner /> Generating PDF…</>
                ) : (
                  "Export PDF Labels"
                )}
              </button>

              <button onClick={handleCuttingMap}
                disabled={!!isLoading || !nestingResult}
                className="ss-btn-ghost w-full text-sm py-2.5 flex items-center justify-center gap-2"
                style={{ borderColor: "rgba(0,207,222,0.3)", color: "var(--ss-cyan)" }}>
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
                <h3 className="ss-section-title mb-2 pb-1"
                    style={{ color: "var(--ss-violet)", borderBottom: "1px solid rgba(108,99,255,0.15)" }}>
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
                    <span className="font-mono font-bold text-lg" style={{ color: "var(--ss-violet)" }}>${nestingResult.costing.total_estimate?.toFixed(2)}</span>
                  </div>
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

              {/* ── Small Part Tabs (Bridges) ─────────────────── */}
              <div className="mt-1 pt-2 space-y-1.5" style={{ borderTop: "1px dashed var(--ss-border)" }}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"
                    style={{ color: "var(--ss-text-muted)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
                      <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    Tabs / Bridges
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                    style={{ backgroundColor: "var(--ss-input-bg)", color: "var(--ss-text-muted)", border: "1px solid var(--ss-border)" }}>
                    ≤ {((settings.small_part_threshold || 0.05) * 1e4).toFixed(0)} cm²
                  </span>
                </div>
                <CheckField
                  label="Tabs on Small Parts"
                  checked={settings.do_tabs ?? true}
                  onChange={v => handleSettingsChange("do_tabs", v)}
                  disabled={!settings.do_cutout}
                />
                {settings.do_tabs && settings.do_cutout && (
                  <div className="pl-3 space-y-1.5 animate-fade-in" style={{ borderLeft: "2px solid var(--ss-border)" }}>
                    <ParamField
                      label={`Tab Height (${unitLabel})`}
                      value={toDisplay(settings.tab_height ?? 0.4)}
                      onChange={v => handleSettingsChange("tab_height", fromDisplay(parseFloat(v) || 0.4))}
                      step="0.1"
                    />
                    <ParamField
                      label={`Tab Width (${unitLabel})`}
                      value={toDisplay(settings.tab_width ?? 4.0)}
                      onChange={v => handleSettingsChange("tab_width", fromDisplay(parseFloat(v) || 4.0))}
                      step="0.5"
                    />
                    <p className="text-[9px] leading-snug" style={{ color: "var(--ss-text-muted)" }}>
                      Bridges keep small parts on the vacuum table during final cutout.
                      Snap them off by hand after unclamping.
                    </p>
                  </div>
                )}
              </div>
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
  "Shaker":           { bg: "rgba(96,165,250,0.15)",  border: "#60A5FA", text: "#93C5FD" },
  "Shaker Step":      { bg: "rgba(132,204,22,0.15)",  border: "#84CC16", text: "#BEF264" },
  "Slab":             { bg: "rgba(249,115,22,0.15)",  border: "#F97316", text: "#FB923C" },
  "Grooved Slab":     { bg: "rgba(20,184,166,0.15)",  border: "#14B8A6", text: "#2DD4BF" },
  "Beaded Shaker":    { bg: "rgba(168,85,247,0.15)",  border: "#A855F7", text: "#C084FC" },
  "Thin Rail Shaker": { bg: "rgba(244,63,94,0.15)",   border: "#F43F5E", text: "#FB7185" },
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
