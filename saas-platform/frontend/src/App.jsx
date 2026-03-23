/**
 * App.jsx — Root application component
 * ═══════════════════════════════════════════════════════════════════════
 * Handles mock authentication state and page routing.
 * When not logged in → shows LoginScreen.
 * When logged in → shows Sidebar + routed page content.
 */
import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ToolpathViewer from "./components/ToolpathViewer.jsx";

export default function App() {
  // ── Mock auth state ─────────────────────────────────────────────
  // In production, replace with Supabase Auth / JWT token validation.
  // TODO: INTEGRATION POINT — Replace with real auth provider
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  /**
   * Mock login handler. Accepts any credentials.
   * Replace with: supabase.auth.signInWithPassword({email, password})
   */
  const handleLogin = (email, password) => {
    setUser({ email, name: email.split("@")[0] });
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
  };

  // ── Not authenticated → Login screen ────────────────────────────
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // ── Authenticated → Dashboard layout ────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar navigation */}
      <Sidebar user={user} onLogout={handleLogout} />

      {/* Main content area with page routing */}
      <main className="flex-1 overflow-y-auto bg-cnc-bg">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/viewer" element={<ToolpathViewer />} />
          {/* Redirect unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
