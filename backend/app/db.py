import os
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