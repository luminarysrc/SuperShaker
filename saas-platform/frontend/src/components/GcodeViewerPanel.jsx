/**
 * GcodeViewerPanel.jsx — Right panel: 3D G-code viewer
 * Wraps ThreeViewer with stats overlay, layer controls, and file controls.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import ThreeViewer from "./ThreeViewer.jsx";
import InteractiveSheetView from "./InteractiveSheetView.jsx";
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
  // viewMode: "3d" | "gcode" | "sheet"
  const [viewMode, setViewMode]             = useState("sheet");

  // ── Toolpath layer controls ──────────────────────────────
  const [visibleLayers, setVisibleLayers]   = useState(DEFAULT_VISIBLE);
  const [colorMode, setColorMode]           = useState("type");   // "type" | "depth" | "pass"
  const [toolProgress, setToolProgress]     = useState(0);

  // ── New: fit trigger, playback state ────────────────────
  const [fitTrigger, setFitTrigger]   = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [playSpeed, setPlaySpeed]     = useState(1);
  const animFrameRef                  = useRef(null);
  const lastTimeRef                   = useRef(null);

  // ── Import Modal State ───────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importConfig, setImportConfig] = useState({ unit: "cm", source: "generic" });
  const [pendingFile, setPendingFile] = useState(null);



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
      setPendingFile(file);
      setShowImportModal(true);
    } else {
      try {
        const text = await readGcodeFile(file);
        const parsed = parseGcode(text);
        setLocalGcode(text);
        setLocalGcodeData(parsed);
      } catch (err) { console.error("Failed to read dropped file as G-code:", err); }
    }
  }, []);

  // ── Excel upload ─────────────────────────────────────────
  const handleExcelUpload = useCallback(async (file) => {
    if (!file) return;
    setIsUploadingExcel(true);
    try {
      await uploadBatchExcel(file, importConfig);
      if (onDoorsImported) onDoorsImported();
      setShowImportModal(false);
      setPendingFile(null);
    } catch (err) {
      console.error("Failed to upload excel batch:", err);
      alert("Failed to import batch parts: " + err.message);
    } finally { setIsUploadingExcel(false); }
  }, [onDoorsImported, importConfig]);

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
    setIsPlaying(false);
    // When G-code arrives, switch to 3D; when nesting arrives without gcode, go to sheet map
    if (gcodeData || allSheets) setViewMode("3d");
  }, [gcodeData, allSheets]);

  React.useEffect(() => {
    if (nestingResult && !gcodeData && !allSheets) setViewMode("sheet");
  }, [nestingResult, gcodeData, allSheets]);

  // ── Tool simulation playback loop ────────────────────────
  React.useEffect(() => {
    if (!isPlaying || !displayData) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = null;
      return;
    }
    const animate = (time) => {
      if (lastTimeRef.current !== null) {
        const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
        setToolProgress(prev => {
          const next = prev + dt * playSpeed * 0.022;
          if (next >= 1) { setIsPlaying(false); return 1; }
          return next;
        });
      }
      lastTimeRef.current = time;
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = null;
    };
  }, [isPlaying, playSpeed, displayData]);

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

  // ── Per-pass segment chips for toolbar ───────────────────
  const PASS_CHIP_DEFS = [
    { key: "pocket",  color: "#f97316", label: "pkt" },
    { key: "contour", color: "#84cc16", label: "ctr" },
    { key: "step",    color: "#a855f7", label: "stp" },
    { key: "unknown", color: "#94a3b8", label: "oth" },
  ];
  const passChips = displayData?.cutByPass
    ? PASS_CHIP_DEFS.map(p => ({ ...p, count: displayData.cutByPass[p.key]?.length ?? 0 }))
        .filter(p => p.count > 0)
    : [];
  const rapidCount = displayData?.rapid?.length ?? 0;

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

        {/* Stats — per-pass coloured chips */}
        {displayData && (
          <div
            className="flex items-center gap-3 mr-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}
          >
            <div className="flex gap-2 text-xs font-mono whitespace-nowrap">
              {passChips.map(p => (
                <span key={p.key} title={`${p.key} moves`} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span style={{ color: p.color }}>{p.count.toLocaleString()}</span>
                  <span style={{ color: "var(--ss-text-muted)" }}>{p.label}</span>
                </span>
              ))}
              {rapidCount > 0 && (
                <span title="rapid moves" className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#38bdf8" }} />
                  <span style={{ color: "#38bdf8" }}>{rapidCount.toLocaleString()}</span>
                  <span style={{ color: "var(--ss-text-muted)" }}>rap</span>
                </span>
              )}
              {displayData.pathLengthMm > 0 && (
                <span title="Total path length" className="flex items-center gap-1 border-l pl-2" style={{ borderColor: "var(--ss-border)", color: "#38bdf8" }}>
                  {displayData.pathLengthMm > 1000
                    ? `${(displayData.pathLengthMm / 1000).toFixed(1)} m`
                    : `${displayData.pathLengthMm} mm`}
                </span>
              )}
            </div>

            {currentStats?.total_time_sec > 0 && (
              <>
                <div className="w-[1px] h-4" style={{ backgroundColor: "var(--ss-border)" }} />
                <div className="flex gap-3 text-xs font-mono whitespace-nowrap">
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

        {/* —— Colour Mode Selector (only shown in 3D view) —— */}
        {viewMode === "3d" && (
          <div className="flex bg-[var(--ss-card)] rounded-lg p-1 border h-10 items-center overflow-hidden" style={{ borderColor: "var(--ss-border)" }}>
            {[
              { id: "type",  label: "By Type" },
              { id: "pass",  label: "By Pass" },
              { id: "depth", label: "By Depth" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setColorMode(m.id)}
                disabled={!displayData}
                className="px-4 h-full rounded text-xs font-semibold transition-all disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap"
                style={{
                  backgroundColor: colorMode === m.id ? "var(--ss-accent-soft)" : "transparent",
                  color: colorMode === m.id ? "var(--ss-accent)" : "var(--ss-text-muted)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* —— Fit to view (3D only) —— */}
        {viewMode === "3d" && (
          <button
            onClick={() => setFitTrigger(t => t + 1)}
            disabled={!displayData && !nestingResult}
            title="Fit scene to view"
            className="h-10 px-3 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            style={toolbarBtnStyle}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
        )}

        {/* 3D / G-code text toggle */}
        <div
          className="relative flex items-center rounded-lg p-1 w-[255px] cursor-pointer"
          style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}
        >
          {/* Sliding pill indicator */}
          <div
            className="absolute top-1 bottom-1 rounded-md transition-all duration-300 ease-out"
            style={{
              backgroundColor: "var(--ss-accent-soft)",
              border: "1px solid rgba(132,204,22,0.2)",
              width: "calc(33.33% - 2px)",
              transform: viewMode === "3d" ? "translateX(0%)" : viewMode === "gcode" ? "translateX(100%)" : "translateX(200%)",
            }}
          />
          <button
            disabled={!displayData && !displayText}
            onClick={() => { setViewMode("3d"); setShowGcodeText(false); }}
            className="relative z-10 flex-1 text-center text-xs font-semibold py-1.5 transition-all select-none disabled:opacity-40"
            style={{ color: viewMode === "3d" ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
            3D View
          </button>
          <button
            disabled={!displayData && !displayText}
            onClick={() => { setViewMode("gcode"); setShowGcodeText(true); }}
            className="relative z-10 flex-1 text-center text-xs font-semibold py-1.5 transition-all select-none disabled:opacity-40"
            style={{ color: viewMode === "gcode" ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
            G-Code
          </button>
          <button
            disabled={!nestingResult}
            onClick={() => { setViewMode("sheet"); setShowGcodeText(false); }}
            className="relative z-10 flex-1 text-center text-xs font-semibold py-1.5 transition-all select-none disabled:opacity-40"
            style={{ color: viewMode === "sheet" ? "var(--ss-accent)" : "var(--ss-text-muted)" }}>
            Sheet Map
          </button>
        </div>

        {/* Excel Batch Upload */}
        <button
          onClick={() => { setPendingFile(null); setShowImportModal(true); }}
          className="w-10 h-10 rounded-lg cursor-pointer transition-all flex items-center justify-center active:scale-95 disabled:opacity-30"
          style={toolbarBtnStyle}
          title="Import CSV/Excel Door List"
          disabled={isUploadingExcel}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
            <path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/>
          </svg>
        </button>

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

      {/* ── Main View Area ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {viewMode === "sheet" && nestingResult ? (
          <InteractiveSheetView nestingResult={nestingResult} />
        ) : viewMode === "gcode" && displayText ? (
          <pre
            className="absolute inset-0 overflow-auto p-4 text-[11px] font-mono leading-tight"
            style={{ backgroundColor: "var(--ss-bg)", color: "var(--ss-text)" }}
          >
            {displayText}
          </pre>
        ) : displayData ? (
          <>
            <ThreeViewer
              gcodeData={displayData}
              bedWidth={currentStats?.sheet_w}
              bedHeight={currentStats?.sheet_h}
              visibleLayers={visibleLayers}
              colorMode={colorMode}
              toolProgress={toolProgress}
              nestingResult={nestingResult}
              settings={settings}
              fitTrigger={fitTrigger}
            />

            {/* Tool simulation scrubber */}
            {displayData && (
              <div
                className="absolute bottom-4 right-4 z-10 rounded-xl p-3 w-72 animate-fade-in shadow-2xl"
                style={{
                  backgroundColor: "rgba(13,13,18,0.85)",
                  border: "1px solid var(--ss-border)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ss-text-muted)" }}>
                    Tool Simulation
                  </p>
                  <div className="flex items-center gap-2">
                    {currentStats?.total_time_sec > 0 && (() => {
                      const elapsed = toolProgress * currentStats.total_time_sec;
                      const total = currentStats.total_time_sec;
                      const fmt = (s) => (s >= 3600 
                        ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}m`
                        : `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`);
                      return (
                        <span className="text-[10px] font-mono" style={{ color: "var(--ss-text-muted)" }}>
                          {fmt(elapsed)} / {fmt(total)}
                        </span>
                      );
                    })()}
                    <span className="text-[10px] font-mono" style={{ color: "var(--ss-accent)" }}>
                      {Math.round(toolProgress * 100)}%
                    </span>
                  </div>
                </div>

                {/* Scrubber */}
                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={Math.round(toolProgress * 1000)}
                  onChange={e => { setIsPlaying(false); setToolProgress(parseInt(e.target.value) / 1000); }}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: "var(--ss-accent)",
                    background: `linear-gradient(to right, var(--ss-accent) ${toolProgress * 100}%, var(--ss-border) ${toolProgress * 100}%)`,
                  }}
                />

                {/* Play controls */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => { if (toolProgress >= 1) setToolProgress(0); setIsPlaying(p => !p); }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95 border"
                    style={{
                      backgroundColor: isPlaying ? "var(--ss-accent-soft)" : "transparent",
                      borderColor: isPlaying ? "rgba(132,204,22,0.3)" : "var(--ss-border)",
                      color: isPlaying ? "var(--ss-accent)" : "var(--ss-text-muted)",
                    }}
                  >
                    {isPlaying
                      ? <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    }
                  </button>
                  <div className="flex flex-col">
                    <button
                      onClick={() => { setToolProgress(0); setIsPlaying(false); }}
                      className="text-[9px] transition-colors rounded px-1 text-left"
                      style={{ color: "var(--ss-text-muted)" }}
                    >
                      ↤ Reset
                    </button>
                  </div>
                  <div className="flex-1" />
                  <div className="flex gap-1 bg-[var(--ss-card)] p-0.5 rounded-md border" style={{ borderColor: "var(--ss-border)" }}>
                    {[0.5, 1, 2, 5].map(s => (
                      <button
                        key={s}
                        onClick={() => setPlaySpeed(s)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono transition-all"
                        style={{
                          backgroundColor: playSpeed === s ? "var(--ss-accent-soft)" : "transparent",
                          color: playSpeed === s ? "var(--ss-accent)" : "var(--ss-text-muted)",
                        }}
                      >{s}×</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Z-depth gradient legend */}
            {colorMode === "depth" && displayData.zRange && (
              <div
                className="absolute bottom-4 left-4 z-10 rounded-xl p-3 animate-fade-in"
                style={{
                  backgroundColor: "rgba(13,13,18,0.85)",
                  border: "1px solid var(--ss-border)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--ss-text-muted)" }}>Z Depth</p>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col justify-between h-20 text-[9px] font-mono text-right">
                    <span style={{ color: "#22d3ee" }}>{displayData.zRange.max.toFixed(1)}</span>
                    <span style={{ color: "#a855f7" }}>{((displayData.zRange.max + displayData.zRange.min) / 2).toFixed(1)}</span>
                    <span style={{ color: "#c026d3" }}>{displayData.zRange.min.toFixed(1)}</span>
                  </div>
                  <div className="w-3 h-20 rounded-full flex-shrink-0" style={{ background: "linear-gradient(to bottom, #22d3ee, #a855f7, #c026d3)" }} />
                  <div className="flex flex-col justify-between h-20 text-[9px] font-mono" style={{ color: "var(--ss-text-muted)" }}>
                    <span>surface</span>
                    <span style={{ fontSize: "8px" }}>&#8212;</span>
                    <span>deep</span>
                  </div>
                </div>
              </div>
            )}
          </>
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

      {/* ── Import Modal Overlay ──────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
          <div className="rounded-xl shadow-2xl w-96 p-5 animate-fade-in" style={{ backgroundColor: "var(--ss-surface)", border: "1px solid var(--ss-border)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base" style={{ color: "var(--ss-text)" }}>Import Door List</h3>
              <button onClick={() => { setShowImportModal(false); setPendingFile(null); }} className="p-1 rounded opacity-50 hover:opacity-100 transition-opacity">
                &times;
              </button>
            </div>
            
            <div className="space-y-4 text-sm" style={{ color: "var(--ss-text)" }}>
              {/* Source Dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: "var(--ss-text-muted)" }}>Source Integration</label>
                <select 
                  className="ss-input text-sm w-full"
                  value={importConfig.source}
                  onChange={e => setImportConfig({ ...importConfig, source: e.target.value })}
                >
                  <option value="generic">Generic CSV / Excel</option>
                  <option value="mozaik">Mozaik Door Report</option>
                  <option value="cabinet_vision">Cabinet Vision Extract</option>
                </select>
              </div>

              {/* Units Dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: "var(--ss-text-muted)" }}>Dimensional Units</label>
                <select 
                  className="ss-input text-sm w-full"
                  value={importConfig.unit}
                  onChange={e => setImportConfig({ ...importConfig, unit: e.target.value })}
                >
                  <option value="mm">Millimeters (mm)</option>
                  <option value="cm">Centimeters (cm)</option>
                  <option value="in">Inches (in)</option>
                </select>
                <p className="text-[10px]" style={{ color: "var(--ss-text-muted)" }}>
                  Values in the sheet will be converted to mm internally.
                </p>
              </div>

              {/* File Info / Select */}
              <div className="pt-2">
                {pendingFile ? (
                  <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 border border-green-500/20 text-green-500 text-xs">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span className="truncate w-full font-mono font-semibold">{pendingFile.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="ss-btn-ghost flex-1 py-2 text-center cursor-pointer text-xs">
                      Choose .csv or .xlsx
                      <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0])} />
                    </label>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 pt-3">
                <button 
                  onClick={() => { setShowImportModal(false); setPendingFile(null); }}
                  className="ss-btn-ghost flex-1 py-2"
                >Cancel</button>
                <button 
                  onClick={() => handleExcelUpload(pendingFile)}
                  disabled={!pendingFile || isUploadingExcel}
                  className="ss-btn-primary flex-1 py-2 disabled:opacity-50 flex justify-center items-center"
                >
                  {isUploadingExcel ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : "Import Parts"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
