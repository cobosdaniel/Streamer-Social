const _raw = import.meta.env.VITE_API_URL;
const BACKEND_BASE_URL = _raw && _raw !== "undefined" ? _raw : "";

export default function TwitchLoginButton() {
  const handleLogin = () => {
    window.location.href = `${BACKEND_BASE_URL}/auth/twitch/login`;
  };

  return (
    <button
      onClick={handleLogin}
      className="primary-btn"
    >
      Login with Twitch
    </button>
  );
}