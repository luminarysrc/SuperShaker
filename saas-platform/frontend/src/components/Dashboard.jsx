/**
 * Dashboard.jsx — Main dashboard overview page
 * ═══════════════════════════════════════════════════════════════════════
 * Shows KPI cards, recent projects mock, and a quick-action panel.
 */
import React from "react";
import { useNavigate } from "react-router-dom";

// ── KPI card data ─────────────────────────────────────────────────
const KPI_CARDS = [
  {
    label: "Projects",
    value: "12",
    change: "+3 this week",
    color: "text-cnc-accent",
    bgAccent: "bg-cnc-accent/10",
  },
  {
    label: "G-codes Generated",
    value: "47",
    change: "+8 today",
    color: "text-cnc-success",
    bgAccent: "bg-green-500/10",
  },
  {
    label: "Sheets Nested",
    value: "156",
    change: "92.4% avg yield",
    color: "text-cnc-warning",
    bgAccent: "bg-amber-500/10",
  },
  {
    label: "Machine Hours",
    value: "23.5h",
    change: "Est. this month",
    color: "text-purple-400",
    bgAccent: "bg-purple-500/10",
  },
];

// ── Mock recent projects ──────────────────────────────────────────
const RECENT_PROJECTS = [
  { id: 1, name: "Kitchen Cabinet Set",    parts: 24, sheets: 3, status: "Generated",  time: "2 hours ago" },
  { id: 2, name: "Office Desk Facades",    parts: 8,  sheets: 1, status: "Nested",     time: "5 hours ago" },
  { id: 3, name: "Wardrobe Doors Batch",   parts: 42, sheets: 6, status: "Draft",      time: "Yesterday" },
  { id: 4, name: "Custom Shaker Order #71",parts: 16, sheets: 2, status: "Generated",  time: "2 days ago" },
];

const STATUS_STYLES = {
  Generated: "bg-green-500/15 text-green-400 border-green-500/20",
  Nested:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Draft:     "bg-gray-500/15 text-gray-400 border-gray-500/20",
};

export default function Dashboard({ user }) {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-cnc-text">
          Welcome back, <span className="text-cnc-accent">{user?.name}</span>
        </h1>
        <p className="text-sm text-cnc-text-muted mt-1">
          Here's what's happening with your CNC projects.
        </p>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {KPI_CARDS.map((kpi) => (
          <div key={kpi.label} className="cnc-card cnc-glow">
            <p className="text-xs font-medium text-cnc-text-muted uppercase tracking-wider">
              {kpi.label}
            </p>
            <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-cnc-text-muted mt-1">{kpi.change}</p>
          </div>
        ))}
      </div>

      {/* ── Quick Actions + Recent Projects ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>

        {/* Quick actions card */}
        <div className="cnc-card space-y-3">
          <h2 className="text-sm font-semibold text-cnc-text uppercase tracking-wider">
            Quick Actions
          </h2>
          <button
            onClick={() => navigate("/viewer")}
            className="cnc-btn-primary w-full text-sm"
          >
            ⚡ Open Toolpath Viewer
          </button>
          <button className="cnc-btn-ghost w-full text-sm" disabled>
            📁 New Project (coming soon)
          </button>
          <button className="cnc-btn-ghost w-full text-sm" disabled>
            📊 Run Nesting (coming soon)
          </button>
        </div>

        {/* Recent projects table */}
        <div className="cnc-card lg:col-span-2">
          <h2 className="text-sm font-semibold text-cnc-text uppercase tracking-wider mb-4">
            Recent Projects
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-cnc-text-muted border-b border-cnc-border">
                  <th className="text-left py-2 pr-4 font-medium">Project</th>
                  <th className="text-center py-2 px-2 font-medium">Parts</th>
                  <th className="text-center py-2 px-2 font-medium">Sheets</th>
                  <th className="text-center py-2 px-2 font-medium">Status</th>
                  <th className="text-right py-2 pl-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cnc-border/50">
                {RECENT_PROJECTS.map((proj) => (
                  <tr key={proj.id} className="hover:bg-cnc-surface/50 transition-colors">
                    <td className="py-2.5 pr-4 text-cnc-text font-medium">{proj.name}</td>
                    <td className="py-2.5 px-2 text-center text-cnc-text-muted font-mono">{proj.parts}</td>
                    <td className="py-2.5 px-2 text-center text-cnc-text-muted font-mono">{proj.sheets}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium
                                        border ${STATUS_STYLES[proj.status]}`}>
                        {proj.status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-4 text-right text-cnc-text-muted text-xs">{proj.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
