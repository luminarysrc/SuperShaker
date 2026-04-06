/**
 * GcodeViewerPanel.jsx — Right panel: 3D G-code viewer
 * Wraps ThreeViewer with stats overlay and file controls.
 */
import React, { useState, useCallback } from "react";
import ThreeViewer from "./ThreeViewer.jsx";
import { readGcodeFile, parseGcode, downloadGcode, uploadBatchExcel } from "../services/EngineClient.js";

export default function GcodeViewerPanel({
  onDoorsImported,
  gcodeData,
  gcodeText,
  stats,
  allSheets,
  orderId,
}) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [localGcode, setLocalGcode] = useState(null);
  const [localGcodeData, setLocalGcodeData] = useState(null);
  const [showGcodeText, setShowGcodeText] = useState(false);

  const displayData = localGcodeData || gcodeData;
  const displayText = localGcode || gcodeText;
  const currentStats = allSheets ? allSheets[activeSheet]?.stats : stats;

  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // ── Drag & Drop ──────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.csv')) {
      setIsUploadingExcel(true);
      try {
        await uploadBatchExcel(file);
        if (onDoorsImported) onDoorsImported();
      } catch (err) {
        console.error("Failed to upload excel batch:", err);
        alert("Failed to import batch parts: " + err.message);
      } finally {
        setIsUploadingExcel(false);
      }
    } else {
      try {
        const text = await readGcodeFile(file);
        const parsed = parseGcode(text);
        setLocalGcode(text);
        setLocalGcodeData(parsed);
      } catch (err) {
        console.error("Failed to read dropped file as G-code:", err);
      }
    }
  }, [onDoorsImported]);

  // ── Excel File upload ────────────────────────────────
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
    } finally {
      setIsUploadingExcel(false);
    }
    e.target.value = "";
  }, [onDoorsImported]);

  // ── Gcode File upload ────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readGcodeFile(file);
      const parsed = parseGcode(text);
      setLocalGcode(text);
      setLocalGcodeData(parsed);
    } catch (err) {
      console.error("Failed to read file:", err);
    }
    e.target.value = "";
  }, []);

  // ── Sync with props ──────────────────────────────────
  React.useEffect(() => {
    setLocalGcode(null);
    setLocalGcodeData(null);
    setActiveSheet(0);
  }, [gcodeData, allSheets]);

  // ── Switch sheet ──────────────────────────────────────
  const handleSheetSwitch = useCallback((idx) => {
    if (!allSheets || !allSheets[idx]) return;
    const sheet = allSheets[idx];
    const parsed = parseGcode(sheet.gcode);
    setLocalGcode(sheet.gcode);
    setLocalGcodeData(parsed);
    setActiveSheet(idx);
  }, [allSheets]);

  // ── Download ─────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (displayText) {
      const sheetNum = allSheets ? activeSheet + 1 : 1;
      let filename = orderId ? `${orderId}_sheet${sheetNum}.gcode` : `toolpath_sheet${sheetNum}.gcode`;
      filename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      downloadGcode(displayText, filename);
    }
  }, [displayText, activeSheet, allSheets, orderId]);

  const toolbarBtnStyle = {
    backgroundColor: "var(--ss-card)",
    border: "1px solid var(--ss-border)",
    color: "var(--ss-text-muted)",
  };

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
               style={{
                 backgroundColor: "var(--ss-card)",
                 border: "2px dashed var(--ss-accent)",
                 boxShadow: "var(--ss-shadow-lg)",
               }}>
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

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 p-2 border-b backdrop-blur-sm"
        style={{
          backgroundColor: "var(--ss-toolbar-bg)",
          borderColor: "var(--ss-border)",
        }}
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
            className="flex items-center gap-4 mr-2 px-4 py-2 rounded-lg"
            style={{
              backgroundColor: "var(--ss-card)",
              border: "1px solid var(--ss-border)",
            }}
          >
            <div className="flex gap-3 text-xs font-mono whitespace-nowrap" style={{ color: "var(--ss-text-muted)" }}>
              <span title="Cut moves">
                <span className="text-green-500">●</span> {displayData.cut?.length || 0} cut
              </span>
              <span title="Rapid moves">
                <span className="text-yellow-500">●</span> {displayData.rapid?.length || 0} rapid
              </span>
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
                  <span title="Cut Distance" className="text-sky-500">
                    {currentStats.total_distance_mm > 1000 ? `${(currentStats.total_distance_mm / 1000).toFixed(1)}m` : `${Math.round(currentStats.total_distance_mm)}mm`}
                  </span>
                  <span title="Tool Changes" className="text-purple-400 font-semibold">
                    {currentStats.tool_changes}T
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* 3D/G-code toggle */}
        <div
          className="relative flex items-center rounded-lg p-1 w-[170px] cursor-pointer"
          style={{
            backgroundColor: "var(--ss-card)",
            border: "1px solid var(--ss-border)",
          }}
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
                 disabled={isUploadingExcel}
                 onChange={handleExcelUpload} />
        </label>

        {/* Upload */}
        <label
          className="w-10 h-10 rounded-lg cursor-pointer transition-all flex items-center justify-center active:scale-95"
          style={toolbarBtnStyle}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <input type="file" accept=".nc,.gcode,.ngc,.txt" className="hidden"
                 onChange={handleFileUpload} />
        </label>

        {/* Download */}
        <button onClick={handleDownload} disabled={!displayText}
          className="w-10 h-10 rounded-lg transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          style={toolbarBtnStyle}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
        </button>
      </div>

      {/* ── 3D View or G-code text ─────────────────────── */}
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
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3"
               style={{ color: "var(--ss-text-muted)" }}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: "var(--ss-card)",
                border: "1px solid var(--ss-border)",
                color: "var(--ss-accent)",
                opacity: 0.5,
              }}
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
              Run nesting and generate G-code from the SuperShaker panel,
              or upload a .nc file
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
