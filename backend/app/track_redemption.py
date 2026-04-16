import os
import json
import websocket
import requests
from datetime import datetime, timezone
from db import (
    save_redemption,
    get_connection,
    save_stream_session,
    end_stream_session,
    get_streak_schedule,
)


def notify_backend(broadcaster_id, event_type, data):
    try:
        requests.post(
            "https://streamer-social-production.up.railway.app/internal/event",
            json={
                "broadcaster_id": broadcaster_id,
                "event_type": event_type,
                "data": data,
            }
        )
    except Exception as e:
        print("Notify failed:", e)


def subscribe(session_id, broadcaster_id, access_token, client_id):
    url = "https://api.twitch.tv/helix/eventsub/subscriptions"

    headers = {
        "Client-ID": client_id,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    subscriptions = [
        # Channel point redemptions
        {
            "type": "channel.channel_points_custom_reward_redemption.add",
            "version": "1",
            "condition": {"broadcaster_user_id": broadcaster_id},
        },
        # Stream goes live
        {
            "type": "stream.online",
            "version": "1",
            "condition": {"broadcaster_user_id": broadcaster_id},
        },
        # Stream goes offline
        {
            "type": "stream.offline",
            "version": "1",
            "condition": {"broadcaster_user_id": broadcaster_id},
        },
    ]

    for sub in subscriptions:
        sub["transport"] = {"method": "websocket", "session_id": session_id}
        res = requests.post(url, headers=headers, json=sub)

        if res.status_code == 401:
            print("Token expired, refreshing...")
            new_token = refresh_access_token_db(broadcaster_id)
            if not new_token:
                continue
            headers["Authorization"] = f"Bearer {new_token}"
            res = requests.post(url, headers=headers, json=sub)

        print(f"Subscription [{sub['type']}]:", res.status_code, res.text)


def refresh_access_token_db(twitch_user_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT refresh_token FROM tokens
        WHERE twitch_user_id = %s
    """, (twitch_user_id,))

    row = cursor.fetchone()

    if not row:
        print("No refresh token found")
        return None

    refresh_token = row["refresh_token"]

    url = "https://id.twitch.tv/oauth2/token"
    params = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": os.getenv("TWITCH_CLIENT_ID"),
        "client_secret": os.getenv("TWITCH_CLIENT_SECRET"),
    }

    res = requests.post(url, params=params)

    if res.status_code != 200:
        print("Token refresh failed:", res.text)
        return None

    data = res.json()

    cursor.execute("""
        UPDATE tokens
        SET access_token = %s,
            refresh_token = %s
        WHERE twitch_user_id = %s
    """, (
        data["access_token"],
        data.get("refresh_token", refresh_token),
        twitch_user_id
    ))

    conn.commit()
    cursor.close()
    conn.close()

    print("Token refreshed for", twitch_user_id)
    return data["access_token"]


# ─── Schedule helpers ─────────────────────────────────────────────────────────

DAY_ABBREVS = {
    0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu",
    4: "Fri", 5: "Sat", 6: "Sun",
}

def classify_session(broadcaster_id, started_at: datetime):
    """
    Given when a stream went live, check against the streamer's schedule.
    Returns (scheduled_day: str | None, is_scheduled: bool).

    If the stream starts within 2 hours before or after a scheduled time window,
    it counts as scheduled. If no time is set for that day, any stream on that
    weekday counts as scheduled.
    """
    schedule = get_streak_schedule(broadcaster_id)

    if not schedule:
        # No schedule configured — every stream is unscheduled (bonus only)
        return None, False

    day_abbrev = DAY_ABBREVS[started_at.weekday()]
    schedule_map = {s["day"]: s.get("time") for s in schedule}

    if day_abbrev not in schedule_map:
        # Streaming on an off-day — bonus stream, no penalty
        return day_abbrev, False

    scheduled_time_str = schedule_map[day_abbrev]

    if not scheduled_time_str:
        # Day matches, no time constraint — counts as scheduled
        return day_abbrev, True

    # Check if stream started within a ±2-hour window of the scheduled time
    hour, minute = map(int, scheduled_time_str.split(":"))
    scheduled_dt = started_at.replace(hour=hour, minute=minute, second=0, microsecond=0)
    delta = abs((started_at - scheduled_dt).total_seconds())

    is_scheduled = delta <= 7200  # 2-hour window
    return day_abbrev, is_scheduled


# ─── Main tracker ─────────────────────────────────────────────────────────────

def run_tracker_for_streamer(streamer):
    broadcaster_id = streamer["twitch_user_id"]
    access_token = streamer["access_token"]
    client_id = streamer["client_id"]

    def on_message(ws, message):
        data = json.loads(message)
        msg_type = data["metadata"]["message_type"]

        if msg_type == "session_welcome":
            session_id = data["payload"]["session"]["id"]
            print(f"Subscribing for {broadcaster_id}")
            subscribe(session_id, broadcaster_id, access_token, client_id)

        elif msg_type == "notification":
            sub_type = data["metadata"]["subscription_type"]
            event = data["payload"]["event"]

            # ── Channel point redemption ──────────────────────────────────────
            if sub_type == "channel.channel_points_custom_reward_redemption.add":
                event_id    = event["id"]
                user_id     = event["user_id"]
                user_name   = event["user_name"]
                reward_id   = event["reward"]["id"]
                reward_title = event["reward"]["title"]
                redeemed_at = event["redeemed_at"]
                status      = event.get("status", "unknown")

                print(f"{reward_title} redeemed by {user_name}")

                save_redemption(
                    event_id, broadcaster_id,
                    user_id, user_name,
                    reward_id, reward_title,
                    redeemed_at, status,
                )

                notify_backend(broadcaster_id, "redemption", {
                    "user_id":      user_id,
                    "user_name":    user_name,
                    "reward_title": reward_title,
                    "redeemed_at":  redeemed_at,
                    "status":       status,
                })

            # ── Stream online ─────────────────────────────────────────────────
            elif sub_type == "stream.online":
                started_at = datetime.now(timezone.utc).replace(tzinfo=None)
                scheduled_day, is_scheduled = classify_session(broadcaster_id, started_at)

                session_id = save_stream_session(
                    broadcaster_id, started_at, scheduled_day, is_scheduled
                )

                print(f"Stream ONLINE for {broadcaster_id} "
                      f"(scheduled={is_scheduled}, day={scheduled_day})")

                notify_backend(broadcaster_id, "stream_online", {
                    "session_id":    session_id,
                    "started_at":    started_at.isoformat(),
                    "scheduled_day": scheduled_day,
                    "is_scheduled":  is_scheduled,
                })

            # ── Stream offline ────────────────────────────────────────────────
            elif sub_type == "stream.offline":
                ended_at = datetime.now(timezone.utc).replace(tzinfo=None)
                end_stream_session(broadcaster_id, ended_at)

                print(f"Stream OFFLINE for {broadcaster_id}")

                notify_backend(broadcaster_id, "stream_offline", {
                    "ended_at": ended_at.isoformat(),
                })

    def on_open(ws):
        print(f"WS connected for {broadcaster_id}")

    while True:
        try:
            print(f"Starting WS for {broadcaster_id}")
            ws = websocket.WebSocketApp(
                "wss://eventsub.wss.twitch.tv/ws",
                on_message=on_message,
                on_open=on_open,
            )
            ws.run_forever()
        except Exception as e:
            print("Websocket crashed:", e)

        print("Reconnecting in 5 seconds...")
        import time
        time.sleep(5)