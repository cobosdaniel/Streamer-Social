import threading
from track_redemption import run_tracker_for_streamer

active_trackers = {}


def start_tracker(streamer):
    user_id = streamer["twitch_user_id"]

    if user_id in active_trackers:
        print(f"Tracker already running for {user_id}")
        return

    thread = threading.Thread(
        target=run_tracker_for_streamer,
        args=(streamer,),
        daemon=True
    )

    active_trackers[user_id] = thread
    thread.start()

    print(f"Started tracker for {user_id}")