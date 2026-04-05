/**
 * LoginScreen.jsx — Contained split-card login with CNC toolpath visual
 */
import React, { useState } from "react";
import { useTheme } from "./ThemeProvider.jsx";

/* ── Animated CNC toolpath visual ─────────────────────────── */
function ToolpathVisual() {
  return (
    <svg viewBox="0 0 500 600" className="w-full h-full" style={{ opacity: 0.18 }}>
      {/* Grid */}
      {Array.from({ length: 25 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 25} x2="500" y2={i * 25}
              stroke="#84cc16" strokeWidth="0.3" />
      ))}
      {Array.from({ length: 21 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 25} y1="0" x2={i * 25} y2="600"
              stroke="#84cc16" strokeWidth="0.3" />
      ))}
      {/* Door outlines */}
      <rect x="40" y="60" width="185" height="260" rx="2"
            stroke="#84cc16" strokeWidth="1.5" fill="none" />
      <rect x="65" y="90" width="135" height="200" rx="1"
            stroke="#84cc16" strokeWidth="0.7" fill="none" strokeDasharray="4 2" />
      <rect x="270" y="60" width="185" height="260" rx="2"
            stroke="#84cc16" strokeWidth="1.5" fill="none" />
      <rect x="295" y="90" width="135" height="200" rx="1"
            stroke="#84cc16" strokeWidth="0.7" fill="none" strokeDasharray="4 2" />
      <rect x="40" y="360" width="185" height="190" rx="2"
            stroke="#a3e635" strokeWidth="1.5" fill="none" />
      <rect x="65" y="390" width="135" height="130" rx="1"
            stroke="#a3e635" strokeWidth="0.7" fill="none" strokeDasharray="4 2" />
      <rect x="270" y="360" width="185" height="190" rx="2"
            stroke="#facc15" strokeWidth="1.5" fill="none" />
      {/* Snake toolpath */}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={`tp${i}`}
              x1={i % 2 === 0 ? 70 : 195} y1={100 + i * 26}
              x2={i % 2 === 0 ? 195 : 70} y2={100 + i * 26}
              stroke="#84cc16" strokeWidth="0.5" strokeDasharray="2 1">
          <animate attributeName="stroke-dashoffset"
                   from="0" to={i % 2 === 0 ? "-20" : "20"} dur="3s"
                   repeatCount="indefinite" />
        </line>
      ))}
      {/* Tool head */}
      <circle r="4" fill="#84cc16" opacity="0.9">
        <animate attributeName="cx" values="70;195;195;70;70" dur="5s" repeatCount="indefinite" />
        <animate attributeName="cy" values="100;100;270;270;100" dur="5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("demo@supershaker.com");
  const [password, setPassword] = useState("demo123");
  const [isLoading, setIsLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    onLogin(email, password);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 lg:p-8"
      style={{
        backgroundColor: isDark ? "#08080c" : "#e4e4e7",
      }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-5 right-5 w-9 h-9 rounded-lg flex items-center justify-center transition-all z-50"
        style={{
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          color: isDark ? "#a1a1aa" : "#52525b",
        }}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>

      {/* ── Single contained card ──────────────────────── */}
      <div
        className="w-full max-w-[960px] flex rounded-3xl overflow-hidden animate-fade-in"
        style={{
          backgroundColor: isDark ? "#111116" : "#ffffff",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          boxShadow: isDark
            ? "0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset"
            : "0 25px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.8) inset",
          minHeight: "560px",
        }}
      >
        {/* ── Left: Visual panel ───────────────────────── */}
        <div
          className="hidden lg:flex lg:w-[50%] relative overflow-hidden flex-col justify-between"
          style={{
            backgroundColor: isDark ? "#0c0c10" : "#111116",
            borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.04)"}`,
          }}
        >
          {/* Toolpath background */}
          <div className="absolute inset-0">
            <ToolpathVisual />
          </div>

          {/* Gradient overlay */}
          <div className="absolute inset-0"
            style={{
              background: "linear-gradient(160deg, rgba(12,12,16,0.75) 0%, rgba(12,12,16,0.4) 40%, rgba(12,12,16,0.85) 100%)",
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center items-center flex-1 p-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight mb-3">
              Super<span style={{ color: "#84cc16" }}>Shaker</span>
            </h1>
            <p className="text-sm leading-relaxed max-w-[260px]"
               style={{ color: "rgba(255,255,255,0.45)" }}>
              CNC cabinet door production — from nesting to G-code in seconds.
            </p>
          </div>

          {/* Version */}
          <div className="relative z-10 p-10 pt-0 text-center">
            <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
              v0.2.0-beta
            </p>
          </div>
        </div>

        {/* ── Right: Form panel ────────────────────────── */}
        <div
          className="flex-1 flex flex-col justify-center px-8 lg:px-14 py-12"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                 style={{ backgroundColor: "#84cc16" }}>
              <svg width="20" height="20" viewBox="0 0 100 100" fill="none"
                   stroke="#18181b" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 75 25 L 25 25 L 25 50 L 75 50 L 75 75 L 25 75" />
              </svg>
            </div>
            <h2 className="text-xl font-extrabold" style={{ color: "var(--ss-text)" }}>
              Super<span style={{ color: "#84cc16" }}>Shaker</span>
            </h2>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-xl font-bold" style={{ color: "var(--ss-text)" }}>
              Sign in to your account
            </h2>
            <p className="text-[13px] mt-2" style={{ color: "var(--ss-text-muted)" }}>
              Enter your credentials below to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wider"
                     style={{ color: "var(--ss-text-muted)" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ss-input w-full py-3 px-4 text-sm"
                style={{
                  borderRadius: "10px",
                  backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f4f4f5",
                }}
                placeholder="you@company.com"
                required
                id="login-email"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wider"
                     style={{ color: "var(--ss-text-muted)" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ss-input w-full py-3 px-4 text-sm"
                style={{
                  borderRadius: "10px",
                  backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#f4f4f5",
                }}
                placeholder="••••••••"
                required
                id="login-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="ss-btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 mt-2"
              style={{ borderRadius: "10px" }}
              id="login-submit"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Beta notice */}
          <div className="mt-8 flex items-center gap-2.5 rounded-xl px-4 py-3"
               style={{
                 backgroundColor: isDark ? "rgba(132,204,22,0.04)" : "rgba(132,204,22,0.06)",
                 border: "1px solid rgba(132,204,22,0.1)",
               }}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#84cc16" }} />
            <p className="text-[11px]" style={{ color: "var(--ss-text-muted)" }}>
              <span className="font-semibold" style={{ color: "#84cc16" }}>Demo</span> — any credentials accepted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
