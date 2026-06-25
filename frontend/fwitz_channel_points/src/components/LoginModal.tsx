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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="modal-brand">Fwitz</div>

        <h2 className="modal-title">Sign in to continue</h2>
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
