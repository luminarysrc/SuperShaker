/**
 * App.jsx — SuperShaker SaaS Application Root
 * Two-panel layout: SuperShakerPanel (left) + GcodeViewerPanel (right)
 */
import React, { useState, useCallback } from "react";
import LoginScreen from "./components/LoginScreen.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SuperShakerPanel from "./components/SuperShakerPanel.jsx";
import GcodeViewerPanel from "./components/GcodeViewerPanel.jsx";

export default function App() {
  const [user, setUser] = useState(null);

  // G-code state — flows from SuperShaker → Viewer
  const [gcodeData, setGcodeData] = useState(null);
  const [gcodeText, setGcodeText] = useState(null);
  const [gcodeStats, setGcodeStats] = useState(null);
  const [allSheets, setAllSheets] = useState(null);
  const [nestingResult, setNestingResult] = useState(null);
  const [orderId, setOrderId] = useState("");

  const handleLogin = useCallback((u) => setUser(u), []);
  const handleLogout = useCallback(() => {
    setUser(null);
    setGcodeData(null);
    setGcodeText(null);
    setAllSheets(null);
    setNestingResult(null);
  }, []);

  const handleGcodeGenerated = useCallback(({ gcodeText, gcodeData, stats, allSheets, orderId }) => {
    setGcodeData(gcodeData);
    setGcodeText(gcodeText);
    setGcodeStats(stats);
    setAllSheets(allSheets);
    setOrderId(orderId || "");
  }, []);

  const handleNestingDone = useCallback((result) => {
    setNestingResult(result);
    // Clear previous G-code when nesting changes
    setGcodeData(null);
    setGcodeText(null);
    setAllSheets(null);
    setOrderId("");
  }, []);

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden bg-cnc-bg">
      <Sidebar user={user} onLogout={handleLogout} />
      <div className="flex-1 flex min-w-0">
        {/* Left: SuperShaker Tool Panel */}
        <div className="w-[380px] min-w-[340px] max-w-[440px] flex-shrink-0
                        border-r border-cnc-border">
          <SuperShakerPanel
            onGcodeGenerated={handleGcodeGenerated}
            onNestingDone={handleNestingDone}
          />
        </div>
        {/* Right: G-code 3D Viewer */}
        <div className="flex-1 min-w-0">
          <GcodeViewerPanel
            gcodeData={gcodeData}
            gcodeText={gcodeText}
            stats={gcodeStats}
            allSheets={allSheets}
            orderId={orderId}
          />
        </div>
      </div>
    </div>
  );
}
