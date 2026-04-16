import { useEffect, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

const MAX_STORED = 50;
const VISIBLE_COUNT = 10;

type Redemption = {
  user_name: string;
  reward_title: string;
  redeemed_at: string;
  status: string;
};

type LeaderboardEntry = {
  user_name: string;
  count: number;
};

type StreakEntry = {
  user_name: string;
  streak: number;
  last_checkin: string;
};

const medalColors: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

const medalLabel: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
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

  // Leaderboard
  const [rewardTitles, setRewardTitles] = useState<string[]>([]);
  const [leaderboardReward, setLeaderboardReward] = useState<string>("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Watch Streak
  const [streakReward, setStreakReward] = useState<string>("");
  const [streaks, setStreaks] = useState<StreakEntry[]>([]);
  const [streaksLoading, setStreaksLoading] = useState(false);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await fetch(`${API_BASE}/api/dashboard`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error("You are not logged in.");
          throw new Error("Failed to load dashboard.");
        }

        const data = await response.json();
        setDashboardData(data);

        const redemptionsRes = await fetch(`${API_BASE}/api/redemptions`, {
          credentials: "include",
        });
        const redemptionsData: Redemption[] = await redemptionsRes.json();
        setRedemptions(redemptionsData.slice(0, MAX_STORED));

        // Derive unique reward titles for dropdowns
        const titles = Array.from(new Set(redemptionsData.map((r) => r.reward_title)));
        setRewardTitles(titles);
        if (titles.length > 0) {
          setLeaderboardReward(titles[0]);
          setStreakReward(titles[0]);
        }
      } catch (err: any) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  // Fetch leaderboard whenever selected reward changes
  useEffect(() => {
    if (!leaderboardReward) return;
    setLeaderboardLoading(true);

    fetch(`${API_BASE}/api/leaderboard?reward_title=${encodeURIComponent(leaderboardReward)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => setLeaderboard(data))
      .catch(console.error)
      .finally(() => setLeaderboardLoading(false));
  }, [leaderboardReward]);

  // Fetch streaks whenever selected reward changes
  useEffect(() => {
    if (!streakReward) return;
    setStreaksLoading(true);

    fetch(`${API_BASE}/api/streaks?reward_title=${encodeURIComponent(streakReward)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => setStreaks(data))
      .catch(console.error)
      .finally(() => setStreaksLoading(false));
  }, [streakReward]);

  // WebSocket for live redemptions
  useEffect(() => {
    if (!dashboardData.broadcaster_id) return;
    if (wsRef.current) return;

    const ws = new WebSocket(
      `${API_BASE.replace("https", "wss")}/ws?user_id=${dashboardData.broadcaster_id}`
    );

    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send("ping");
    };

    ws.onmessage = (event) => {
      const data: Redemption = JSON.parse(event.data);

      setRedemptions((prev) => {
        const updated = [data, ...prev].slice(0, MAX_STORED);
        return updated;
      });

      // Update reward titles list if new reward seen
      setRewardTitles((prev) => {
        if (!prev.includes(data.reward_title)) return [...prev, data.reward_title];
        return prev;
      });
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      wsRef.current = null;
    };

    return () => ws.close();
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

      {/* Recent Redemptions */}
      <section className="section-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 className="section-title" style={{ margin: 0 }}>Recent Redemptions</h2>
          <span style={{ fontSize: "13px", opacity: 0.6 }}>
            {redemptions.length} / {MAX_STORED}
          </span>
        </div>

        {redemptions.length === 0 ? (
          <p style={{ color: "#cbbce4" }}>No redemptions yet.</p>
        ) : (
          <div
            style={{
              overflowY: "auto",
              maxHeight: `${VISIBLE_COUNT * 76}px`,
              paddingRight: "4px",
            }}
          >
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {redemptions.map((r, index) => (
                <li
                  key={index}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>{r.user_name}</div>
                    <div style={{ fontSize: "13px", color: "#cbbce4", marginTop: "2px" }}>{r.reward_title}</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#a090c0", whiteSpace: "nowrap" }}>
                    {new Date(r.redeemed_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Two-column layout for Leaderboard + Streaks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", maxWidth: "1100px", margin: "0 auto" }}>

        {/* Leaderboard */}
        <section className="section-card" style={{ margin: 0 }}>
          <h2 className="section-title">Leaderboard</h2>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "13px", color: "#cbbce4", display: "block", marginBottom: "6px" }}>
              Track reward
            </label>
            <select
              value={leaderboardReward}
              onChange={(e) => setLeaderboardReward(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f4ecff",
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {rewardTitles.length === 0 && <option value="">No rewards yet</option>}
              {rewardTitles.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {leaderboardLoading ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>Loading...</p>
          ) : leaderboard.length === 0 ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>No data for this reward yet.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {leaderboard.map((entry, i) => {
                const rank = i + 1;
                const color = medalColors[rank] ?? "#8b7bff";
                const label = medalLabel[rank] ?? `#${rank}`;
                return (
                  <li
                    key={entry.user_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "12px",
                      background: rank <= 3 ? `${color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${rank <= 3 ? color + "44" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: rank <= 3 ? color : "rgba(255,255,255,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "12px",
                        color: rank <= 3 ? "#1a1230" : "#f4ecff",
                        flexShrink: 0,
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{entry.user_name}</div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color }}>
                      {entry.count}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Watch Streaks */}
        <section className="section-card" style={{ margin: 0 }}>
          <h2 className="section-title">Watch Streaks</h2>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "13px", color: "#cbbce4", display: "block", marginBottom: "6px" }}>
              Daily check-in reward
            </label>
            <select
              value={streakReward}
              onChange={(e) => setStreakReward(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f4ecff",
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {rewardTitles.length === 0 && <option value="">No rewards yet</option>}
              {rewardTitles.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {streaksLoading ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>Loading...</p>
          ) : streaks.length === 0 ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>No check-ins recorded yet.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {streaks.map((entry, i) => {
                const rank = i + 1;
                const streakColor =
                  entry.streak >= 30 ? "#FFD700"
                  : entry.streak >= 14 ? "#ff8f8f"
                  : entry.streak >= 7  ? "#8b7bff"
                  : "#cbbce4";
                return (
                  <li
                    key={entry.user_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: "12px",
                        color: "#a090c0",
                        flexShrink: 0,
                      }}
                    >
                      #{rank}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{entry.user_name}</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={{ fontWeight: 800, fontSize: "15px", color: streakColor }}>
                        {entry.streak} day{entry.streak !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: "11px", color: "#a090c0" }}>
                        Last: {new Date(entry.last_checkin).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
