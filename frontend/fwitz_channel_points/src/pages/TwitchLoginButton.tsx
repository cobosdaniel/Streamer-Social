const BACKEND_BASE_URL = "http://127.0.0.1:8000";

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