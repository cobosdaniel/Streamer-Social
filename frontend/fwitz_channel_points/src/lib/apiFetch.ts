const API_BASE = import.meta.env.VITE_API_URL;

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("session_token");
  } catch {
    // localStorage unavailable (e.g. private browsing on some browsers)
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${API_BASE}${path}`, { ...options, credentials: "include", headers });
}

export function clearSessionToken() {
  try {
    localStorage.removeItem("session_token");
  } catch {
    // ignore
  }
}

export function storeSessionToken(token: string) {
  try {
    localStorage.setItem("session_token", token);
  } catch {
    // ignore
  }
}
