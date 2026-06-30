from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from db import (
    get_connection, upsert_streamer, save_tokens,
    get_streak_schedule, save_streak_schedule,
    get_viewer_streaks,
    save_session, get_session, delete_session,
    get_user_token_data, load_all_user_tokens,
    refresh_access_token,
    get_streak_reward, save_streak_reward,
    get_point_config, save_point_config, get_points_leaderboard,
)
import os
import logging
import secrets
import time
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)
import httpx
from tracker_manager import start_tracker, stop_all_trackers
from typing import Optional

load_dotenv("user_oauth.env")

for _var in ("TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_REDIRECT_URI",
             "FRONTEND_BASE_URL", "INTERNAL_API_KEY"):
    assert os.getenv(_var), f"Missing required environment variable: {_var}"

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

TWITCH_CLIENT_ID     = os.environ["TWITCH_CLIENT_ID"]
TWITCH_CLIENT_SECRET = os.environ["TWITCH_CLIENT_SECRET"]
TWITCH_REDIRECT_URI  = os.environ["TWITCH_REDIRECT_URI"]
FRONTEND_BASE_URL    = os.getenv("FRONTEND_BASE_URL")
INTERNAL_API_KEY     = os.environ["INTERNAL_API_KEY"]

pending_states   = {}
exchange_tokens  = {}  # short-lived one-time tokens for iOS ITP cookie handoff
user_tokens      = {}  # in-memory cache; populated from DB on startup and on login


def get_user_tokens(twitch_user_id: str) -> dict | None:
    data = user_tokens.get(twitch_user_id)
    if data:
        return data
    data = get_user_token_data(twitch_user_id)
    if data:
        user_tokens[twitch_user_id] = data
    return data

AUTH_URL     = "https://id.twitch.tv/oauth2/authorize"
TOKEN_URL    = "https://id.twitch.tv/oauth2/token"
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
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    row = get_session(token)
    if not row:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return row["twitch_user_id"]


# ── Redemptions ────────────────────────────────────────────────────────────────

@app.get("/api/redemptions")
@limiter.limit("60/minute")
async def get_redemptions(request: Request, user_id: str = Depends(get_current_user)):
    conn   = get_connection()
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
    return [
        {**r, "redeemed_at": r["redeemed_at"].isoformat() + "Z" if r["redeemed_at"] else None}
        for r in rows
    ]


# ── Leaderboard ────────────────────────────────────────────────────────────────

@app.get("/api/leaderboard")
@limiter.limit("60/minute")
async def get_leaderboard(
    request: Request,
    reward_title: str,
    from_date: str | None = None,
    to_date:   str | None = None,
    user_id: str = Depends(get_current_user),
):
    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)

    query  = "SELECT user_name, COUNT(*) AS count FROM redemptions WHERE twitch_user_id = %s AND reward_title = %s"
    params: list = [user_id, reward_title]

    if from_date:
        query += " AND redeemed_at >= %s"
        params.append(from_date)
    if to_date:
        query += " AND redeemed_at < DATE_ADD(%s, INTERVAL 1 DAY)"
        params.append(to_date)

    query += " GROUP BY user_name ORDER BY count DESC LIMIT 20"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


# ── Streaks — fast cached read ─────────────────────────────────────────────────

@app.get("/api/streaks")
@limiter.limit("60/minute")
async def get_streaks(
    request: Request,
    from_date: str | None = None,
    to_date:   str | None = None,
    user_id: str = Depends(get_current_user),
):
    rows = get_viewer_streaks(user_id, limit=20, from_date=from_date, to_date=to_date)

    return [
        {
            "user_name":      r["user_name"],
            "streak":         r["current_streak"],
            "longest_streak": r["longest_streak"],
            "updated_at":     r["updated_at"].isoformat() + "Z" if r["updated_at"] else None,
        }
        for r in rows
    ]

# ── Rewards ─────────────────────────────────────────────────

@app.get("/api/rewards")
@limiter.limit("60/minute")
async def get_rewards(request: Request, user_id: str = Depends(get_current_user)):
    user_data = get_user_tokens(user_id)

    if not user_data:
        raise HTTPException(status_code=404, detail="User data not found")

    access_token = user_data["access_token"]
    client_id = user_data["client_id"]

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get(
            "https://api.twitch.tv/helix/channel_points/custom_rewards",
            params={"broadcaster_id": user_id},
            headers={
                "Client-ID": client_id,
                "Authorization": f"Bearer {access_token}",
            },
        )

        if res.status_code == 401:
            new_token = refresh_access_token(user_id)
            if not new_token:
                raise HTTPException(status_code=401, detail="Token expired and refresh failed")
            user_tokens[user_id] = {**user_data, "access_token": new_token}
            res = await client.get(
                "https://api.twitch.tv/helix/channel_points/custom_rewards",
                params={"broadcaster_id": user_id},
                headers={
                    "Client-ID": client_id,
                    "Authorization": f"Bearer {new_token}",
                },
            )

    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=res.text)

    data = sorted(res.json().get("data", []), key=lambda r: r["title"].lower())

    return [
        {
            "id": r["id"],
            "title": r["title"],
            "cost": r.get("cost"),
            "is_enabled": r.get("is_enabled"),
        }
        for r in data
    ]


# ── Streak Schedule ────────────────────────────────────────────────────────────

class ScheduleDay(BaseModel):
    day:   str
    start: Optional[str] = None
    end:   Optional[str] = None
    time:  Optional[str] = None  # legacy single-time, kept for back-compat

class StreakSchedulePayload(BaseModel):
    scheduled_days: list[ScheduleDay]
    timezone:       Optional[str] = None

@app.get("/api/point-config")
@limiter.limit("60/minute")
async def get_point_config_endpoint(request: Request, user_id: str = Depends(get_current_user)):
    return get_point_config(user_id)


class PointConfigPayload(BaseModel):
    reward_1st: Optional[str] = None
    reward_2nd: Optional[str] = None
    reward_3rd: Optional[str] = None


@app.post("/api/point-config")
@limiter.limit("20/minute")
async def set_point_config_endpoint(
    request: Request,
    payload: PointConfigPayload,
    user_id: str = Depends(get_current_user),
):
    save_point_config(user_id, payload.reward_1st, payload.reward_2nd, payload.reward_3rd)
    return {"ok": True}


@app.get("/api/points-leaderboard")
@limiter.limit("60/minute")
async def points_leaderboard_endpoint(
    request: Request,
    from_date: str | None = None,
    to_date:   str | None = None,
    user_id: str = Depends(get_current_user),
):
    rows = get_points_leaderboard(user_id, from_date=from_date, to_date=to_date)
    return [
        {
            "user_name":     r["user_name"],
            "total_points":  float(r["total_points"]),
            "count_1st":     int(r["count_1st"]),
            "count_2nd":     int(r["count_2nd"]),
            "count_3rd":     int(r["count_3rd"]),
            "count_checkin": int(r["count_checkin"]),
        }
        for r in rows
    ]


@app.get("/api/streak-reward")
@limiter.limit("60/minute")
async def get_streak_reward_endpoint(request: Request, user_id: str = Depends(get_current_user)):
    return {"reward_title": get_streak_reward(user_id)}


class StreakRewardPayload(BaseModel):
    reward_title: str


@app.post("/api/streak-reward")
@limiter.limit("20/minute")
async def set_streak_reward_endpoint(
    request: Request,
    payload: StreakRewardPayload,
    user_id: str = Depends(get_current_user),
):
    save_streak_reward(user_id, payload.reward_title)
    return {"ok": True, "reward_title": payload.reward_title}


@app.get("/api/streak-schedule")
async def get_schedule(user_id: str = Depends(get_current_user)):
    sched = get_streak_schedule(user_id)
    return {"scheduled_days": sched["days"], "timezone": sched["timezone"]}

@app.post("/api/streak-schedule")
async def update_schedule(
    payload: StreakSchedulePayload,
    user_id: str = Depends(get_current_user),
):
    # Normalise to either an all-day {day} entry or a full window {day, start, end}.
    # A half-filled window (only one time) is coerced to all-day.
    days = []
    for d in payload.scheduled_days:
        start = d.start or d.time  # accept legacy `time` as a start value
        if start and d.end:
            days.append({"day": d.day, "start": start, "end": d.end})
        else:
            days.append({"day": d.day})

    save_streak_schedule(user_id, days, payload.timezone)
    return {"ok": True, "scheduled_days": days, "timezone": payload.timezone}


# ── Auth ───────────────────────────────────────────────────────────────────────

def build_auth_url(scopes: list[str]) -> str:
    now = time.time()
    expired = [k for k, v in pending_states.items() if now - v["created"] > 600]
    for k in expired:
        del pending_states[k]

    state = secrets.token_urlsafe(32)
    pending_states[state] = {"created": now}
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
@limiter.limit("20/minute")
def twitch_login(request: Request):
    return RedirectResponse(build_auth_url(["channel:read:redemptions"]))

@app.post("/auth/logout")
def logout(request: Request):
    token = request.cookies.get("session_token")
    if token:
        row = get_session(token)
        if row:
            user_tokens.pop(row["twitch_user_id"], None)
        delete_session(token)
    response = JSONResponse({"message": "Logged out successfully"})
    response.delete_cookie(key="session_token", httponly=True, samesite="lax")
    return response

@app.get("/api/me")
async def me(user_id: str = Depends(get_current_user)):
    user_data = get_user_tokens(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User data not found")
    return {"login": user_data.get("login"), "broadcaster_id": user_id}

@app.get("/auth/twitch/callback")
@limiter.limit("20/minute")
async def twitch_callback(
    request: Request,
    code:  str | None = None,
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

    upsert_streamer(twitch_user_id=twitch_user_id, login=login, client_id=client_id)
    save_tokens(
        twitch_user_id=twitch_user_id, access_token=access_token,
        refresh_token=refresh_token, expires_in=expires_in, scopes=scopes,
    )

    user_tokens[twitch_user_id] = {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "expires_in":    expires_in,
        "scopes":        scopes,
        "client_id":     client_id,
        "login":         login,
    }

    start_tracker({"twitch_user_id": twitch_user_id, "access_token": access_token,
                   "client_id": client_id, "login": login})
    del pending_states[state]

    # Use a short-lived exchange token instead of setting the cookie directly
    # during the redirect chain. iOS WebKit/ITP drops cookies set mid-redirect
    # from a cross-site OAuth flow. The frontend will call /auth/exchange to
    # trade this token for the real session cookie in a first-party fetch context.
    exchange_token = secrets.token_urlsafe(32)
    exchange_tokens[exchange_token] = {
        "twitch_user_id": twitch_user_id,
        "expires_at": time.time() + 120,
    }

    return RedirectResponse(url=f"{FRONTEND_BASE_URL}/dashboard?exchange_token={exchange_token}")

@app.post("/auth/exchange")
@limiter.limit("20/minute")
async def exchange_token_for_session(request: Request, token: str = Query(...)):
    entry = exchange_tokens.pop(token, None)
    if not entry or time.time() > entry["expires_at"]:
        raise HTTPException(status_code=400, detail="Invalid or expired exchange token")

    session_token = secrets.token_urlsafe(32)
    save_session(session_token, entry["twitch_user_id"])

    response = JSONResponse({"ok": True})
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", max_age=24 * 3600,
    )
    return response


@app.get("/api/dashboard")
async def dashboard(user_id: str = Depends(get_current_user)):
    user_data = get_user_tokens(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User data not found")
    return {
        "login":          user_data.get("login"),
        "broadcaster_id": user_id,
        "client_id":      user_data.get("client_id"),
        "scopes":         user_data.get("scopes", []),
    }


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, user_id: str = Query(None)):
    if not user_id:
        await websocket.close()
        return
    user_id = str(user_id)
    await manager.connect(websocket, user_id)
    logger.info("WS connected for user %s", user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        logger.info("WS disconnected for user %s", user_id)


# ── Internal push from tracker ─────────────────────────────────────────────────

def verify_internal_key(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[len("Bearer "):] != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/internal/event")
async def push_event(payload: dict, _: None = Depends(verify_internal_key)):
    broadcaster_id = str(payload["broadcaster_id"])
    event_type     = payload["event_type"]
    data           = payload["data"]
    await manager.send_to_user(broadcaster_id, {"type": event_type, **data})
    return {"ok": True}


# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    user_tokens.update(load_all_user_tokens())

    conn   = get_connection()
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


@app.on_event("shutdown")
def shutdown_event():
    stop_all_trackers(timeout=10)