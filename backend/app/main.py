from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from db import get_connection, upsert_streamer, save_tokens, get_streak_schedule, save_streak_schedule
import os
import secrets
import time
from dotenv import load_dotenv
import httpx
from tracker_manager import start_tracker
from datetime import datetime, timedelta
from typing import Optional

load_dotenv("user_oauth.env")

app = FastAPI()

TWITCH_CLIENT_ID = os.environ["TWITCH_CLIENT_ID"]
TWITCH_CLIENT_SECRET = os.environ["TWITCH_CLIENT_SECRET"]
TWITCH_REDIRECT_URI = os.environ["TWITCH_REDIRECT_URI"]
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL")

pending_states = {}
user_tokens = {}
sessions = {}

AUTH_URL = "https://id.twitch.tv/oauth2/authorize"
TOKEN_URL = "https://id.twitch.tv/oauth2/token"
VALIDATE_URL = "https://id.twitch.tv/oauth2/validate"


class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)

    async def send_to_user(self, user_id: str, data: dict):
        user_id = str(user_id)
        if user_id not in self.active_connections:
            return
        for connection in self.active_connections[user_id][:]:
            try:
                await connection.send_json(data)
            except:
                self.active_connections[user_id].remove(connection)


manager = ConnectionManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_BASE_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token or token not in sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sessions[token]["twitch_user_id"]


# ── Redemptions ───────────────────────────────────────────────────────────────

@app.get("/api/redemptions")
async def get_redemptions(user_id: str = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT user_id, user_name, reward_title, redeemed_at, status
        FROM redemptions
        WHERE twitch_user_id = %s
        ORDER BY redeemed_at DESC
        LIMIT 50
    """, (user_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


# ── Leaderboard ───────────────────────────────────────────────────────────────

@app.get("/api/leaderboard")
async def get_leaderboard(reward_title: str, user_id: str = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT user_name, COUNT(*) AS count
        FROM redemptions
        WHERE twitch_user_id = %s AND reward_title = %s
        GROUP BY user_name
        ORDER BY count DESC
        LIMIT 20
    """, (user_id, reward_title))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


# ── Streak Schedule ───────────────────────────────────────────────────────────

class ScheduleDay(BaseModel):
    day: str
    time: Optional[str] = None

class StreakSchedulePayload(BaseModel):
    scheduled_days: list[ScheduleDay]

@app.get("/api/streak-schedule")
async def get_schedule(user_id: str = Depends(get_current_user)):
    schedule = get_streak_schedule(user_id)
    return {"scheduled_days": schedule or []}

@app.post("/api/streak-schedule")
async def update_schedule(
    payload: StreakSchedulePayload,
    user_id: str = Depends(get_current_user),
):
    days = [d.dict() for d in payload.scheduled_days]
    save_streak_schedule(user_id, days)
    return {"ok": True, "scheduled_days": days}


# ── Streaks ───────────────────────────────────────────────────────────────────

@app.get("/api/streaks")
async def get_streaks(reward_title: str, user_id: str = Depends(get_current_user)):
    """
    Per-stream streak computation.

    - Scheduled session missed (and ended) → streak resets to 0.
    - Unscheduled session missed            → no penalty.
    - Any session checked into              → streak +1.
    - Live session not yet checked into     → not penalised yet.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT id, started_at, ended_at, is_scheduled, scheduled_day
        FROM stream_sessions
        WHERE twitch_user_id = %s
        ORDER BY started_at ASC
    """, (user_id,))
    sessions_list = cursor.fetchall()

    if not sessions_list:
        cursor.close()
        conn.close()
        return []

    cursor.execute("""
        SELECT user_name, redeemed_at
        FROM redemptions
        WHERE twitch_user_id = %s AND reward_title = %s
        ORDER BY redeemed_at ASC
    """, (user_id, reward_title))
    redemptions = cursor.fetchall()

    cursor.close()
    conn.close()

    from collections import defaultdict
    user_redemption_times: dict[str, list] = defaultdict(list)
    for r in redemptions:
        user_redemption_times[r["user_name"]].append(r["redeemed_at"])

    now = datetime.utcnow()
    result = []

    for viewer, viewer_times in user_redemption_times.items():
        streak = 0
        last_session_info = None

        for sess in sessions_list:
            sess_start = sess["started_at"]
            sess_end   = sess["ended_at"] if sess["ended_at"] else now
            is_live    = sess["ended_at"] is None

            checked_in = any(sess_start <= rt <= sess_end for rt in viewer_times)

            if checked_in:
                streak += 1
                last_session_info = sess
            elif sess["is_scheduled"] and not is_live:
                # Missed a finished scheduled session — reset
                streak = 0
            # Unscheduled miss or live session not yet checked in: no action

        if streak > 0 and last_session_info:
            result.append({
                "user_name":           viewer,
                "streak":              streak,
                "last_checkin_session": last_session_info["started_at"].isoformat(),
                "last_scheduled_day":  last_session_info.get("scheduled_day"),
            })

    result.sort(key=lambda x: x["streak"], reverse=True)
    return result[:20]


# ── Auth ──────────────────────────────────────────────────────────────────────

def build_auth_url(scopes: list[str]) -> str:
    state = secrets.token_urlsafe(32)
    pending_states[state] = {"created": time.time()}
    scope_str = "%20".join(scopes)
    return (
        f"{AUTH_URL}?client_id={TWITCH_CLIENT_ID}"
        f"&redirect_uri={TWITCH_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scope_str}"
        f"&state={state}"
    )

@app.get("/")
def root():
    return {"message": "FastAPI Twitch auth server is running"}

@app.get("/auth/twitch/login")
def twitch_login():
    scopes = ["channel:read:redemptions"]
    return RedirectResponse(build_auth_url(scopes))

@app.post("/auth/logout")
def logout(request: Request):
    token = request.cookies.get("session_token")
    if token and token in sessions:
        del sessions[token]
    response = JSONResponse({"message": "Logged out successfully"})
    response.delete_cookie(key="session_token", httponly=True, samesite="lax")
    return response

@app.get("/api/me")
async def me(user_id: str = Depends(get_current_user)):
    user_data = user_tokens.get(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User data not found")
    return {"login": user_data.get("login"), "broadcaster_id": user_id}

@app.get("/auth/twitch/callback")
async def twitch_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        raise HTTPException(status_code=400, detail=f"Twitch auth error: {error}")
    if not code or not state or state not in pending_states:
        raise HTTPException(status_code=400, detail="Invalid code or state")

    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(TOKEN_URL, params={
            "client_id":     TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "code":          code,
            "grant_type":    "authorization_code",
            "redirect_uri":  TWITCH_REDIRECT_URI,
        })
        token_resp.raise_for_status()
        token_json = token_resp.json()

        access_token  = token_json["access_token"]
        refresh_token = token_json.get("refresh_token")
        expires_in    = token_json.get("expires_in")

        validate_resp = await client.get(
            VALIDATE_URL,
            headers={"Authorization": f"OAuth {access_token}"},
        )
        validate_resp.raise_for_status()
        v = validate_resp.json()

    twitch_user_id = v.get("user_id")
    login          = v.get("login")
    client_id      = v.get("client_id")
    scopes         = v.get("scopes", [])

    if not twitch_user_id:
        raise HTTPException(status_code=500, detail="Token validated but no user_id returned")

    user_tokens[twitch_user_id] = {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "expires_in":    expires_in,
        "scopes":        scopes,
        "client_id":     client_id,
        "login":         login,
    }

    upsert_streamer(twitch_user_id=twitch_user_id, login=login, client_id=client_id)
    save_tokens(
        twitch_user_id=twitch_user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        scopes=scopes,
    )

    start_tracker({"twitch_user_id": twitch_user_id, "access_token": access_token,
                   "client_id": client_id, "login": login})
    del pending_states[state]

    session_token = secrets.token_urlsafe(32)
    sessions[session_token] = {"twitch_user_id": twitch_user_id, "created": time.time()}

    response = RedirectResponse(url=f"{FRONTEND_BASE_URL}/dashboard")
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", max_age=24 * 3600,
    )
    return response

@app.get("/api/dashboard")
async def dashboard(user_id: str = Depends(get_current_user)):
    user_data = user_tokens.get(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User data not found")
    return {
        "login":          user_data.get("login"),
        "broadcaster_id": user_id,
        "client_id":      user_data.get("client_id"),
        "scopes":         user_data.get("scopes", []),
    }


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, user_id: str = Query(None)):
    if not user_id:
        await websocket.close()
        return
    user_id = str(user_id)
    await manager.connect(websocket, user_id)
    print("WS CONNECTED FOR USER:", user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        print("WS DISCONNECTED FOR USER:", user_id)


# ── Internal push from tracker ────────────────────────────────────────────────

@app.post("/internal/event")
async def push_event(payload: dict):
    """
    Receives all events from track_redemption.py.
    event_type: "redemption" | "stream_online" | "stream_offline"
    """
    broadcaster_id = str(payload["broadcaster_id"])
    event_type     = payload["event_type"]
    data           = payload["data"]

    await manager.send_to_user(broadcaster_id, {"type": event_type, **data})
    return {"ok": True}


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT s.twitch_user_id, s.client_id, t.access_token
        FROM streamers s
        JOIN tokens t ON s.twitch_user_id = t.twitch_user_id
    """)
    streamers = cursor.fetchall()
    cursor.close()
    conn.close()
    for s in streamers:
        start_tracker(s)