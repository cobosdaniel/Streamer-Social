import { useEffect, useState, useRef } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";


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

type Reward = {
  id: string;
  title: string;
  cost?: number;
  is_enabled?: boolean;
};

type LeaderboardEntry = {
  user_name: string;
  count:     number;
};

type StreakEntry = {
  user_name:      string;
  streak:         number;
  longest_streak: number;
  updated_at:     string | null;
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

function DateRangeFilter({
  from, to, onFromChange, onToChange,
}: {
  from: string; to: string;
  onFromChange: (v: string) => void;
  onToChange:   (v: string) => void;
}) {
  const inputSx = {
    width: 130,
    "& .MuiInputBase-root": {
      color: "#f4ecff", background: "rgba(255,255,255,0.06)", fontSize: "11px",
    },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.12)" },
    "& input::-webkit-calendar-picker-indicator": { filter: "invert(0.7)" },
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <TextField
        size="small" type="date" value={from}
        onChange={(e) => onFromChange(e.target.value)}
        slotProps={{ htmlInput: { max: to || undefined } }}
        sx={inputSx}
      />
      <span style={{ color: "#6a5c80", fontSize: "11px" }}>–</span>
      <TextField
        size="small" type="date" value={to}
        onChange={(e) => onToChange(e.target.value)}
        slotProps={{ htmlInput: { min: from || undefined } }}
        sx={inputSx}
      />
      {(from || to) && (
        <button
          onClick={() => { onFromChange(""); onToChange(""); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#6a5c80", fontSize: "16px", lineHeight: 1, padding: "0 2px",
          }}
          title="Clear dates"
        >×</button>
      )}
    </div>
  );
}

function RewardDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Reward[];
  onChange: (v: string) => void;
}) {
  const selectedReward = options.find((r) => r.title === value) ?? null;

  return (
    <Autocomplete
      size="small"
      options={options}
      value={selectedReward}
      onChange={(_: React.SyntheticEvent, newValue: Reward | null) =>
        onChange(newValue?.title ?? "")
      }
      getOptionLabel={(option: Reward) => option.title}
      isOptionEqualToValue={(option: Reward, value: Reward) => option.id === value.id}
      sx={{
        width: 240,
        "& .MuiInputBase-root": {
          color: "#f4ecff",
          background: "rgba(255,255,255,0.06)",
          fontSize: "12px",
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: "rgba(255,255,255,0.12)",
        },
        "& .MuiSvgIcon-root": {
          color: "#c5bcff",
        },
      }}
      renderInput={(params: any) => (
        <TextField
          {...params}
          placeholder="Search rewards"
        />
      )}
    />
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
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ live: false });

  const [lbReward,    setLbReward]    = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading,   setLbLoading]   = useState(false);
  const [lbFrom,      setLbFrom]      = useState("");
  const [lbTo,        setLbTo]        = useState("");

  const [streakReward,  setStreakReward]  = useState("");
  const [streaks,       setStreaks]       = useState<StreakEntry[]>([]);
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakFrom,    setStreakFrom]    = useState("");
  const [streakTo,      setStreakTo]      = useState("");

  const [pendingStreakReward,   setPendingStreakReward]   = useState<string | null>(null);
  const [confirmDialogOpen,     setConfirmDialogOpen]     = useState(false);
  const [streakRewardSaving,    setStreakRewardSaving]    = useState(false);

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
        const [dashRes, redRes, rewardsRes] = await Promise.all([
          fetch(`${API_BASE}/api/dashboard`, { credentials: "include" }),
          fetch(`${API_BASE}/api/redemptions`, { credentials: "include" }),
          fetch(`${API_BASE}/api/rewards`, { credentials: "include" })
        ]);

        if (!dashRes.ok) {
          throw new Error(dashRes.status === 401 ? "You are not logged in." : "Failed to load dashboard.");
        }

        const dashData           = await dashRes.json();
        const redData: Redemption[] = redRes.ok ? await redRes.json() : [];

        setDashboardData(dashData);
        setRedemptions(redData.slice(0, MAX_STORED));

        const rewardData: Reward[] = rewardsRes.ok ? await rewardsRes.json() : [];

        setRewards(rewardData);

        if (rewardData.length > 0) {
          setLbReward(rewardData[0].title);
        }

        // Load the configured streak reward, fall back to first reward
        try {
          const srRes = await fetch(`${API_BASE}/api/streak-reward`, { credentials: "include" });
          if (srRes.ok) {
            const srData = await srRes.json();
            const configured = srData.reward_title;
            const match = rewardData.find((r) => r.title === configured);
            setStreakReward(match ? configured : (rewardData[0]?.title ?? ""));
          } else {
            setStreakReward(rewardData[0]?.title ?? "");
          }
        } catch {
          setStreakReward(rewardData[0]?.title ?? "");
        }

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
    const params = new URLSearchParams({ reward_title: lbReward });
    if (lbFrom) params.set("from_date", lbFrom);
    if (lbTo)   params.set("to_date",   lbTo);
    fetch(`${API_BASE}/api/leaderboard?${params}`, { credentials: "include" })
      .then((r) => r.json()).then(setLeaderboard).catch(console.error).finally(() => setLbLoading(false));
  }, [lbReward, lbFrom, lbTo]);

  // ── Streaks fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!streakReward) return;
    setStreakLoading(true);
    const params = new URLSearchParams({ reward_title: streakReward });
    if (streakFrom) params.set("from_date", streakFrom);
    if (streakTo)   params.set("to_date",   streakTo);
    fetch(`${API_BASE}/api/streaks?${params}`, { credentials: "include" })
      .then((r) => r.json()).then(setStreaks).catch(console.error).finally(() => setStreakLoading(false));
  }, [streakReward, streakFrom, streakTo]);

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
        setRewards((prev) =>
          prev.some((reward) => reward.title === r.reward_title)
            ? prev
            : [...prev, { id: r.reward_title, title: r.reward_title }]
        );

      } else if (msg.type === "stream_online") {
        setStreamStatus({
          live: true, session_id: msg.session_id,
          started_at: msg.started_at, is_scheduled: msg.is_scheduled,
          scheduled_day: msg.scheduled_day,
        });

      } else if (msg.type === "stream_offline") {
        setStreamStatus({ live: false });
        if (streakReward) {
          const params = new URLSearchParams({ reward_title: streakReward });
          if (streakFrom) params.set("from_date", streakFrom);
          if (streakTo)   params.set("to_date",   streakTo);
          fetch(`${API_BASE}/api/streaks?${params}`, { credentials: "include" })
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

  // ── Streak reward config ────────────────────────────────────────────────────
  function handleStreakRewardChange(title: string) {
    if (!title || title === streakReward) return;
    setPendingStreakReward(title);
    setConfirmDialogOpen(true);
  }

  async function confirmStreakReward() {
    if (!pendingStreakReward) return;
    setStreakRewardSaving(true);
    try {
      await fetch(`${API_BASE}/api/streak-reward`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_title: pendingStreakReward }),
      });
      setStreakReward(pendingStreakReward);
    } catch (e) {
      console.error(e);
    } finally {
      setStreakRewardSaving(false);
      setConfirmDialogOpen(false);
      setPendingStreakReward(null);
    }
  }

  function cancelStreakReward() {
    setConfirmDialogOpen(false);
    setPendingStreakReward(null);
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
    <main style={{ padding: "20px 24px 48px", maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f4ecff" }}>
            {dashboardData.login || "Dashboard"}
          </h1>
          {streamStatus.live && streamStatus.started_at && (
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#a090c0" }}>
              Live since {new Date(streamStatus.started_at).toLocaleTimeString()}
              {streamStatus.scheduled_day ? ` · ${streamStatus.scheduled_day}` : " · bonus stream"}
            </p>
          )}
        </div>
        {streamStatus.live && <LiveBadge />}
      </div>

      {/* Top row — Leaderboard + Streaks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>

        {/* Leaderboard */}
        <section className="section-card" style={{ margin: 0, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a090c0" }}>Leaderboard</h2>
            <RewardDropdown value={lbReward} options={rewards} onChange={setLbReward} />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <DateRangeFilter from={lbFrom} to={lbTo} onFromChange={setLbFrom} onToChange={setLbTo} />
          </div>
          {lbLoading ? (
            <p style={{ color: "#a090c0", fontSize: "12px", margin: 0 }}>Loading...</p>
          ) : leaderboard.length === 0 ? (
            <p style={{ color: "#a090c0", fontSize: "12px", margin: 0 }}>No data yet.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
              {leaderboard.map((entry, i) => {
                const rank  = i + 1;
                const color = medalColors[rank] ?? "#8b7bff";
                const label = medalLabel[rank]  ?? `#${rank}`;
                return (
                  <li key={entry.user_name} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "5px 8px", borderRadius: "7px",
                    background: rank <= 3 ? `${color}12` : "transparent",
                  }}>
                    <span style={{ width: "28px", fontSize: "11px", fontWeight: 700, color, flexShrink: 0 }}>{label}</span>
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#f4ecff" }}>{entry.user_name}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color }}>{entry.count}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Watch Streaks */}
        <section className="section-card" style={{ margin: 0, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a090c0" }}>Watch Streaks</h2>
            <RewardDropdown value={streakReward} options={rewards} onChange={handleStreakRewardChange} />
          </div>
          {streakLoading ? (
            <p style={{ color: "#a090c0", fontSize: "12px", margin: 0 }}>Loading...</p>
          ) : streaks.length === 0 ? (
            <p style={{ color: "#a090c0", fontSize: "12px", margin: 0 }}>No check-ins yet.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
              {streaks.map((entry, i) => {
                const streakColor =
                  entry.streak >= 20 ? "#FFD700" :
                  entry.streak >= 10 ? "#ff8f8f" :
                  entry.streak >= 5  ? "#8b7bff" : "#cbbce4";
                return (
                  <li key={entry.user_name} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "5px 8px", borderRadius: "7px",
                  }}>
                    <span style={{ width: "24px", fontSize: "11px", color: "#a090c0", flexShrink: 0 }}>#{i + 1}</span>
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#f4ecff" }}>{entry.user_name}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: streakColor }}>
                      {entry.streak}s
                    </span>
                    <span style={{ fontSize: "11px", color: "#a090c0" }}>
                      best: {entry.longest_streak}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Stream Schedule */}
      {scheduleSupported && (
        <section className="section-card" style={{ margin: "0 0 16px", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a090c0" }}>Stream Schedule</h2>
            <button
              onClick={saveSchedule}
              disabled={scheduleLoading}
              style={{
                padding: "4px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px",
                background: scheduleSaved ? "rgba(80,200,120,0.15)" : "rgba(139,123,255,0.15)",
                border: `1px solid ${scheduleSaved ? "#50c878" : "#8b7bff"}`,
                color: scheduleSaved ? "#50c878" : "#c5bcff", fontWeight: 600,
              }}
            >
              {scheduleLoading ? "Saving..." : scheduleSaved ? "Saved!" : "Save"}
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {DAYS.map((day) => {
              const active = selectedDays.has(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  style={{
                    padding: "4px 10px", borderRadius: "6px", cursor: "pointer",
                    fontSize: "12px", fontWeight: 600, border: "1px solid",
                    borderColor: active ? "#8b7bff" : "rgba(255,255,255,0.1)",
                    background: active ? "rgba(139,123,255,0.18)" : "rgba(255,255,255,0.03)",
                    color: active ? "#c5bcff" : "#6a5c80",
                    transition: "all 0.12s",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {DAYS.filter((d) => selectedDays.has(d)).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {DAYS.filter((d) => selectedDays.has(d)).map((day) => {
                const entry = schedule.find((s) => s.day === day);
                return (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#c5bcff", width: "28px" }}>{day}</span>
                    <input
                      type="time"
                      value={entry?.time ?? ""}
                      onChange={(e) => updateTime(day, e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#f4ecff", borderRadius: "6px", padding: "3px 7px", fontSize: "12px",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Recent Redemptions — compact feed at the bottom */}
      <section className="section-card" style={{ margin: 0, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a090c0" }}>Recent Redemptions</h2>
          <span style={{ fontSize: "11px", color: "#6a5c80" }}>{redemptions.length} / {MAX_STORED}</span>
        </div>

        {redemptions.length === 0 ? (
          <p style={{ color: "#a090c0", fontSize: "12px", margin: 0 }}>No redemptions yet.</p>
        ) : (
          <div style={{ overflowY: "auto", maxHeight: `${VISIBLE_COUNT * 32}px` }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
              {redemptions.map((r, i) => (
                <li key={i} style={{
                  display: "grid", gridTemplateColumns: "140px 1fr auto",
                  alignItems: "center", gap: "10px",
                  padding: "5px 8px", borderRadius: "6px",
                  background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#f4ecff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.user_name}</span>
                  <span style={{ fontSize: "12px", color: "#cbbce4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reward_title}</span>
                  <span style={{ fontSize: "11px", color: "#6a5c80", whiteSpace: "nowrap" }}>{new Date(r.redeemed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {/* Confirm streak reward dialog */}
      {confirmDialogOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "#1a1330", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px", padding: "24px 28px", maxWidth: "380px", width: "90%",
          }}>
            <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 700, color: "#f4ecff" }}>
              Set check-in reward?
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#a090c0", lineHeight: 1.5 }}>
              <span style={{ color: "#c5bcff", fontWeight: 600 }}>"{pendingStreakReward}"</span> will be
              set as your daily check-in / watch streak reward. Only this redemption will count toward viewer streaks.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={cancelStreakReward}
                style={{
                  padding: "6px 16px", borderRadius: "7px", cursor: "pointer",
                  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#a090c0", fontSize: "13px", fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStreakReward}
                disabled={streakRewardSaving}
                style={{
                  padding: "6px 16px", borderRadius: "7px", cursor: "pointer",
                  background: "rgba(139,123,255,0.2)", border: "1px solid #8b7bff",
                  color: "#c5bcff", fontSize: "13px", fontWeight: 600,
                }}
              >
                {streakRewardSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
