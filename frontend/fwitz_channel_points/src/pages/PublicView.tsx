import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";

const API_BASE = import.meta.env.VITE_API_URL;

const medalColors: Record<number, string> = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
const medalLabel:  Record<number, string> = { 1: "1st",     2: "2nd",     3: "3rd"     };

type Reward = {
  id:    string;
  title: string;
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

type StreakEntry = {
  user_name:      string;
  streak:         number;
  longest_streak: number;
  updated_at:     string | null;
};

type TrackerEntry = {
  user_name: string;
  count:     number;
};

type StreamStatus = {
  live:        boolean;
  started_at?: string;
};

type QuickMode = "month" | "year" | "all" | "custom";

type DateFilterState = { mode: QuickMode; from: string; to: string };

const ALL_TIME: DateFilterState = { mode: "all", from: "", to: "" };

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange() {
  const now = new Date();
  return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
}

function yearRange() {
  const now = new Date();
  return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to: toISODate(now) };
}

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
  flexWrap: "wrap" as const,
  gap: 1,
  minHeight: 56,
};

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper elevation={0} sx={cardSx}>
      <Box sx={cardHeaderSx}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: "#f4ecff", fontSize: "15px" }}>
          {title}
        </Typography>
        {action && <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>{action}</Box>}
      </Box>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />
      <Box sx={{ p: 2.5 }}>{children}</Box>
    </Paper>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Typography sx={{ color: "#a090c0", fontSize: "13px", py: 1 }}>{message}</Typography>
  );
}

function QuickDateFilter({
  value,
  onChange,
}: {
  value: DateFilterState;
  onChange: (next: DateFilterState) => void;
}) {
  const tabs: { mode: QuickMode; label: string }[] = [
    { mode: "month",  label: "Month" },
    { mode: "year",   label: "Year" },
    { mode: "all",    label: "All Time" },
    { mode: "custom", label: "Custom" },
  ];

  function selectMode(mode: QuickMode) {
    if (mode === "month") return onChange({ mode, ...monthRange() });
    if (mode === "year")  return onChange({ mode, ...yearRange() });
    if (mode === "all")   return onChange({ mode, from: "", to: "" });
    onChange({ mode, from: value.from, to: value.to });
  }

  const tabBtnSx = (active: boolean) => ({
    fontSize: "11px", fontWeight: 600, minWidth: 0, px: 1.25, py: 0.4,
    lineHeight: 1.4, textTransform: "none" as const, boxShadow: "none",
    borderColor: active ? "#8b7bff" : "rgba(255,255,255,0.1)",
    background: active ? "rgba(139,123,255,0.25)" : "rgba(255,255,255,0.03)",
    color: active ? "#c5bcff" : "#6a5c80",
    "&:hover": { background: active ? "rgba(139,123,255,0.35)" : "rgba(255,255,255,0.06)", boxShadow: "none" },
  });

  const inputSx = {
    width: 130,
    "& .MuiInputBase-root": { color: "#f4ecff", background: "rgba(255,255,255,0.06)", fontSize: "11px" },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.12)" },
    "& input::-webkit-calendar-picker-indicator": { filter: "invert(0.7)" },
  };

  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <Button
          key={t.mode}
          size="small"
          variant="outlined"
          onClick={() => selectMode(t.mode)}
          sx={tabBtnSx(value.mode === t.mode)}
        >
          {t.label}
        </Button>
      ))}
      {value.mode === "custom" && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <TextField
            size="small" type="date" value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            slotProps={{ htmlInput: { max: value.to || undefined, "aria-label": "From date" } }}
            sx={inputSx}
          />
          <Typography sx={{ color: "#6a5c80", fontSize: "11px" }}>–</Typography>
          <TextField
            size="small" type="date" value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            slotProps={{ htmlInput: { min: value.from || undefined, "aria-label": "To date" } }}
            sx={inputSx}
          />
        </Stack>
      )}
    </Stack>
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
      onChange={(_: React.SyntheticEvent, newValue: Reward | null) => onChange(newValue?.id ?? "")}
      getOptionLabel={(option: Reward) => option.title}
      isOptionEqualToValue={(option: Reward, value: Reward) => option.id === value.id}
      sx={{
        width: 200,
        "& .MuiInputBase-root": { color: "#f4ecff", background: "rgba(255,255,255,0.06)", fontSize: "12px" },
        "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.12)" },
        "& .MuiSvgIcon-root": { color: "#c5bcff" },
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

export default function PublicView() {
  const { login } = useParams<{ login: string }>();

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [pointsEntries, setPointsEntries] = useState<PointsEntry[]>([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsFilter,  setPointsFilter]  = useState<DateFilterState>(ALL_TIME);

  const [rewards,         setRewards]         = useState<Reward[]>([]);
  const [selectedReward,  setSelectedReward]  = useState("");
  const [trackerEntries,  setTrackerEntries]  = useState<TrackerEntry[]>([]);
  const [trackerLoading,  setTrackerLoading]  = useState(false);
  const [trackerFilter,   setTrackerFilter]   = useState<DateFilterState>(ALL_TIME);

  const [streaks,        setStreaks]        = useState<StreakEntry[]>([]);
  const [streaksLoading, setStreaksLoading] = useState(false);

  const [status, setStatus] = useState<StreamStatus>({ live: false });

  // ── Existence check + live status ───────────────────────────────────────────
  useEffect(() => {
    if (!login) return;

    async function loadStatus() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/public/${login}/status`);
        if (res.status === 404) {
          throw new Error(`No tracker found for "${login}".`);
        }
        setStatus(res.ok ? await res.json() : { live: false });
      } catch (err: any) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [login]);

  // ── Leaderboard fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!login || loading || error) return;
    setPointsLoading(true);
    const params = new URLSearchParams();
    if (pointsFilter.from) params.set("from_date", pointsFilter.from);
    if (pointsFilter.to)   params.set("to_date",   pointsFilter.to);
    fetch(`${API_BASE}/api/public/${login}/points-leaderboard?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setPointsEntries)
      .catch(console.error)
      .finally(() => setPointsLoading(false));
  }, [login, loading, error, pointsFilter.from, pointsFilter.to]);

  // ── Redemption Tracker: reward list ─────────────────────────────────────────
  useEffect(() => {
    if (!login || loading || error) return;
    fetch(`${API_BASE}/api/public/${login}/rewards`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Reward[]) => {
        setRewards(data);
        setSelectedReward((prev) =>
          prev && data.some((r) => r.id === prev) ? prev : (data[0]?.id ?? "")
        );
      })
      .catch(console.error);
  }, [login, loading, error]);

  // ── Redemption Tracker: leaderboard for selected reward ─────────────────────
  useEffect(() => {
    if (!login || loading || error || !selectedReward) {
      setTrackerEntries([]);
      return;
    }
    setTrackerLoading(true);
    const params = new URLSearchParams({ reward_id: selectedReward });
    if (trackerFilter.from) params.set("from_date", trackerFilter.from);
    if (trackerFilter.to)   params.set("to_date",   trackerFilter.to);
    fetch(`${API_BASE}/api/public/${login}/leaderboard?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setTrackerEntries)
      .catch(console.error)
      .finally(() => setTrackerLoading(false));
  }, [login, loading, error, selectedReward, trackerFilter.from, trackerFilter.to]);

  // ── Streaks fetch — no date filter, streaks are a running total ─────────────
  useEffect(() => {
    if (!login || loading || error) return;
    setStreaksLoading(true);
    fetch(`${API_BASE}/api/public/${login}/streaks`)
      .then((r) => r.ok ? r.json() : [])
      .then(setStreaks)
      .catch(console.error)
      .finally(() => setStreaksLoading(false));
  }, [login, loading, error]);

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

  return (
    <Box component="main" sx={{ maxWidth: "800px", mx: "auto", px: 3, pt: 3, pb: 6 }}>
      <Stack
        direction="row"
        sx={{ mb: 3, pb: 2.5, borderBottom: "1px solid rgba(255,255,255,0.07)", alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Typography variant="h4" sx={{ fontWeight: 700, color: "#f4ecff", fontSize: { xs: "22px", sm: "28px" } }}>
          {login}
        </Typography>
        {status.live && (
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
        <SectionCard
          title="Leaderboard"
          action={<QuickDateFilter value={pointsFilter} onChange={setPointsFilter} />}
        >
          {pointsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} sx={{ color: "#8b7bff" }} />
            </Box>
          ) : pointsEntries.length === 0 ? (
            <EmptyState message="No points earned yet." />
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

        <SectionCard
          title="Redemption Tracker"
          action={
            rewards.length > 0 ? (
              <>
                <RewardDropdown value={selectedReward} options={rewards} onChange={setSelectedReward} />
                <QuickDateFilter value={trackerFilter} onChange={setTrackerFilter} />
              </>
            ) : undefined
          }
        >
          {rewards.length === 0 ? (
            <EmptyState message="No redemptions tracked yet." />
          ) : trackerLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} sx={{ color: "#8b7bff" }} />
            </Box>
          ) : trackerEntries.length === 0 ? (
            <EmptyState message="No redemptions yet for this reward." />
          ) : (
            <List disablePadding>
              {trackerEntries.map((entry, i) => {
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

        <SectionCard title="Watch Streaks">
          {streaksLoading ? (
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
      </Stack>
    </Box>
  );
}
