/**
 * Sidebar.jsx — Slim sidebar with user info + machine profile selector
 */
import React, { useState, useRef, useEffect } from "react";

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
    <aside className="w-16 bg-[#0F0F11] border-r border-[rgba(255,255,255,0.08)]
                      flex flex-col items-center py-4 flex-shrink-0 relative"
           id="sidebar">

      {/* Top: User profile */}
      <div className="relative" ref={profileMenuRef}>
        <button 
          onClick={() => { setShowProfileMenu(!showProfileMenu); setShowMachinePanel(false); }}
          className="w-10 h-10 rounded-lg bg-[#0a0a0a] border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]
                     flex items-center justify-center text-sm font-bold text-[#C6F321]
                     hover:border-[#C6F321]/50 hover:shadow-[0_0_12px_rgba(198,243,33,0.3)]
                     transition-all focus:outline-none focus:ring-1 focus:ring-[#C6F321]/50 active:scale-95"
          title={user?.name || "User Profile"}>
          {(user?.name || "U")[0].toUpperCase()}
        </button>

        {/* Profile Popover Menu */}
        {showProfileMenu && (
          <div className="absolute left-16 top-0 w-48 bg-[#0F0F11] border border-white/10 rounded-lg shadow-2xl p-4 z-50 animate-fade-in flex flex-col gap-3">
            <div className="border-b border-white/10 pb-3">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">User Info</p>
              <p className="text-sm text-gray-200 font-mono font-bold truncate">{user?.name || "DEMO_USER"}</p>
              <p className="text-xs text-gray-500 font-mono truncate">{user?.email || "user@supershaker.com"}</p>
            </div>
            <div className="text-xs font-mono text-gray-400 space-y-2">
              <p className="flex justify-between items-center"><span>LVL:</span> <span className="text-[#00FFFF] font-bold">ADMIN</span></p>
              <p className="flex justify-between items-center"><span>SUB:</span> <span className="text-[#C6F321] font-bold">PRO</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Machine Profile Button */}
      <div className="relative mt-4" ref={machinePanelRef}>
        <button
          onClick={() => { setShowMachinePanel(!showMachinePanel); setShowProfileMenu(false); }}
          className={`w-10 h-10 rounded-lg bg-[#0a0a0a] border shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]
                     flex items-center justify-center transition-all focus:outline-none active:scale-95
                     ${showMachinePanel
                       ? "border-[#00FFFF]/50 text-[#00FFFF] shadow-[0_0_12px_rgba(0,255,255,0.3)]"
                       : "border-white/10 text-gray-500 hover:border-[#00FFFF]/30 hover:text-[#00FFFF]/70"
                     }`}
          title="Machine Profiles">
          {/* Gear/wrench icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {/* Machine Profile Flyout */}
        {showMachinePanel && (
          <div className="absolute left-16 top-0 w-64 bg-[#0A0A0C] border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] z-50 animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-white/5">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">Machine Profiles</p>
              {activeProfile && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00FFFF] shadow-[0_0_6px_rgba(0,255,255,0.6)]" />
                  <p className="text-xs font-mono text-[#00FFFF] font-bold truncate">{activeProfile.name}</p>
                </div>
              )}
            </div>

            {/* Profile List */}
            <div className="px-2 py-2 max-h-[280px] overflow-y-auto space-y-1 scrollbar-thin">
              {(profiles || []).map(p => (
                <div key={p.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all
                    ${p.id === activeProfileId
                      ? "bg-[#00FFFF]/8 border border-[#00FFFF]/20"
                      : "hover:bg-white/5 border border-transparent"
                    }`}>
                  {/* Radio indicator */}
                  <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all
                    ${p.id === activeProfileId
                      ? "border-[#00FFFF] bg-[#00FFFF] shadow-[0_0_6px_rgba(0,255,255,0.5)]"
                      : "border-gray-600"
                    }`}
                    onClick={() => onProfileSwitch && onProfileSwitch(p.id)}
                  />

                  {/* Name (editable if renaming) */}
                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={handleCommitRename}
                      onKeyDown={e => { if (e.key === "Enter") handleCommitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      className="flex-1 min-w-0 bg-transparent text-xs font-mono text-white border-b border-[#00FFFF]/50 outline-none px-1 py-0.5"
                    />
                  ) : (
                    <span
                      onClick={() => onProfileSwitch && onProfileSwitch(p.id)}
                      className={`flex-1 min-w-0 truncate text-xs font-mono transition-colors
                        ${p.id === activeProfileId ? "text-white font-bold" : "text-gray-400 group-hover:text-gray-200"}`}>
                      {p.name}
                    </span>
                  )}

                  {/* Action buttons (visible on hover or when active) */}
                  <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity
                    ${p.id === activeProfileId ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    {/* Save (only on active) */}
                    {p.id === activeProfileId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onProfileSave && onProfileSave(p.id); }}
                        className="p-1 rounded text-[#C6F321]/60 hover:text-[#C6F321] hover:bg-[#C6F321]/10 transition-all"
                        title="Save current settings to this profile">
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
                      className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all"
                      title="Rename">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    {/* Delete (not on last profile) */}
                    {(profiles || []).length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onProfileDelete && onProfileDelete(p.id); }}
                        className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
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
            <div className="px-3 py-3 border-t border-white/5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={e => setNewProfileName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateProfile(); }}
                  placeholder="New profile name..."
                  className="flex-1 min-w-0 bg-[#0F0F11] border border-white/10 rounded-lg px-2.5 py-1.5
                             text-[11px] font-mono text-gray-300 placeholder-gray-600
                             focus:outline-none focus:border-[#00FFFF]/40 transition-colors"
                />
                <button
                  onClick={handleCreateProfile}
                  disabled={!newProfileName.trim()}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold
                             bg-[#00FFFF]/10 text-[#00FFFF] border border-[#00FFFF]/20
                             hover:bg-[#00FFFF]/20 hover:border-[#00FFFF]/40
                             disabled:opacity-30 disabled:cursor-not-allowed
                             transition-all active:scale-95">
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Bottom: Logout */}
      <button onClick={onLogout} title="Log out"
        className="group w-10 h-10 rounded-lg bg-[#0a0a0a] text-red-500 border border-red-500/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]
                   hover:bg-[#1a1a1a] hover:border-red-500/50 hover:text-[#ff3366] hover:shadow-[0_0_12px_rgba(255,51,102,0.4)]
                   transition-all flex items-center justify-center active:scale-95 mb-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
             stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             className="group-hover:drop-shadow-[0_0_8px_rgba(255,51,102,0.8)] transition-all">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </button>
    </aside>
  );
}
