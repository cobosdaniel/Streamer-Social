import os
import json
import logging
import websocket
import requests
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
from db import (
    save_redemption,
    get_connection,
    get_active_session,
    save_stream_session,
    end_stream_session,
    settle_streaks_for_session,
    get_streak_schedule,
    refresh_access_token,
)


_INTERNAL_URL = os.getenv("BACKEND_INTERNAL_URL", "https://streamer-social-production.up.railway.app")
_INTERNAL_KEY = os.environ["INTERNAL_API_KEY"]

def notify_backend(broadcaster_id, event_type, data):
    try:
        requests.post(
            f"{_INTERNAL_URL}/internal/event",
            json={
                "broadcaster_id": broadcaster_id,
                "event_type":     event_type,
                "data":           data,
            },
            headers={"Authorization": f"Bearer {_INTERNAL_KEY}"},
        )
    except Exception as e:
        logger.error("Notify failed: %s", e)


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
            logger.warning("Token expired for %s, refreshing...", broadcaster_id)
            new_token = refresh_access_token(broadcaster_id)
            if not new_token:
                continue
            headers["Authorization"] = f"Bearer {new_token}"
            res = requests.post(url, headers=headers, json=sub)

        logger.info("Subscription [%s]: %s %s", sub["type"], res.status_code, res.text)


# ── Schedule helpers ───────────────────────────────────────────────────────────

DAY_ABBREVS = {
    0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu",
    4: "Fri", 5: "Sat", 6: "Sun",
}


def _local_zone(timezone_name):
    """Resolve the streamer's stored IANA zone, falling back to UTC."""
    if not timezone_name:
        return timezone.utc
    try:
        return ZoneInfo(timezone_name)
    except Exception:
        logger.warning("Unknown schedule timezone %r — falling back to UTC", timezone_name)
        return timezone.utc


def _as_utc(dt: datetime) -> datetime:
    """Ensure a datetime is UTC-aware. Naive values (e.g. MySQL DATETIME read
    back from the DB) are assumed to be UTC, since that's how we store them."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_hhmm(value):
    """Parse a 'HH:MM' string into (hour, minute), or None if blank/invalid."""
    if not value:
        return None
    try:
        hour, minute = (int(x) for x in value.split(":")[:2])
        return hour, minute
    except (ValueError, TypeError):
        return None


def classify_session(broadcaster_id, started_at: datetime):
    """Provisional classification at stream start.

    scheduled_day / counts_toward_streak are final here; required_day is
    recomputed at settlement (once ended_at is known) by is_required_day().
    """
    sched = get_streak_schedule(broadcaster_id)
    tz = _local_zone(sched.get("timezone"))
    local_start = _as_utc(started_at).astimezone(tz)
    day_abbrev = DAY_ABBREVS[local_start.weekday()]

    return {
        "scheduled_day": day_abbrev,
        "counts_toward_streak": True,
        # Provisional — finalised at settlement with the full live interval.
        "required_day": is_required_day(sched, started_at, started_at),
    }


def is_required_day(sched, started_at: datetime, ended_at: datetime) -> bool:
    """Whether no-shows should be penalised for this session.

    `sched` is the {"days": [...], "timezone": ...} dict from get_streak_schedule.
    Times are interpreted in the streamer's canonical zone. A day is "required"
    when the live interval [started_at, ended_at] overlaps the scheduled window;
    all-day entries are required whenever the stream was live that day.
    """
    days = sched.get("days") or []
    if not days:
        # No schedule configured at all → every day is required.
        return True

    tz = _local_zone(sched.get("timezone"))
    started_at = _as_utc(started_at)
    ended_at = _as_utc(ended_at)
    local_start = started_at.astimezone(tz)
    day_abbrev = DAY_ABBREVS[local_start.weekday()]

    entry = next((d for d in days if d.get("day") == day_abbrev), None)

    # Day isn't part of the schedule → reward attendance but never penalise.
    if entry is None:
        return False

    # Back-compat: a legacy single `time` entry is treated as all-day.
    start_hm = _parse_hhmm(entry.get("start"))
    end_hm = _parse_hhmm(entry.get("end"))

    # All-day (no full window) → required whenever live that day.
    if start_hm is None or end_hm is None:
        return True

    # Build the local window anchored on the stream's local start date.
    window_start = local_start.replace(
        hour=start_hm[0], minute=start_hm[1], second=0, microsecond=0
    )
    window_end = local_start.replace(
        hour=end_hm[0], minute=end_hm[1], second=0, microsecond=0
    )
    # end <= start means the window crosses midnight (e.g. 19:00 → 00:00).
    if window_end <= window_start:
        window_end += timedelta(days=1)

    local_end = ended_at.astimezone(tz)

    # Required iff the live interval overlaps the window.
    return local_start < window_end and local_end > window_start


# ── Main tracker ───────────────────────────────────────────────────────────────

def run_tracker_for_streamer(streamer, shutdown_event=None):
    broadcaster_id = streamer["twitch_user_id"]
    access_token   = streamer["access_token"]
    client_id      = streamer["client_id"]

    def on_message(ws, message):
        data     = json.loads(message)
        msg_type = data["metadata"]["message_type"]

        if msg_type == "session_welcome":
            ws_session_id = data["payload"]["session"]["id"]
            logger.info("Subscribing for %s", broadcaster_id)
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

                logger.info("%s redeemed by %s (session=%s)", reward_title, user_name, db_session_id)

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
                started_at = datetime.now(timezone.utc)
                session_meta = classify_session(broadcaster_id, started_at)

                db_session_id = save_stream_session(
                    broadcaster_id,
                    started_at,
                    session_meta["scheduled_day"],
                    session_meta["counts_toward_streak"],
                    session_meta["required_day"],
                )

                logger.info(
                    "Stream ONLINE for %s (counts_toward_streak=%s, required_day=%s, day=%s)",
                    broadcaster_id, session_meta["counts_toward_streak"],
                    session_meta["required_day"], session_meta["scheduled_day"],
                )

                notify_backend(broadcaster_id, "stream_online", {
                    "session_id": db_session_id,
                    "started_at": started_at.isoformat() + "Z",
                    "scheduled_day": session_meta["scheduled_day"],
                    "counts_toward_streak": session_meta["counts_toward_streak"],
                    "required_day": session_meta["required_day"],
                })

            # ── Stream offline ────────────────────────────────────────────────
            elif sub_type == "stream.offline":
                ended_at = datetime.now(timezone.utc)

                # Close the session and get back the closed row
                closed_session = end_stream_session(broadcaster_id, ended_at)

                if closed_session:
                    # Recompute required_day now that the full live interval is
                    # known — this is what makes "only penalised once the stream
                    # reaches the start time" work.
                    sched = get_streak_schedule(broadcaster_id)
                    closed_session["required_day"] = is_required_day(
                        sched,
                        closed_session["started_at"],
                        closed_session["ended_at"],
                    )

                    logger.info(
                        "Stream OFFLINE for %s — settling streaks for session %s "
                        "(counts_toward_streak=%s, required_day=%s, scheduled_day=%s)",
                        broadcaster_id, closed_session["id"],
                        closed_session.get("counts_toward_streak"),
                        closed_session.get("required_day"),
                        closed_session.get("scheduled_day"),
                    )
                    try:
                        settle_streaks_for_session(closed_session)
                        logger.info("Streaks settled for session %s", closed_session["id"])
                    except Exception as e:
                        logger.error("Streak settlement failed: %s", e)
                else:
                    logger.warning("Stream OFFLINE for %s — no open session found", broadcaster_id)

                notify_backend(broadcaster_id, "stream_offline", {
                    "ended_at": ended_at.isoformat(),
                })

    def on_open(ws):
        logger.info("WS connected for %s", broadcaster_id)

    import time
    backoff = 5
    while not (shutdown_event and shutdown_event.is_set()):
        try:
            logger.info("Starting WS for %s", broadcaster_id)
            ws = websocket.WebSocketApp(
                "wss://eventsub.wss.twitch.tv/ws",
                on_message=on_message,
                on_open=on_open,
            )
            ws.run_forever()
            backoff = 5  # reset after a clean disconnect
        except Exception as e:
            logger.error("Websocket crashed: %s", e)

        if shutdown_event and shutdown_event.is_set():
            break

        logger.warning("Reconnecting in %s seconds...", backoff)
        interrupted = shutdown_event.wait(backoff) if shutdown_event else (time.sleep(backoff) or False)
        if interrupted:
            break
        backoff = min(backoff * 2, 120)