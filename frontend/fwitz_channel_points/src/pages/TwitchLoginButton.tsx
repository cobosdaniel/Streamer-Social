import { API_BASE as BACKEND_BASE_URL } from "../env";

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