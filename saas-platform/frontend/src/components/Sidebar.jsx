/**
 * Sidebar.jsx — Slim sidebar with branding and user info
 */
import React from "react";

export default function Sidebar({ user, onLogout }) {
  return (
    <aside className="w-16 bg-cnc-surface border-r border-cnc-border
                      flex flex-col items-center py-4 gap-4 flex-shrink-0"
           id="sidebar">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cnc-accent to-purple-600
                      flex items-center justify-center text-white font-bold text-sm
                      shadow-lg shadow-cnc-accent/20">
        SS
      </div>

      <div className="flex-1" />

      {/* User avatar */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-cnc-card border border-cnc-border
                        flex items-center justify-center text-xs font-bold text-cnc-accent
                        cursor-default" title={user?.name || "User"}>
          {(user?.name || "U")[0].toUpperCase()}
        </div>
        <button onClick={onLogout} title="Log out"
          className="text-cnc-text-muted hover:text-red-400 transition-colors text-sm">
          ⏻
        </button>
      </div>
    </aside>
  );
}
