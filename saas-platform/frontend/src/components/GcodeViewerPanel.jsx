/**
 * GcodeViewerPanel.jsx — Right panel: 3D G-code viewer
 * Wraps ThreeViewer with stats overlay and file controls.
 */
import React, { useState, useCallback } from "react";
import ThreeViewer from "./ThreeViewer.jsx";
import { readGcodeFile, parseGcode, downloadGcode } from "../services/EngineClient.js";

export default function GcodeViewerPanel({
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

  // ── File upload ──────────────────────────────────────
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

  // ── Switch sheet (when multiple sheets generated) ──
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

  return (
    <div className="h-full flex flex-col bg-cnc-bg" id="gcode-viewer-panel">
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-2 border-b border-cnc-border bg-cnc-surface/80 backdrop-blur-sm">
        {/* Sheet tabs */}
        {allSheets && allSheets.length > 1 && (
          <div className="flex gap-1 mr-2">
            {allSheets.map((_, i) => (
              <button key={i}
                onClick={() => handleSheetSwitch(i)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all
                  ${activeSheet === i
                    ? "bg-cnc-accent/15 text-cnc-accent border border-cnc-accent/30"
                    : "text-cnc-text-muted hover:text-cnc-text border border-transparent"}`}>
                S{i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Stats */}
        {displayData && (
          <div className="flex gap-3 text-[10px] font-mono text-cnc-text-muted">
            <span title="Cut moves">
              <span className="text-green-400">●</span> {displayData.cut?.length || 0} cut
            </span>
            <span title="Rapid moves">
              <span className="text-yellow-400">●</span> {displayData.rapid?.length || 0} rapid
            </span>
          </div>
        )}

        {/* G-code text toggle */}
        <div className="relative flex items-center bg-[#0a0a0a] rounded-lg p-1.5 border border-white/10 w-[180px] cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
          {/* Slider thumb */}
          <div 
            className="absolute top-1.5 bottom-1.5 w-[82px] rounded-md bg-[#1a1a1a] border border-white/5 shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-out"
            style={{ transform: showGcodeText ? "translateX(84px)" : "translateX(0px)" }}
          />
          <button 
            disabled={!displayData && !displayText}
            onClick={() => setShowGcodeText(false)}
            className={`relative z-10 flex-1 text-center text-xs font-mono font-bold py-1.5 transition-all select-none ${!showGcodeText ? 'text-[#C6F321] drop-shadow-[0_0_8px_rgba(198,243,33,0.6)] scale-105' : 'text-gray-600 hover:text-gray-400'}`}>
            3D VIEW
          </button>
          <button 
            disabled={!displayData && !displayText}
            onClick={() => setShowGcodeText(true)}
            className={`relative z-10 flex-1 text-center text-xs font-mono font-bold py-1.5 transition-all select-none ${showGcodeText ? 'text-[#00FFFF] drop-shadow-[0_0_8px_rgba(0,255,255,0.6)] scale-105' : 'text-gray-600 hover:text-gray-400'}`}>
            G-CODE
          </button>
        </div>

        {/* Upload */}
        <label className="group relative w-10 h-10 rounded-lg bg-[#0a0a0a] text-gray-500 border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]
                          hover:bg-[#1a1a1a] hover:text-[#00FFFF] hover:border-[#00FFFF]/50 hover:shadow-[0_0_12px_rgba(0,255,255,0.3)]
                          cursor-pointer transition-all flex items-center justify-center active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
               stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
               className="group-hover:drop-shadow-[0_0_8px_rgba(0,255,255,0.8)] transition-all">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <input type="file" accept=".nc,.gcode,.ngc,.txt" className="hidden"
                 onChange={handleFileUpload} />
        </label>

        {/* Download */}
        <button onClick={handleDownload} disabled={!displayText}
          className="group relative w-10 h-10 rounded-lg bg-[#0a0a0a] text-gray-500 border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]
                     hover:bg-[#1a1a1a] hover:text-[#C6F321] hover:border-[#C6F321]/50 hover:shadow-[0_0_12px_rgba(198,243,33,0.3)]
                     disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center justify-center active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
               stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
               className="group-hover:drop-shadow-[0_0_8px_rgba(198,243,33,0.8)] transition-all">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
        </button>
      </div>

      {/* ── 3D View or G-code text ─────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {showGcodeText && displayText ? (
          <pre className="absolute inset-0 overflow-auto p-4 text-[11px] font-mono
                          text-cnc-text leading-tight bg-cnc-bg">
            {displayText}
          </pre>
        ) : displayData ? (
          <ThreeViewer 
            gcodeData={displayData} 
            bedWidth={currentStats?.sheet_w} 
            bedHeight={currentStats?.sheet_h} 
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-cnc-text-muted gap-3">
            <div className="w-16 h-16 rounded-2xl bg-cnc-card border border-cnc-border
                            flex items-center justify-center text-cnc-accent/50 shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" 
                   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15.5 15.5 4.6 4.6a2.1 2.1 0 1 1-2.9 2.9l-4.6-4.6"/>
                <path d="M21.1 21.1 19 19"/>
                <path d="m5 16 1.4-1.4c.5-.5 1.4-.4 1.8.1.3.4.2 1-.1 1.4L6.9 17.3c-.4.4-1 .3-1.4-.1-.4-.5-.3-1.1.1-1.5L7 14.3c.4-.4.3-1.1-.1-1.5-.5-.4-1.4-.3-1.8.1L3.9 14.1c1.5 2.1 4.1 3 6.6 2.3l4.6 4.6"/>
                <path d="M12.9 2.4A7.9 7.9 0 0 0 5 9.1c0 1.2.3 2.5 1 3.5l4-1.4a.5.5 0 0 1 .6.6l-1.4 4c1 .7 2.3 1 3.5 1a7.9 7.9 0 0 0 7.4-10.5 7.9 7.9 0 0 0-7.2-4.3z"/>
              </svg>
            </div>
            <p className="text-sm font-medium">No G-code loaded</p>
            <p className="text-xs text-cnc-text-muted text-center max-w-[200px]">
              Run nesting and generate G-code from the SuperShaker panel,
              or upload a .nc file
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
