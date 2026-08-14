-- Local development schema for Streamer-Social.
--
-- The production database (hosted on Railway) was created by hand and this
-- repo has never had a migration file — these CREATE TABLEs are reverse
-- engineered from the queries in backend/app/db.py, not exported from
-- production. They're enough to run the app locally end-to-end, but if you
-- need byte-for-byte parity with prod, diff this against
-- `SHOW CREATE TABLE <name>` on the real database.
--
-- The `sessions` table (login sessions) is NOT included here — the app
-- creates it itself on startup via db.py's _ensure_sessions_table().

CREATE TABLE IF NOT EXISTS streamers (
    twitch_user_id VARCHAR(64)  NOT NULL PRIMARY KEY,
    login          VARCHAR(255) NOT NULL,
    client_id      VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_streamers_login (login)
);

CREATE TABLE IF NOT EXISTS tokens (
    twitch_user_id VARCHAR(64) NOT NULL PRIMARY KEY,
    access_token   TEXT        NOT NULL,
    refresh_token  TEXT        NOT NULL,
    expires_in     INT         NOT NULL,
    scopes         VARCHAR(500) DEFAULT NULL,
    FOREIGN KEY (twitch_user_id) REFERENCES streamers(twitch_user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stream_sessions (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    twitch_user_id        VARCHAR(64) NOT NULL,
    started_at            DATETIME    NOT NULL,
    ended_at              DATETIME    DEFAULT NULL,
    scheduled_day         VARCHAR(8)  DEFAULT NULL,
    counts_toward_streak  TINYINT(1)  NOT NULL DEFAULT 1,
    required_day          TINYINT(1)  NOT NULL DEFAULT 1,
    KEY idx_stream_sessions_user_started (twitch_user_id, started_at),
    KEY idx_stream_sessions_user_ended   (twitch_user_id, ended_at),
    FOREIGN KEY (twitch_user_id) REFERENCES streamers(twitch_user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS redemptions (
    event_id       VARCHAR(64)  NOT NULL PRIMARY KEY,
    twitch_user_id VARCHAR(64)  NOT NULL,
    user_id        VARCHAR(64)  NOT NULL,
    user_name      VARCHAR(255) NOT NULL,
    reward_id      VARCHAR(64)  NOT NULL,
    reward_title   VARCHAR(255) NOT NULL,
    redeemed_at    DATETIME     NOT NULL,
    status         VARCHAR(32)  NOT NULL,
    session_id     INT          DEFAULT NULL,
    KEY idx_redemptions_user_redeemed (twitch_user_id, redeemed_at),
    KEY idx_redemptions_user_reward   (twitch_user_id, reward_id),
    KEY idx_redemptions_session       (session_id),
    FOREIGN KEY (twitch_user_id) REFERENCES streamers(twitch_user_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES stream_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS viewer_streaks (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    twitch_user_id    VARCHAR(64)  NOT NULL,
    viewer_twitch_id  VARCHAR(64)  NOT NULL,
    user_name         VARCHAR(255) NOT NULL,
    reward_title      VARCHAR(255) NOT NULL,
    current_streak    INT          NOT NULL DEFAULT 0,
    longest_streak    INT          NOT NULL DEFAULT 0,
    previous_streak   INT          DEFAULT NULL,
    last_session_id   INT          DEFAULT NULL,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_viewer_streaks (twitch_user_id, viewer_twitch_id, reward_title),
    FOREIGN KEY (twitch_user_id) REFERENCES streamers(twitch_user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS streak_schedules (
    twitch_user_id VARCHAR(64)  NOT NULL PRIMARY KEY,
    scheduled_days TEXT         DEFAULT NULL,
    timezone       VARCHAR(64)  DEFAULT NULL,
    reward_title   VARCHAR(255) DEFAULT NULL,
    reward_1st     VARCHAR(255) DEFAULT NULL,
    reward_2nd     VARCHAR(255) DEFAULT NULL,
    reward_3rd     VARCHAR(255) DEFAULT NULL,
    reward_lurker  VARCHAR(255) DEFAULT NULL,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (twitch_user_id) REFERENCES streamers(twitch_user_id) ON DELETE CASCADE
);
