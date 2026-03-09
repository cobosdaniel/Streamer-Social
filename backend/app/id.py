from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
import os, secrets, time
from dotenv import load_dotenv
import httpx

load_dotenv("user_oauth.env")

app = FastAPI()

TWITCH_CLIENT_ID = os.environ["TWITCH_CLIENT_ID"]
TWITCH_CLIENT_SECRET = os.environ["TWITCH_CLIENT_SECRET"]
TWITCH_REDIRECT_URI = os.environ["TWITCH_REDIRECT_URI"]

# In production, store state + tokens in a DB/redis, not in-memory.
pending_states = {}
user_tokens = {}  # key by your internal user id or twitch user id

AUTH_URL = "https://id.twitch.tv/oauth2/authorize"
TOKEN_URL = "https://id.twitch.tv/oauth2/token"
VALIDATE_URL = "https://id.twitch.tv/oauth2/validate"

def build_auth_url(scopes: list[str]) -> str:
    state = secrets.token_urlsafe(32)
    pending_states[state] = {"created": time.time()}
    scope_str = "%20".join(scopes)  # URL-encoded space separator
    return (
        f"{AUTH_URL}"
        f"?client_id={TWITCH_CLIENT_ID}"
        f"&redirect_uri={TWITCH_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scope_str}"
        f"&state={state}"
    )

@app.get("/auth/twitch/login")
def twitch_login():
    # Minimal scopes for just “identify user” can be empty for some calls,
    # but commonly you’ll want at least user:read:email depending on your needs.
    scopes = ["channel:read:redemptions"]
    return RedirectResponse(build_auth_url(scopes))

@app.get("/auth/twitch/callback")
async def twitch_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(status_code=400, detail=f"Twitch auth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code/state")
    if state not in pending_states:
        raise HTTPException(status_code=400, detail="Invalid state")

    # Exchange code -> tokens
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            TOKEN_URL,
            params={
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": TWITCH_REDIRECT_URI,
            },
        )
        token_resp.raise_for_status()
        token_json = token_resp.json()

        access_token = token_json["access_token"]
        refresh_token = token_json.get("refresh_token")  # present for auth code flow
        expires_in = token_json.get("expires_in")

        # Validate token -> get user_id (aka broadcaster_id), scopes, client_id, expiry
        validate_resp = await client.get(
            VALIDATE_URL,
            headers={"Authorization": f"OAuth {access_token}"},
        )
        validate_resp.raise_for_status()
        v = validate_resp.json()

    twitch_user_id = v.get("user_id")  # this is your broadcaster_id for that user
    if not twitch_user_id:
        raise HTTPException(status_code=500, detail="Token validated but no user_id returned")

    user_tokens[twitch_user_id] = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
        "scopes": v.get("scopes", []),
        "client_id": v.get("client_id"),
        "login": v.get("login"),
    }

    # Redirect back to your frontend (or show success)
    return {"ok": True, "broadcaster_id": twitch_user_id, "login": v.get("login")}