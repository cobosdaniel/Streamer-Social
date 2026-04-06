import { useEffect, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

type Redemption = {
  user_name: string;
  reward_title: string;
  redeemed_at: string;
  status: string;
};

export default function Dashboard() {
  const wsRef = useRef<WebSocket | null>(null);

  const [dashboardData, setDashboardData] = useState({
    login: "",
    broadcaster_id: "",
    client_id: "",
    scopes: [] as string[],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await fetch(`${API_BASE}/api/dashboard`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("You are not logged in.");
          }
          throw new Error("Failed to load dashboard.");
        }

        const redemptionsRes = await fetch(`${API_BASE}/api/redemptions`, {
          credentials: "include",
        });
        const redemptionsData = await redemptionsRes.json();
        setRedemptions(redemptionsData);

        const data = await response.json();
        setDashboardData(data);
      } catch (err: any) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  useEffect(() => {
    if (!dashboardData.broadcaster_id) return;
    if (wsRef.current) return;

    const ws = new WebSocket(
      `${API_BASE.replace("https", "wss")}/ws?user_id=${dashboardData.broadcaster_id}`
    );

    console.log("WS URL:", `${API_BASE.replace("https", "wss")}/ws?user_id=${dashboardData.broadcaster_id}`);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send("ping");
    };

    ws.onmessage = (event) => {
      console.log("WS MESSAGE:", event.data);
      const data = JSON.parse(event.data);

      setRedemptions((prev) => [data, ...prev]);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      wsRef.current = null;
    };

    return () => {
      ws.close();
    };
  }, [dashboardData.broadcaster_id]);

  if (loading) {
    return (
      <main style={{ padding: "40px 20px 60px" }}>
        <p>Loading dashboard...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: "40px 20px 60px" }}>
        <section className="section-card">
          <h2 className="section-title">Dashboard Error</h2>
          <p className="section-text">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main style={{ padding: "40px 20px 60px" }}>
      <section className="hero" style={{ minHeight: "auto", paddingTop: "40px", paddingBottom: "20px" }}>
        <h1 className="hero-title">Streamer Dashboard</h1>
        <p className="hero-subtitle">Welcome {dashboardData.login || "streamer"}</p>
      </section>

      <section className="section-card">
        <h2 className="section-title">Recent Redemptions</h2>

        {redemptions.length === 0 ? (
          <p>No redemptions yet.</p>
        ) : (
          <ul>
            {redemptions.map((r, index) => (
              <li key={index}>
                <strong>{r.user_name}</strong><br />
                🎯 {r.reward_title}<br />
                🕒 {new Date(r.redeemed_at).toLocaleString()}<br />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}