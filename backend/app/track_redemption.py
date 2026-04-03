import json
import websocket
import requests
from db import get_connection, save_redemption

def notify_backend(broadcaster_id, data):
    try:
        requests.post(
            "http://localhost:8000/internal/redemption",
            json={
                "broadcaster_id": broadcaster_id,
                "data": data
            }
        )
    except Exception as e:
        print("Notify failed:", e)

def get_streamers():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT 
            s.twitch_user_id,
            s.client_id,
            t.access_token
        FROM streamers s
        JOIN tokens t ON s.twitch_user_id = t.twitch_user_id
    """)

    data = cursor.fetchall()

    cursor.close()
    conn.close()
    return data


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
    print("Subscription:", res.status_code, res.text)


def on_message(ws, message):
    data = json.loads(message)

    if data["metadata"]["message_type"] == "session_welcome":
        session_id = data["payload"]["session"]["id"]

        streamers = get_streamers()

        for s in streamers:
            subscribe(
                session_id,
                s["twitch_user_id"],
                s["access_token"],
                s["client_id"]
            )

    elif data["metadata"]["message_type"] == "notification":
        event = data["payload"]["event"]

        event_id = data["payload"]["event"]["id"]
        broadcaster_id = event["broadcaster_user_id"]

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
    print("Connected to Twitch EventSub")


ws = websocket.WebSocketApp(
    "wss://eventsub.wss.twitch.tv/ws",
    on_message=on_message,
    on_open=on_open
)

ws.run_forever()