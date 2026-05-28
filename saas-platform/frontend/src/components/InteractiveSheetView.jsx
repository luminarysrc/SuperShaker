/**
 * InteractiveSheetView.jsx
 * SVG-based interactive nesting map. Drag parts to reposition.
 * Press 'R' while dragging to rotate.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { updateNestingResult } from "../services/EngineClient.js";

const TYPE_STYLE = {
  "Shaker": { fill: "rgba(96,165,250,0.18)", stroke: "#60A5FA", label: "#93C5FD" },
  "Shaker Step": { fill: "rgba(132,204,22,0.15)", stroke: "#84CC16", label: "#BEF264" },
  "Slab": { fill: "rgba(249,115,22,0.14)", stroke: "#F97316", label: "#FB923C" },
  "Grooved Slab": { fill: "rgba(20,184,166,0.14)", stroke: "#14B8A6", label: "#2DD4BF" },
  "Beaded Shaker": { fill: "rgba(168,85,247,0.14)", stroke: "#A855F7", label: "#C084FC" },
  "Thin Rail Shaker": { fill: "rgba(244,63,94,0.14)", stroke: "#F43F5E", label: "#FB7185" },
  default: { fill: "rgba(143,155,179,0.14)", stroke: "#8F9BB3", label: "#8F9BB3" },
};

const SELECTED_STYLE = { fill: "rgba(108,99,255,0.18)", stroke: "#6C63FF", label: "#A5A0FF" };

function useContainerSize(ref) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return size;
}

function PartDetailPanel({ part, onClose, onEdit }) {
  if (!part) return null;
  const ts = TYPE_STYLE[part.type] || TYPE_STYLE.default;
  const area = (part.orig_w * part.orig_h / 1e6).toFixed(4);
  const rotated = Math.abs(part.w - part.orig_w) > 1;
  return (
    <div className="absolute top-4 right-4 z-20 rounded-2xl p-4 w-64 shadow-2xl"
      style={{ backgroundColor: "rgba(13,13,22,0.92)", border: `1px solid ${ts.stroke}44`, backdropFilter: "blur(12px)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ts.stroke }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: ts.label }}>{part.type}</span>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-lg leading-none opacity-50 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:outline-none rounded" style={{ color: "var(--ss-text-muted)" }}>×</button>
      </div>
      <div className="text-center py-3 rounded-xl mb-3" style={{ backgroundColor: `${ts.stroke}18`, border: `1px solid ${ts.stroke}33` }}>
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: ts.label }}>Part ID</p>
        <p className="text-3xl font-black font-mono" style={{ color: ts.label }}>#{part.id}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Width", value: `${part.orig_w} mm` },
          { label: "Height", value: `${part.orig_h} mm` },
          { label: "Area", value: `${area} m²` },
          { label: "Orient", value: rotated ? "Rotated" : "Normal" },
          { label: "Pos X", value: `${part.x.toFixed(1)} mm` },
          { label: "Pos Y", value: `${part.y.toFixed(1)} mm` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg p-2" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "var(--ss-text-muted)" }}>{label}</p>
            <p className="text-xs font-semibold font-mono" style={{ color: "var(--ss-text)" }}>{value}</p>
          </div>
        ))}
      </div>
      {part.is_small && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs mb-3"
          style={{ backgroundColor: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
          ⚠ Small part — may use tabs
        </div>
      )}
      <button onClick={() => onEdit(part.id)} className="w-full py-2 rounded-lg text-xs font-semibold mt-2"
        style={{ backgroundColor: ts.stroke, color: "#fff" }}>
        Edit Part
      </button>
    </div>
  );
}

function SheetTabs({ count, activeIdx, sheetsMeta, onSwitch }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }, (_, i) => {
        const isOffcut = sheetsMeta?.[i]?.is_offcut;
        return (
          <button key={i} onClick={() => onSwitch(i)} className="px-3 py-1 rounded-md text-xs font-mono transition-all"
            style={{ backgroundColor: activeIdx === i ? "var(--ss-accent-soft)" : "transparent", color: activeIdx === i ? "var(--ss-accent)" : "var(--ss-text-muted)", border: activeIdx === i ? "1px solid rgba(132,204,22,0.25)" : "1px solid transparent" }}>
            {isOffcut ? `✂ Off${i + 1}` : `S${i + 1}`}
          </button>
        );
      })}
    </div>
  );
}

function Legend({ types }) {
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

export default function InteractiveSheetView({ nestingResult }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const containerSize = useContainerSize(containerRef);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  // Local copy of sheets so optimistic updates render immediately
  const [localSheets, setLocalSheets] = useState(null);
  useEffect(() => {
    if (nestingResult?.sheets) setLocalSheets(nestingResult.sheets.map(s => [...s]));
  }, [nestingResult]);

  // Drag state lives in a ref so window listeners always read fresh values
  const drag = useRef(null);
  // Ghost position for rendering — this is React state so it re-renders
  const [ghost, setGhost] = useState(null);

  const sheets = localSheets || nestingResult?.sheets || [];
  const sheetsMeta = nestingResult?.sheets_meta || [];
  const sheet = sheets[activeSheet] || [];
  const meta = { ...(sheetsMeta[activeSheet] || {}), margin: 10 };
  const selectedPart = selectedId != null ? sheet.find(p => p.id === selectedId) : null;

  // ── Geometry helpers (derived from current containerSize + meta) ──
  const PADDING = 40;
  const getGeom = useCallback(() => {
    const sw = meta.w || 2500;
    const sh = meta.h || 1250;
    const availW = containerSize.w - PADDING * 2;
    const availH = containerSize.h - PADDING * 2;
    const scale = Math.min(availW / sw, availH / sh);
    const drawW = sw * scale;
    const drawH = sh * scale;
    const ox = (containerSize.w - drawW) / 2;
    const oy = (containerSize.h - drawH) / 2;
    const toX = v => ox + v * scale;
    const toY = v => oy + (sh - v) * scale;
    const toLen = v => v * scale;
    const fromSvgX = svgX => (svgX - ox) / scale;
    const fromSvgY = svgY => sh - (svgY - oy) / scale;
    return { sw, sh, scale, drawW, drawH, ox, oy, toX, toY, toLen, fromSvgX, fromSvgY };
  }, [containerSize, meta]);

  // ── Snap ──────────────────────────────────────────────────────────
  const calculateSnap = useCallback((tx, ty, nw, nh, ignoreIdx) => {
    const settings = JSON.parse(localStorage.getItem("ss_settings") || "{}");
    const margin = settings.margin || meta.margin || 10;
    const kerf = settings.kerf || 5;
    const sw = meta.w || settings.sheet_w || 2500;
    const sh = meta.h || settings.sheet_h || 1250;
    const snapDist = 20;
    let snapTx = tx, snapTy = ty, dX = snapDist, dY = snapDist;

    const tryX = t => { const d = Math.abs(tx - t); if (d < dX) { snapTx = t; dX = d; } };
    const tryY = t => { const d = Math.abs(ty - t); if (d < dY) { snapTy = t; dY = d; } };

    tryX(margin); tryX(sw - margin - nw);
    tryY(margin); tryY(sh - margin - nh);

    for (let i = 0; i < sheet.length; i++) {
      if (i === ignoreIdx) continue;
      const o = sheet[i];
      const ow = o.rotated ? o.h : o.w;
      const oh = o.rotated ? o.w : o.h;
      if (ty < o.y + oh + snapDist && ty + nh > o.y - snapDist) { tryX(o.x - nw - kerf); tryX(o.x + ow + kerf); }
      if (tx < o.x + ow + snapDist && tx + nw > o.x - snapDist) { tryY(o.y - nh - kerf); tryY(o.y + oh + kerf); }
    }
    return { tx: snapTx, ty: snapTy };
  }, [sheet, meta]);

  // ── Pointer down on a part ────────────────────────────────────────
  const handlePartPointerDown = useCallback((e, part, idx) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const svgRect = svgRef.current.getBoundingClientRect();
    const cx = e.clientX - svgRect.left;
    const cy = e.clientY - svgRect.top;
    const { toX, toY } = getGeom();
    const ph = part.rotated ? part.w : part.h;

    drag.current = {
      part, idx,
      startCx: cx, startCy: cy,
      cx, cy,
      ox: cx - toX(part.x),
      oy: cy - (toY(part.y) - getGeom().toLen(ph)),
      rotated: part.rotated || false,
      forcedRotate: false,
    };

    setGhost({ cx, cy, rotated: part.rotated || false });
  }, [getGeom]);

  // ── Window-level move / up ────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const cx = e.clientX - svgRect.left;
      const cy = e.clientY - svgRect.top;
      drag.current.cx = cx;
      drag.current.cy = cy;
      setGhost(prev => prev ? { ...prev, cx, cy } : null);
    };

    const onUp = (e) => {
      if (!drag.current) return;
      const d = drag.current;
      drag.current = null;
      setGhost(null);

      const dist = Math.hypot(d.cx - d.startCx, d.cy - d.startCy);

      // Treat as click
      if (dist < 4 && !d.forcedRotate) {
        setSelectedId(prev => prev === d.part.id ? null : d.part.id);
        return;
      }

      // Compute drop position
      const { sw, sh, ox, oy, scale, fromSvgX, fromSvgY, toLen } = getGeom();
      const nw = d.rotated ? d.part.h : d.part.w;
      const nh = d.rotated ? d.part.w : d.part.h;

      const finalSvgX = d.cx - d.ox;
      const finalSvgY = d.cy - d.oy;

      const rawTx = (finalSvgX - ox) / scale;
      const rawTy = sh - ((finalSvgY - oy) / scale) - nh;

      const { tx, ty } = calculateSnap(rawTx, rawTy, nw, nh, d.idx);

      // Bounds check
      const settings = JSON.parse(localStorage.getItem("ss_settings") || "{}");
      const margin = settings.margin || meta.margin || 10;
      const kerf = settings.kerf || 5;
      if (tx < margin - 0.1 || ty < margin - 0.1 || tx + nw > sw - margin + 0.1 || ty + nh > sh - margin + 0.1) return;

      // Collision check
      for (let oi = 0; oi < sheet.length; oi++) {
        if (oi === d.idx) continue;
        const o = sheet[oi];
        const ow = o.rotated ? o.h : o.w;
        const oh = o.rotated ? o.w : o.h;
        if (tx < o.x + ow + kerf - 0.1 && tx + nw + kerf > o.x + 0.1 &&
          ty < o.y + oh + kerf - 0.1 && ty + nh + kerf > o.y + 0.1) return;
      }

      // Optimistic local update
      setLocalSheets(prev => {
        if (!prev) return prev;
        const next = prev.map(s => [...s]);
        next[activeSheet][d.idx] = { ...next[activeSheet][d.idx], x: tx, y: ty, w: nw, h: nh, rotated: d.rotated };
        // Sync to backend via event (SuperShakerPanel listens)
        document.dispatchEvent(new CustomEvent("update-nesting-layout", { detail: { sheets: next } }));
        return next;
      });
    };

    const onKey = (e) => {
      if ((e.key === "r" || e.key === "R") && drag.current) {
        drag.current.rotated = !drag.current.rotated;
        drag.current.forcedRotate = true;
        setGhost(prev => prev ? { ...prev, rotated: drag.current.rotated } : null);
      } i
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [activeSheet, calculateSnap, getGeom, meta, sheet]);

  // ── Edit part ─────────────────────────────────────────────────────
  const handleEditPart = useCallback((id) => {
    document.dispatchEvent(new CustomEvent("edit-door-part", { detail: { id } }));
  }, []);

  if (!sheets.length) return null;

  const { toX, toY, toLen, ox, oy, drawW, drawH, sw, sh, scale } = getGeom();
  const MIN_LABEL_PX = 36;

  // Ghost rendering
  let ghostEl = null;
  if (ghost && drag.current) {
    const d = drag.current;
    const nw = ghost.rotated ? d.part.h : d.part.w;
    const nh = ghost.rotated ? d.part.w : d.part.h;
    const rawTx = (ghost.cx - d.ox - ox) / scale;
    const rawTy = sh - ((ghost.cy - d.oy - oy) / scale) - nh;
    const { tx: stx, ty: sty } = calculateSnap(rawTx, rawTy, nw, nh, d.idx);
    const gpx = toX(stx);
    const gpy = toY(sty) - toLen(nh);
    const gpw = toLen(nw);
    const gph = toLen(nh);
    ghostEl = (
      <g style={{ pointerEvents: "none" }}>
        <rect x={gpx} y={gpy} width={gpw} height={gph} fill="rgba(108,99,255,0.25)" stroke="#6C63FF" strokeWidth={2} strokeDasharray="6 3" rx={2} />
        <text x={gpx + gpw / 2} y={gpy + gph / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={Math.min(13, Math.max(8, gpw / 6))} fontWeight="700" fill="#A5A0FF">{d.part.id}</text>
      </g>
    );
  }

  const allTypes = [...new Set(sheets.flat().map(p => p.type))];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--ss-border)", backgroundColor: "var(--ss-toolbar-bg)" }}>
        <SheetTabs count={sheets.length} activeIdx={activeSheet} sheetsMeta={sheetsMeta}
          onSwitch={i => { setSelectedId(null); setActiveSheet(i); }} />
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--ss-text-muted)" }}>
          <span><span className="font-bold" style={{ color: "var(--ss-text)" }}>{sheet.length}</span> parts</span>
          <span>
            <span className="font-bold" style={{ color: "var(--ss-accent)" }}>
              {meta.w ? ((sheet.reduce((s, p) => s + p.orig_w * p.orig_h, 0) / 1e6) / (meta.w * meta.h / 1e6) * 100).toFixed(1) : "—"}%
            </span> yield
          </span>
          <span>{meta.w?.toFixed(0)}×{meta.h?.toFixed(0)} mm</span>
        </div>
        <Legend types={allTypes} />
      </div>

      {/* SVG canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden" style={{ outline: "none" }}>
        <svg ref={svgRef} width={containerSize.w} height={containerSize.h}
          style={{ display: "block", userSelect: "none", cursor: ghost ? "grabbing" : "default" }}>
          <defs>
            <pattern id="isv-grid" width={toLen(100)} height={toLen(100)} patternUnits="userSpaceOnUse" x={ox} y={oy}>
              <path d={`M ${toLen(100)} 0 L 0 0 0 ${toLen(100)}`} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            </pattern>
            <pattern id="isv-hatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x={ox} y={oy} width={drawW} height={drawH} fill="#08090F" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
          <rect x={ox} y={oy} width={drawW} height={drawH} fill="url(#isv-grid)" />
          {meta.margin > 0 && (
            <rect x={toX(meta.margin)} y={toY(sh - meta.margin)}
              width={toLen(sw - meta.margin * 2)} height={toLen(sh - meta.margin * 2)}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} strokeDasharray="6 4" />
          )}

          {Array.from({ length: Math.floor(sw / 100) + 1 }, (_, i) => i * 100).map(mm => (
            <g key={mm}>
              <line x1={toX(mm)} y1={oy + drawH} x2={toX(mm)} y2={oy + drawH + 6} stroke="#475569" strokeWidth={0.8} />
              {mm % 500 === 0 && <text x={toX(mm)} y={oy + drawH + 16} textAnchor="middle" fontSize={9} fill="#475569">{mm}</text>}
            </g>
          ))}

          {sheet.map((part, idx) => {
            const isDraggingThis = ghost && drag.current?.idx === idx;
            const isSel = part.id === selectedId;
            const ts = isSel ? SELECTED_STYLE : (TYPE_STYLE[part.type] || TYPE_STYLE.default);
            const pw = toLen(part.rotated ? part.h : part.w);
            const ph = toLen(part.rotated ? part.w : part.h);
            const px = toX(part.x);
            const py = toY(part.y) - ph;
            const showLabel = pw > MIN_LABEL_PX && ph > MIN_LABEL_PX;
            return (
              <g key={part.id}
                onPointerDown={e => handlePartPointerDown(e, part, idx)}
                style={{ cursor: "grab", opacity: isDraggingThis ? 0 : 1 }}>
                {part.is_small && <rect x={px} y={py} width={pw} height={ph} fill="url(#isv-hatch)" fillOpacity={0.6} />}
                <rect x={px} y={py} width={pw} height={ph} fill={ts.fill} stroke={ts.stroke} strokeWidth={isSel ? 2 : 1} rx={2} />
                {["Shaker", "Shaker Step", "Beaded Shaker", "Thin Rail Shaker", "Shaker Rail", "Glass"].includes(part.type) && pw > 80 && ph > 80 && (() => {
                  const fw = toLen(part.type === "Thin Rail Shaker" ? 45 : 65);
                  const innerW = Math.max(0, pw - fw * 2);
                  const innerH = Math.max(0, ph - fw * 2);
                  if (part.type === "Shaker Rail") {
                     const rp = toLen(part.rail_position || part.orig_h / 2);
                     const rpY = part.rotated ? pw - rp : rp;
                     const railH = fw;
                     return (
                        <g>
                           <rect x={px + fw} y={py + fw} width={innerW} height={Math.max(0, ph - rpY - railH/2 - fw)} fill="none" stroke={ts.stroke} strokeWidth={0.6} strokeDasharray="3 3" opacity={0.4} />
                           <rect x={px + fw} y={py + ph - rpY + railH/2} width={innerW} height={Math.max(0, rpY - railH/2 - fw)} fill="none" stroke={ts.stroke} strokeWidth={0.6} strokeDasharray="3 3" opacity={0.4} />
                        </g>
                     );
                  }
                  if (part.type === "Glass") {
                     return <rect x={px + fw} y={py + fw} width={innerW} height={innerH} fill={ts.fill} stroke={ts.stroke} strokeWidth={1} strokeDasharray="5 5" opacity={0.6} />;
                  }
                  return <rect x={px + fw} y={py + fw} width={innerW} height={innerH} fill="none" stroke={ts.stroke} strokeWidth={0.6} strokeDasharray="3 3" opacity={0.4} />;
                })()}
                {showLabel && (
                  <>
                    <text x={px + pw / 2} y={py + ph / 2 - (pw > 60 ? 7 : 0)} textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(13, Math.max(8, pw / 6))} fontWeight="700" fill={ts.label}>{part.id}</text>
                    {pw > 60 && ph > 30 && <text x={px + pw / 2} y={py + ph / 2 + 9} textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(10, Math.max(7, pw / 9))} fill={ts.label} opacity={0.7}>{part.orig_w}×{part.orig_h}</text>}
                  </>
                )}
                {isSel && <rect x={px - 3} y={py - 3} width={pw + 6} height={ph + 6} fill="none" stroke="#6C63FF" strokeWidth={1.5} strokeDasharray="5 3" rx={4} opacity={0.8} />}
              </g>
            );
          })}

          {ghostEl}

          <text x={ox + drawW / 2} y={oy - 8} textAnchor="middle" fontSize={11} fill="#64748b">{sw.toFixed(0)} mm</text>
          <text x={ox - 10} y={oy + drawH / 2} textAnchor="middle" fontSize={11} fill="#64748b"
            transform={`rotate(-90,${ox - 10},${oy + drawH / 2})`}>{sh.toFixed(0)} mm</text>
        </svg>

        <PartDetailPanel part={selectedPart} onClose={() => setSelectedId(null)} onEdit={handleEditPart} />

        {!selectedId && !ghost && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs pointer-events-none"
            style={{ backgroundColor: "rgba(13,13,22,0.8)", border: "1px solid var(--ss-border)", color: "var(--ss-text-muted)", backdropFilter: "blur(8px)" }}>
            Drag to move · R to rotate · Click to inspect
          </div>
        )}
      </div>
    </div>
  );
}
