import { useEffect, useState } from "react";
import { Link, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import PublicView from "./pages/PublicView";
import ProtectedRoute from "./pages/ProtectedRoute";
import Footer from "./components/Footer";
import LoginModal from "./components/LoginModal";
import { apiFetch, storeSessionToken, clearSessionToken } from "./lib/apiFetch";

type User = {
  login: string;
  broadcaster_id: string;
};

// Smooth-scrolls to a section when the URL carries a hash (e.g. /#about),
// otherwise resets to the top on navigation. Lets the nav's About/Contact
// links point at sections of the combined Home page.
function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        // Defer so the target section is mounted before we scroll.
        requestAnimationFrame(() =>
          el.scrollIntoView({ behavior: "smooth", block: "start" })
        );
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
}

export default function App() {
  const API_BASE = import.meta.env.VITE_API_URL;

  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    checkAuth();

    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  // Escape is the keyboard equivalent of the outside-click that closes the profile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const checkAuth = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const exchangeToken = params.get("exchange_token");
      if (exchangeToken) {
        params.delete("exchange_token");
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState(null, "", newUrl);

        // The backend sets a cookie (desktop) AND returns session_token in the body (iOS).
        // iOS Safari's ITP blocks cross-origin Set-Cookie, so we store the token in
        // localStorage and send it as an Authorization header on every subsequent request.
        const exchangeResp = await fetch(`${API_BASE}/auth/exchange?token=${encodeURIComponent(exchangeToken)}`, {
          method: "POST",
          credentials: "include",
        });
        if (exchangeResp.ok) {
          const exchangeData = await exchangeResp.json();
          if (exchangeData.session_token) {
            storeSessionToken(exchangeData.session_token);
          }
        }
      }

      const response = await apiFetch("/api/me");

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
      await apiFetch("/auth/logout", { method: "POST" });
      clearSessionToken();
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
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stops click-outside propagation only, not an interactive action itself
      <div
        className="profile-menu-wrapper"
        style={{ position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={toggleMenu}
          className="profile-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
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
          <li><Link to="/#about">About</Link></li>
          <li><Link to="/#contact">Contact</Link></li>

          {!loadingAuth && !user && (
            <li>
              <button
                className="nav-login-btn"
                onClick={() => setLoginModalOpen(true)}
              >
                Login
              </button>
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

      <ScrollToHash />

      <LoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />

      <div className="app-main">
        <Routes>
          <Route path="/" element={<Home isAuthenticated={!!user} />} />

          {/* About & Contact are sections of the combined Home page. */}
          <Route path="/about" element={<Navigate to="/#about" replace />} />
          <Route path="/contact" element={<Navigate to="/#contact" replace />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/view/:login" element={<PublicView />} />

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

      <Footer />
    </div>
  );
}