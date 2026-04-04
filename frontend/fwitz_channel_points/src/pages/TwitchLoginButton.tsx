const BACKEND_BASE_URL = import.meta.env.VITE_API_URL;

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