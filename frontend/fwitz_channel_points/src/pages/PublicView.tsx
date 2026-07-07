import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";

const API_BASE = import.meta.env.VITE_API_URL;

const medalColors: Record<number, string> = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
const medalLabel:  Record<number, string> = { 1: "1st",     2: "2nd",     3: "3rd"     };

type PointsEntry = {
  user_name: string;
  total_points:  number;
  count_1st:     number;
  count_2nd:     number;
  count_3rd:     number;
  count_checkin: number;
};

type StreakEntry = {
  user_name:      string;
  streak:         number;
  longest_streak: number;
  updated_at:     string | null;
};

type StreamStatus = {
  live:        boolean;
  started_at?: string;
};

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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper elevation={0} sx={cardSx}>
      <Box sx={cardHeaderSx}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: "#f4ecff", fontSize: "15px" }}>
          {title}
        </Typography>
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

export default function PublicView() {
  const { login } = useParams<{ login: string }>();

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [pointsEntries, setPointsEntries] = useState<PointsEntry[]>([]);
  const [streaks,       setStreaks]       = useState<StreakEntry[]>([]);
  const [status,        setStatus]        = useState<StreamStatus>({ live: false });

  useEffect(() => {
    if (!login) return;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [pointsRes, streaksRes, statusRes] = await Promise.all([
          fetch(`${API_BASE}/api/public/${login}/points-leaderboard`),
          fetch(`${API_BASE}/api/public/${login}/streaks`),
          fetch(`${API_BASE}/api/public/${login}/status`),
        ]);

        if (pointsRes.status === 404) {
          throw new Error(`No tracker found for "${login}".`);
        }

        setPointsEntries(pointsRes.ok ? await pointsRes.json() : []);
        setStreaks(streaksRes.ok ? await streaksRes.json() : []);
        setStatus(statusRes.ok ? await statusRes.json() : { live: false });
      } catch (err: any) {
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [login]);

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
        <SectionCard title="Leaderboard">
          {pointsEntries.length === 0 ? (
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
                        {entry.count_1st     > 0 && <span title="1st place">🥇×{entry.count_1st}</span>}
                        {entry.count_2nd     > 0 && <span title="2nd place">🥈×{entry.count_2nd}</span>}
                        {entry.count_3rd     > 0 && <span title="3rd place">🥉×{entry.count_3rd}</span>}
                        {entry.count_checkin > 0 && <span title="Check-ins">✓×{entry.count_checkin}</span>}
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

        <SectionCard title="Watch Streaks">
          {streaks.length === 0 ? (
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
