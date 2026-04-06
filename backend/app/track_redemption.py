import json
import websocket
import requests
from db import save_redemption


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
    print("Subscription:", res.status_code, res.text)


# 🚀 THIS IS THE NEW ENTRY POINT
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

    ws.run_forever()