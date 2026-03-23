/**
 * Sidebar.jsx — Dark sidebar navigation
 * ═══════════════════════════════════════════════════════════════════════
 * Vertical nav with branding, page links, and user/logout section.
 * Uses NavLink from react-router-dom for active-state highlighting.
 */
import React from "react";
import { NavLink } from "react-router-dom";

// ── SVG Icon components (inline to avoid extra dependencies) ──────
const IconDashboard = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
  </svg>
);

const IconViewer = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const IconLogout = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);

// ── Navigation items ──────────────────────────────────────────────
const NAV_ITEMS = [
  { path: "/",       label: "Dashboard",       icon: IconDashboard },
  { path: "/viewer", label: "Toolpath Viewer",  icon: IconViewer },
];

export default function Sidebar({ user, onLogout }) {
  return (
    <aside className="w-64 bg-cnc-surface border-r border-cnc-border flex flex-col shrink-0">

      {/* ── Brand header ─────────────────────────────────────────── */}
      <div className="h-16 flex items-center px-5 border-b border-cnc-border">
        <div className="flex items-center gap-3">
          {/* Animated accent dot */}
          <div className="w-8 h-8 rounded-lg bg-cnc-accent flex items-center justify-center
                          animate-pulse-glow">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-cnc-text leading-none">SuperShaker</h1>
            <p className="text-[10px] text-cnc-text-muted tracking-widest uppercase">CNC SaaS</p>
          </div>
        </div>
      </div>

      {/* ── Navigation links ─────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
               transition-all duration-150 group
               ${isActive
                 ? "bg-cnc-accent/10 text-cnc-accent border border-cnc-accent/20"
                 : "text-cnc-text-muted hover:text-cnc-text hover:bg-cnc-card border border-transparent"
               }`
            }
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── User section at bottom ───────────────────────────────── */}
      <div className="px-3 py-4 border-t border-cnc-border">
        <div className="flex items-center gap-3 px-3 py-2">
          {/* User avatar ring */}
          <div className="w-8 h-8 rounded-full bg-cnc-card border border-cnc-border
                          flex items-center justify-center text-xs font-bold text-cnc-accent">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-cnc-text truncate">{user?.name}</p>
            <p className="text-[11px] text-cnc-text-muted truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg
                     text-sm text-cnc-text-muted hover:text-cnc-danger hover:bg-cnc-card
                     transition-colors duration-150"
        >
          <IconLogout />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
