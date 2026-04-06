/**
 * ThreeViewer.jsx — 3D G-code Visualization Canvas
 * Uses @react-three/fiber and @react-three/drei for interactive 3D rendering.
 * Adapts to light/dark theme.
 */
import React, { useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Text } from "@react-three/drei";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════
//  Inner scene components
// ═══════════════════════════════════════════════════════════

function MachineBed({ width, height }) {
  const gridSize = Math.max(width, height);
  const isDark = true;
  return (
    <group>
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

      {/* Machine bed outline */}
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

      {/* Origin axes */}
      <Line points={[[0, 0, 0], [20, 0, 0]]} color="#ef4444" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, 20, 0]]} color="#22c55e" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, 0, 20]]} color="#3b82f6" lineWidth={2} />

      {/* Axis labels */}
      <Text position={[25, 0, 0]} fontSize={6} color="#ef4444" anchorX="left">X</Text>
      <Text position={[0, 25, 0]} fontSize={6} color="#22c55e" anchorX="left">Y</Text>
      <Text position={[0, 0, 25]} fontSize={6} color="#3b82f6" anchorX="left">Z</Text>
    </group>
  );
}

function GcodeLines({ gcodeData }) {
  const geometries = useMemo(() => {
    if (!gcodeData) return null;

    const rapidVerts = new Float32Array(gcodeData.rapid.length * 6);
    gcodeData.rapid.forEach((seg, i) => {
      rapidVerts.set(seg, i * 6);
    });
    const rapidGeom = new THREE.BufferGeometry();
    if (gcodeData.rapid.length > 0) {
      rapidGeom.setAttribute("position", new THREE.BufferAttribute(rapidVerts, 3));
    }

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
    "Shaker": "#3b82f6",
    "Shaker Step": "#22c55e",
    "Slab": "#f59e0b",
    "default": "#94a3b8",
  };

  return (
    <group>
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

      {Object.entries(geometries.cuts).map(([group, geom]) => (
        <lineSegments key={group} geometry={geom}>
          <lineBasicMaterial color={colors[group] || colors.default} linewidth={1} />
        </lineSegments>
      ))}
    </group>
  );
}

function ToolIndicator({ gcodeData }) {
  const lastPos = useMemo(() => {
    if (!gcodeData) return [0, 0, 30];
    
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
    return [last[3], last[4], last[5]];
  }, [gcodeData]);

  return (
    <mesh position={lastPos}>
      <sphereGeometry args={[1.5, 16, 16]} />
      <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════
//  Main exported component
// ═══════════════════════════════════════════════════════════

export default function ThreeViewer({ gcodeData, bedWidth = 2500, bedHeight = 1250 }) {
  const cameraPos = [bedWidth / 2, -bedHeight * 0.3, bedHeight * 1.5];
  const cameraTarget = [bedWidth / 2, bedHeight / 2, 0];
  const bgColor = "#0d0d12";
  const isDark = true;

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
      style={{ background: bgColor }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 100, 200]} intensity={0.6} />
      <pointLight position={[bedWidth / 2, bedHeight / 2, 100]} intensity={0.3} />

      <OrbitControls
        target={cameraTarget}
        up={[0, 0, 1]}
        enableDamping
        dampingFactor={0.1}
        minDistance={10}
        maxDistance={50000}
        makeDefault
      />

      <MachineBed key={`${bedWidth}-${bedHeight}`} width={bedWidth} height={bedHeight} />
      <GcodeLines gcodeData={gcodeData} />
      <ToolIndicator gcodeData={gcodeData} />
    </Canvas>
  );
}
