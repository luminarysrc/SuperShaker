/**
 * Sidebar.jsx — Slim sidebar with branding and user info
 */
import React, { useState } from "react";

export default function Sidebar({ user, onLogout }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <aside className="w-16 bg-[#0F0F11] border-r border-[rgba(255,255,255,0.08)]
                      flex flex-col items-center py-4 flex-shrink-0 relative"
           id="sidebar">

      {/* Top: User profile */}
      <div className="relative">
        <button 
          onClick={() => setShowProfileMenu(!showProfileMenu)}
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
