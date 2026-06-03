# Channel Points Tracker

A Twitch channel points redemption tracker and analytics dashboard for streamers. Monitor viewer redemptions in real time, track engagement streaks, and view leaderboards — all in one place.

## Features

- **Live Redemption Feed** — real-time feed of channel point redemptions via Twitch EventSub WebSocket
- **Leaderboards** — top 20 viewers ranked by redemption count per reward
- **Watch Streaks** — tracks consecutive stream attendance per viewer, per reward
- **Stream Schedule** — configure scheduled streaming days and time windows to control which streams count toward streaks
- **Twitch OAuth** — login with your Twitch account, no passwords

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Material UI |
| Backend | FastAPI (Python), Uvicorn |
| Database | MySQL |
| Realtime | Twitch EventSub WebSocket |
| Hosting | Railway (backend + DB), Vercel (frontend) |

## How It Works

1. Streamer logs in via Twitch OAuth
2. A tracker thread connects to Twitch EventSub and listens for redemptions, stream online, and stream offline events
3. Redemptions are saved to the database and pushed to the frontend via WebSocket
4. When a stream ends, viewer streaks are settled based on who redeemed during the session and whether the stream was a scheduled or bonus stream

## Project Structure

```
Channel_Points/
├── backend/
│   └── app/
│       ├── main.py               # FastAPI app, auth endpoints, WebSocket
│       ├── db.py                 # Database queries
│       ├── track_redemption.py   # Twitch EventSub listener & streak logic
│       └── tracker_manager.py   # Thread manager for per-streamer trackers
└── frontend/
    └── fwitz_channel_points/
        └── src/
            ├── App.tsx
            └── pages/
                └── Dashboard.tsx
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/twitch/login` | Start Twitch OAuth flow |
| GET | `/auth/twitch/callback` | OAuth callback |
| POST | `/auth/logout` | Clear session |
| GET | `/api/redemptions` | Recent redemptions (last 50) |
| GET | `/api/leaderboard` | Top viewers by redemption count |
| GET | `/api/streaks` | Top viewers by streak |
| GET | `/api/streak-schedule` | Get streaming schedule |
| POST | `/api/streak-schedule` | Save streaming schedule |
| WS | `/ws` | Real-time event stream |
