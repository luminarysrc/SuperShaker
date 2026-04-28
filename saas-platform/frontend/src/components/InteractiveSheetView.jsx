/**
 * InteractiveSheetView.jsx
 * ──────────────────────────────────────────────────────────
 * SVG-based interactive "Cutting Map" that mirrors the PDF
 * operator sheet. Click any part to highlight it and see its
 * ID, dimensions and type.  Pan + zoom via mouse wheel.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";

// ── Colour palette – Blockly design system ──────────────────
const TYPE_STYLE = {
  "Shaker":      { fill: "rgba(59,130,246,0.18)",  stroke: "#3b82f6", label: "#60a5fa" },
  "Shaker Step": { fill: "rgba(0,214,143,0.14)",   stroke: "#00D68F", label: "#00D68F" },
  "Slab":        { fill: "rgba(255,140,0,0.14)",   stroke: "#FF8C00", label: "#FF8C00" },
  default:       { fill: "rgba(108,99,255,0.14)",  stroke: "#6C63FF", label: "#6C63FF" },
};

const SELECTED_STYLE = {
  fill:   "rgba(108,99,255,0.18)",
  stroke: "#6C63FF",
  label:  "#A5A0FF",
};

function useContainerSize(ref) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return size;
}

// ── Helper: scale a sheet coordinate to SVG space ──────────
function toSvg(val, sheetDim, svgDim, offset) {
  return offset + (val / sheetDim) * svgDim;
}

// ── Single sheet renderer ───────────────────────────────────
function SheetCanvas({ sheet, meta, selectedId, onSelect, containerSize }) {
  const PADDING = 40; // px around sheet in svg space
  const sw = meta.w;
  const sh = meta.h;

  const availW = containerSize.w - PADDING * 2;
  const availH = containerSize.h - PADDING * 2;
  const scale  = Math.min(availW / sw, availH / sh);

  const drawW = sw * scale;
  const drawH = sh * scale;
  const ox    = (containerSize.w - drawW) / 2;
  const oy    = (containerSize.h - drawH) / 2;

  const toX = (v) => ox + v * scale;
  const toY = (v) => oy + v * scale;
  const toLen = (v) => v * scale;

  // Minimum label box size in SVG pixels to show it
  const MIN_LABEL_PX = 36;

  return (
    <svg
      width={containerSize.w}
      height={containerSize.h}
      style={{ display: "block", cursor: "default", userSelect: "none" }}
    >
      {/* Grid backdrop */}
      <defs>
        <pattern id="grid" width={toLen(100)} height={toLen(100)} patternUnits="userSpaceOnUse"
          x={ox} y={oy}>
          <path
            d={`M ${toLen(100)} 0 L 0 0 0 ${toLen(100)}`}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"
          />
        </pattern>
      </defs>

      {/* Sheet background */}
      <rect
        x={ox} y={oy} width={drawW} height={drawH}
        fill="#08090F" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5}
      />
      <rect x={ox} y={oy} width={drawW} height={drawH} fill="rgba(255,255,255,0.015)" />
      <rect x={ox} y={oy} width={drawW} height={drawH} fill="url(#grid)" />

      {/* Margin indicator (dashed) */}
      {meta.margin > 0 && (
        <rect
          x={toX(meta.margin)} y={toY(meta.margin)}
          width={toLen(sw - meta.margin * 2)} height={toLen(sh - meta.margin * 2)}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} strokeDasharray="6 4"
        />
      )}

      {/* Ruler ticks along bottom */}
      {Array.from({ length: Math.floor(sw / 100) + 1 }, (_, i) => i * 100).map(mm => (
        <g key={mm}>
          <line
            x1={toX(mm)} y1={oy + drawH}
            x2={toX(mm)} y2={oy + drawH + 6}
            stroke="#475569" strokeWidth={0.8}
          />
          {mm % 500 === 0 && (
            <text
              x={toX(mm)} y={oy + drawH + 16}
              textAnchor="middle" fontSize={9} fill="#475569"
            >
              {mm}
            </text>
          )}
        </g>
      ))}

      {/* Parts */}
      {sheet.map((part) => {
        const isSel  = part.id === selectedId;
        const ts     = isSel ? SELECTED_STYLE : (TYPE_STYLE[part.type] || TYPE_STYLE.default);
        const px     = toX(part.x);
        const py     = toY(part.y);
        const pw     = toLen(part.w);
        const ph     = toLen(part.h);
        const isSmall = part.is_small || (part.orig_w * part.orig_h < 50000);
        const showLabel = pw > MIN_LABEL_PX && ph > MIN_LABEL_PX;

        // Is the part rotated? (w in nesting != orig_w means it was rotated)
        const rotated = Math.abs(part.w - part.orig_w) > 1 && Math.abs(part.w - part.orig_h) < 2;

        return (
          <g key={part.id} onClick={() => onSelect(isSel ? null : part.id)} style={{ cursor: "pointer" }}>
            {/* Hatch for small parts */}
            {isSmall && (
              <rect
                x={px} y={py} width={pw} height={ph}
                fill="url(#hatch)" fillOpacity={0.6}
              />
            )}

            <rect
              x={px} y={py} width={pw} height={ph}
              fill={ts.fill}
              stroke={ts.stroke}
              strokeWidth={isSel ? 2 : 1}
              rx={2}
            />

            {/* Rotated indicator */}
            {rotated && showLabel && (
              <text
                x={px + pw - 6} y={py + 12}
                fontSize={9} fill={ts.label} textAnchor="end" opacity={0.7}
              >↺</text>
            )}

            {/* Shaker frame outline */}
            {(part.type === "Shaker" || part.type === "Shaker Step") && pw > 80 && ph > 80 && (() => {
              const fw = toLen(65);
              return (
                <rect
                  x={px + fw} y={py + fw}
                  width={Math.max(0, pw - fw * 2)} height={Math.max(0, ph - fw * 2)}
                  fill="none"
                  stroke={ts.stroke}
                  strokeWidth={0.6}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
              );
            })()}

            {/* Label */}
            {showLabel && (
              <>
                <text
                  x={px + pw / 2} y={py + ph / 2 - (pw > 60 ? 7 : 0)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(13, Math.max(8, pw / 6))}
                  fontWeight="700"
                  fill={ts.label}
                >
                  {part.id}
                </text>
                {pw > 60 && ph > 30 && (
                  <text
                    x={px + pw / 2} y={py + ph / 2 + 9}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(10, Math.max(7, pw / 9))}
                    fill={ts.label}
                    opacity={0.7}
                  >
                    {part.orig_w}×{part.orig_h}
                  </text>
                )}
              </>
            )}

            {/* Selection glow ring */}
            {isSel && (
              <rect
                x={px - 3} y={py - 3} width={pw + 6} height={ph + 6}
                fill="none" stroke="#6C63FF" strokeWidth={1.5}
                strokeDasharray="5 3" rx={4}
                opacity={0.8}
                filter="drop-shadow(0 0 6px rgba(108,99,255,0.5))"
              >
                <animate attributeName="stroke-dashoffset" from="0" to="16"
                  dur="1s" repeatCount="indefinite" />
              </rect>
            )}
          </g>
        );
      })}

      {/* Sheet dimension labels */}
      <text x={ox + drawW / 2} y={oy - 8}
        textAnchor="middle" fontSize={11} fill="#64748b">
        {sw.toFixed(0)} mm
      </text>
      <text
        x={ox - 10} y={oy + drawH / 2}
        textAnchor="middle" fontSize={11} fill="#64748b"
        transform={`rotate(-90, ${ox - 10}, ${oy + drawH / 2})`}
      >
        {sh.toFixed(0)} mm
      </text>
    </svg>
  );
}

// ── Detail panel shown on right when a part is selected ────
function PartDetailPanel({ part, onClose }) {
  if (!part) return null;
  const ts = TYPE_STYLE[part.type] || TYPE_STYLE.default;
  const area = (part.orig_w * part.orig_h / 1e6).toFixed(4);
  const rotated = Math.abs(part.w - part.orig_w) > 1;

  return (
    <div
      className="absolute top-4 right-4 z-20 rounded-2xl p-4 w-64 shadow-2xl animate-fade-in"
      style={{
        backgroundColor: "rgba(13,13,22,0.92)",
        border: `1px solid ${ts.stroke}44`,
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ts.stroke }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: ts.label }}>
            {part.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[18px] leading-none opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: "var(--ss-text-muted)" }}
        >×</button>
      </div>

      {/* ID badge */}
      <div
        className="text-center py-3 rounded-xl mb-3"
        style={{ backgroundColor: `${ts.stroke}18`, border: `1px solid ${ts.stroke}33` }}
      >
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: ts.label }}>Part ID</p>
        <p className="text-3xl font-black font-mono" style={{ color: ts.label }}>#{part.id}</p>
      </div>

      {/* Dimensions grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Width",  value: `${part.orig_w} mm` },
          { label: "Height", value: `${part.orig_h} mm` },
          { label: "Area",   value: `${area} m²` },
          { label: "Type",   value: rotated ? "Rotated" : "Normal" },
          { label: "Pos X",  value: `${part.x.toFixed(1)} mm` },
          { label: "Pos Y",  value: `${part.y.toFixed(1)} mm` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg p-2"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "var(--ss-text-muted)" }}>{label}</p>
            <p className="text-xs font-semibold font-mono" style={{ color: "var(--ss-text)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Small flag */}
      {part.is_small && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ backgroundColor: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
          </svg>
          Small part — may use tabs
        </div>
      )}
    </div>
  );
}

// ── Sheet selector tabs (for multi-sheet nesting) ──────────
function SheetTabs({ count, activeIdx, sheetsMeta, onSwitch }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }, (_, i) => {
        const meta = sheetsMeta?.[i];
        const isOffcut = meta?.is_offcut;
        return (
          <button
            key={i}
            onClick={() => onSwitch(i)}
            className="px-3 py-1 rounded-md text-xs font-mono transition-all"
            style={{
              backgroundColor: activeIdx === i ? "var(--ss-accent-soft)" : "transparent",
              color: activeIdx === i ? "var(--ss-accent)" : "var(--ss-text-muted)",
              border: activeIdx === i ? "1px solid rgba(132,204,22,0.25)" : "1px solid transparent",
            }}
          >
            {isOffcut ? `✂ Off${i + 1}` : `S${i + 1}`}
          </button>
        );
      })}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────
function Legend({ sheets }) {
  const types = [...new Set(sheets.flat().map(p => p.type))];
  return (
    <div className="flex items-center gap-3">
      {types.map(t => {
        const ts = TYPE_STYLE[t] || TYPE_STYLE.default;
        return (
          <div key={t} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm border" style={{ backgroundColor: ts.fill, borderColor: ts.stroke }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--ss-text-muted)" }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Public component ────────────────────────────────────────
export default function InteractiveSheetView({ nestingResult }) {
  const containerRef               = useRef(null);
  const containerSize              = useContainerSize(containerRef);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedId, setSelectedId]   = useState(null);

  const sheets      = nestingResult?.sheets      || [];
  const sheetsMeta  = nestingResult?.sheets_meta || [];

  // Use first sheet settings for margin hint (approximate)
  const firstMeta  = sheetsMeta[0] || {};
  const firstSheet = sheets[0]    || [];

  // Active sheet data
  const sheet = sheets[activeSheet] || [];
  const meta  = {
    ...(sheetsMeta[activeSheet] || {}),
    margin: 10, // default margin hint for overlay
  };

  // Derive selected part object
  const selectedPart = selectedId != null ? sheet.find(p => p.id === selectedId) : null;

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  const handleSheetSwitch = useCallback((idx) => {
    setSelectedId(null);
    setActiveSheet(idx);
  }, []);

  // Stats for the active sheet
  const partsOnSheet = sheet.length;
  const sheetArea    = meta.w != null ? (meta.w * meta.h / 1e6).toFixed(3) : "—";
  const usedArea     = sheet.reduce((s, p) => s + p.orig_w * p.orig_h, 0) / 1e6;
  const yieldPct     = meta.w ? ((usedArea / (meta.w * meta.h / 1e6)) * 100).toFixed(1) : "—";

  if (!sheets.length) return null;

  return (
    <div className="flex flex-col h-full">
      {/* ── Mini-toolbar ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--ss-border)", backgroundColor: "var(--ss-toolbar-bg)" }}
      >
        <SheetTabs
          count={sheets.length}
          activeIdx={activeSheet}
          sheetsMeta={sheetsMeta}
          onSwitch={handleSheetSwitch}
        />
        <div className="flex-1" />

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--ss-text-muted)" }}>
          <span>
            <span className="font-bold" style={{ color: "var(--ss-text)" }}>{partsOnSheet}</span> parts
          </span>
          <span>
            <span className="font-bold" style={{ color: "var(--ss-accent)" }}>{yieldPct}%</span> yield
          </span>
          <span>{meta.w?.toFixed(0)}×{meta.h?.toFixed(0)} mm</span>
        </div>

        <Legend sheets={sheets} />
      </div>

      {/* ── SVG canvas ───────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden">
        <SheetCanvas
          sheet={sheet}
          meta={meta}
          selectedId={selectedId}
          onSelect={handleSelect}
          containerSize={containerSize}
        />

        {/* Click-anywhere-to-deselect overlay (transparent) */}
        {selectedId != null && (
          <div
            className="absolute inset-0"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Part detail panel */}
        <PartDetailPanel part={selectedPart} onClose={() => setSelectedId(null)} />

        {/* Empty-click hint */}
        {!selectedId && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs pointer-events-none"
            style={{
              backgroundColor: "rgba(13,13,22,0.8)",
              border: "1px solid var(--ss-border)",
              color: "var(--ss-text-muted)",
              backdropFilter: "blur(8px)",
            }}
          >
            Click any part to inspect its dimensions
          </div>
        )}
      </div>
    </div>
  );
}
