import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../lib/apiFetch";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";

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

type PointsEntry = {
  user_name: string;
  total_points:  number;
  count_1st:     number;
  count_2nd:     number;
  count_3rd:     number;
  count_lurker:  number;
  count_checkin: number;
};

type PointConfig = {
  reward_1st:    string | null;
  reward_2nd:    string | null;
  reward_3rd:    string | null;
  reward_lurker: string | null;
  checkin:       string | null;
};

type StreakEntry = {
  user_name:      string;
  streak:         number;
  longest_streak: number;
  updated_at:     string | null;
};

type ScheduleDay = {
  day:   string;
  start: string;
  end:   string;
};

type StreamStatus = {
  live:           boolean;
  session_id?:    number;
  started_at?:    string;
  is_scheduled?:  boolean;
  scheduled_day?: string | null;
};

// Shared card styles matching CRUD template structure with our color scheme
const cardSx = {
  background: "rgba(21, 18, 40, 0.95)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "12px",
  overflow: "hidden",
};

const cardHeaderSx = {
  px: 2.5,
  py: 1.75,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 56,
};

function SectionCard({
  title,
  action,
  children,
  sx = {},
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  sx?: object;
}) {
  return (
    <Paper elevation={0} sx={{ ...cardSx, ...sx }}>
      <Box sx={cardHeaderSx}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: "#f4ecff", fontSize: "15px" }}>
          {title}
        </Typography>
        {action && <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>{action}</Box>}
      </Box>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />
      <Box sx={{ p: 2.5 }}>{children}</Box>
    </Paper>
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
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <TextField
        size="small" type="date" value={from}
        onChange={(e) => onFromChange(e.target.value)}
        slotProps={{ htmlInput: { max: to || undefined, "aria-label": "From date" } }}
        sx={inputSx}
      />
      <Typography sx={{ color: "#6a5c80", fontSize: "11px" }}>–</Typography>
      <TextField
        size="small" type="date" value={to}
        onChange={(e) => onToChange(e.target.value)}
        slotProps={{ htmlInput: { min: from || undefined, "aria-label": "To date" } }}
        sx={inputSx}
      />
      {(from || to) && (
        <Button
          size="small"
          onClick={() => { onFromChange(""); onToChange(""); }}
          sx={{ minWidth: 0, p: "2px 6px", color: "#6a5c80", fontSize: "16px", lineHeight: 1 }}
        >×</Button>
      )}
    </Box>
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
  const selectedReward = options.find((r) => r.id === value) ?? null;

  return (
    <Autocomplete
      size="small"
      options={options}
      value={selectedReward}
      onChange={(_: React.SyntheticEvent, newValue: Reward | null) =>
        onChange(newValue?.id ?? "")
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
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps?.htmlInput, "aria-label": "Search rewards" },
          }}
        />
      )}
    />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Typography sx={{ color: "#a090c0", fontSize: "13px", py: 1 }}>{message}</Typography>
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

  const [pendingStreakReward,   setPendingStreakReward]   = useState<string | null>(null);
  const [confirmDialogOpen,     setConfirmDialogOpen]     = useState(false);
  const [streakRewardSaving,    setStreakRewardSaving]    = useState(false);

  const [pointsEntries,   setPointsEntries]   = useState<PointsEntry[]>([]);
  const [pointsLoading,   setPointsLoading]   = useState(false);
  const [pointsFrom,      setPointsFrom]      = useState("");
  const [pointsTo,        setPointsTo]        = useState("");
  const [pointConfig,     setPointConfig]     = useState<PointConfig>({ reward_1st: null, reward_2nd: null, reward_3rd: null, reward_lurker: null, checkin: null });
  const [pointConfigOpen, setPointConfigOpen] = useState(false);
  const [pendingConfig,   setPendingConfig]   = useState<PointConfig>({ reward_1st: null, reward_2nd: null, reward_3rd: null, reward_lurker: null, checkin: null });
  const [pointConfigSaving, setPointConfigSaving] = useState(false);

  const [schedule,        setSchedule]        = useState<ScheduleDay[]>(DAYS.map((d) => ({ day: d, start: "", end: "" })));
  const [selectedDays,    setSelectedDays]     = useState<Set<string>>(new Set());
  const [scheduleTz,      setScheduleTz]       = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch { return "UTC"; }
  });
  // Days the streamer has put into "window" mode (vs the all-day default).
  const [windowDays,      setWindowDays]        = useState<Set<string>>(new Set());
  const [scheduleLoading, setScheduleLoading]  = useState(false);
  const [scheduleSaved,   setScheduleSaved]    = useState(false);
  const [scheduleSupported, setScheduleSupported] = useState(true);

  // ── Initial fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [dashRes, redRes, rewardsRes] = await Promise.all([
          apiFetch("/api/dashboard"),
          apiFetch("/api/redemptions"),
          apiFetch("/api/rewards"),
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
          setLbReward(rewardData[0].id);
        }

        const [pcRes, srRes, schedRes] = await Promise.allSettled([
          apiFetch("/api/point-config"),
          apiFetch("/api/streak-reward"),
          apiFetch("/api/streak-schedule"),
        ]);

        if (pcRes.status === "fulfilled" && pcRes.value.ok) {
          const pc = await pcRes.value.json();
          setPointConfig(pc);
          setPendingConfig(pc);
        }

        if (srRes.status === "fulfilled" && srRes.value.ok) {
          const srData = await srRes.value.json();
          const configured = srData.reward_id;
          const match = rewardData.find((r) => r.id === configured);
          setStreakReward(match ? configured : (rewardData[0]?.id ?? ""));
        } else {
          setStreakReward(rewardData[0]?.id ?? "");
        }

        if (schedRes.status === "fulfilled" && schedRes.value.ok) {
          const schedData = await schedRes.value.json();
          const saved: Record<string, { start: string; end: string }> = {};
          for (const s of schedData.scheduled_days ?? []) {
            // Accept the new {start,end} shape, falling back to legacy {time}.
            saved[s.day] = { start: s.start ?? s.time ?? "", end: s.end ?? "" };
          }
          setSchedule(DAYS.map((d) => ({ day: d, start: saved[d]?.start ?? "", end: saved[d]?.end ?? "" })));
          setSelectedDays(new Set(Object.keys(saved)));
          setWindowDays(new Set(Object.keys(saved).filter((d) => saved[d].start && saved[d].end)));
          if (schedData.timezone) setScheduleTz(schedData.timezone);
        } else {
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
    const params = new URLSearchParams({ reward_id: lbReward });
    if (lbFrom) params.set("from_date", lbFrom);
    if (lbTo)   params.set("to_date",   lbTo);
    apiFetch(`/api/leaderboard?${params}`)
      .then((r) => r.json()).then(setLeaderboard).catch(console.error).finally(() => setLbLoading(false));
  }, [lbReward, lbFrom, lbTo]);

  // ── Streaks fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    setStreakLoading(true);
    apiFetch("/api/streaks")
      .then((r) => r.ok ? r.json() : []).then(setStreaks).catch(console.error).finally(() => setStreakLoading(false));
  }, [loading]);

  // ── Points leaderboard fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    setPointsLoading(true);
    const params = new URLSearchParams();
    if (pointsFrom) params.set("from_date", pointsFrom);
    if (pointsTo)   params.set("to_date",   pointsTo);
    apiFetch(`/api/points-leaderboard?${params}`)
      .then((r) => r.ok ? r.json() : []).then(setPointsEntries).catch(console.error).finally(() => setPointsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pointsFrom, pointsTo, JSON.stringify(pointConfig)]);

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
          prev.some((reward) => reward.id === msg.reward_id)
            ? prev
            : [...prev, { id: msg.reward_id, title: r.reward_title }]
        );
      } else if (msg.type === "stream_online") {
        setStreamStatus({
          live: true, session_id: msg.session_id,
          started_at: msg.started_at, is_scheduled: msg.is_scheduled,
          scheduled_day: msg.scheduled_day,
        });
      } else if (msg.type === "streak_update") {
        setStreaks((prev) => {
          const entry: StreakEntry = {
            user_name:      msg.user_name,
            streak:         msg.current_streak,
            longest_streak: msg.longest_streak,
            updated_at:     new Date().toISOString(),
          };
          const idx = prev.findIndex((s) => s.user_name === msg.user_name);
          const next = idx >= 0
            ? prev.map((s, i) => (i === idx ? entry : s))
            : [...prev, entry];
          return next.sort((a, b) => b.streak - a.streak);
        });
      } else if (msg.type === "stream_offline") {
        setStreamStatus({ live: false });
        apiFetch("/api/streaks")
          .then((r) => r.json()).then(setStreaks).catch(console.error);
      }
    };

    return () => ws.close();
  }, [dashboardData.broadcaster_id]);

  // ── Schedule helpers ────────────────────────────────────────────────────────
  function toggleDay(day: string) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
        // Deselecting a day drops any window it had configured.
        setWindowDays((w) => { const n = new Set(w); n.delete(day); return n; });
        setSchedule((s) => s.map((d) => d.day === day ? { ...d, start: "", end: "" } : d));
      } else {
        next.add(day);
      }
      return next;
    });
  }

  function updateWindow(day: string, field: "start" | "end", value: string) {
    setSchedule((prev) => prev.map((d) => d.day === day ? { ...d, [field]: value } : d));
  }

  // Switch a day between all-day (default) and a start/end window.
  function setDayMode(day: string, mode: "all" | "window") {
    setWindowDays((prev) => {
      const next = new Set(prev);
      mode === "window" ? next.add(day) : next.delete(day);
      return next;
    });
    if (mode === "all") {
      // Clearing the window returns the day to "show up whenever".
      setSchedule((prev) => prev.map((d) => d.day === day ? { ...d, start: "", end: "" } : d));
    }
  }

  async function saveSchedule() {
    setScheduleLoading(true);
    setScheduleSaved(false);
    try {
      // Only send a window when BOTH times are set; otherwise the day is all-day.
      const selected = schedule
        .filter((d) => selectedDays.has(d.day))
        .map((d) => (d.start && d.end
          ? { day: d.day, start: d.start, end: d.end }
          : { day: d.day }));

      await apiFetch("/api/streak-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_days: selected, timezone: scheduleTz }),
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
  function openStreakConfig() {
    setPendingStreakReward(streakReward);
    setConfirmDialogOpen(true);
  }

  async function confirmStreakReward() {
    if (!pendingStreakReward) return;
    setStreakRewardSaving(true);
    try {
      await apiFetch("/api/streak-reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_id: pendingStreakReward }),
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

  // ── Point config ────────────────────────────────────────────────────────────
  async function savePointConfig() {
    setPointConfigSaving(true);
    try {
      await apiFetch("/api/point-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reward_1st:    pendingConfig.reward_1st,
          reward_2nd:    pendingConfig.reward_2nd,
          reward_3rd:    pendingConfig.reward_3rd,
          reward_lurker: pendingConfig.reward_lurker,
        }),
      });
      setPointConfig(pendingConfig);
      setPointConfigOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setPointConfigSaving(false);
    }
  }

  // ── Early returns ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <CircularProgress sx={{ color: "#8b7bff" }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", mt: 6, px: 3 }}>
        <Alert severity="error" sx={{ background: "rgba(255,60,60,0.1)", color: "#ff8f8f", border: "1px solid rgba(255,60,60,0.3)" }}>
          {error}
        </Alert>
      </Box>
    );
  }

  const dialogPaperSx = {
    background: "#1a1330",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    color: "#f4ecff",
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Box
      component="main"
      sx={{ maxWidth: "1200px", mx: "auto", px: 3, pt: 3, pb: 6 }}
    >
      {/* Page header */}
      <Stack
        direction="row"
        sx={{ mb: 3, pb: 2.5, borderBottom: "1px solid rgba(255,255,255,0.07)", alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: "#f4ecff", fontSize: { xs: "22px", sm: "28px" } }}>
            {dashboardData.login || "Dashboard"}
          </Typography>
          {streamStatus.live && streamStatus.started_at && (
            <Typography sx={{ mt: 0.5, fontSize: "13px", color: "#a090c0" }}>
              Live since {new Date(streamStatus.started_at).toLocaleTimeString()}
              {streamStatus.scheduled_day ? ` · ${streamStatus.scheduled_day}` : " · bonus stream"}
            </Typography>
          )}
        </Box>
        {streamStatus.live && (
          <Chip
            label="LIVE"
            size="small"
            icon={
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#fff", animation: "pulse 1.2s infinite",
                marginLeft: 8,
              }} />
            }
            sx={{
              background: "#ff4040", color: "#fff", fontWeight: 700,
              fontSize: "12px", height: 26,
              "& .MuiChip-icon": { color: "#fff" },
            }}
          />
        )}
      </Stack>

      <Stack spacing={2}>
        {/* Leaderboard (points) — full width */}
        <SectionCard
          title="Leaderboard"
          action={
            <>
              <DateRangeFilter from={pointsFrom} to={pointsTo} onFromChange={setPointsFrom} onToChange={setPointsTo} />
              <Button
                size="small"
                variant="outlined"
                onClick={() => { setPendingConfig(pointConfig); setPointConfigOpen(true); }}
                sx={{
                  fontSize: "12px", borderColor: "rgba(139,123,255,0.4)",
                  color: "#c5bcff", ml: 1,
                  "&:hover": { borderColor: "#8b7bff", background: "rgba(139,123,255,0.08)" },
                }}
              >
                Configure
              </Button>
            </>
          }
        >
          {pointsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} sx={{ color: "#8b7bff" }} />
            </Box>
          ) : pointsEntries.length === 0 ? (
            <EmptyState message={
              pointConfig.reward_1st || pointConfig.reward_2nd || pointConfig.reward_3rd || pointConfig.reward_lurker || pointConfig.checkin
                ? "No points earned yet."
                : "Configure rewards to start tracking points."
            } />
          ) : (
            <List disablePadding>
              {pointsEntries.map((entry, i) => {
                const rank  = i + 1;
                const color = medalColors[rank] ?? "#8b7bff";
                const label = medalLabel[rank]  ?? `#${rank}`;
                return (
                  <ListItem
                    key={entry.user_name}
                    disableGutters
                    sx={{
                      px: 1, py: 0.75, borderRadius: "8px",
                      background: rank <= 3 ? `${color}12` : "transparent",
                      mb: 0.5,
                    }}
                  >
                    <Typography sx={{ width: 32, fontSize: "12px", fontWeight: 700, color, flexShrink: 0 }}>
                      {label}
                    </Typography>
                    <ListItemText
                      primary={entry.user_name}
                      slotProps={{
                        primary: { sx: { fontSize: "14px", fontWeight: 600, color: "#f4ecff" } },
                      }}
                    />
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                      <Typography sx={{ fontSize: "11px", color: "#6a5c80", display: "flex", gap: 1 }}>
                        {entry.count_1st     > 0 && <span><span role="img" aria-label="1st place">🥇</span>×{entry.count_1st}</span>}
                        {entry.count_2nd     > 0 && <span><span role="img" aria-label="2nd place">🥈</span>×{entry.count_2nd}</span>}
                        {entry.count_3rd     > 0 && <span><span role="img" aria-label="3rd place">🥉</span>×{entry.count_3rd}</span>}
                        {entry.count_lurker  > 0 && <span><span role="img" aria-label="Lurker redemptions">👀</span>×{entry.count_lurker}</span>}
                        {entry.count_checkin > 0 && <span><span role="img" aria-label="Check-ins">✓</span>×{entry.count_checkin}</span>}
                      </Typography>
                      <Typography sx={{ fontSize: "14px", fontWeight: 700, color }}>
                        {entry.total_points}pts
                      </Typography>
                    </Stack>
                  </ListItem>
                );
              })}
            </List>
          )}
        </SectionCard>

        {/* Middle row — Redemption Tracker + Watch Streaks */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>

          {/* Redemption Tracker */}
          <SectionCard
            title="Redemption Tracker"
            action={<RewardDropdown value={lbReward} options={rewards} onChange={setLbReward} />}
          >
            <Box sx={{ mb: 1.5 }}>
              <DateRangeFilter from={lbFrom} to={lbTo} onFromChange={setLbFrom} onToChange={setLbTo} />
            </Box>
            {lbLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size={24} sx={{ color: "#8b7bff" }} />
              </Box>
            ) : leaderboard.length === 0 ? (
              <EmptyState message="No data yet." />
            ) : (
              <List disablePadding>
                {leaderboard.map((entry, i) => {
                  const rank  = i + 1;
                  const color = medalColors[rank] ?? "#8b7bff";
                  const label = medalLabel[rank]  ?? `#${rank}`;
                  return (
                    <ListItem
                      key={entry.user_name}
                      disableGutters
                      sx={{
                        px: 1, py: 0.75, borderRadius: "8px",
                        background: rank <= 3 ? `${color}12` : "transparent",
                        mb: 0.5,
                      }}
                    >
                      <Typography sx={{ width: 32, fontSize: "12px", fontWeight: 700, color, flexShrink: 0 }}>
                        {label}
                      </Typography>
                      <ListItemText
                        primary={entry.user_name}
                        slotProps={{
                          primary: { sx: { fontSize: "14px", fontWeight: 600, color: "#f4ecff" } },
                        }}
                      />
                      <Typography sx={{ fontSize: "14px", fontWeight: 700, color }}>
                        {entry.count}
                      </Typography>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </SectionCard>

          {/* Watch Streaks */}
          <SectionCard
            title="Watch Streaks"
            action={
              <>
                {streakReward && (
                  <Typography sx={{ fontSize: "12px", color: "#a090c0", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rewards.find((r) => r.id === streakReward)?.title ?? streakReward}
                  </Typography>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={openStreakConfig}
                  sx={{
                    fontSize: "12px", borderColor: "rgba(139,123,255,0.4)",
                    color: "#c5bcff",
                    "&:hover": { borderColor: "#8b7bff", background: "rgba(139,123,255,0.08)" },
                  }}
                >
                  Configure
                </Button>
              </>
            }
          >
            {streakLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size={24} sx={{ color: "#8b7bff" }} />
              </Box>
            ) : streaks.length === 0 ? (
              <EmptyState message="No check-ins yet." />
            ) : (
              <List disablePadding>
                {streaks.map((entry, i) => {
                  const streakColor =
                    entry.streak >= 20 ? "#FFD700" :
                    entry.streak >= 10 ? "#ff8f8f" :
                    entry.streak >= 5  ? "#8b7bff" : "#cbbce4";
                  return (
                    <ListItem
                      key={entry.user_name}
                      disableGutters
                      sx={{ px: 1, py: 0.75, borderRadius: "8px", mb: 0.5 }}
                    >
                      <Typography sx={{ width: 28, fontSize: "12px", color: "#a090c0", flexShrink: 0 }}>
                        #{i + 1}
                      </Typography>
                      <ListItemText
                        primary={entry.user_name}
                        slotProps={{
                          primary: { sx: { fontSize: "14px", fontWeight: 600, color: "#f4ecff" } },
                        }}
                      />
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <Typography sx={{ fontSize: "13px", fontWeight: 700, color: streakColor }}>
                          {entry.streak}s
                        </Typography>
                        <Typography sx={{ fontSize: "12px", color: "#a090c0" }}>
                          best: {entry.longest_streak}
                        </Typography>
                      </Stack>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </SectionCard>
        </Box>

        {/* Stream Schedule */}
        {scheduleSupported && (
          <SectionCard
            title="Stream Schedule"
            action={
              <Button
                size="small"
                variant="outlined"
                onClick={saveSchedule}
                disabled={scheduleLoading}
                sx={{
                  fontSize: "12px",
                  borderColor: scheduleSaved ? "#50c878" : "rgba(139,123,255,0.4)",
                  color: scheduleSaved ? "#50c878" : "#c5bcff",
                  "&:hover": {
                    borderColor: scheduleSaved ? "#50c878" : "#8b7bff",
                    background: scheduleSaved ? "rgba(80,200,120,0.08)" : "rgba(139,123,255,0.08)",
                  },
                }}
              >
                {scheduleLoading ? "Saving..." : scheduleSaved ? "Saved!" : "Save"}
              </Button>
            }
          >
            <Stack spacing={1.5}>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {DAYS.map((day) => {
                  const active = selectedDays.has(day);
                  return (
                    <Button
                      key={day}
                      size="small"
                      variant={active ? "contained" : "outlined"}
                      onClick={() => toggleDay(day)}
                      sx={{
                        fontSize: "12px", fontWeight: 600, minWidth: 48,
                        borderColor: active ? "#8b7bff" : "rgba(255,255,255,0.1)",
                        background: active ? "rgba(139,123,255,0.25)" : "rgba(255,255,255,0.03)",
                        color: active ? "#c5bcff" : "#6a5c80",
                        boxShadow: "none",
                        "&:hover": {
                          background: active ? "rgba(139,123,255,0.35)" : "rgba(255,255,255,0.06)",
                          boxShadow: "none",
                        },
                      }}
                    >
                      {day}
                    </Button>
                  );
                })}
              </Stack>

              {DAYS.filter((d) => selectedDays.has(d)).length > 0 && (
                <Stack spacing={1} sx={{ pt: 0.5 }}>
                  {DAYS.filter((d) => selectedDays.has(d)).map((day) => {
                    const entry = schedule.find((s) => s.day === day);
                    const isWindow = windowDays.has(day);
                    const timeInputSx: React.CSSProperties = {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#f4ecff", borderRadius: "6px",
                      padding: "3px 7px", fontSize: "12px",
                    };
                    const modeBtnSx = (on: boolean) => ({
                      fontSize: "11px", fontWeight: 600, minWidth: 0, px: 1, py: 0.25,
                      lineHeight: 1.4, textTransform: "none" as const, boxShadow: "none",
                      borderColor: on ? "#8b7bff" : "rgba(255,255,255,0.1)",
                      background: on ? "rgba(139,123,255,0.25)" : "rgba(255,255,255,0.03)",
                      color: on ? "#c5bcff" : "#6a5c80",
                      "&:hover": { background: on ? "rgba(139,123,255,0.35)" : "rgba(255,255,255,0.06)", boxShadow: "none" },
                    });
                    return (
                      <Stack key={day} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <Typography sx={{ fontSize: "12px", fontWeight: 600, color: "#c5bcff", width: 28 }}>
                          {day}
                        </Typography>
                        <Stack direction="row" spacing={0.5}>
                          <Button size="small" variant="outlined" onClick={() => setDayMode(day, "all")} sx={modeBtnSx(!isWindow)}>
                            All day
                          </Button>
                          <Button size="small" variant="outlined" onClick={() => setDayMode(day, "window")} sx={modeBtnSx(isWindow)}>
                            Set window
                          </Button>
                        </Stack>
                        {isWindow && (
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <input
                              type="time"
                              value={entry?.start ?? ""}
                              onChange={(e) => updateWindow(day, "start", e.target.value)}
                              style={timeInputSx}
                              aria-label={`${day} window start time`}
                            />
                            <Typography sx={{ fontSize: "12px", color: "#6a5c80" }}>→</Typography>
                            <input
                              type="time"
                              value={entry?.end ?? ""}
                              onChange={(e) => updateWindow(day, "end", e.target.value)}
                              style={timeInputSx}
                              aria-label={`${day} window end time`}
                            />
                          </Stack>
                        )}
                      </Stack>
                    );
                  })}
                  <Typography sx={{ fontSize: "11px", color: "#6a5c80", pt: 0.25 }}>
                    Times are in {scheduleTz}. “All day” means viewers just need to show up that day; a window only penalizes no-shows when you’re live during it.
                  </Typography>
                </Stack>
              )}
            </Stack>
          </SectionCard>
        )}

        {/* Recent Redemptions */}
        <SectionCard
          title="Recent Redemptions"
          action={
            <Typography sx={{ fontSize: "12px", color: "#6a5c80" }}>
              {redemptions.length} / {MAX_STORED}
            </Typography>
          }
        >
          <Box aria-live="polite" aria-atomic="false">
            {redemptions.length === 0 ? (
              <EmptyState message="No redemptions yet." />
            ) : (
              <Box sx={{ overflowY: "auto", maxHeight: `${VISIBLE_COUNT * 38}px` }}>
                <List disablePadding>
                  {redemptions.map((r, i) => (
                    <ListItem
                      key={`${r.redeemed_at}-${r.user_name}-${r.reward_title}`}
                      disableGutters
                      sx={{
                        px: 1, py: 0.75, borderRadius: "6px",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                      }}
                    >
                      <Typography sx={{ width: 140, fontSize: "13px", fontWeight: 600, color: "#f4ecff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {r.user_name}
                      </Typography>
                      <ListItemText
                        primary={r.reward_title}
                        slotProps={{
                          primary: { sx: { fontSize: "13px", color: "#cbbce4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                        }}
                      />
                      <Typography sx={{ fontSize: "12px", color: "#6a5c80", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {new Date(r.redeemed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </SectionCard>
      </Stack>

      {/* Point config dialog */}
      <Dialog
        open={pointConfigOpen}
        onClose={() => setPointConfigOpen(false)}
        slotProps={{ paper: { sx: dialogPaperSx } }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ color: "#f4ecff", fontWeight: 700, pb: 1 }}>
          Configure Leaderboard Rewards
        </DialogTitle>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2, fontSize: "13px", color: "#6a5c80" }}>
            Assign your channel point rewards to each placement. Check-in uses the reward configured in Watch Streaks.
          </Typography>
          {(["reward_1st", "reward_2nd", "reward_3rd", "reward_lurker"] as const).map((key, i) => {
            const labels = [
              { emoji: "🥇", text: "1st Place (3 pts)" },
              { emoji: "🥈", text: "2nd Place (2 pts)" },
              { emoji: "🥉", text: "3rd Place (1 pt)" },
              { emoji: "👀", text: "Lurker (0.5 pts)" },
            ];
            return (
              <Box key={key} sx={{ mb: 2 }}>
                <Typography sx={{ mb: 0.5, fontSize: "13px", fontWeight: 600, color: "#c5bcff" }}>
                  <span aria-hidden="true">{labels[i].emoji}</span> {labels[i].text}
                </Typography>
                <RewardDropdown
                  value={pendingConfig[key] ?? ""}
                  options={rewards}
                  onChange={(v) => setPendingConfig((prev) => ({ ...prev, [key]: v || null }))}
                />
              </Box>
            );
          })}
          <Box sx={{ p: 1.5, borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Typography sx={{ fontSize: "12px", color: "#6a5c80" }}>
              <span aria-hidden="true">✓</span> Check-in (1 pt):{" "}
              <span style={{ color: "#c5bcff" }}>{pointConfig.checkin ?? "not configured"}</span>
              {!pointConfig.checkin && " — set in Watch Streaks"}
            </Typography>
          </Box>
        </DialogContent>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setPointConfigOpen(false)}
            sx={{ color: "#a090c0", borderColor: "rgba(255,255,255,0.12)" }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={savePointConfig}
            disabled={pointConfigSaving}
            variant="contained"
            sx={{ background: "rgba(139,123,255,0.3)", color: "#c5bcff", border: "1px solid #8b7bff", boxShadow: "none", "&:hover": { background: "rgba(139,123,255,0.45)", boxShadow: "none" } }}
          >
            {pointConfigSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm streak reward dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={cancelStreakReward}
        slotProps={{ paper: { sx: dialogPaperSx } }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ color: "#f4ecff", fontWeight: 700, pb: 1 }}>
          Configure check-in reward
        </DialogTitle>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
        <DialogContent sx={{ pt: 2 }}>
          {streamStatus.live && (
            <Alert
              severity="warning"
              sx={{ mb: 2, background: "rgba(255,60,60,0.1)", color: "#ff8f8f", border: "1px solid rgba(255,60,60,0.3)", "& .MuiAlert-icon": { color: "#ff8f8f" } }}
            >
              You are currently live. Changing this reward mid-stream may affect your viewers' watch streaks.
            </Alert>
          )}
          <Typography sx={{ mb: 2, fontSize: "13px", color: "#a090c0", lineHeight: 1.6 }}>
            Only this redemption will count toward viewer streaks. Streaks are global — changing this reward will not reset existing streaks.
          </Typography>
          <RewardDropdown
            value={pendingStreakReward ?? ""}
            options={rewards}
            onChange={(v) => setPendingStreakReward(v || null)}
          />
        </DialogContent>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={cancelStreakReward}
            sx={{ color: "#a090c0", borderColor: "rgba(255,255,255,0.12)" }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={confirmStreakReward}
            disabled={streakRewardSaving}
            variant="contained"
            sx={{ background: "rgba(139,123,255,0.3)", color: "#c5bcff", border: "1px solid #8b7bff", boxShadow: "none", "&:hover": { background: "rgba(139,123,255,0.45)", boxShadow: "none" } }}
          >
            {streakRewardSaving ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
