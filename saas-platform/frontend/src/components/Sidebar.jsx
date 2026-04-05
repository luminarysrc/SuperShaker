/**
 * Sidebar.jsx — Slim sidebar with user info, machine profiles, theme toggle
 */
import React, { useState, useRef, useEffect } from "react";
import ThemeToggle from "./ThemeToggle.jsx";

export default function Sidebar({
  user, onLogout,
  profiles, activeProfileId,
  onProfileSwitch, onProfileSave, onProfileCreate, onProfileDelete, onProfileRename,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMachinePanel, setShowMachinePanel] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const machinePanelRef = useRef(null);
  const profileMenuRef = useRef(null);

  // Close panels when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (showMachinePanel && machinePanelRef.current && !machinePanelRef.current.contains(e.target)) {
        setShowMachinePanel(false);
      }
      if (showProfileMenu && profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMachinePanel, showProfileMenu]);

  const handleCreateProfile = () => {
    const name = newProfileName.trim();
    if (name && onProfileCreate) {
      onProfileCreate(name);
      setNewProfileName("");
    }
  };

  const handleStartRename = (p) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const handleCommitRename = () => {
    if (renamingId && renameValue.trim() && onProfileRename) {
      onProfileRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const activeProfile = profiles?.find(p => p.id === activeProfileId);

  return (
    <aside
      className="w-16 border-r flex flex-col items-center py-4 flex-shrink-0 relative"
      style={{
        backgroundColor: "var(--ss-sidebar-bg)",
        borderColor: "var(--ss-border)",
      }}
      id="sidebar"
    >
      {/* Top: User profile */}
      <div className="relative" ref={profileMenuRef}>
        <button 
          onClick={() => { setShowProfileMenu(!showProfileMenu); setShowMachinePanel(false); }}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all focus:outline-none active:scale-95"
          style={{
            backgroundColor: "var(--ss-accent)",
            color: "var(--ss-text-inverse)",
          }}
          title={user?.name || "User Profile"}>
          {(user?.name || "U")[0].toUpperCase()}
        </button>

        {/* Profile Popover */}
        {showProfileMenu && (
          <div
            className="absolute left-16 top-0 w-52 rounded-xl z-50 animate-fade-in flex flex-col"
            style={{
              backgroundColor: "var(--ss-card)",
              border: "1px solid var(--ss-border)",
              boxShadow: "var(--ss-shadow-lg)",
            }}
          >
            <div className="p-4 pb-3" style={{ borderBottom: "1px solid var(--ss-border)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--ss-text-muted)" }}>Account</p>
              <p className="text-sm font-semibold truncate" style={{ color: "var(--ss-text)" }}>{user?.name || "Demo User"}</p>
              <p className="text-xs truncate" style={{ color: "var(--ss-text-muted)" }}>{user?.email || "user@supershaker.com"}</p>
            </div>
            <div className="p-4 space-y-2 text-xs" style={{ color: "var(--ss-text-muted)" }}>
              <p className="flex justify-between items-center"><span>Role</span> <span className="font-semibold" style={{ color: "var(--ss-accent)" }}>Admin</span></p>
              <p className="flex justify-between items-center"><span>Plan</span> <span className="font-semibold" style={{ color: "var(--ss-accent)" }}>Pro</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Machine Profile Button */}
      <div className="relative mt-4" ref={machinePanelRef}>
        <button
          onClick={() => { setShowMachinePanel(!showMachinePanel); setShowProfileMenu(false); }}
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-all focus:outline-none active:scale-95"
          style={{
            backgroundColor: showMachinePanel ? "var(--ss-accent-soft)" : "var(--ss-card)",
            border: "1px solid " + (showMachinePanel ? "var(--ss-accent)" : "var(--ss-border)"),
            color: showMachinePanel ? "var(--ss-accent)" : "var(--ss-text-muted)",
          }}
          title="Machine Profiles">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {/* Machine Profile Flyout */}
        {showMachinePanel && (
          <div
            className="absolute left-16 top-0 w-64 rounded-xl z-50 animate-fade-in overflow-hidden"
            style={{
              backgroundColor: "var(--ss-card)",
              border: "1px solid var(--ss-border)",
              boxShadow: "var(--ss-shadow-lg)",
            }}
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--ss-border)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--ss-text-muted)" }}>Machine Profiles</p>
              {activeProfile && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--ss-accent)" }} />
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--ss-accent)" }}>{activeProfile.name}</p>
                </div>
              )}
            </div>

            {/* Profile List */}
            <div className="px-2 py-2 max-h-[280px] overflow-y-auto space-y-1">
              {(profiles || []).map(p => (
                <div key={p.id}
                  className="group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all"
                  style={{
                    backgroundColor: p.id === activeProfileId ? "var(--ss-accent-soft)" : "transparent",
                    border: p.id === activeProfileId ? "1px solid rgba(132,204,22,0.2)" : "1px solid transparent",
                  }}>
                  {/* Radio */}
                  <div
                    className="w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all"
                    style={{
                      borderColor: p.id === activeProfileId ? "var(--ss-accent)" : "var(--ss-text-muted)",
                      backgroundColor: p.id === activeProfileId ? "var(--ss-accent)" : "transparent",
                    }}
                    onClick={() => onProfileSwitch && onProfileSwitch(p.id)}
                  />

                  {/* Name */}
                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={handleCommitRename}
                      onKeyDown={e => { if (e.key === "Enter") handleCommitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      className="flex-1 min-w-0 bg-transparent text-xs font-mono outline-none px-1 py-0.5"
                      style={{ color: "var(--ss-text)", borderBottom: "1px solid var(--ss-accent)" }}
                    />
                  ) : (
                    <span
                      onClick={() => onProfileSwitch && onProfileSwitch(p.id)}
                      className="flex-1 min-w-0 truncate text-xs font-mono transition-colors"
                      style={{
                        color: p.id === activeProfileId ? "var(--ss-text)" : "var(--ss-text-muted)",
                        fontWeight: p.id === activeProfileId ? 600 : 400,
                      }}>
                      {p.name}
                    </span>
                  )}

                  {/* Action buttons */}
                  <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity
                    ${p.id === activeProfileId ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    {/* Save */}
                    {p.id === activeProfileId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onProfileSave && onProfileSave(p.id); }}
                        className="p-1 rounded transition-all"
                        style={{ color: "var(--ss-accent)" }}
                        title="Save current settings">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                          <polyline points="17 21 17 13 7 13 7 21"/>
                          <polyline points="7 3 7 8 15 8"/>
                        </svg>
                      </button>
                    )}
                    {/* Rename */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(p); }}
                      className="p-1 rounded transition-all"
                      style={{ color: "var(--ss-text-muted)" }}
                      title="Rename">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    {/* Delete */}
                    {(profiles || []).length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onProfileDelete && onProfileDelete(p.id); }}
                        className="p-1 rounded transition-all hover:text-red-500"
                        style={{ color: "var(--ss-text-muted)" }}
                        title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Create new profile */}
            <div className="px-3 py-3" style={{ borderTop: "1px solid var(--ss-border)" }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={e => setNewProfileName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateProfile(); }}
                  placeholder="New profile name…"
                  className="ss-input flex-1 min-w-0 text-[11px] py-1.5"
                />
                <button
                  onClick={handleCreateProfile}
                  disabled={!newProfileName.trim()}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "var(--ss-accent-soft)",
                    color: "var(--ss-accent)",
                    border: "1px solid rgba(132,204,22,0.2)",
                  }}>
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Theme Toggle */}
      <div className="mb-2">
        <ThemeToggle />
      </div>

      {/* Bottom: Logout */}
      <button onClick={onLogout} title="Log out"
        className="w-10 h-10 rounded-lg transition-all flex items-center justify-center active:scale-95 mb-1"
        style={{
          backgroundColor: "var(--ss-card)",
          color: "var(--ss-danger)",
          border: "1px solid var(--ss-border)",
        }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
             stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </button>
    </aside>
  );
}
