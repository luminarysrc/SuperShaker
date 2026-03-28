/**
 * ThreeViewer.jsx — 3D G-code Visualization Canvas
 * ═══════════════════════════════════════════════════════════════════════
 * Uses @react-three/fiber (R3F) and @react-three/drei to render:
 *   - A grid plane representing the CNC machine bed
 *   - G-code toolpath lines: blue dashed (rapid) + green solid (cut)
 *   - OrbitControls for interactive pan/zoom/rotate
 *
 * Props:
 *   @param {Object} gcodeData - Output from parseGcode():
 *     { rapid: [[x1,y1,z1,x2,y2,z2], ...], cut: [...] }
 *   @param {number} bedWidth  - Machine bed width in mm (for grid sizing)
 *   @param {number} bedHeight - Machine bed height in mm
 *
 * ──────────────────────────────────────────────────────────────────────
 * TODO: INTEGRATION POINT — Performance Upgrades
 * For files > 500K lines, consider:
 *   1. Using instanced BufferGeometry instead of <lineSegments>
 *   2. Adding LOD (Level of Detail) via Douglas-Peucker simplification
 *   3. Moving parsing to a Web Worker (see EngineClient.js)
 *   4. Implementing frustum culling with spatial chunking (octree)
 * ──────────────────────────────────────────────────────────────────────
 */
import React, { useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Text } from "@react-three/drei";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════════════
//  Inner scene components (rendered inside the R3F Canvas)
// ═══════════════════════════════════════════════════════════════════════

/**
 * CNC Machine Bed — grid plane with axis labels
 */
function MachineBed({ width, height }) {
  const gridSize = Math.max(width, height);
  return (
    <group>
      {/* Semi-transparent grid on the XY plane */}
      <Grid
        args={[gridSize * 1.2, gridSize * 1.2]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#1e293b"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#334155"
        fadeDistance={gridSize * 2}
        fadeStrength={1}
        position={[width / 2, height / 2, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* Machine bed outline (white rectangle) */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={5}
            array={new Float32Array([
              0, 0, 0,
              width, 0, 0,
              width, height, 0,
              0, height, 0,
              0, 0, 0,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#475569" linewidth={1} />
      </line>

      {/* Origin marker (small red/green/blue axes) */}
      {/* X axis — red */}
      <Line
        points={[[0, 0, 0], [20, 0, 0]]}
        color="#ef4444"
        lineWidth={2}
      />
      {/* Y axis — green */}
      <Line
        points={[[0, 0, 0], [0, 20, 0]]}
        color="#22c55e"
        lineWidth={2}
      />
      {/* Z axis — blue */}
      <Line
        points={[[0, 0, 0], [0, 0, 20]]}
        color="#3b82f6"
        lineWidth={2}
      />

      {/* Axis labels */}
      <Text position={[25, 0, 0]} fontSize={6} color="#ef4444" anchorX="left">
        X
      </Text>
      <Text position={[0, 25, 0]} fontSize={6} color="#22c55e" anchorX="left">
        Y
      </Text>
      <Text position={[0, 0, 25]} fontSize={6} color="#3b82f6" anchorX="left">
        Z
      </Text>
    </group>
  );
}

/**
 * GcodeLines — renders parsed G-code segments as colored 3D lines
 *
 * Rapid moves  → dashed cyan lines (semi-transparent)
 * Cutting moves → solid green lines (full opacity)
 */
function GcodeLines({ gcodeData }) {
  // Build Float32Array geometry from segment arrays
  const geometries = useMemo(() => {
    if (!gcodeData) return null;

    // Rapid lines
    const rapidVerts = new Float32Array(gcodeData.rapid.length * 6);
    gcodeData.rapid.forEach((seg, i) => {
      rapidVerts.set(seg, i * 6);
    });
    const rapidGeom = new THREE.BufferGeometry();
    if (gcodeData.rapid.length > 0) {
      rapidGeom.setAttribute("position", new THREE.BufferAttribute(rapidVerts, 3));
    }

    // Cut lines by group
    const cuts = {};
    if (gcodeData.cutByGroup) {
      for (const [group, segments] of Object.entries(gcodeData.cutByGroup)) {
        if (segments.length === 0) continue;
        const verts = new Float32Array(segments.length * 6);
        segments.forEach((seg, i) => verts.set(seg, i * 6));
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        cuts[group] = geom;
      }
    }

    return { rapid: rapidGeom, cuts };
  }, [gcodeData]);

  if (!geometries) return null;

  const colors = {
    "Shaker": "#3b82f6",       // blue
    "Shaker Step": "#22c55e",  // green
    "Slab": "#f59e0b",         // yellow
    "default": "#94a3b8",      // gray
  };

  return (
    <group>
      {/* Rapid moves — cyan dashed */}
      {geometries.rapid.attributes.position && (
        <lineSegments geometry={geometries.rapid}>
          <lineDashedMaterial
            color="#38bdf8"
            dashSize={3}
            gapSize={2}
            opacity={0.35}
            transparent
          />
        </lineSegments>
      )}

      {/* Cutting moves — colored by door type */}
      {Object.entries(geometries.cuts).map(([group, geom]) => (
        <lineSegments key={group} geometry={geom}>
          <lineBasicMaterial color={colors[group] || colors.default} linewidth={1} />
        </lineSegments>
      ))}
    </group>
  );
}

/**
 * Tool position indicator — small sphere showing current tool position
 */
function ToolIndicator({ gcodeData }) {
  const lastPos = useMemo(() => {
    if (!gcodeData) return [0, 0, 30];
    
    // gather all segments to find the last one
    let allCutSegs = [];
    if (gcodeData.cutByGroup) {
      Object.values(gcodeData.cutByGroup).forEach(arr => {
        allCutSegs = allCutSegs.concat(arr);
      });
    } else if (gcodeData.cut) {
      allCutSegs = gcodeData.cut;
    }
    
    const allSegs = [...gcodeData.rapid, ...allCutSegs];
    if (allSegs.length === 0) return [0, 0, 30];
    const last = allSegs[allSegs.length - 1];
    return [last[3], last[4], last[5]]; // end position of last segment
  }, [gcodeData]);

  return (
    <mesh position={lastPos}>
      <sphereGeometry args={[1.5, 16, 16]} />
      <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Main exported component
// ═══════════════════════════════════════════════════════════════════════

export default function ThreeViewer({ gcodeData, bedWidth = 2500, bedHeight = 1250 }) {
  // Camera default: looking at center of the bed from above-front
  const cameraPos = [bedWidth / 2, -bedHeight * 0.3, bedHeight * 1.5];
  const cameraTarget = [bedWidth / 2, bedHeight / 2, 0];

  return (
    <Canvas
      camera={{
        position: cameraPos,
        fov: 50,
        near: 0.1,
        far: 500000,
        up: [0, 0, 1],
      }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#0a0c12" }}
      dpr={[1, 2]}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 100, 200]} intensity={0.6} />
      <pointLight position={[bedWidth / 2, bedHeight / 2, 100]} intensity={0.3} />

      {/* Interactive camera controls */}
      <OrbitControls
        target={cameraTarget}
        up={[0, 0, 1]}
        enableDamping
        dampingFactor={0.1}
        minDistance={10}
        maxDistance={50000}
        makeDefault
      />

      {/* Machine bed grid + axes */}
      <MachineBed width={bedWidth} height={bedHeight} />

      {/* Rendered G-code toolpath */}
      <GcodeLines gcodeData={gcodeData} />

      {/* Tool position indicator */}
      <ToolIndicator gcodeData={gcodeData} />
    </Canvas>
  );
}
