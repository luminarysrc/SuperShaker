/**
 * LoginScreen.jsx — Mock authentication screen
 * ═══════════════════════════════════════════════════════════════════════
 * A polished login form that accepts any credentials and bypasses
 * to the dashboard. In production, replace with Supabase Auth.
 *
 * TODO: INTEGRATION POINT — Replace mock login with:
 *   import { createClient } from "@supabase/supabase-js";
 *   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *   const { data, error } = await supabase.auth.signInWithPassword({
 *     email, password
 *   });
 */
import React, { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("demo@supershaker.com");
  const [password, setPassword] = useState("demo123");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate a brief network delay for realism
    await new Promise((r) => setTimeout(r, 600));
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cnc-bg p-4">
      {/* Background decorative gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cnc-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* ── Brand header ───────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-cnc-accent mb-4 animate-pulse-glow">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-2xl font-bold text-cnc-text">SuperShaker</h1>
          <p className="text-cnc-text-muted text-sm mt-1">
            CNC G-code Generation & Visualization
          </p>
        </div>

        {/* ── Login card ─────────────────────────────────────────── */}
        <div className="cnc-card">
          <h2 className="text-lg font-semibold text-cnc-text mb-1">Sign In</h2>
          <p className="text-sm text-cnc-text-muted mb-6">
            Enter any credentials to access the demo
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="cnc-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cnc-input w-full"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label className="cnc-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="cnc-input w-full"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="cnc-btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                            stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-5 pt-4 border-t border-cnc-border">
            <p className="text-xs text-cnc-text-muted text-center">
              <span className="text-cnc-accent font-medium">Beta Demo</span> — Any credentials will work.
              <br />
              Auth integration placeholder for Supabase / Auth0.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
