import os
import json
import websocket
import requests
from db import save_redemption, get_connection


def notify_backend(broadcaster_id, data):
    try:
        requests.post(
            "https://streamer-social-production.up.railway.app/internal/redemption",
            json={
                "broadcaster_id": broadcaster_id,
                "data": data
            }
        )
    except Exception as e:
        print("Notify failed:", e)


def subscribe(session_id, broadcaster_id, access_token, client_id):
    url = "https://api.twitch.tv/helix/eventsub/subscriptions"

    headers = {
        "Client-ID": client_id,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "type": "channel.channel_points_custom_reward_redemption.add",
        "version": "1",
        "condition": {
            "broadcaster_user_id": broadcaster_id,
        },
        "transport": {
            "method": "websocket",
            "session_id": session_id
        }
    }

    res = requests.post(url, headers=headers, json=payload)

    if res.status_code == 401:
        print("Token expired, refreshing...")

        new_token = refresh_access_token_db(broadcaster_id)

        if not new_token:
            return
        
        headers["Authorization"] = f"Bearer {new_token}"

        res = requests.post(url, headers=headers, json=payload)

    print("Subscription:", res.status_code, res.text)

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

    # update DB
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

def run_tracker_for_streamer(streamer):
    broadcaster_id = streamer["twitch_user_id"]
    access_token = streamer["access_token"]
    client_id = streamer["client_id"]

    def on_message(ws, message):
        data = json.loads(message)

        if data["metadata"]["message_type"] == "session_welcome":
            session_id = data["payload"]["session"]["id"]

            print(f"Subscribing for {broadcaster_id}")

            subscribe(
                session_id,
                broadcaster_id,
                access_token,
                client_id
            )

        elif data["metadata"]["message_type"] == "notification":
            event = data["payload"]["event"]

            event_id = event["id"]
            user_id = event["user_id"]
            user_name = event["user_name"]

            reward_id = event["reward"]["id"]
            reward_title = event["reward"]["title"]

            redeemed_at = event["redeemed_at"]
            status = event.get("status", "unknown")

            print(f"{reward_title} redeemed by {user_name}")

            save_redemption(
                event_id,
                broadcaster_id,
                user_id,
                user_name,
                reward_id,
                reward_title,
                redeemed_at,
                status
            )

            notify_backend(broadcaster_id, {
                "user_id": user_id,
                "user_name": user_name,
                "reward_title": reward_title,
                "redeemed_at": redeemed_at,
                "status": status
            })

    def on_open(ws):
        print(f"Connected for streamer {broadcaster_id}")

    ws = websocket.WebSocketApp(
        "wss://eventsub.wss.twitch.tv/ws",
        on_message=on_message,
        on_open=on_open
    )

    while True:
        try:
            print(f"Starting WS for {broadcaster_id}")

            ws = websocket.WebSocketApp(
                "wss://eventsub.wss.twitch.tv/ws",
                on_message=on_message,
                on_open=on_open
            )

            ws.run_forever()

        except Exception as e:
            print("Websocket crashed", e)

        print("Reconnecting in 5 seconds...")
        import time
        time.sleep(5)