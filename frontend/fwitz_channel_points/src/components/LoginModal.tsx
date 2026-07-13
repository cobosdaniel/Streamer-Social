import { useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

interface Props {
  open: boolean;
  onClose: () => void;
}

function TwitchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

export default function LoginModal({ open, onClose }: Props) {
  // Escape is the keyboard equivalent of the backdrop's mouse-only click-to-close.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleLogin = async () => {
    try {
      const resp = await fetch(`${API_BASE}/auth/twitch/login-url`, {
        credentials: "include",
      });
      const { auth_url } = await resp.json();
      window.location.href = auth_url;
    } catch {
      window.location.href = `${API_BASE}/auth/twitch/login`;
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- mouse-only convenience close; Escape (handled above) is the keyboard equivalent
    <div className="modal-backdrop" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- stops click-outside propagation only, not an interactive action itself */}
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="modal-brand">Fwitz</div>

        <h2 id="login-modal-title" className="modal-title">Sign in to continue</h2>
        <p className="modal-body">
          Connect your Twitch account to track redemptions, climb the
          leaderboards, and keep your watch streak alive.
        </p>

        <button className="twitch-login-btn" onClick={handleLogin}>
          <TwitchIcon />
          Login with Twitch
        </button>

        <p className="modal-fine">
          By signing in you agree to Twitch's terms of service. We only request
          read access to your channel points.
        </p>
      </div>
    </div>
  );
}
