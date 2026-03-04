Task 1 (30–45 min): Create the database + tables

Goal: MySQL schema exists and you can connect to it.

Create DB (e.g., channel_points)

Create tables:

streamers

tokens (can be empty for now)

redemptions (core)

Add indexes + UNIQUE(event_id) for dedupe

Done when: you can run SHOW TABLES; and see them.

Task 2 (30–60 min): Write a tiny “DB insert” test (no Twitch yet)

Goal: prove your insert + unique constraint works.

Insert a fake redemption row

Try inserting the same event_id twice and confirm the 2nd fails (or is ignored)

Done when: duplicates don’t create extra rows.

Task 3 (30–60 min): Add a backend endpoint that reads “recent redemptions”

Goal: your web app has a reliable read path.

Endpoint like: GET /api/redemptions?streamer_id=...&limit=50

Returns sorted by occurred_at DESC

Done when: hitting it in browser/Postman returns JSON.

Task 4 (30–60 min): Add a backend endpoint to receive redemption events (ingest)

Goal: simulate what Twitch will do later.

Endpoint like: POST /eventsub/redemptions

It accepts a JSON payload (you can post manually for now)

Extract the fields you care about → insert into redemptions

Done when: you can curl a sample payload and see a new DB row.

(This is huge: now your pipeline works even without Twitch.)

Task 5 (30–60 min): Hook your existing EventSub script into the database

Goal: real events go into the DB.

Keep your websocket EventSub listener (for now)

On each notification, insert into redemptions using your schema

Use event["id"] (or Twitch’s redemption ID) as event_id

Done when: a viewer redeems → it shows in MySQL.

Task 6 (30–60 min): Display “Available rewards” in your web dashboard

Goal: your React page lists rewards (read-only).

Backend endpoint: GET /api/rewards (uses your current Helix call)

React fetches it and displays title/cost/id

Done when: dashboard shows rewards list.

Task 7 (30–60 min): Display “Recent redemptions” in the dashboard

Goal: the dashboard shows live-ish data.

React fetches GET /api/redemptions?streamer_id=...

Render a table: viewer, reward, timestamp

Done when: you redeem → refresh page → you see it.

Task 8 (30–60 min): Save “tracked reward IDs” per streamer (still simple)

Goal: store selection even if UI is basic.

Add table: tracked_rewards (streamer_id, reward_id, enabled)

For now, manually insert tracked IDs in DB (no UI)

In your event handler: only store rows if reward_id is tracked or store everything but mark tracked=true

Done when: you can change tracked IDs in DB and behavior changes.

Task 9 (30–60 min): Add a basic “Select rewards” UI (checkboxes)

Goal: streamer can pick rewards in the dashboard.

Render rewards list with checkboxes

“Save” calls backend: POST /api/tracked_rewards

Backend writes to tracked_rewards

Done when: selection persists and affects what you display/filter.