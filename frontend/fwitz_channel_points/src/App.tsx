import React, { Component } from "react";
import { Link, Routes, Route, Navigate } from "react-router-dom";

import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/TwitchLoginButton";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./pages/ProtectedRoute";
import TwitchLoginButton from "./pages/TwitchLoginButton";

class App extends Component {
  state = {
    user: null,
    loadingAuth: true,
    menuOpen: false,
  };

  componentDidMount() {
    this.checkAuth();
    document.addEventListener("click", this.handleOutsideClick);
  }

  componentWillUnmount() {
    document.removeEventListener("click", this.handleOutsideClick);
  }

  checkAuth = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/me", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        this.setState({ user: null, loadingAuth: false });
        return;
      }

      const data = await response.json();
      this.setState({
        user: data,
        loadingAuth: false,
      });
    } catch (error) {
      console.error("Auth check failed:", error);
      this.setState({
        user: null,
        loadingAuth: false,
      });
    }
  };

  handleLogout = async () => {
    try {
      await fetch("http://localhost:8000/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      this.setState({
        user: null,
        menuOpen: false,
      });

      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  toggleMenu = (e) => {
    e.stopPropagation();
    this.setState((prev) => ({ menuOpen: !prev.menuOpen }));
  };

  handleOutsideClick = () => {
    if (this.state.menuOpen) {
      this.setState({ menuOpen: false });
    }
  };

  renderProfileMenu() {
    const { user, menuOpen } = this.state;

    if (!user) return null;

    return (
      <div
        className="profile-menu-wrapper"
        style={{ position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={this.toggleMenu}
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
              onClick={() => this.setState({ menuOpen: false })}
            >
              Dashboard
            </Link>

            <button
              onClick={this.handleLogout}
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
  }

  render() {
    const { user, loadingAuth } = this.state;

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
                <a href="http://localhost:8000/auth/twitch/login">
                  Login
                </a>
              </li>
            )}

            {!loadingAuth && user && (
              <li><Link to="/dashboard">Dashboard</Link></li>
            )}

            {!loadingAuth && user && (
              <li style={{ listStyle: "none" }}>
                {this.renderProfileMenu()}
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
                      <Link to="/dashboard" className="primary-btn">Go to Dashboard</Link>
                    )}
                  </div>

                  <div className="stats">
                    <div className="stat">
                      <h3>1.2K</h3>
                      <p>Redemptions</p>
                    </div>
                    <div className="stat">
                      <h3>312</h3>
                      <p>Users</p>
                    </div>
                    <div className="stat">
                      <h3>28</h3>
                      <p>Rewards</p>
                    </div>
                    <div className="stat">
                      <h3>99%</h3>
                      <p>Uptime</p>
                    </div>
                  </div>
                </section>

                <section className="section-card">
                  <h2 className="section-title">What this app does</h2>
                  <p className="section-text">
                    Connect your Twitch account, store tokens securely, and redirect users
                    into a dashboard where you can view redemption activity and streamer data.
                  </p>
                </section>
              </>
            }
          />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard/>
            </ProtectedRoute>
          }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    );
  }
}

export default App;