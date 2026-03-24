/**
 * App.jsx — SuperShaker SaaS Application Root
 * Two-panel layout: SuperShakerPanel (left) + GcodeViewerPanel (right)
 */
import React, { useState, useCallback, useEffect } from "react";
import LoginScreen from "./components/LoginScreen.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SuperShakerPanel from "./components/SuperShakerPanel.jsx";
import GcodeViewerPanel from "./components/GcodeViewerPanel.jsx";
import { listProfiles, createProfile, renameProfile, deleteProfile, loadProfile, saveProfile } from "./services/EngineClient.js";

export default function App() {
  const [user, setUser] = useState(null);

  // G-code state — flows from SuperShaker → Viewer
  const [gcodeData, setGcodeData] = useState(null);
  const [gcodeText, setGcodeText] = useState(null);
  const [gcodeStats, setGcodeStats] = useState(null);
  const [allSheets, setAllSheets] = useState(null);
  const [nestingResult, setNestingResult] = useState(null);
  const [orderId, setOrderId] = useState("");

  // Machine profiles
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [settingsVersion, setSettingsVersion] = useState(0); // bump to tell SuperShakerPanel to re-fetch

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

  // Fetch profiles on login
  useEffect(() => {
    if (!user) return;
    listProfiles().then(data => {
      setProfiles(data.profiles || []);
      setActiveProfileId(data.active_id);
    }).catch(console.error);
  }, [user]);

  // Refresh the profile list helper
  const refreshProfiles = async () => {
    const data = await listProfiles();
    setProfiles(data.profiles || []);
    setActiveProfileId(data.active_id);
    return data;
  };

  const handleProfileSwitch = useCallback(async (id) => {
    try {
      await loadProfile(id);
      setActiveProfileId(id);
      setSettingsVersion(v => v + 1);
    } catch (e) { console.error(e); }
  }, []);

  const handleProfileSave = useCallback(async (id) => {
    try {
      await saveProfile(id);
    } catch (e) { console.error(e); }
  }, []);

  const handleProfileCreate = useCallback(async (name) => {
    try {
      const created = await createProfile(name);
      await refreshProfiles();
      setSettingsVersion(v => v + 1);
    } catch (e) { console.error(e); }
  }, []);

  const handleProfileDelete = useCallback(async (id) => {
    try {
      const result = await deleteProfile(id);
      await refreshProfiles();
      if (result.active_id !== activeProfileId) {
        setSettingsVersion(v => v + 1);
      }
    } catch (e) { console.error(e); }
  }, [activeProfileId]);

  const handleProfileRename = useCallback(async (id, name) => {
    try {
      await renameProfile(id, name);
      await refreshProfiles();
    } catch (e) { console.error(e); }
  }, []);

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden bg-cnc-bg">
      <Sidebar
        user={user}
        onLogout={handleLogout}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onProfileSwitch={handleProfileSwitch}
        onProfileSave={handleProfileSave}
        onProfileCreate={handleProfileCreate}
        onProfileDelete={handleProfileDelete}
        onProfileRename={handleProfileRename}
      />
      <div className="flex-1 flex min-w-0">
        {/* Left: SuperShaker Tool Panel */}
        <div className="w-[380px] min-w-[340px] max-w-[440px] flex-shrink-0
                        border-r border-[rgba(255,255,255,0.08)] bg-[#0F0F11]">
          <SuperShakerPanel
            onGcodeGenerated={handleGcodeGenerated}
            onNestingDone={handleNestingDone}
            settingsVersion={settingsVersion}
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
