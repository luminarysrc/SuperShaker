/**
 * ToolpathViewer.jsx — Full-page G-code viewer with control panel
 */
import React, { useState, useCallback } from "react";
import ThreeViewer from "./ThreeViewer.jsx";
import {
  generateGcode,
  parseGcode,
  readGcodeFile,
  downloadGcode,
} from "../services/EngineClient.js";

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
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [gcodeData, setGcodeData] = useState(null);
  const [gcodeText, setGcodeText] = useState("");
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateParam = useCallback((key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateGcode(params);
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

  const handleDownload = useCallback(() => {
    if (gcodeText) {
      downloadGcode(gcodeText, `supershaker_${params.pattern}.nc`);
    }
  }, [gcodeText, params.pattern]);

  return (
    <div className="flex h-full">
      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <ThreeViewer
          gcodeData={gcodeData}
          bedWidth={Math.max(params.width * 1.3, 200)}
          bedHeight={Math.max(params.height * 1.3, 200)}
        />

        {/* Overlay stats badge */}
        {stats && (
          <div
            className="absolute top-4 left-4 backdrop-blur-sm rounded-lg px-3 py-2 text-xs font-mono space-y-0.5 animate-fade-in"
            style={{
              backgroundColor: "var(--ss-toolbar-bg)",
              border: "1px solid var(--ss-border)",
              color: "var(--ss-text-muted)",
            }}
          >
            <p>Lines: <span style={{ color: "var(--ss-text)" }}>{stats.line_count}</span></p>
            <p>Rapid: <span className="text-sky-400">{gcodeData?.rapid.length || 0}</span>
               {" "}Cut: <span className="text-green-500">{gcodeData?.cut.length || 0}</span></p>
            <p>Pattern: <span style={{ color: "var(--ss-text)" }}>{stats.pattern}</span></p>
          </div>
        )}

        {/* Empty state */}
        {!gcodeData && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center" style={{ color: "var(--ss-text-muted)" }}>
              <p className="text-lg mb-1">No toolpath loaded</p>
              <p className="text-sm">Set parameters and click <strong>Generate G-code</strong></p>
            </div>
          </div>
        )}
      </div>

      {/* Right control panel */}
      <aside
        className="w-80 border-l overflow-y-auto shrink-0"
        style={{
          backgroundColor: "var(--ss-surface)",
          borderColor: "var(--ss-border)",
        }}
      >
        <div className="p-4 space-y-5">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--ss-text)" }}>Toolpath Generator</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--ss-text-muted)" }}>
              Configure and generate CNC toolpaths
            </p>
          </div>

          {/* Part Parameters */}
          <section className="space-y-3">
            <SectionTitle>Part Dimensions</SectionTitle>
            <Field label="Width (mm)" value={params.width}
              onChange={(v) => updateParam("width", parseFloat(v) || 0)} />
            <Field label="Height (mm)" value={params.height}
              onChange={(v) => updateParam("height", parseFloat(v) || 0)} />
            <Field label="Depth (mm)" value={params.depth}
              onChange={(v) => updateParam("depth", parseFloat(v) || 0)} step="0.1" />
          </section>

          {/* Tool Configuration */}
          <section className="space-y-3">
            <SectionTitle>Tool Configuration</SectionTitle>
            <Field label="Tool Ø (mm)" value={params.tool_diameter}
              onChange={(v) => updateParam("tool_diameter", parseFloat(v) || 0)} step="0.5" />
            <Field label="Feed (mm/min)" value={params.feed_rate}
              onChange={(v) => updateParam("feed_rate", parseInt(v) || 0)} />
            <Field label="Spindle RPM" value={params.spindle_rpm}
              onChange={(v) => updateParam("spindle_rpm", parseInt(v) || 0)} />
          </section>

          {/* Toolpath Pattern */}
          <section className="space-y-3">
            <SectionTitle>Toolpath Pattern</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {["spiral", "square", "pocket"].map((pat) => (
                <button
                  key={pat}
                  onClick={() => updateParam("pattern", pat)}
                  className="px-2 py-2 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    backgroundColor: params.pattern === pat ? "var(--ss-accent-soft)" : "var(--ss-card)",
                    color: params.pattern === pat ? "var(--ss-accent)" : "var(--ss-text-muted)",
                    border: `1px solid ${params.pattern === pat ? "rgba(132,204,22,0.25)" : "var(--ss-border)"}`,
                  }}
                >
                  {pat}
                </button>
              ))}
            </div>
          </section>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="ss-btn-primary w-full flex items-center justify-center gap-2 py-3"
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
              "Generate G-code"
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-lg p-3 text-xs animate-fade-in"
                 style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--ss-danger)" }}>
              <p className="font-semibold mb-1">Error</p>
              <p>{error}</p>
            </div>
          )}

          {/* File Upload */}
          <section className="space-y-2">
            <SectionTitle>Or Load File</SectionTitle>
            <label className="ss-btn-ghost w-full text-sm text-center block cursor-pointer py-2.5">
              <input type="file" accept=".nc,.gcode,.tap,.txt" className="hidden" onChange={handleFileUpload} />
              Upload .nc File
            </label>
          </section>

          {/* Download + Stats */}
          {gcodeText && (
            <section className="space-y-3 animate-fade-in">
              <button onClick={handleDownload} className="ss-btn-ghost w-full text-sm py-2.5">
                Download G-code
              </button>

              {stats && (
                <div className="rounded-lg p-3 space-y-1 text-xs font-mono"
                     style={{ backgroundColor: "var(--ss-card)", border: "1px solid var(--ss-border)" }}>
                  <p style={{ color: "var(--ss-text-muted)" }}>Pattern: <span style={{ color: "var(--ss-text)" }}>{stats.pattern}</span></p>
                  <p style={{ color: "var(--ss-text-muted)" }}>Size: <span style={{ color: "var(--ss-text)" }}>{stats.part_size}</span></p>
                  <p style={{ color: "var(--ss-text-muted)" }}>Tool: <span style={{ color: "var(--ss-text)" }}>{stats.tool}</span></p>
                  <p style={{ color: "var(--ss-text-muted)" }}>Lines: <span style={{ color: "var(--ss-text)" }}>{stats.line_count}</span></p>
                  {stats.estimated_time_min && (
                    <p style={{ color: "var(--ss-text-muted)" }}>Est. time: <span style={{ color: "var(--ss-accent)" }}>{stats.estimated_time_min} min</span></p>
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

function SectionTitle({ children }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider pb-1"
        style={{ color: "var(--ss-text-muted)", borderBottom: "1px solid var(--ss-border)" }}>
      {children}
    </h3>
  );
}

function Field({ label, value, onChange, step = "1", type = "number" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs whitespace-nowrap" style={{ color: "var(--ss-text-muted)" }}>{label}</label>
      <input
        type={type}
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="ss-input w-24 text-right text-xs"
      />
    </div>
  );
}
