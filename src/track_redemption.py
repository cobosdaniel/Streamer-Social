import json
import websocket
import requests
import os
from dotenv import load_dotenv

load_dotenv("twitch_oauth_token.env")

CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
OAUTH_TOKEN = os.getenv("TWITCH_OAUTH_TOKEN")
BROADCASTER_ID = os.getenv("TWITCH_BROADCASTER_ID")
# REWARD_ID = os.getenv("REWARD_ID")

HEADERS = {
    "Client-ID": CLIENT_ID,
    "Authorization": f"Bearer {OAUTH_TOKEN}",
    "Content-Type": "application/json"
}

url = f"https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={BROADCASTER_ID}"
resp = requests.get(url, headers=HEADERS)
resp.raise_for_status()

data = resp.json()["data"]

rewards_by_id = {reward["id"]: reward for reward in data}

# List all the user's channel point redeems
# 1. Hydrate! | ID: 123123
print(f"Loaded {len(rewards_by_id)} rewards.")

print(f"List of ALL Channel Point Redeems")
for i, reward in enumerate(data, start=1):
    title = reward["title"]
    id = reward["id"]

    print(f"{i}. {title} | ID: {id}")


# To subscribe and track OALL channel point redemptions.
def subscribe(session_id):
    url = "https://api.twitch.tv/helix/eventsub/subscriptions"
    payload = {
        "type": "channel.channel_points_custom_reward_redemption.add",
        "version": "1",
        "condition": {
            "broadcaster_user_id": BROADCASTER_ID,
        },
        "transport": {
            "method": "websocket",
            "session_id": session_id
        }
    }
    requests.post(url, headers=HEADERS, json=payload)

def on_message(ws, message):
    data = json.loads(message)

    if data["metadata"]["message_type"] == "session_welcome":
        session_id = data["payload"]["session"]["id"]
        subscribe(session_id)

    elif data["metadata"]["message_type"] == "notification":
        event = data["payload"]["event"]
        username = event["user_name"]

        reward_id = event["reward"]["id"]
        reward_title = rewards_by_id.get(reward_id, {}).get("title", "Unknown Reward")
        print(f"{reward_title} Redeemed by: {username}")

def on_error(ws, error):
    print("Error:", error)

def on_close(ws, close_status_code, close_msg):
    print(f"Connection closed: {close_status_code} - {close_msg}")

def on_open(ws):
    print("Connected to Twitch EventSub")

if __name__ == "__main__":
    ws = websocket.WebSocketApp(
        "wss://eventsub.wss.twitch.tv/ws",
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
        on_open=on_open
    )
    ws.run_forever()
