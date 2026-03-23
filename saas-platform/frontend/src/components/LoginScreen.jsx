/**
 * LoginScreen.jsx — Cyberpunk Hacker Authentication
 */
import React, { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("demo@supershaker.com");
  const [password, setPassword] = useState("demo123");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#080808] text-gray-300 font-sans selection:bg-[#00FFFF]/30">
      
      {/* ── Background CAD Grid ── */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundSize: "40px 40px",
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `
        }}
      />

      {/* ── Background Silhouette (CNC Robot Arm) ── */}
      <div className="absolute -bottom-20 -right-20 pointer-events-none opacity-[0.04] text-white">
        <svg width="800" height="800" viewBox="0 0 100 100" fill="currentColor">
          <path d="M 80 100 L 80 70 L 60 55 L 60 40 L 40 40 L 40 20 L 30 20 L 30 10 L 20 10 L 20 20 L 30 20 L 30 40 L 50 40 L 50 60 L 70 75 L 70 100 Z" />
          <circle cx="25" cy="15" r="3" fill="#080808" />
          <circle cx="60" cy="47" r="4" fill="#080808" />
        </svg>
      </div>

      {/* ── Top Header ── */}
      <div className="absolute top-0 w-full p-2 text-center text-[10px] text-white/20 font-mono tracking-widest border-b border-white/5">
        AUTH_INTEGRATION: SUPABASE/AUTH0 // STATUS: STANDBY
      </div>

      {/* ── Main Layout (Asymmetric Shift Left) ── */}
      <div className="relative z-10 h-screen flex flex-col justify-center items-start pl-[5%] md:pl-[15%] w-full max-w-7xl mx-auto">
        <div className="w-full max-w-sm animate-fade-in space-y-8">
          
          {/* ── Branding ── */}
          <div className="flex flex-col items-start">
            {/* Toolpath S Logo */}
            <div className="mb-6">
              <svg width="48" height="48" viewBox="0 0 100 100" fill="none" stroke="#00A000" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter">
                <path d="M 80 20 L 20 20 L 20 50 L 80 50 L 80 80 L 20 80" className="animate-pulse" style={{ strokeDasharray: '300', strokeDashoffset: '0' }} />
                <path d="M 80 20 L 20 20 L 20 50 L 80 50 L 80 80 L 20 80" stroke="#00A000" strokeWidth="1" strokeDasharray="2, 4" opacity="0.5"/>
              </svg>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white drop-shadow-[0_2px_1px_rgba(0,0,0,0.8)]" style={{ textShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'}}>
              SuperShaker
            </h1>
            <p className="text-[#00A000]/70 font-mono text-xs mt-2 uppercase tracking-widest">
              CNC G-code Generation & Visualization
            </p>
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-600 uppercase font-mono tracking-wider ml-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1A1A1A] text-gray-200 border border-transparent rounded-[4px] px-4 py-3 font-mono text-sm
                           focus:outline-none focus:border-[#00FFFF] focus:ring-1 focus:ring-[#00FFFF]/50 transition-all duration-300"
                placeholder="USER@SYS.COM"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-600 uppercase font-mono tracking-wider ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#1A1A1A] text-gray-200 border border-transparent rounded-[4px] px-4 py-3 font-mono text-sm
                           focus:outline-none focus:border-[#00FFFF] focus:ring-1 focus:ring-[#00FFFF]/50 transition-all duration-300"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-[#FFE800] text-black font-bold font-mono uppercase tracking-widest rounded-[4px] py-3 flex items-center justify-center gap-3
                         shadow-[0_0_15px_rgba(255,232,0,0.4)] hover:shadow-[0_0_25px_rgba(255,232,0,0.6)] hover:bg-white
                         active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:shadow-none"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  INITIALIZING...
                </>
              ) : (
                "SIGN IN"
              )}
            </button>
          </form>

          {/* ── Demo Footer ── */}
          <div className="pt-6">
            <p className="font-mono text-[10px] text-yellow-500/80 uppercase tracking-widest border border-yellow-500/20 bg-yellow-500/5 inline-block px-2 py-1 rounded-sm">
              [ Beta Demo ]
            </p>
            <p className="text-gray-600 font-mono text-[10px] mt-2">
              ANY CREDENTIALS ACCEPTED. SECURE TUNNEL ESTABLISHED.
            </p>
          </div>

        </div>
      </div>

      {/* ── Bottom Marquee ── */}
      <div className="absolute bottom-0 w-full overflow-hidden bg-[#0a0a0a] border-t border-[#111] py-1">
        <div className="whitespace-nowrap animate-marquee flex items-center">
          {[...Array(20)].map((_, i) => (
            <span key={i} className="text-[10px] text-gray-800 font-mono font-bold tracking-[0.2em] mx-4 uppercase">
              SUPER SHAKER G-CODE DEMO
            </span>
          ))}
        </div>
      </div>
      
    </div>
  );
}
