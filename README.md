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
├── docker-compose.yml         # Local MySQL for development
├── backend/
│   ├── schema.sql              # Local-dev schema (see Local Development below)
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

## Local Development

Run the whole stack locally against a local database, instead of pushing to `main`/`dev` just to test something on Railway.

### 1. Start the local database

```
docker compose up -d
```

This starts a MySQL container on `localhost:3307` (not the default 3306, so it won't collide with a MySQL you already have running) and initializes it from `backend/schema.sql` on first boot.

> `schema.sql` is reverse-engineered from the queries in `db.py` — there's no migration file, since the production tables on Railway were created by hand. It's enough to run the app locally; it's not guaranteed to be byte-for-byte identical to production.

### 2. Backend

```
cd backend/app
pip install -r requirements.txt
cp db.env.example db.env                  # fill in TOKEN_ENCRYPTION_KEY (see comments in the file)
cp user_oauth.env.example user_oauth.env  # fill in your Twitch Client ID/Secret
uvicorn main:app --reload --port 8000
```

Before this works you need to add `http://localhost:8000/auth/twitch/callback` as a second OAuth Redirect URL on your Twitch app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) — Twitch apps support multiple redirect URLs, so your production one keeps working too.

### 3. Frontend

```
cd frontend/fwitz_channel_points
npm install
npm run dev
```

By default `npm run dev` points at the live Railway backend (`.env.development`, committed). **To cycle into the local backend instead:**

```
cp .env.development.local.example .env.development.local
```

Vite gives `.env.development.local` priority over `.env.development`, and it's gitignored — so switching back to Railway is just deleting that one file. Nothing else changes.

### Notes

- The EventSub tracker runs as a background thread inside the backend process itself — no separate service to start.
- Testing redemptions/streaks requires actually going live and redeeming channel points on your own Twitch channel; there's no mock EventSub feed. Since your local backend writes to the local database, this never touches production data.
- `BACKEND_INTERNAL_URL` in `user_oauth.env.example` is important: without it, the local tracker thread reports events to the *production* backend instead of your local one.

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
