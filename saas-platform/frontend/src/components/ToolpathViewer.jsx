/**
 * ToolpathViewer.jsx — Full-page G-code viewer with control panel
 * ═══════════════════════════════════════════════════════════════════════
 * This page integrates:
 *   - The ThreeViewer 3D canvas (left/main area)
 *   - A control panel (right side) with:
 *       • Part parameter inputs (width, height, depth)
 *       • Tool configuration (diameter, feed, RPM)
 *       • Pattern selector (spiral / square / pocket)
 *       • "Generate" button → calls backend API → renders result
 *       • File upload for custom .nc files
 *       • Generation stats display
 *       • Download button for generated G-code
 */
import React, { useState, useCallback } from "react";
import ThreeViewer from "./ThreeViewer.jsx";
import {
  generateGcode,
  parseGcode,
  readGcodeFile,
  downloadGcode,
} from "../services/EngineClient.js";

// ── Default parameter values ──────────────────────────────────────
const DEFAULT_PARAMS = {
  width: 120,
  height: 80,
  depth: 3.0,
  tool_diameter: 6.0,
  feed_rate: 6000,
  spindle_rpm: 18000,
  pattern: "spiral",
};

export default function ToolpathViewer() {
  // ── State ─────────────────────────────────────────────────────────
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [gcodeData, setGcodeData] = useState(null);     // parsed 3D data for viewer
  const [gcodeText, setGcodeText] = useState("");        // raw G-code string
  const [stats, setStats] = useState(null);              // generation stats from API
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Parameter change handler ──────────────────────────────────────
  const updateParam = useCallback((key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Generate G-code via backend API ───────────────────────────────
  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Call the FastAPI backend
      const result = await generateGcode(params);

      // Parse the returned G-code into 3D segments
      const parsed = parseGcode(result.gcode);

      setGcodeText(result.gcode);
      setGcodeData(parsed);
      setStats(result.stats);
    } catch (err) {
      console.error("Generation failed:", err);
      setError(err.message || "Failed to generate G-code. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  // ── Upload .nc file handler ───────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await readGcodeFile(file);
      const parsed = parseGcode(text);
      setGcodeText(text);
      setGcodeData(parsed);
      setStats({
        pattern: "uploaded",
        line_count: text.split("\n").length,
        part_size: "from file",
        tool: "—",
      });
      setError(null);
    } catch (err) {
      setError("Failed to read file");
    }
  }, []);

  // ── Download generated G-code ─────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (gcodeText) {
      downloadGcode(gcodeText, `supershaker_${params.pattern}.nc`);
    }
  }, [gcodeText, params.pattern]);

  // ═══════════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-full">
      {/* ── 3D Canvas (fills remaining space) ─────────────────────── */}
      <div className="flex-1 relative">
        <ThreeViewer
          gcodeData={gcodeData}
          bedWidth={Math.max(params.width * 1.3, 200)}
          bedHeight={Math.max(params.height * 1.3, 200)}
        />

        {/* Overlay stats badge */}
        {stats && (
          <div className="absolute top-4 left-4 bg-cnc-surface/90 backdrop-blur-sm
                          border border-cnc-border rounded-lg px-3 py-2 text-xs font-mono
                          text-cnc-text-muted space-y-0.5 animate-fade-in">
            <p>Lines: <span className="text-cnc-text">{stats.line_count}</span></p>
            <p>Rapid: <span className="text-sky-400">{gcodeData?.rapid.length || 0}</span>
               {" "}Cut: <span className="text-green-400">{gcodeData?.cut.length || 0}</span></p>
            <p>Pattern: <span className="text-cnc-text">{stats.pattern}</span></p>
          </div>
        )}

        {/* Empty state message */}
        {!gcodeData && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-cnc-text-muted">
              <p className="text-lg mb-1">No toolpath loaded</p>
              <p className="text-sm">Set parameters and click <strong>Generate G-code</strong></p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right control panel ───────────────────────────────────── */}
      <aside className="w-80 bg-cnc-surface border-l border-cnc-border overflow-y-auto shrink-0">
        <div className="p-4 space-y-5">

          {/* Header */}
          <div>
            <h2 className="text-base font-bold text-cnc-text">Toolpath Generator</h2>
            <p className="text-xs text-cnc-text-muted mt-0.5">
              Configure and generate CNC toolpaths
            </p>
          </div>

          {/* ── Part Parameters ──────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-cnc-text-muted uppercase tracking-wider
                           border-b border-cnc-border pb-1">
              Part Dimensions
            </h3>

            <Field label="Width (mm)" value={params.width}
              onChange={(v) => updateParam("width", parseFloat(v) || 0)} />
            <Field label="Height (mm)" value={params.height}
              onChange={(v) => updateParam("height", parseFloat(v) || 0)} />
            <Field label="Depth (mm)" value={params.depth}
              onChange={(v) => updateParam("depth", parseFloat(v) || 0)} step="0.1" />
          </section>

          {/* ── Tool Configuration ───────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-cnc-text-muted uppercase tracking-wider
                           border-b border-cnc-border pb-1">
              Tool Configuration
            </h3>

            <Field label="Tool Ø (mm)" value={params.tool_diameter}
              onChange={(v) => updateParam("tool_diameter", parseFloat(v) || 0)} step="0.5" />
            <Field label="Feed (mm/min)" value={params.feed_rate}
              onChange={(v) => updateParam("feed_rate", parseInt(v) || 0)} />
            <Field label="Spindle RPM" value={params.spindle_rpm}
              onChange={(v) => updateParam("spindle_rpm", parseInt(v) || 0)} />
          </section>

          {/* ── Toolpath Pattern ──────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-cnc-text-muted uppercase tracking-wider
                           border-b border-cnc-border pb-1">
              Toolpath Pattern
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {["spiral", "square", "pocket"].map((pat) => (
                <button
                  key={pat}
                  onClick={() => updateParam("pattern", pat)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium capitalize
                    transition-all duration-150 border
                    ${params.pattern === pat
                      ? "bg-cnc-accent/15 text-cnc-accent border-cnc-accent/30"
                      : "bg-cnc-card text-cnc-text-muted border-cnc-border hover:border-cnc-accent/20"
                    }`}
                >
                  {pat}
                </button>
              ))}
            </div>
          </section>

          {/* ── Generate Button ───────────────────────────────────── */}
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="cnc-btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                          stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </>
            ) : (
              "⚡ Generate G-code"
            )}
          </button>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3
                            text-xs text-red-400 animate-fade-in">
              <p className="font-semibold mb-1">Error</p>
              <p>{error}</p>
            </div>
          )}

          {/* ── File Upload ──────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-cnc-text-muted uppercase tracking-wider
                           border-b border-cnc-border pb-1">
              Or Load File
            </h3>
            <label className="cnc-btn-ghost w-full text-sm text-center block cursor-pointer">
              <input
                type="file"
                accept=".nc,.gcode,.tap,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
              📁 Upload .nc File
            </label>
          </section>

          {/* ── Download + Stats ──────────────────────────────────── */}
          {gcodeText && (
            <section className="space-y-3 animate-fade-in">
              <button onClick={handleDownload} className="cnc-btn-ghost w-full text-sm">
                💾 Download G-code
              </button>

              {stats && (
                <div className="bg-cnc-card rounded-lg p-3 space-y-1 text-xs font-mono">
                  <p className="text-cnc-text-muted">
                    Pattern: <span className="text-cnc-text">{stats.pattern}</span>
                  </p>
                  <p className="text-cnc-text-muted">
                    Size: <span className="text-cnc-text">{stats.part_size}</span>
                  </p>
                  <p className="text-cnc-text-muted">
                    Tool: <span className="text-cnc-text">{stats.tool}</span>
                  </p>
                  <p className="text-cnc-text-muted">
                    Lines: <span className="text-cnc-text">{stats.line_count}</span>
                  </p>
                  {stats.estimated_time_min && (
                    <p className="text-cnc-text-muted">
                      Est. time: <span className="text-cnc-accent">{stats.estimated_time_min} min</span>
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

        </div>
      </aside>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Helper: simple labeled input field
// ═══════════════════════════════════════════════════════════════════════
function Field({ label, value, onChange, step = "1", type = "number" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-cnc-text-muted whitespace-nowrap">{label}</label>
      <input
        type={type}
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="cnc-input w-24 text-right text-xs"
      />
    </div>
  );
}
