import os
import json
import mysql.connector
from dotenv import load_dotenv

load_dotenv("db.env")

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

def upsert_streamer(twitch_user_id, login, client_id):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
    INSERT INTO streamers (twitch_user_id, login, client_id)
    VALUES (%s, %s, %s)
    ON DUPLICATE KEY UPDATE
        login = VALUES(login),
        client_id = VALUES(client_id)
    """

    cursor.execute(query, (twitch_user_id, login, client_id))
    conn.commit()
    cursor.close()
    conn.close()

def save_tokens(twitch_user_id, access_token, refresh_token, expires_in, scopes):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
    INSERT INTO tokens (twitch_user_id, access_token, refresh_token, expires_in, scopes)
    VALUES (%s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_in = VALUES(expires_in),
        scopes = VALUES(scopes)
    """

    cursor.execute(query, (
        twitch_user_id,
        access_token,
        refresh_token,
        expires_in,
        ",".join(scopes)
    ))
    conn.commit()
    cursor.close()
    conn.close()

def save_redemption(
    event_id,
    twitch_user_id,
    user_id,
    user_name,
    reward_id,
    reward_title,
    redeemed_at,
    status
):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
    INSERT IGNORE INTO redemptions
    (event_id, twitch_user_id, user_id, user_name, reward_id, reward_title, redeemed_at, status)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    cursor.execute(query, (
        event_id,
        twitch_user_id,
        user_id,
        user_name,
        reward_id,
        reward_title,
        redeemed_at,
        status
    ))

    conn.commit()
    cursor.close()
    conn.close()


# ─── Stream Sessions ──────────────────────────────────────────────────────────

def save_stream_session(twitch_user_id, started_at, scheduled_day, is_scheduled):
    """
    Open a new stream session. Returns the new session id.
    scheduled_day: e.g. 'Wed' or None for unscheduled bonus streams.
    is_scheduled: True if this stream falls on a scheduled day/time window.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO stream_sessions
            (twitch_user_id, scheduled_day, is_scheduled, started_at)
        VALUES (%s, %s, %s, %s)
    """, (twitch_user_id, scheduled_day, is_scheduled, started_at))

    session_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()

    return session_id


def end_stream_session(twitch_user_id, ended_at):
    """
    Close the most recent open session for this streamer.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE stream_sessions
        SET ended_at = %s
        WHERE twitch_user_id = %s
          AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    """, (ended_at, twitch_user_id))

    conn.commit()
    cursor.close()
    conn.close()


def get_active_session(twitch_user_id):
    """Return the currently open session for a streamer, or None."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT * FROM stream_sessions
        WHERE twitch_user_id = %s
          AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    """, (twitch_user_id,))

    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row


# ─── Streak Schedule ──────────────────────────────────────────────────────────

def get_streak_schedule(twitch_user_id):
    """
    Returns a list like:
      [{"day": "Mon", "time": "19:00"}, {"day": "Wed"}, {"day": "Fri", "time": "20:00"}]
    or None if not configured yet.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT scheduled_days FROM streak_schedules
        WHERE twitch_user_id = %s
    """, (twitch_user_id,))

    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return None

    return json.loads(row["scheduled_days"])


def save_streak_schedule(twitch_user_id, scheduled_days):
    """
    scheduled_days: list of dicts, e.g.
      [{"day": "Mon", "time": "19:00"}, {"day": "Wed"}]
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO streak_schedules (twitch_user_id, scheduled_days)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE
            scheduled_days = VALUES(scheduled_days),
            updated_at = CURRENT_TIMESTAMP
    """, (twitch_user_id, json.dumps(scheduled_days)))

    conn.commit()
    cursor.close()
    conn.close()