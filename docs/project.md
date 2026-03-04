# Project: **Channel Points**
## PEACTO
P: problem
E: example
A: approach
C/T/O: code / test / optimize

### Problem: 
Tracking user's channel point usage in a certain community
### Example: 
1. Daily Check In's
2. Stream Streaks with designated streaming days (wont penalize viewers for missing non scheduled day)
### Approach:

### Code:

### Test:

### Optimize:

WHAT DO YOU WANT TO IT TO DO:

i want the streamer to be able to chooose which channel point redeems to track
P:
E: 1st / 2nd / 3rd, Daily Check In
Use Case: see who is consistently 1st/2nd/3rd of each month provide rewards.
Use Case: Daily Check In - to see who is consistently showing up to streams
Use Case: Daily Check In - have personal stream streaks
    have designated streaming days, streak only applies to certain days
        Example: Streamer has a set schedule of only Mon Wed Fri BUT occassionally streams Sat
        streak is only reset if the viewer does not consecutively watches Mon Wed Fri
        if they missed Sat it does harm the streak
        if they missed Mon Wed Fri, streak resets
        this would be a personal toggle
        default would be consecutive days no matter which day
A:
C/T/O:

i want the streamer to be able to select which dates to monitor
P:
E: month of Feb, 21st of Feb through 20th of March, 2024-2025, March of 2024 - June 2025
A:
C/T/O:

Should log when a viewer loses a stream streak, or streak resets

Have the ability for the streamer to retrieve user's streak via channel points or donos/subs or not

Create a database

streamer_id

event_id (unique) dedupe

occurred_at

viewer_id, viewer_name

reward_id, reward_title
Optional:

cost

raw_payload JSON (debug)


🔥 Minimal Production-Ready Schema (For Your Project)
1️⃣ Streamers Table

Stores Twitch users who log in.

streamers
-----------
id (PK)
twitch_user_id (unique)
login_name
display_name
created_at

2️⃣ Tokens Table

Stores OAuth tokens securely.

tokens
-----------
id (PK)
streamer_id (FK)
access_token
refresh_token
expires_at
created_at

3️⃣ Redemptions Table (CORE TABLE)

This is your product foundation.

redemptions
-----------
id (PK)
event_id (unique)  <-- CRITICAL (dedupe)
streamer_id (FK)
viewer_id
viewer_login
viewer_display_name
reward_id
reward_title
cost
occurred_at (timestamp)
created_at


Add indexes:

INDEX(streamer_id)

INDEX(viewer_id)

INDEX(occurred_at)

UNIQUE(event_id)

That unique event_id is what prevents duplicate inserts when Twitch retries webhooks.




