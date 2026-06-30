import os
import time
import json
import requests
import mysql.connector
import mysql.connector.pooling
from dotenv import load_dotenv

load_dotenv("db.env")

for _var in ("DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"):
    assert os.getenv(_var), f"Missing required environment variable: {_var}"

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


_STREAK_KEY = "__streak__"

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

    configured_reward = get_streak_reward(twitch_user_id)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()

        if not configured_reward:
            # No reward configured — settle nothing
            conn.commit()
            cursor.close()
            conn.close()
            return

        # Query redemptions by the configured reward but store streaks under
        # the fixed sentinel so changing the reward never resets viewer streaks.
        cursor.execute("""
            SELECT DISTINCT user_id, user_name
            FROM redemptions
            WHERE session_id = %s
              AND twitch_user_id = %s
              AND reward_title = %s
        """, (session_id, twitch_user_id, configured_reward))
        checked_in = {r["user_id"]: r["user_name"] for r in cursor.fetchall()}

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
                        user_name       = VALUES(user_name),
                        longest_streak  = IF(last_session_id = VALUES(last_session_id),
                                             longest_streak,
                                             GREATEST(longest_streak, current_streak + 1)),
                        current_streak  = IF(last_session_id = VALUES(last_session_id),
                                             current_streak,
                                             current_streak + 1),
                        last_session_id = VALUES(last_session_id)
                """, (twitch_user_id, viewer_twitch_id, user_name, _STREAK_KEY, session_id))

        if required_day:
            checked_in_ids = list(checked_in.keys())
            if checked_in_ids:
                placeholders = ",".join(["%s"] * len(checked_in_ids))
                params = (twitch_user_id, _STREAK_KEY, *checked_in_ids)
                cursor.execute(f"""
                    UPDATE viewer_streaks
                    SET previous_streak = current_streak, current_streak = 0
                    WHERE twitch_user_id = %s
                      AND reward_title = %s
                      AND current_streak > 0
                      AND viewer_twitch_id NOT IN ({placeholders})
                """, params)
            else:
                cursor.execute("""
                    UPDATE viewer_streaks
                    SET previous_streak = current_streak, current_streak = 0
                    WHERE twitch_user_id = %s
                      AND reward_title = %s
                      AND current_streak > 0
                """, (twitch_user_id, _STREAK_KEY))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def update_viewer_streak_on_redemption(
    twitch_user_id: str,
    viewer_twitch_id: str,
    user_name: str,
    session_id: int,
) -> dict | None:
    """Increment streak at redemption time (real-time path). Returns updated row or None if already counted this session."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT last_session_id FROM viewer_streaks
            WHERE twitch_user_id = %s
              AND viewer_twitch_id = %s
              AND reward_title = %s
        """, (twitch_user_id, viewer_twitch_id, _STREAK_KEY))
        row = cursor.fetchone()
        if row and row["last_session_id"] == session_id:
            return None

        cursor.execute("""
            INSERT INTO viewer_streaks (
                twitch_user_id, viewer_twitch_id, user_name,
                reward_title, current_streak, longest_streak, last_session_id
            )
            VALUES (%s, %s, %s, %s, 1, 1, %s)
            ON DUPLICATE KEY UPDATE
                user_name       = VALUES(user_name),
                longest_streak  = GREATEST(longest_streak, current_streak + 1),
                current_streak  = current_streak + 1,
                last_session_id = VALUES(last_session_id)
        """, (twitch_user_id, viewer_twitch_id, user_name, _STREAK_KEY, session_id))
        conn.commit()

        cursor.execute("""
            SELECT current_streak, longest_streak FROM viewer_streaks
            WHERE twitch_user_id = %s
              AND viewer_twitch_id = %s
              AND reward_title = %s
        """, (twitch_user_id, viewer_twitch_id, _STREAK_KEY))
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def get_viewer_streaks(twitch_user_id, limit=20, from_date=None, to_date=None):
    """Fast single-query fetch from the cached viewer_streaks table."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query  = """
        SELECT user_name, current_streak, longest_streak, last_session_id, updated_at
        FROM viewer_streaks
        WHERE twitch_user_id = %s
          AND reward_title = '__streak__'
          AND current_streak > 0
    """
    params: list = [twitch_user_id]

    if from_date:
        query += " AND updated_at >= %s"
        params.append(from_date)
    if to_date:
        query += " AND updated_at < DATE_ADD(%s, INTERVAL 1 DAY)"
        params.append(to_date)

    query += " ORDER BY current_streak DESC, longest_streak DESC LIMIT %s"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


# ── Streak Schedule ────────────────────────────────────────────────────────────

def get_streak_schedule(twitch_user_id):
    """Return the streamer's schedule as {"days": [...], "timezone": str|None}.

    Each day entry is either an all-day day {"day": "Mon"} or a windowed day
    {"day": "Mon", "start": "19:00", "end": "00:00"}. The timezone is the single
    canonical IANA zone the times are expressed in (None ⇒ treat as UTC).
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT scheduled_days, timezone FROM streak_schedules
        WHERE twitch_user_id = %s
    """, (twitch_user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row:
        return {"days": [], "timezone": None}
    return {
        "days": json.loads(row["scheduled_days"]) if row["scheduled_days"] else [],
        "timezone": row.get("timezone"),
    }


def save_streak_schedule(twitch_user_id, scheduled_days, timezone=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO streak_schedules (twitch_user_id, scheduled_days, timezone)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            scheduled_days = VALUES(scheduled_days),
            timezone = VALUES(timezone),
            updated_at = CURRENT_TIMESTAMP
    """, (twitch_user_id, json.dumps(scheduled_days), timezone))
    conn.commit()
    cursor.close()
    conn.close()


# ── Streak reward config ───────────────────────────────────────────────────────

def _ensure_previous_streak_column():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'viewer_streaks'
          AND COLUMN_NAME  = 'previous_streak'
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            ALTER TABLE viewer_streaks
            ADD COLUMN previous_streak INT DEFAULT NULL
        """)
        conn.commit()
    cursor.close()
    conn.close()

_ensure_previous_streak_column()


def _ensure_streak_reward_column():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'streak_schedules'
          AND COLUMN_NAME  = 'reward_title'
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            ALTER TABLE streak_schedules
            ADD COLUMN reward_title VARCHAR(255) DEFAULT NULL
        """)
        conn.commit()
    cursor.close()
    conn.close()

_ensure_streak_reward_column()


def _ensure_point_reward_columns():
    conn = get_connection()
    cursor = conn.cursor()
    for col in ("reward_1st", "reward_2nd", "reward_3rd"):
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'streak_schedules'
              AND COLUMN_NAME  = %s
        """, (col,))
        if cursor.fetchone()[0] == 0:
            cursor.execute(f"""
                ALTER TABLE streak_schedules
                ADD COLUMN {col} VARCHAR(255) DEFAULT NULL
            """)
            conn.commit()
    cursor.close()
    conn.close()

_ensure_point_reward_columns()


def _ensure_schedule_timezone_column():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'streak_schedules'
          AND COLUMN_NAME  = 'timezone'
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            ALTER TABLE streak_schedules
            ADD COLUMN timezone VARCHAR(64) DEFAULT NULL
        """)
        conn.commit()
    cursor.close()
    conn.close()

_ensure_schedule_timezone_column()


def get_point_config(twitch_user_id: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT reward_1st, reward_2nd, reward_3rd, reward_title AS checkin
        FROM streak_schedules WHERE twitch_user_id = %s
    """, (twitch_user_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row:
        return {"reward_1st": None, "reward_2nd": None, "reward_3rd": None, "checkin": None}
    return row


def save_point_config(twitch_user_id: str, reward_1st: str | None, reward_2nd: str | None, reward_3rd: str | None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO streak_schedules (twitch_user_id, scheduled_days, reward_1st, reward_2nd, reward_3rd)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            reward_1st = VALUES(reward_1st),
            reward_2nd = VALUES(reward_2nd),
            reward_3rd = VALUES(reward_3rd),
            updated_at = CURRENT_TIMESTAMP
    """, (twitch_user_id, json.dumps([]), reward_1st, reward_2nd, reward_3rd))
    conn.commit()
    cursor.close()
    conn.close()


def get_points_leaderboard(twitch_user_id: str, from_date: str | None = None, to_date: str | None = None) -> list:
    config = get_point_config(twitch_user_id)
    reward_1st = config["reward_1st"]
    reward_2nd = config["reward_2nd"]
    reward_3rd = config["reward_3rd"]
    checkin    = config["checkin"]

    if not any([reward_1st, reward_2nd, reward_3rd, checkin]):
        return []

    date_filter = ""
    date_params: list = []
    if from_date:
        date_filter += " AND redeemed_at >= %s"
        date_params.append(from_date)
    if to_date:
        date_filter += " AND redeemed_at < DATE_ADD(%s, INTERVAL 1 DAY)"
        date_params.append(to_date)

    unions = []
    params: list = []

    for reward, points in [(reward_1st, 3), (reward_2nd, 2), (reward_3rd, 1), (checkin, 1)]:
        if reward:
            unions.append(f"""
                SELECT user_name, {points} AS points
                FROM redemptions
                WHERE twitch_user_id = %s AND reward_title = %s{date_filter}
            """)
            params += [twitch_user_id, reward] + date_params

    if not unions:
        return []

    query = f"""
        SELECT user_name, SUM(points) AS total_points,
               SUM(CASE WHEN reward_title_tag = '1st' THEN cnt ELSE 0 END) AS pts_1st,
               SUM(CASE WHEN reward_title_tag = '2nd' THEN cnt ELSE 0 END) AS pts_2nd,
               SUM(CASE WHEN reward_title_tag = '3rd' THEN cnt ELSE 0 END) AS pts_3rd,
               SUM(CASE WHEN reward_title_tag = 'checkin' THEN cnt ELSE 0 END) AS pts_checkin
        FROM (
            {" UNION ALL ".join(unions)}
        ) sub
        GROUP BY user_name
        ORDER BY total_points DESC
        LIMIT 20
    """

    # Rebuild with breakdown tags
    unions2 = []
    params2: list = []
    for reward, points, tag in [
        (reward_1st, 3, "1st"), (reward_2nd, 2, "2nd"),
        (reward_3rd, 1, "3rd"), (checkin, 1, "checkin"),
    ]:
        if reward:
            unions2.append(f"""
                SELECT user_name, '{tag}' AS reward_title_tag, COUNT(*) AS cnt, COUNT(*) * {points} AS points
                FROM redemptions
                WHERE twitch_user_id = %s AND reward_title = %s{date_filter}
                GROUP BY user_name
            """)
            params2 += [twitch_user_id, reward] + date_params

    query2 = f"""
        SELECT user_name,
               SUM(points) AS total_points,
               SUM(CASE WHEN reward_title_tag = '1st'     THEN cnt ELSE 0 END) AS count_1st,
               SUM(CASE WHEN reward_title_tag = '2nd'     THEN cnt ELSE 0 END) AS count_2nd,
               SUM(CASE WHEN reward_title_tag = '3rd'     THEN cnt ELSE 0 END) AS count_3rd,
               SUM(CASE WHEN reward_title_tag = 'checkin' THEN cnt ELSE 0 END) AS count_checkin
        FROM ({" UNION ALL ".join(unions2)}) sub
        GROUP BY user_name
        ORDER BY total_points DESC
        LIMIT 20
    """

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query2, params2)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


def get_streak_reward(twitch_user_id: str) -> str | None:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT reward_title FROM streak_schedules WHERE twitch_user_id = %s",
        (twitch_user_id,),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row["reward_title"] if row else None


def save_streak_reward(twitch_user_id: str, reward_title: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO streak_schedules (twitch_user_id, scheduled_days, reward_title)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            reward_title = VALUES(reward_title),
            updated_at   = CURRENT_TIMESTAMP
    """, (twitch_user_id, json.dumps([]), reward_title))
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