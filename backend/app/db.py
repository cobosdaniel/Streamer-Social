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
    cursor.execute("""
        INSERT INTO streamers (twitch_user_id, login, client_id)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            login = VALUES(login),
            client_id = VALUES(client_id)
    """, (twitch_user_id, login, client_id))
    conn.commit()
    cursor.close()
    conn.close()

def save_tokens(twitch_user_id, access_token, refresh_token, expires_in, scopes):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tokens (twitch_user_id, access_token, refresh_token, expires_in, scopes)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            access_token = VALUES(access_token),
            refresh_token = VALUES(refresh_token),
            expires_in = VALUES(expires_in),
            scopes = VALUES(scopes)
    """, (twitch_user_id, access_token, refresh_token, expires_in, ",".join(scopes)))
    conn.commit()
    cursor.close()
    conn.close()

def save_redemption(
    event_id, twitch_user_id, user_id, user_name,
    reward_id, reward_title, redeemed_at, status,
    session_id=None,
):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT IGNORE INTO redemptions
        (event_id, twitch_user_id, user_id, user_name,
         reward_id, reward_title, redeemed_at, status, session_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (event_id, twitch_user_id, user_id, user_name,
          reward_id, reward_title, redeemed_at, status, session_id))
    conn.commit()
    cursor.close()
    conn.close()


# ── Stream Sessions ────────────────────────────────────────────────────────────

def save_stream_session(twitch_user_id, started_at, scheduled_day, is_scheduled):
    """Open a new stream session. Returns the new session id."""
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
    Close the most recent open session and return its full row
    so the caller can immediately process streaks.
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # Close it
    cursor.execute("""
        UPDATE stream_sessions
        SET ended_at = %s
        WHERE twitch_user_id = %s
          AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    """, (ended_at, twitch_user_id))
    conn.commit()

    # Fetch the row we just closed
    cursor.execute("""
        SELECT * FROM stream_sessions
        WHERE twitch_user_id = %s
          AND ended_at = %s
        ORDER BY started_at DESC
        LIMIT 1
    """, (twitch_user_id, ended_at))
    row = cursor.fetchone()

    cursor.close()
    conn.close()
    return row


def get_active_session(twitch_user_id):
    """Return the currently open session for a streamer, or None."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT * FROM stream_sessions
        WHERE twitch_user_id = %s AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    """, (twitch_user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row


# ── Viewer Streaks ─────────────────────────────────────────────────────────────

def settle_streaks_for_session(session):
    """
    Called once when a stream session closes.
    For every viewer who redeemed the check-in reward during this session,
    increment their streak. For scheduled sessions, reset streaks for anyone
    who had a streak going but did NOT check in.

    session: dict row from stream_sessions (must have ended_at set).
    """
    session_id     = session["id"]
    twitch_user_id = session["twitch_user_id"]
    is_scheduled   = session["is_scheduled"]

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # Find all distinct reward_titles redeemed during this session
    cursor.execute("""
        SELECT DISTINCT reward_title FROM redemptions
        WHERE session_id = %s AND twitch_user_id = %s
    """, (session_id, twitch_user_id))
    reward_rows = cursor.fetchall()

    for rr in reward_rows:
        reward_title = rr["reward_title"]

        # Viewers who checked in this session
        cursor.execute("""
            SELECT DISTINCT user_name FROM redemptions
            WHERE session_id = %s
              AND twitch_user_id = %s
              AND reward_title = %s
        """, (session_id, twitch_user_id, reward_title))
        checked_in = {r["user_name"] for r in cursor.fetchall()}

        # Increment streak for viewers who checked in
        for user_name in checked_in:
            cursor.execute("""
                INSERT INTO viewer_streaks
                    (twitch_user_id, user_name, reward_title,
                     current_streak, longest_streak, last_session_id)
                VALUES (%s, %s, %s, 1, 1, %s)
                ON DUPLICATE KEY UPDATE
                    current_streak  = current_streak + 1,
                    longest_streak  = GREATEST(longest_streak, current_streak + 1),
                    last_session_id = VALUES(last_session_id)
            """, (twitch_user_id, user_name, reward_title, session_id))

        # For scheduled sessions only: reset streaks for viewers who had a
        # streak but didn't check in this session
        if is_scheduled:
            cursor.execute("""
                UPDATE viewer_streaks
                SET current_streak = 0
                WHERE twitch_user_id = %s
                  AND reward_title = %s
                  AND current_streak > 0
                  AND user_name NOT IN ({})
            """.format(",".join(["%s"] * len(checked_in)) if checked_in else "SELECT NULL"),
                (twitch_user_id, reward_title, *checked_in) if checked_in
                else (twitch_user_id, reward_title)
            )

    conn.commit()
    cursor.close()
    conn.close()


def get_viewer_streaks(twitch_user_id, reward_title, limit=20):
    """Fast single-query fetch from the cached viewer_streaks table."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            user_name,
            current_streak,
            longest_streak,
            last_session_id,
            updated_at
        FROM viewer_streaks
        WHERE twitch_user_id = %s
          AND reward_title = %s
          AND current_streak > 0
        ORDER BY current_streak DESC, longest_streak DESC
        LIMIT %s
    """, (twitch_user_id, reward_title, limit))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


# ── Streak Schedule ────────────────────────────────────────────────────────────

def get_streak_schedule(twitch_user_id):
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