/**
 * GcodeViewerPanel.jsx — Right panel: 3D G-code viewer
 * Wraps ThreeViewer with stats overlay, layer controls, and file controls.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import ThreeViewer from "./ThreeViewer.jsx";
import { readGcodeFile, parseGcode, downloadGcode, uploadBatchExcel } from "../services/EngineClient.js";

// ── Layer definitions ──────────────────────────────────────
const LAYER_DEFS = [
  { key: "pocket",  label: "Pocket",   color: "#f97316", desc: "Pocketing spiral passes" },
  { key: "contour", label: "Contour",  color: "#84cc16", desc: "Contour / profile passes" },
  { key: "step",    label: "Step",     color: "#a855f7", desc: "Step contour passes" },
  { key: "unknown", label: "Other",    color: "#94a3b8", desc: "Untagged cut moves" },
  { key: "rapid",   label: "Rapids",   color: "#38bdf8", desc: "Rapid positioning moves" },
];

const DEFAULT_VISIBLE = { rapid: true, pocket: true, contour: true, step: true, unknown: true };

// ── Small utility components ───────────────────────────────
function LayerRow({ def, checked, onChange }) {
  return (
    <label
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
      style={{ backgroundColor: checked ? `${def.color}12` : "transparent" }}
    >
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        style={{ backgroundColor: def.color, opacity: checked ? 1 : 0.3 }}
      />
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={e => onChange(def.key, e.target.checked)}
      />
      <span className="text-xs font-medium flex-1" style={{ color: checked ? "var(--ss-text)" : "var(--ss-text-muted)" }}>
        {def.label}
      </span>
      <span className="text-[10px]" style={{ color: "var(--ss-text-muted)" }}>{def.desc}</span>
    </label>
  );
}

export default function GcodeViewerPanel({
  onDoorsImported,
  gcodeData,
  gcodeText,
  stats,
  allSheets,
  orderId,
  nestingResult = null,
  settings      = null,
}) {
  const [activeSheet, setActiveSheet]       = useState(0);
  const [localGcode, setLocalGcode]         = useState(null);
  const [localGcodeData, setLocalGcodeData] = useState(null);
  const [showGcodeText, setShowGcodeText]   = useState(false);

  // ── Toolpath layer controls ──────────────────────────────
  const [visibleLayers, setVisibleLayers]   = useState(DEFAULT_VISIBLE);
  const [colorMode, setColorMode]           = useState("type");   // "type" | "depth"
  const [toolProgress, setToolProgress]     = useState(0);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const layersPanelRef = useRef(null);

  // Close layers panel on outside click
  useEffect(() => {
    if (!showLayersPanel) return;
    const onClick = (e) => {
      if (layersPanelRef.current && !layersPanelRef.current.contains(e.target))
        setShowLayersPanel(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showLayersPanel]);

  const toggleLayer = useCallback((key, value) => {
    setVisibleLayers(prev => ({ ...prev, [key]: value }));
  }, []);

  const displayData  = localGcodeData || gcodeData;
  const displayText  = localGcode     || gcodeText;
  const currentStats = allSheets ? allSheets[activeSheet]?.stats : stats;

  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [isDragging, setIsDragging]             = useState(false);

  // ── Drag & Drop ──────────────────────────────────────────
  const handleDragOver  = useCallback((e) => { e.preventDefault(); setIsDragging(true);  }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".csv")) {
      setIsUploadingExcel(true);
      try {
        await uploadBatchExcel(file);
        if (onDoorsImported) onDoorsImported();
      } catch (err) {
        console.error("Failed to upload excel batch:", err);
        alert("Failed to import batch parts: " + err.message);
      } finally { setIsUploadingExcel(false); }
    } else {
      try {
        const text = await readGcodeFile(file);
        const parsed = parseGcode(text);
        setLocalGcode(text);
        setLocalGcodeData(parsed);
      } catch (err) { console.error("Failed to read dropped file as G-code:", err); }
    }
  }, [onDoorsImported]);

  // ── Excel upload ─────────────────────────────────────────
  const handleExcelUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingExcel(true);
    try {
      await uploadBatchExcel(file);
      if (onDoorsImported) onDoorsImported();
    } catch (err) {
      console.error("Failed to upload excel batch:", err);
      alert("Failed to import batch parts: " + err.message);
    } finally { setIsUploadingExcel(false); e.target.value = ""; }
  }, [onDoorsImported]);

  // ── G-code file upload ───────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readGcodeFile(file);
      const parsed = parseGcode(text);
      setLocalGcode(text);
      setLocalGcodeData(parsed);
    } catch (err) { console.error("Failed to read file:", err); }
    e.target.value = "";
  }, []);

  // ── Sync with props ──────────────────────────────────────
  React.useEffect(() => {
    setLocalGcode(null);
    setLocalGcodeData(null);
    setActiveSheet(0);
    setToolProgress(0);
  }, [gcodeData, allSheets]);

  // ── Sheet switch ─────────────────────────────────────────
  const handleSheetSwitch = useCallback((idx) => {
    if (!allSheets || !allSheets[idx]) return;
    const sheet = allSheets[idx];
    const parsed = parseGcode(sheet.gcode);
    setLocalGcode(sheet.gcode);
    setLocalGcodeData(parsed);
    setActiveSheet(idx);
    setToolProgress(0);
  }, [allSheets]);

  // ── Download ─────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (displayText) {
      const sheetNum = allSheets ? activeSheet + 1 : 1;
      let filename = orderId ? `${orderId}_sheet${sheetNum}.gcode` : `toolpath_sheet${sheetNum}.gcode`;
      filename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      downloadGcode(displayText, filename);
    }
  }, [displayText, activeSheet, allSheets, orderId]);

  const toolbarBtnStyle = {
    backgroundColor: "var(--ss-card)",
    border: "1px solid var(--ss-border)",
    color: "var(--ss-text-muted)",
  };

  // ── Stats computed from displayData ──────────────────────
  const passCountLabel = displayData?.cutByPass
    ? Object.entries(displayData.cutByPass)
        .filter(([, segs]) => segs.length > 0)
        .map(([k, segs]) => `${segs.length.toLocaleString()} ${k}`)
        .join(" · ")
    : null;

  return (
    <div
      className={`h-full flex flex-col transition-colors duration-200`}
      id="gcode-viewer-panel"
      style={{
        backgroundColor: isDragging ? "var(--ss-surface)" : "var(--ss-bg)",
        outline: isDragging ? "2px solid var(--ss-accent)" : "none",
        outlineOffset: "-2px",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-lg m-2"
             style={{ backgroundColor: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}>
          <div className="text-center p-8 rounded-2xl"
               style={{ backgroundColor: "var(--ss-card)", border: "2px dashed var(--ss-accent)", boxShadow: "var(--ss-shadow-lg)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"
                 stroke="var(--ss-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                 className="mx-auto mb-4 animate-bounce">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <p className="font-bold text-xl mb-1" style={{ color: "var(--ss-accent)" }}>Drop file to import</p>
            <p className="text-xs" style={{ color: "var(--ss-text-muted)" }}>Supports .xlsx, .csv (Batch) or .nc (Toolpath)</p>
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 p-2 border-b backdrop-blur-sm flex-shrink-0"
        style={{ backgroundColor: "var(--ss-toolbar-bg)", borderColor: "var(--ss-border)" }}
      >
        {/* Sheet tabs */}
        {allSheets && allSheets.length > 1 && (
          <div className="flex gap-1 mr-2">
            {allSheets.map((_, i) => (
              <button key={i}
                onClick={() => handleSheetSwitch(i)}
                className="px-2.5 py-1 rounded-md text-xs font-mono transition-all"
                style={{
                  backgroundColor: activeSheet === i ? "var(--ss-accent-soft)" : "transparent",
                  color: activeSheet === i ? "var(--ss-accent)" : "var(--ss-text-muted)",
                  border: activeSheet === i ? "1px solid rgba(132,204,22,0.25)" : "1px solid transparent",
                }}>
                S{i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Stats */}
        {displayData && (
          <div
            className="flex items-center gap-4 mr-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}
          >
            <div className="flex gap-3 text-xs font-mono whitespace-nowrap" style={{ color: "var(--ss-text-muted)" }}>
              <span title="Cut moves">
                <span className="text-green-500">●</span> {(displayData.cut?.length || 0).toLocaleString()} cut
              </span>
              <span title="Rapid moves">
                <span className="text-yellow-500">●</span> {(displayData.rapid?.length || 0).toLocaleString()} rapid
              </span>
              {displayData.pathLengthMm > 0 && (
                <span title="Total path length" className="text-sky-400">
                  {displayData.pathLengthMm > 1000
                    ? `${(displayData.pathLengthMm / 1000).toFixed(1)} m`
                    : `${displayData.pathLengthMm} mm`}
                </span>
              )}
            </div>

            {currentStats?.total_time_sec > 0 && (
              <>
                <div className="w-[1px] h-4" style={{ backgroundColor: "var(--ss-border)" }} />
                <div className="flex gap-4 text-xs font-mono whitespace-nowrap">
                  <span title="Total Machining Time" className="font-semibold flex items-center gap-1.5" style={{ color: "var(--ss-accent)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {currentStats.total_time_formatted}
                  </span>
                  <span title="Cut Time" className="text-green-500">
                    {currentStats.cut_time_sec < 60 ? `${Math.round(currentStats.cut_time_sec)}s` : `${Math.floor(currentStats.cut_time_sec / 60)}m`} cut
                  </span>
                  <span title="Rapid Time" className="text-yellow-500">
                    {currentStats.rapid_time_sec < 60 ? `${Math.round(currentStats.rapid_time_sec)}s` : `${Math.floor(currentStats.rapid_time_sec / 60)}m`} rap
                  </span>
                  <span title="Distance" className="text-sky-500">
                    {currentStats.total_distance_mm > 1000
                      ? `${(currentStats.total_distance_mm / 1000).toFixed(1)}m`
                      : `${Math.round(currentStats.total_distance_mm)}mm`}
                  </span>
                  <span title="Tool Changes" className="text-purple-400 font-semibold">
                    {currentStats.tool_changes}T
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Layers button + popover ─────────────────────── */}
        <div className="relative" ref={layersPanelRef}>
          <button
            onClick={() => setShowLayersPanel(p => !p)}
            disabled={!displayData}
            title="Layer visibility & tool simulation"
            className="h-10 px-3 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold"
            style={{
              backgroundColor: showLayersPanel ? "var(--ss-accent-soft)" : "var(--ss-card)",
              border: showLayersPanel ? "1px solid rgba(132,204,22,0.3)" : "1px solid var(--ss-border)",
              color: showLayersPanel ? "var(--ss-accent)" : "var(--ss-text-muted)",
            }}
          >
            {/* Layers icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            Layers
          </button>

          {showLayersPanel && (
            <div
              className="absolute right-0 top-12 z-50 w-72 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
              style={{
                backgroundColor: "var(--ss-surface)",
                border: "1px solid var(--ss-border)",
                boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
              }}
            >
              {/* Header */}
              <div className="px-3 pt-3 pb-2 border-b" style={{ borderColor: "var(--ss-border)" }}>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--ss-text-muted)" }}>
                  Toolpath Layers
                </p>
              </div>

              {/* Layer toggles */}
              <div className="px-2 py-2 space-y-0.5">
                {LAYER_DEFS.map(def => (
                  <LayerRow
                    key={def.key}
                    def={def}
                    checked={visibleLayers[def.key] !== false}
                    onChange={toggleLayer}
                  />
                ))}
              </div>

              {/* Colour mode */}
              <div className="px-3 py-2 border-t" style={{ borderColor: "var(--ss-border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--ss-text-muted)" }}>
                  Colour Mode
                </p>
                <div className="flex gap-2">
                  {[
                    { id: "type",  label: "By Type" },
                    { id: "pass",  label: "By Pass" },
                    { id: "depth", label: "By Z-Depth" },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setColorMode(m.id)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        backgroundColor: colorMode === m.id ? "var(--ss-accent-soft)" : "var(--ss-card)",
                        color: colorMode === m.id ? "var(--ss-accent)" : "var(--ss-text-muted)",
                        border: `1px solid ${colorMode === m.id ? "rgba(132,204,22,0.25)" : "var(--ss-border)"}`,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {colorMode === "depth" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: "#22d3ee" }}>Surface</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: "linear-gradient(to right, #22d3ee, #a855f7, #c026d3)" }} />
                    <span className="text-[10px]" style={{ color: "#c026d3" }}>Deep</span>
                  </div>
                )}
              </div>

              {/* Tool simulation scrubber */}
              <div className="px-3 py-3 border-t" style={{ borderColor: "var(--ss-border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ss-text-muted)" }}>
                    Tool Simulation
                  </p>
                  <span className="text-[10px] font-mono" style={{ color: "var(--ss-accent)" }}>
                    {Math.round(toolProgress * 100)}%
                  </span>
                </div>

                {/* Scrubber slider */}
                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={Math.round(toolProgress * 1000)}
                  onChange={e => setToolProgress(parseInt(e.target.value) / 1000)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: "var(--ss-accent)",
                    background: `linear-gradient(to right, var(--ss-accent) ${toolProgress * 100}%, var(--ss-border) ${toolProgress * 100}%)`,
                  }}
                />

                <div className="flex justify-between mt-1">
                  <button
                    onClick={() => setToolProgress(0)}
                    className="text-[10px] transition-colors hover:text-sky-400"
                    style={{ color: "var(--ss-text-muted)" }}
                  >
                    ↤ Start
                  </button>
                  <button
                    onClick={() => setToolProgress(1)}
                    className="text-[10px] transition-colors hover:text-sky-400"
                    style={{ color: "var(--ss-text-muted)" }}
                  >
                    End ↦
                  </button>
                </div>

                {/* Z-depth info */}
                {displayData?.zRange && (
                  <div className="mt-2 flex justify-between text-[10px] font-mono" style={{ color: "var(--ss-text-muted)" }}>
                    <span>Z min: <span style={{ color: "#c026d3" }}>{displayData.zRange.min.toFixed(2)}</span> mm</span>
                    <span>Z max: <span style={{ color: "#22d3ee" }}>{displayData.zRange.max.toFixed(2)}</span> mm</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3D / G-code text toggle */}
        <div
          className="relative flex items-center rounded-lg p-1 w-[170px] cursor-pointer"
          style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}
        >
          <div
            className="absolute top-1 bottom-1 w-[78px] rounded-md transition-transform duration-300 ease-out"
            style={{
              backgroundColor: "var(--ss-accent-soft)",
              border: "1px solid rgba(132,204,22,0.2)",
              transform: showGcodeText ? "translateX(80px)" : "translateX(0px)",
            }}
          />
          <button
            disabled={!displayData && !displayText}
            onClick={() => setShowGcodeText(false)}
            className="relative z-10 flex-1 text-center text-xs font-semibold py-1.5 transition-all select-none"
            style={{ color: !showGcodeText ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
            3D View
          </button>
          <button
            disabled={!displayData && !displayText}
            onClick={() => setShowGcodeText(true)}
            className="relative z-10 flex-1 text-center text-xs font-semibold py-1.5 transition-all select-none"
            style={{ color: showGcodeText ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
            G-Code
          </button>
        </div>

        {/* Excel Batch Upload */}
        <label
          className="w-10 h-10 rounded-lg cursor-pointer transition-all flex items-center justify-center active:scale-95"
          style={toolbarBtnStyle}
          title="Excel Batch Import (.xlsx, .csv)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
            <path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/>
          </svg>
          <input type="file" accept=".xlsx,.csv" className="hidden"
                 disabled={isUploadingExcel} onChange={handleExcelUpload} />
        </label>

        {/* G-code Upload */}
        <label
          className="w-10 h-10 rounded-lg cursor-pointer transition-all flex items-center justify-center active:scale-95"
          style={toolbarBtnStyle}
          title="Upload G-code file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <input type="file" accept=".nc,.gcode,.ngc,.txt" className="hidden" onChange={handleFileUpload} />
        </label>

        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={!displayText}
          className="w-10 h-10 rounded-lg transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          style={toolbarBtnStyle}
          title="Download G-code"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
        </button>
      </div>

      {/* ── 3D View or G-code text ──────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {showGcodeText && displayText ? (
          <pre
            className="absolute inset-0 overflow-auto p-4 text-[11px] font-mono leading-tight"
            style={{ backgroundColor: "var(--ss-bg)", color: "var(--ss-text)" }}
          >
            {displayText}
          </pre>
        ) : displayData ? (
          <ThreeViewer
            gcodeData={displayData}
            bedWidth={currentStats?.sheet_w}
            bedHeight={currentStats?.sheet_h}
            visibleLayers={visibleLayers}
            colorMode={colorMode}
            toolProgress={toolProgress}
            nestingResult={nestingResult}
            settings={settings}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3"
               style={{ color: "var(--ss-text-muted)" }}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)", color: "var(--ss-accent)", opacity: 0.5 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15.5 15.5 4.6 4.6a2.1 2.1 0 1 1-2.9 2.9l-4.6-4.6"/>
                <path d="M21.1 21.1 19 19"/>
                <path d="m5 16 1.4-1.4c.5-.5 1.4-.4 1.8.1.3.4.2 1-.1 1.4L6.9 17.3c-.4.4-1 .3-1.4-.1-.4-.5-.3-1.1.1-1.5L7 14.3c.4-.4.3-1.1-.1-1.5-.5-.4-1.4-.3-1.8.1L3.9 14.1c1.5 2.1 4.1 3 6.6 2.3l4.6 4.6"/>
                <path d="M12.9 2.4A7.9 7.9 0 0 0 5 9.1c0 1.2.3 2.5 1 3.5l4-1.4a.5.5 0 0 1 .6.6l-1.4 4c1 .7 2.3 1 3.5 1a7.9 7.9 0 0 0 7.4-10.5 7.9 7.9 0 0 0-7.2-4.3z"/>
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--ss-text)" }}>No G-code loaded</p>
            <p className="text-xs text-center max-w-[200px]">
              Run nesting and generate G-code from the SuperShaker panel, or upload a .nc file
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
