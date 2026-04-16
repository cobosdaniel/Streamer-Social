import { useEffect, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

const MAX_STORED = 50;
const VISIBLE_COUNT = 10;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const medalColors: Record<number, string> = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
const medalLabel:  Record<number, string> = { 1: "1st",     2: "2nd",     3: "3rd"     };

type Redemption = {
  user_name:    string;
  reward_title: string;
  redeemed_at:  string;
  status:       string;
};

type LeaderboardEntry = {
  user_name: string;
  count:     number;
};

type StreakEntry = {
  user_name:            string;
  streak:               number;
  last_checkin_session: string;
  last_scheduled_day:   string | null;
};

type ScheduleDay = {
  day:  string;
  time: string;
};

type StreamStatus = {
  live:           boolean;
  session_id?:    number;
  started_at?:    string;
  is_scheduled?:  boolean;
  scheduled_day?: string | null;
};

function LiveBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      background: "#ff4040", color: "#fff", fontWeight: 700,
      fontSize: "12px", padding: "3px 10px", borderRadius: "20px",
    }}>
      <span style={{
        width: "7px", height: "7px", borderRadius: "50%",
        background: "#fff", animation: "pulse 1.2s infinite",
      }} />
      LIVE
    </span>
  );
}

function SelectRow({
  label, value, options, onChange,
}: {
  label: string; value: string;
  options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ fontSize: "13px", color: "#cbbce4", display: "block", marginBottom: "6px" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)", color: "#f4ecff",
          borderRadius: "10px", padding: "8px 12px", fontSize: "14px", cursor: "pointer",
        }}
      >
        {options.length === 0 && <option value="">No rewards yet</option>}
        {options.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}

export default function Dashboard() {
  const wsRef = useRef<WebSocket | null>(null);

  const [dashboardData, setDashboardData] = useState({
    login: "", broadcaster_id: "", client_id: "", scopes: [] as string[],
  });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [redemptions,  setRedemptions]  = useState<Redemption[]>([]);
  const [rewardTitles, setRewardTitles] = useState<string[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ live: false });

  const [lbReward,    setLbReward]    = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading,   setLbLoading]   = useState(false);

  const [streakReward,  setStreakReward]  = useState("");
  const [streaks,       setStreaks]       = useState<StreakEntry[]>([]);
  const [streakLoading, setStreakLoading] = useState(false);

  const [schedule,        setSchedule]        = useState<ScheduleDay[]>(DAYS.map((d) => ({ day: d, time: "" })));
  const [selectedDays,    setSelectedDays]     = useState<Set<string>>(new Set());
  const [scheduleLoading, setScheduleLoading]  = useState(false);
  const [scheduleSaved,   setScheduleSaved]    = useState(false);
  // Track whether the streak-schedule endpoint exists on this deployment
  const [scheduleSupported, setScheduleSupported] = useState(true);

  // ── Initial fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // Dashboard and redemptions are required — if these fail we show an error
        const [dashRes, redRes] = await Promise.all([
          fetch(`${API_BASE}/api/dashboard`,   { credentials: "include" }),
          fetch(`${API_BASE}/api/redemptions`, { credentials: "include" }),
        ]);

        if (!dashRes.ok) {
          throw new Error(dashRes.status === 401 ? "You are not logged in." : "Failed to load dashboard.");
        }

        const dashData           = await dashRes.json();
        const redData: Redemption[] = redRes.ok ? await redRes.json() : [];

        setDashboardData(dashData);
        setRedemptions(redData.slice(0, MAX_STORED));

        const titles = Array.from(new Set(redData.map((r) => r.reward_title)));
        setRewardTitles(titles);
        if (titles.length > 0) { setLbReward(titles[0]); setStreakReward(titles[0]); }

        // Schedule fetch is optional — if Railway hasn't deployed new main.py yet,
        // we just hide the schedule section rather than crashing the whole page.
        try {
          const schedRes = await fetch(`${API_BASE}/api/streak-schedule`, { credentials: "include" });
          if (schedRes.ok) {
            const schedData = await schedRes.json();
            const saved: Record<string, string> = {};
            for (const s of schedData.scheduled_days ?? []) saved[s.day] = s.time ?? "";
            setSchedule(DAYS.map((d) => ({ day: d, time: saved[d] ?? "" })));
            setSelectedDays(new Set(Object.keys(saved)));
          } else {
            // 404 means backend not yet updated — disable section silently
            setScheduleSupported(false);
          }
        } catch {
          setScheduleSupported(false);
        }

      } catch (err: any) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Leaderboard fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!lbReward) return;
    setLbLoading(true);
    fetch(`${API_BASE}/api/leaderboard?reward_title=${encodeURIComponent(lbReward)}`, { credentials: "include" })
      .then((r) => r.json()).then(setLeaderboard).catch(console.error).finally(() => setLbLoading(false));
  }, [lbReward]);

  // ── Streaks fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!streakReward) return;
    setStreakLoading(true);
    fetch(`${API_BASE}/api/streaks?reward_title=${encodeURIComponent(streakReward)}`, { credentials: "include" })
      .then((r) => r.json()).then(setStreaks).catch(console.error).finally(() => setStreakLoading(false));
  }, [streakReward]);

  // ── WebSocket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dashboardData.broadcaster_id || wsRef.current) return;

    const ws = new WebSocket(
      `${API_BASE.replace("https", "wss")}/ws?user_id=${dashboardData.broadcaster_id}`
    );
    wsRef.current = ws;

    ws.onopen  = () => { console.log("WS connected"); ws.send("ping"); };
    ws.onclose = () => { console.log("WS disconnected"); wsRef.current = null; };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "redemption") {
        const r: Redemption = {
          user_name: msg.user_name, reward_title: msg.reward_title,
          redeemed_at: msg.redeemed_at, status: msg.status,
        };
        setRedemptions((prev) => [r, ...prev].slice(0, MAX_STORED));
        setRewardTitles((prev) => prev.includes(r.reward_title) ? prev : [...prev, r.reward_title]);

      } else if (msg.type === "stream_online") {
        setStreamStatus({
          live: true, session_id: msg.session_id,
          started_at: msg.started_at, is_scheduled: msg.is_scheduled,
          scheduled_day: msg.scheduled_day,
        });

      } else if (msg.type === "stream_offline") {
        setStreamStatus({ live: false });
        if (streakReward) {
          fetch(`${API_BASE}/api/streaks?reward_title=${encodeURIComponent(streakReward)}`, { credentials: "include" })
            .then((r) => r.json()).then(setStreaks).catch(console.error);
        }
      }
    };

    return () => ws.close();
  }, [dashboardData.broadcaster_id]);

  // ── Schedule helpers ────────────────────────────────────────────────────────
  function toggleDay(day: string) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  }

  function updateTime(day: string, time: string) {
    setSchedule((prev) => prev.map((d) => d.day === day ? { ...d, time } : d));
  }

  async function saveSchedule() {
    setScheduleLoading(true);
    setScheduleSaved(false);
    try {
      const selected = schedule
        .filter((d) => selectedDays.has(d.day))
        .map((d) => ({ day: d.day, ...(d.time ? { time: d.time } : {}) }));

      await fetch(`${API_BASE}/api/streak-schedule`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_days: selected }),
      });
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setScheduleLoading(false);
    }
  }

  // ── Early returns ───────────────────────────────────────────────────────────
  if (loading) return <main style={{ padding: "40px 20px" }}><p>Loading dashboard...</p></main>;
  if (error) return (
    <main style={{ padding: "40px 20px 60px" }}>
      <section className="section-card">
        <h2 className="section-title">Dashboard Error</h2>
        <p className="section-text">{error}</p>
      </section>
    </main>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main style={{ padding: "40px 20px 60px" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {/* Hero */}
      <section className="hero" style={{ minHeight: "auto", paddingTop: "40px", paddingBottom: "20px" }}>
        <h1 className="hero-title">Streamer Dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px" }}>
          <p className="hero-subtitle" style={{ margin: 0 }}>Welcome {dashboardData.login || "streamer"}</p>
          {streamStatus.live && <LiveBadge />}
        </div>
        {streamStatus.live && streamStatus.started_at && (
          <p style={{ fontSize: "13px", color: "#cbbce4", marginTop: "6px" }}>
            Stream started {new Date(streamStatus.started_at).toLocaleTimeString()}
            {streamStatus.scheduled_day
              ? ` · ${streamStatus.scheduled_day} scheduled stream`
              : " · bonus stream"}
          </p>
        )}
      </section>

      {/* Recent Redemptions */}
      <section className="section-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 className="section-title" style={{ margin: 0 }}>Recent Redemptions</h2>
          <span style={{ fontSize: "13px", opacity: 0.6 }}>{redemptions.length} / {MAX_STORED}</span>
        </div>

        {redemptions.length === 0 ? (
          <p style={{ color: "#cbbce4" }}>No redemptions yet.</p>
        ) : (
          <div style={{ overflowY: "auto", maxHeight: `${VISIBLE_COUNT * 76}px`, paddingRight: "4px" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {redemptions.map((r, i) => (
                <li key={i} style={{
                  padding: "12px 16px", borderRadius: "12px",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
                }}>
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

      {/* Leaderboard + Streaks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", maxWidth: "1100px", margin: "0 auto" }}>

        {/* Leaderboard */}
        <section className="section-card" style={{ margin: 0 }}>
          <h2 className="section-title">Leaderboard</h2>
          <SelectRow label="Track reward" value={lbReward} options={rewardTitles} onChange={setLbReward} />
          {lbLoading ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>Loading...</p>
          ) : leaderboard.length === 0 ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>No data for this reward yet.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {leaderboard.map((entry, i) => {
                const rank  = i + 1;
                const color = medalColors[rank] ?? "#8b7bff";
                const label = medalLabel[rank]  ?? `#${rank}`;
                return (
                  <li key={entry.user_name} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 14px", borderRadius: "12px",
                    background: rank <= 3 ? `${color}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${rank <= 3 ? color + "44" : "rgba(255,255,255,0.06)"}`,
                  }}>
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "50%",
                      background: rank <= 3 ? color : "rgba(255,255,255,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 800, fontSize: "12px",
                      color: rank <= 3 ? "#1a1230" : "#f4ecff", flexShrink: 0,
                    }}>{label}</div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{entry.user_name}</div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color }}>{entry.count}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Watch Streaks */}
        <section className="section-card" style={{ margin: 0 }}>
          <h2 className="section-title">Watch Streaks</h2>
          <SelectRow label="Check-in reward" value={streakReward} options={rewardTitles} onChange={setStreakReward} />
          {streakLoading ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>Loading...</p>
          ) : streaks.length === 0 ? (
            <p style={{ color: "#cbbce4", fontSize: "14px" }}>No check-ins recorded yet.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {streaks.map((entry, i) => {
                const streakColor =
                  entry.streak >= 20 ? "#FFD700" :
                  entry.streak >= 10 ? "#ff8f8f" :
                  entry.streak >= 5  ? "#8b7bff" : "#cbbce4";
                return (
                  <li key={entry.user_name} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 14px", borderRadius: "12px",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ width: "28px", textAlign: "center", fontWeight: 700, fontSize: "12px", color: "#a090c0", flexShrink: 0 }}>
                      #{i + 1}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{entry.user_name}</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={{ fontWeight: 800, fontSize: "15px", color: streakColor }}>
                        {entry.streak} stream{entry.streak !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: "11px", color: "#a090c0" }}>
                        Last: {entry.last_scheduled_day ?? "bonus"} · {new Date(entry.last_checkin_session).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Stream Schedule — hidden if backend not yet updated */}
      {scheduleSupported && (
        <section className="section-card" style={{ maxWidth: "1100px", margin: "24px auto 0" }}>
          <h2 className="section-title">Stream Schedule</h2>
          <p style={{ color: "#cbbce4", fontSize: "14px", marginBottom: "20px", marginTop: 0 }}>
            Select your regular stream days. Viewers won't lose streaks for missing bonus streams on unscheduled days.
            Setting a time creates a ±2 hour window — streams starting outside it are treated as bonus streams.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px", marginBottom: "20px" }}>
            {DAYS.map((day) => {
              const active = selectedDays.has(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  style={{
                    padding: "10px 6px", borderRadius: "12px", cursor: "pointer",
                    fontWeight: 700, fontSize: "13px", border: "1px solid",
                    borderColor: active ? "#8b7bff" : "rgba(255,255,255,0.12)",
                    background: active ? "rgba(139,123,255,0.18)" : "rgba(255,255,255,0.04)",
                    color: active ? "#c5bcff" : "#a090c0",
                    transition: "all 0.15s",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {DAYS.filter((d) => selectedDays.has(d)).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {DAYS.filter((d) => selectedDays.has(d)).map((day) => {
                const entry = schedule.find((s) => s.day === day);
                return (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span style={{ width: "36px", fontWeight: 700, fontSize: "14px", color: "#c5bcff" }}>{day}</span>
                    <input
                      type="time"
                      value={entry?.time ?? ""}
                      onChange={(e) => updateTime(day, e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                        color: "#f4ecff", borderRadius: "8px", padding: "6px 10px", fontSize: "14px",
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "#a090c0" }}>optional start time</span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={saveSchedule}
            disabled={scheduleLoading}
            style={{
              padding: "10px 24px", borderRadius: "12px", cursor: "pointer",
              background: scheduleSaved ? "rgba(80,200,120,0.2)" : "rgba(139,123,255,0.25)",
              border: `1px solid ${scheduleSaved ? "#50c878" : "#8b7bff"}`,
              color: scheduleSaved ? "#50c878" : "#c5bcff",
              fontWeight: 700, fontSize: "14px", transition: "all 0.2s",
            }}
          >
            {scheduleLoading ? "Saving..." : scheduleSaved ? "Saved!" : "Save Schedule"}
          </button>
        </section>
      )}
    </main>
  );
}
