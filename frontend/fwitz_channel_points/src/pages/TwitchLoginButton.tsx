import React from "react";

const BACKEND_BASE_URL = "http://127.0.0.1:8000";

export default function TwitchLoginButton() {
  const handleLogin = () => {
    window.location.href = `${BACKEND_BASE_URL}/auth/twitch/login`;
  };

  return (
    <button
      onClick={handleLogin}
      style={{
        padding: "12px 16px",
        borderRadius: "10",
        border: "none",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "16",
      }}
    >
      Login with Twitch
    </button>
  );
}