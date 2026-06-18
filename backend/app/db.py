import os
import time
import json
import requests
import mysql.connector
import mysql.connector.pooling
from dotenv import load_dotenv

load_dotenv("db.env")

_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="main",
    pool_size=5,
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
)

def get_connection():
    return _pool.get_connection()

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

def save_stream_session(twitch_user_id, started_at, scheduled_day, counts_toward_streak, required_day):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO stream_sessions (
            twitch_user_id,
            started_at,
            scheduled_day,
            counts_toward_streak,
            required_day,
            ended_at
        )
        VALUES (%s, %s, %s, %s, %s, NULL)
    """, (
        twitch_user_id,
        started_at,
        scheduled_day,
        counts_toward_streak,
        required_day,
    ))

    session_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return session_id


def end_stream_session(twitch_user_id, ended_at):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT id
        FROM stream_sessions
        WHERE twitch_user_id = %s AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
    """, (twitch_user_id,))
    row = cursor.fetchone()

    if not row:
        cursor.close()
        conn.close()
        return None

    session_id = row["id"]

    cursor.execute("""
        UPDATE stream_sessions
        SET ended_at = %s
        WHERE id = %s
    """, (ended_at, session_id))
    conn.commit()

    cursor.execute("""
        SELECT id, twitch_user_id, started_at, ended_at,
               scheduled_day, counts_toward_streak, required_day
        FROM stream_sessions
        WHERE id = %s
    """, (session_id,))
    closed_session = cursor.fetchone()

    cursor.close()
    conn.close()
    return closed_session


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

    Rules:
    - If counts_toward_streak is true, viewers who checked in increase their streak.
    - If required_day is true, viewers with an active streak who missed reset to 0.
    - If required_day is false, missing the stream does not reset streaks.
    """
    session_id = session["id"]
    twitch_user_id = session["twitch_user_id"]
    counts_toward_streak = bool(session.get("counts_toward_streak", 1))
    required_day = bool(session.get("required_day", 1))

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # Find all distinct reward titles redeemed during this session
    cursor.execute("""
        SELECT DISTINCT reward_title
        FROM redemptions
        WHERE session_id = %s
          AND twitch_user_id = %s
    """, (session_id, twitch_user_id))
    reward_rows = cursor.fetchall()

    for rr in reward_rows:
        reward_title = rr["reward_title"]

        # Viewers who checked in for this reward during this session
        # Select both user_id (permanent) and user_name (display, may change)
        cursor.execute("""
            SELECT DISTINCT user_id, user_name
            FROM redemptions
            WHERE session_id = %s
              AND twitch_user_id = %s
              AND reward_title = %s
        """, (session_id, twitch_user_id, reward_title))
        checked_in = {r["user_id"]: r["user_name"] for r in cursor.fetchall()}

        # Reward attendance on any counted session
        if counts_toward_streak:
            for viewer_twitch_id, user_name in checked_in.items():
                cursor.execute("""
                    INSERT INTO viewer_streaks (
                        twitch_user_id,
                        viewer_twitch_id,
                        user_name,
                        reward_title,
                        current_streak,
                        longest_streak,
                        last_session_id
                    )
                    VALUES (%s, %s, %s, %s, 1, 1, %s)
                    ON DUPLICATE KEY UPDATE
                        user_name = VALUES(user_name),
                        current_streak = current_streak + 1,
                        longest_streak = GREATEST(longest_streak, current_streak + 1),
                        last_session_id = VALUES(last_session_id)
                """, (twitch_user_id, viewer_twitch_id, user_name, reward_title, session_id))

        # Only penalize misses on required days
        if required_day:
            checked_in_ids = list(checked_in.keys())
            if checked_in_ids:
                placeholders = ",".join(["%s"] * len(checked_in_ids))
                params = (twitch_user_id, reward_title, *checked_in_ids)
                cursor.execute(f"""
                    UPDATE viewer_streaks
                    SET current_streak = 0
                    WHERE twitch_user_id = %s
                      AND reward_title = %s
                      AND current_streak > 0
                      AND viewer_twitch_id NOT IN ({placeholders})
                """, params)
            else:
                cursor.execute("""
                    UPDATE viewer_streaks
                    SET current_streak = 0
                    WHERE twitch_user_id = %s
                      AND reward_title = %s
                      AND current_streak > 0
                """, (twitch_user_id, reward_title))

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


# ── Sessions ───────────────────────────────────────────────────────────────────

def _ensure_sessions_table():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_token VARCHAR(64) PRIMARY KEY,
            twitch_user_id VARCHAR(64) NOT NULL,
            created_at BIGINT NOT NULL,
            INDEX idx_sessions_user (twitch_user_id)
        )
    """)
    conn.commit()
    cursor.close()
    conn.close()

_ensure_sessions_table()


def save_session(session_token, twitch_user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO sessions (session_token, twitch_user_id, created_at)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)
    """, (session_token, twitch_user_id, int(time.time())))
    conn.commit()
    cursor.close()
    conn.close()


def get_session(session_token):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT twitch_user_id, created_at FROM sessions WHERE session_token = %s",
        (session_token,),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row


def delete_session(session_token):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE session_token = %s", (session_token,))
    conn.commit()
    cursor.close()
    conn.close()


# ── Token cache helpers ────────────────────────────────────────────────────────

def get_user_token_data(twitch_user_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT t.access_token, t.refresh_token, t.expires_in, t.scopes,
               s.client_id, s.login
        FROM tokens t
        JOIN streamers s ON t.twitch_user_id = s.twitch_user_id
        WHERE t.twitch_user_id = %s
    """, (twitch_user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row:
        return None
    return {
        "access_token":  row["access_token"],
        "refresh_token": row["refresh_token"],
        "expires_in":    row["expires_in"],
        "scopes":        row["scopes"].split(",") if row["scopes"] else [],
        "client_id":     row["client_id"],
        "login":         row["login"],
    }


def load_all_user_tokens():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT t.twitch_user_id, t.access_token, t.refresh_token, t.expires_in, t.scopes,
               s.client_id, s.login
        FROM tokens t
        JOIN streamers s ON t.twitch_user_id = s.twitch_user_id
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return {
        r["twitch_user_id"]: {
            "access_token":  r["access_token"],
            "refresh_token": r["refresh_token"],
            "expires_in":    r["expires_in"],
            "scopes":        r["scopes"].split(",") if r["scopes"] else [],
            "client_id":     r["client_id"],
            "login":         r["login"],
        }
        for r in rows
    }


def refresh_access_token(twitch_user_id: str) -> str | None:
    """Exchange the stored refresh_token for a new access_token and persist it."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT refresh_token FROM tokens WHERE twitch_user_id = %s",
        (twitch_user_id,),
    )
    row = cursor.fetchone()
    if not row:
        cursor.close()
        conn.close()
        return None

    refresh_token = row["refresh_token"]
    res = requests.post("https://id.twitch.tv/oauth2/token", params={
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
        "client_id":     os.getenv("TWITCH_CLIENT_ID"),
        "client_secret": os.getenv("TWITCH_CLIENT_SECRET"),
    })

    if res.status_code != 200:
        cursor.close()
        conn.close()
        return None

    data = res.json()
    new_access  = data["access_token"]
    new_refresh = data.get("refresh_token", refresh_token)

    cursor.execute("""
        UPDATE tokens SET access_token = %s, refresh_token = %s
        WHERE twitch_user_id = %s
    """, (new_access, new_refresh, twitch_user_id))
    conn.commit()
    cursor.close()
    conn.close()
    return new_access