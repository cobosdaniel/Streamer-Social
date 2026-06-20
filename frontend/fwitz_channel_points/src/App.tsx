import { useEffect, useState } from "react";
import { Link, Routes, Route, Navigate } from "react-router-dom";

import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/TwitchLoginButton";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./pages/ProtectedRoute";
import TwitchLoginButton from "./pages/TwitchLoginButton";

type User = {
  login: string;
  broadcaster_id: string;
};

export default function App() {
  const API_BASE = import.meta.env.VITE_API_URL;

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    checkAuth();

    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  const checkAuth = async () => {
    try {
      // iOS WebKit/ITP blocks cookies set during cross-site OAuth redirect chains.
      // The backend passes a short-lived exchange_token in the URL instead; we
      // redeem it here via a same-origin fetch so the session cookie is set safely.
      const params = new URLSearchParams(window.location.search);
      const exchangeToken = params.get("exchange_token");
      if (exchangeToken) {
        params.delete("exchange_token");
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState(null, "", newUrl);

        await fetch(`${API_BASE}/auth/exchange?token=${encodeURIComponent(exchangeToken)}`, {
          method: "POST",
          credentials: "include",
        });
      }

      const response = await fetch(`${API_BASE}/api/me`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        setLoadingAuth(false);
        return;
      }

      const data = await response.json();
      setUser(data);
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      setUser(null);
      setMenuOpen(false);

      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleOutsideClick = () => {
    setMenuOpen(false);
  };

  const renderProfileMenu = () => {
    if (!user) return null;

    return (
      <div
        className="profile-menu-wrapper"
        style={{ position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={toggleMenu}
          className="profile-trigger"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: "12px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              background: "#9147ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "700",
              color: "#fff",
            }}
          >
            {user.login ? user.login.charAt(0).toUpperCase() : "U"}
          </div>
          <span>{user.login}</span>
          <span style={{ fontSize: "12px", opacity: 0.8 }}>▼</span>
        </button>

        {menuOpen && (
          <div
            className="profile-dropdown"
            style={{
              position: "absolute",
              top: "52px",
              right: 0,
              width: "220px",
              background: "#1f1f23",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "14px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
              padding: "10px",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                padding: "12px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                marginBottom: "8px",
              }}
            >
              <div style={{ fontWeight: "700", color: "#fff" }}>{user.login}</div>
              <div style={{ fontSize: "12px", opacity: 0.7, color: "#cfcfd2" }}>
                Broadcaster ID: {user.broadcaster_id}
              </div>
            </div>

            <Link
              to="/dashboard"
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: "10px",
                color: "#fff",
                textDecoration: "none",
              }}
              onClick={() => setMenuOpen(false)}
            >
              Dashboard
            </Link>

            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                textAlign: "left",
                marginTop: "6px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "none",
                background: "transparent",
                color: "#ff8f8f",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="App">
      <nav className="navbar">
        <div className="brand">Fwitz Channel Points</div>

        <ul
          className="header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
          <li><Link to="/contact">Contact</Link></li>

          {!loadingAuth && !user && (
            <li>
              <a href={`${API_BASE}/auth/twitch/login`}>Login</a>
            </li>
          )}

          {!loadingAuth && user && (
            <li><Link to="/dashboard">Dashboard</Link></li>
          )}

          {!loadingAuth && user && (
            <li style={{ listStyle: "none" }}>
              {renderProfileMenu()}
            </li>
          )}
        </ul>
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            <>
              <section className="hero">
                <h1 className="hero-title">Fwitz Channel Points</h1>
                <div className="hero-subtitle">Twitch Rewards Dashboard</div>
                <p className="hero-text">
                  Track redemptions, manage viewer interactions, and build a cleaner
                  Twitch channel points experience with a modern dashboard.
                </p>

                <div className="hero-actions">
                  {!user ? (
                    <TwitchLoginButton />
                  ) : (
                    <Link to="/dashboard" className="primary-btn">
                      Go to Dashboard
                    </Link>
                  )}
                </div>
              </section>
            </>
          }
        />

        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute loading={loadingAuth} isAuthenticated={!!user}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}