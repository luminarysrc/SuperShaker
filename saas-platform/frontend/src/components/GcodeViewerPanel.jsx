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
}) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [localGcode, setLocalGcode] = useState(null);
  const [localGcodeData, setLocalGcodeData] = useState(null);
  const [showGcodeText, setShowGcodeText] = useState(true);

  // Use provided data or local overrides
  const displayData = localGcodeData || gcodeData;
  const displayText = localGcode || gcodeText;

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
      downloadGcode(displayText, `toolpath_sheet${sheetNum}.gcode`);
    }
  }, [displayText, activeSheet, allSheets]);

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
        <button onClick={() => setShowGcodeText(!showGcodeText)}
          className={`px-2 py-1 rounded text-xs transition-all border
            ${showGcodeText
              ? "bg-cnc-accent/15 text-cnc-accent border-cnc-accent/30"
              : "text-cnc-text-muted border-cnc-border hover:border-cnc-accent/20"}`}>
          { showGcodeText ? "3D" : "TXT" }
        </button>

        {/* Upload */}
        <label className="px-2 py-1 rounded text-xs text-cnc-text-muted border border-cnc-border
                          hover:border-cnc-accent/20 cursor-pointer transition-all">
          📂
          <input type="file" accept=".nc,.gcode,.ngc,.txt" className="hidden"
                 onChange={handleFileUpload} />
        </label>

        {/* Download */}
        <button onClick={handleDownload} disabled={!displayText}
          className="px-2 py-1 rounded text-xs text-cnc-text-muted border border-cnc-border
                     hover:border-cnc-accent/20 disabled:opacity-30 transition-all">
          💾
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
          <ThreeViewer gcodeData={displayData} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-cnc-text-muted gap-3">
            <div className="w-16 h-16 rounded-2xl bg-cnc-card border border-cnc-border
                            flex items-center justify-center text-2xl">
              🔧
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
