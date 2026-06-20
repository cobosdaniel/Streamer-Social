const _api = import.meta.env.VITE_API_URL;
const _ws  = import.meta.env.VITE_WS_URL;

export const API_BASE = _api && _api !== "undefined" ? _api : "";
export const WS_BASE  = _ws  && _ws  !== "undefined" ? _ws  : API_BASE.replace(/^https?/, "wss");
