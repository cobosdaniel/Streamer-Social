const BACKEND_BASE_URL = import.meta.env.VITE_API_URL;

export default function TwitchLoginButton() {
  const handleLogin = async () => {
    try {
      const resp = await fetch(`${BACKEND_BASE_URL}/auth/twitch/login-url`, {
        credentials: "include",
      });
      const { auth_url } = await resp.json();
      window.location.href = auth_url;
    } catch {
      // Fallback: navigate to backend login (non-iOS browsers handle this fine)
      window.location.href = `${BACKEND_BASE_URL}/auth/twitch/login`;
    }
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
