import os
import json
import websocket
import requests
from datetime import datetime, timezone
from db import (
    save_redemption,
    get_connection,
    get_active_session,
    save_stream_session,
    end_stream_session,
    settle_streaks_for_session,
    get_streak_schedule,
)


def notify_backend(broadcaster_id, event_type, data):
    try:
        requests.post(
            "https://streamer-social-production.up.railway.app/internal/event",
            json={
                "broadcaster_id": broadcaster_id,
                "event_type":     event_type,
                "data":           data,
            }
        )
    except Exception as e:
        print("Notify failed:", e)


def subscribe(ws_session_id, broadcaster_id, access_token, client_id):
    url = "https://api.twitch.tv/helix/eventsub/subscriptions"
    headers = {
        "Client-ID":     client_id,
        "Authorization": f"Bearer {access_token}",
        "Content-Type":  "application/json",
    }

    subscriptions = [
        {
            "type":      "channel.channel_points_custom_reward_redemption.add",
            "version":   "1",
            "condition": {"broadcaster_user_id": broadcaster_id},
        },
        {
            "type":      "stream.online",
            "version":   "1",
            "condition": {"broadcaster_user_id": broadcaster_id},
        },
        {
            "type":      "stream.offline",
            "version":   "1",
            "condition": {"broadcaster_user_id": broadcaster_id},
        },
    ]

    for sub in subscriptions:
        sub["transport"] = {"method": "websocket", "session_id": ws_session_id}
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
        SELECT refresh_token FROM tokens WHERE twitch_user_id = %s
    """, (twitch_user_id,))
    row = cursor.fetchone()
    if not row:
        print("No refresh token found")
        return None

    refresh_token = row["refresh_token"]
    res = requests.post("https://id.twitch.tv/oauth2/token", params={
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
        "client_id":     os.getenv("TWITCH_CLIENT_ID"),
        "client_secret": os.getenv("TWITCH_CLIENT_SECRET"),
    })

    if res.status_code != 200:
        print("Token refresh failed:", res.text)
        return None

    data = res.json()
    cursor.execute("""
        UPDATE tokens SET access_token = %s, refresh_token = %s
        WHERE twitch_user_id = %s
    """, (data["access_token"], data.get("refresh_token", refresh_token), twitch_user_id))
    conn.commit()
    cursor.close()
    conn.close()
    print("Token refreshed for", twitch_user_id)
    return data["access_token"]


# ── Schedule helpers ───────────────────────────────────────────────────────────

DAY_ABBREVS = {
    0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu",
    4: "Fri", 5: "Sat", 6: "Sun",
}

def classify_session(broadcaster_id, started_at: datetime):
    schedule = get_streak_schedule(broadcaster_id)
    day_abbrev = DAY_ABBREVS[started_at.weekday()]

    # No schedule configured at all = every day is required
    if not schedule:
        return {
            "scheduled_day": day_abbrev,
            "counts_toward_streak": True,
            "required_day": True,
        }

    schedule_map = {s["day"]: s.get("time") for s in schedule}

    # Day is not part of configured schedule:
    # still reward attendance, but don't punish missing it
    if day_abbrev not in schedule_map:
        return {
            "scheduled_day": day_abbrev,
            "counts_toward_streak": True,
            "required_day": False,
        }

    scheduled_time_str = schedule_map[day_abbrev]

    # Day is scheduled, no time restriction
    if not scheduled_time_str:
        return {
            "scheduled_day": day_abbrev,
            "counts_toward_streak": True,
            "required_day": True,
        }

    hour, minute = map(int, scheduled_time_str.split(":"))
    scheduled_dt = started_at.replace(hour=hour, minute=minute, second=0, microsecond=0)
    delta = abs((started_at - scheduled_dt).total_seconds())
    within_window = delta <= 7200

    return {
        "scheduled_day": day_abbrev,
        "counts_toward_streak": True,
        "required_day": within_window,
    }


# ── Main tracker ───────────────────────────────────────────────────────────────

def run_tracker_for_streamer(streamer):
    broadcaster_id = streamer["twitch_user_id"]
    access_token   = streamer["access_token"]
    client_id      = streamer["client_id"]

    def on_message(ws, message):
        data     = json.loads(message)
        msg_type = data["metadata"]["message_type"]

        if msg_type == "session_welcome":
            ws_session_id = data["payload"]["session"]["id"]
            print(f"Subscribing for {broadcaster_id}")
            subscribe(ws_session_id, broadcaster_id, access_token, client_id)

        elif msg_type == "notification":
            sub_type = data["metadata"]["subscription_type"]
            event    = data["payload"]["event"]

            # ── Redemption ────────────────────────────────────────────────────
            if sub_type == "channel.channel_points_custom_reward_redemption.add":
                event_id     = event["id"]
                user_id      = event["user_id"]
                user_name    = event["user_name"]
                reward_id    = event["reward"]["id"]
                reward_title = event["reward"]["title"]
                redeemed_at  = event["redeemed_at"]
                status       = event.get("status", "unknown")

                # Attach the active session id if a stream is live
                active = get_active_session(broadcaster_id)
                db_session_id = active["id"] if active else None

                print(f"{reward_title} redeemed by {user_name} "
                      f"(session={db_session_id})")

                save_redemption(
                    event_id, broadcaster_id,
                    user_id, user_name,
                    reward_id, reward_title,
                    redeemed_at, status,
                    session_id=db_session_id,
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
                session_meta = classify_session(broadcaster_id, started_at)

                db_session_id = save_stream_session(
                    broadcaster_id=broadcaster_id,
                    started_at=started_at,
                    scheduled_day=session_meta["scheduled_day"],
                    counts_toward_streak=session_meta["counts_toward_streak"],
                    required_day=session_meta["required_day"],
                )

                print(
                    f"Stream ONLINE for {broadcaster_id} "
                    f"(counts_toward_streak={session_meta['counts_toward_streak']}, "
                    f"required_day={session_meta['required_day']}, "
                    f"day={session_meta['scheduled_day']})"
                )

                notify_backend(broadcaster_id, "stream_online", {
                    "session_id": db_session_id,
                    "started_at": started_at.isoformat(),
                    "scheduled_day": session_meta["scheduled_day"],
                    "counts_toward_streak": session_meta["counts_toward_streak"],
                    "required_day": session_meta["required_day"],
                })

            # ── Stream offline ────────────────────────────────────────────────
            elif sub_type == "stream.offline":
                ended_at = datetime.now(timezone.utc).replace(tzinfo=None)

                # Close the session and get back the closed row
                closed_session = end_stream_session(broadcaster_id, ended_at)

                if closed_session:
                    print(
                        f"Stream OFFLINE for {broadcaster_id} — settling streaks for "
                        f"session {closed_session['id']} "
                        f"(counts_toward_streak={closed_session.get('counts_toward_streak')}, "
                        f"required_day={closed_session.get('required_day')}, "
                        f"scheduled_day={closed_session.get('scheduled_day')})"
                    )
                    try:
                        settle_streaks_for_session(closed_session)
                        print(f"Streaks settled for session {closed_session['id']}")
                    except Exception as e:
                        print(f"Streak settlement failed: {e}")
                else:
                    print(f"Stream OFFLINE for {broadcaster_id} — no open session found")

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