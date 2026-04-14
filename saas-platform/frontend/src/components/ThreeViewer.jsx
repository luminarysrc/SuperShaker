/**
 * ThreeViewer.jsx — 3D G-code Visualization Canvas
 * Uses @react-three/fiber and @react-three/drei for interactive 3D rendering.
 *
 * Props:
 *   gcodeData      — parsed G-code (rapid, cutByGroup, cutByPass, zRange)
 *   bedWidth       — machine bed width  (mm)
 *   bedHeight      — machine bed height (mm)
 *   visibleLayers  — { rapid, pocket, contour, step, unknown } boolean flags
 *   colorMode      — "type" | "depth"  coloring strategy
 *   toolProgress   — 0.0–1.0 scrub position along cut path
 *   nestingResult  — optional nesting data to draw door footprint boxes
 */
import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Text } from "@react-three/drei";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════
//  Colour helpers
// ═══════════════════════════════════════════════════════════

const PASS_COLORS = {
  pocket:  new THREE.Color("#f97316"), // orange
  contour: new THREE.Color("#84cc16"), // lime
  step:    new THREE.Color("#a855f7"), // violet
  unknown: new THREE.Color("#94a3b8"), // slate
};

const TYPE_COLORS = {
  "Shaker":      new THREE.Color("#3b82f6"),
  "Shaker Step": new THREE.Color("#22c55e"),
  "Slab":        new THREE.Color("#f59e0b"),
  "default":     new THREE.Color("#94a3b8"),
};

/** Map a normalised depth (0 = surface, 1 = deepest) → a THREE.Color on a magenta→cyan gradient */
function depthColor(t) {
  // t=0 (surface): bright cyan tweaked to lime/cyan
  // t=1 (deep):    deep magenta/purple
  const surface = new THREE.Color("#22d3ee"); // cyan-400
  const deep    = new THREE.Color("#c026d3"); // fuchsia-600
  return surface.clone().lerp(deep, t);
}

// ═══════════════════════════════════════════════════════════
//  Machine bed / grid
// ═══════════════════════════════════════════════════════════

function MachineBed({ width, height }) {
  const gridSize = Math.max(width, height);
  return (
    <group>
      <Grid
        args={[gridSize * 1.2, gridSize * 1.2]}
        cellSize={10}
        cellThickness={0.4}
        cellColor="#1e293b"
        sectionSize={50}
        sectionThickness={0.8}
        sectionColor="#334155"
        fadeDistance={gridSize * 2}
        fadeStrength={1}
        position={[width / 2, height / 2, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {/* Bed outline */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={5}
            array={new Float32Array([
              0, 0, 0, width, 0, 0, width, height, 0, 0, height, 0, 0, 0, 0,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#475569" linewidth={1} />
      </line>
      {/* Origin axes */}
      <Line points={[[0,0,0],[20,0,0]]} color="#ef4444" lineWidth={2} />
      <Line points={[[0,0,0],[0,20,0]]} color="#22c55e" lineWidth={2} />
      <Line points={[[0,0,0],[0,0,20]]} color="#3b82f6" lineWidth={2} />
      <Text position={[26,0,0]} fontSize={6} color="#ef4444" anchorX="left">X</Text>
      <Text position={[0,26,0]} fontSize={6} color="#22c55e" anchorX="left">Y</Text>
      <Text position={[0,0,26]} fontSize={6} color="#3b82f6" anchorX="left">Z</Text>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
//  G-code lines — per-pass with Z-depth or type colouring
// ═══════════════════════════════════════════════════════════

function buildSegmentGeometry(segments, colorFn) {
  if (!segments || segments.length === 0) return null;

  const positions = new Float32Array(segments.length * 6);
  const colors    = new Float32Array(segments.length * 6); // 2 verts × RGB

  segments.forEach((seg, i) => {
    positions[i * 6 + 0] = seg[0];
    positions[i * 6 + 1] = seg[1];
    positions[i * 6 + 2] = seg[2];
    positions[i * 6 + 3] = seg[3];
    positions[i * 6 + 4] = seg[4];
    positions[i * 6 + 5] = seg[5];

    const [x0, y0, z0, x1, y1, z1, t] = seg;
    const c0 = colorFn(x0, y0, z0, t);
    const c1 = colorFn(x1, y1, z1, t);
    colors[i * 6 + 0] = c0.r; colors[i * 6 + 1] = c0.g; colors[i * 6 + 2] = c0.b;
    colors[i * 6 + 3] = c1.r; colors[i * 6 + 4] = c1.g; colors[i * 6 + 5] = c1.b;
  });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
  return geom;
}

function GcodeLines({ gcodeData, visibleLayers, colorMode }) {
  const geometries = useMemo(() => {
    if (!gcodeData) return null;
    const { rapid, cutByPass, cutByGroup, zRange } = gcodeData;
    const zSpan = (zRange?.max ?? 0) - (zRange?.min ?? 0);

    // colour function depending on mode
    const colorFnForPass = (passKey) => (x, y, z, type = "default") => {
      if (colorMode === "depth") {
        const t = zSpan > 0 ? Math.abs((z - (zRange?.max ?? 0)) / zSpan) : 0;
        return depthColor(Math.min(1, Math.max(0, t)));
      }
      if (colorMode === "type") {
        return (TYPE_COLORS[type] || TYPE_COLORS.default).clone();
      }
      return (PASS_COLORS[passKey] || PASS_COLORS.unknown).clone();
    };

    // Rapid geometry (always type-coloured: sky blue)
    let rapidGeom = null;
    if (rapid && rapid.length > 0) {
      const pos = new Float32Array(rapid.length * 6);
      rapid.forEach((s, i) => pos.set(s, i * 6));
      rapidGeom = new THREE.BufferGeometry();
      rapidGeom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    }

    // Per-pass cut geometries
    const passGeoms = {};
    if (cutByPass) {
      for (const [pass, segs] of Object.entries(cutByPass)) {
        if (segs.length === 0) continue;
        passGeoms[pass] = buildSegmentGeometry(segs, colorFnForPass(pass));
      }
    } else if (cutByGroup) {
      // Fallback: treat cutByGroup as "unknown" pass
      const allCuts = Object.values(cutByGroup).flat();
      if (allCuts.length > 0) {
        passGeoms["unknown"] = buildSegmentGeometry(allCuts, colorFnForPass("unknown"));
      }
    }

    return { rapidGeom, passGeoms };
  }, [gcodeData, colorMode]);

  if (!geometries) return null;
  const { rapidGeom, passGeoms } = geometries;

  return (
    <group>
      {/* Rapid moves — dashed, faint sky-blue */}
      {visibleLayers.rapid && rapidGeom && (
        <lineSegments geometry={rapidGeom}>
          <lineBasicMaterial color="#38bdf8" opacity={0.25} transparent />
        </lineSegments>
      )}

      {/* Cut moves — per pass type, vertex coloured */}
      {Object.entries(passGeoms).map(([pass, geom]) => {
        const visible = visibleLayers[pass] !== false; // default true for unknown passes
        if (!visible) return null;
        return (
          <lineSegments key={pass} geometry={geom}>
            <lineBasicMaterial vertexColors opacity={0.92} transparent />
          </lineSegments>
        );
      })}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
//  Tool head scrubber
// ═══════════════════════════════════════════════════════════

/** Animated glowing sphere that follows the tool progress along all cut segments */
function ToolHead({ gcodeData, toolProgress }) {
  const meshRef = useRef();
  const tailRef = useRef();

  // Build flat ordered list of all cut points
  const allPoints = useMemo(() => {
    if (!gcodeData) return [];
    const segs = gcodeData.cutByPass
      ? Object.values(gcodeData.cutByPass).flat()
      : Object.values(gcodeData.cutByGroup || {}).flat();

    if (segs.length === 0) return [];
    const pts = [];
    // Start from first segment start
    const [sx, sy, sz] = segs[0];
    pts.push(new THREE.Vector3(sx, sy, sz));
    for (const [,,,ex,ey,ez] of segs) {
      pts.push(new THREE.Vector3(ex, ey, ez));
    }
    return pts;
  }, [gcodeData]);

  const { position, tailPts } = useMemo(() => {
    if (allPoints.length < 2)
      return { position: new THREE.Vector3(0, 0, 30), tailPts: [] };

    const idx = Math.min(
      Math.floor(toolProgress * (allPoints.length - 1)),
      allPoints.length - 2
    );
    const frac = (toolProgress * (allPoints.length - 1)) - idx;
    const pos = allPoints[idx].clone().lerp(allPoints[idx + 1], frac);

    // trailing tail: last 40 points
    const tailStart = Math.max(0, idx - 40);
    const tail = allPoints.slice(tailStart, idx + 1);

    return { position: pos, tailPts: tail };
  }, [allPoints, toolProgress]);

  // Gentle bob animation for the tool sphere
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.z = position.z + Math.sin(clock.elapsedTime * 4) * 0.4;
    }
  });

  if (allPoints.length === 0) return null;

  return (
    <group>
      {/* Trailing tail line */}
      {tailPts.length > 1 && (
        <Line
          points={tailPts.map(p => [p.x, p.y, p.z])}
          color="#fbbf24"
          lineWidth={2}
          opacity={0.6}
          transparent
        />
      )}
      {/* Tool sphere */}
      <mesh ref={meshRef} position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[2, 16, 16]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>
      {/* Glow ring */}
      <mesh position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[3.5, 16, 16]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={0.4}
          opacity={0.18}
          transparent
        />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
//  Sheet / door footprint boxes
// ═══════════════════════════════════════════════════════════

function SheetBoxes({ nestingResult, settings }) {
  if (!nestingResult?.sheets) return null;

  const typeColors = {
    "Shaker":      "#3b82f6",
    "Shaker Step": "#22c55e",
    "Slab":        "#f59e0b",
  };

  return (
    <group>
      {nestingResult.sheets.map((sheet, si) => {
        const meta = nestingResult.sheets_meta?.[si];
        const sw = meta?.w ?? settings?.sheet_w ?? 2500;
        const sh = meta?.h ?? settings?.sheet_h ?? 1250;

        return (
          <group key={si}>
            {/* Sheet outline at Z=0 */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={5}
                  array={new Float32Array([
                    0, 0, 0.5, sw, 0, 0.5, sw, sh, 0.5, 0, sh, 0.5, 0, 0, 0.5,
                  ])}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#334155" linewidth={1} />
            </line>

            {/* Each door part as a thin coloured rectangle */}
            {sheet.map((part, pi) => {
              const c = typeColors[part.type] || "#6366f1";
              const pw = part.rotated ? part.h : part.w;
              const ph = part.rotated ? part.w : part.h;
              return (
                <line key={pi}>
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      count={5}
                      array={new Float32Array([
                        part.x      , part.y      , 0.5,
                        part.x + pw , part.y      , 0.5,
                        part.x + pw , part.y + ph , 0.5,
                        part.x      , part.y + ph , 0.5,
                        part.x      , part.y      , 0.5,
                      ])}
                      itemSize={3}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial color={c} opacity={0.5} transparent linewidth={1} />
                </line>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
//  Main exported component
// ═══════════════════════════════════════════════════════════

const DEFAULT_VISIBLE = {
  rapid:   true,
  pocket:  true,
  contour: true,
  step:    true,
  unknown: true,
};

export default function ThreeViewer({
  gcodeData,
  bedWidth    = 2500,
  bedHeight   = 1250,
  visibleLayers = DEFAULT_VISIBLE,
  colorMode   = "type",
  toolProgress = 0,
  nestingResult = null,
  settings    = null,
}) {
  const w = bedWidth  || 2500;
  const h = bedHeight || 1250;
  const cameraPos    = [w / 2, -h * 0.3, h * 1.5];
  const cameraTarget = [w / 2, h / 2, 0];

  return (
    <Canvas
      camera={{ position: cameraPos, fov: 50, near: 0.1, far: 500000, up: [0, 0, 1] }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#0d0d12" }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 100, 200]} intensity={0.6} />
      <pointLight position={[w / 2, h / 2, 100]} intensity={0.3} />

      <OrbitControls
        target={cameraTarget}
        up={[0, 0, 1]}
        enableDamping
        dampingFactor={0.1}
        minDistance={10}
        maxDistance={50000}
        makeDefault
      />

      <MachineBed key={`${w}-${h}`} width={w} height={h} />

      {nestingResult && (
        <SheetBoxes nestingResult={nestingResult} settings={settings} />
      )}

      <GcodeLines
        gcodeData={gcodeData}
        visibleLayers={visibleLayers}
        colorMode={colorMode}
      />

      {gcodeData && (
        <ToolHead gcodeData={gcodeData} toolProgress={toolProgress} />
      )}
    </Canvas>
  );
}
