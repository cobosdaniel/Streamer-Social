import threading
from track_redemption import run_tracker_for_streamer

active_trackers = {}
_shutdown_event = threading.Event()


def start_tracker(streamer):
    user_id = streamer["twitch_user_id"]

    if user_id in active_trackers:
        print(f"Tracker already running for {user_id}")
        return

    thread = threading.Thread(
        target=run_tracker_for_streamer,
        args=(streamer, _shutdown_event),
        daemon=False,
    )

    active_trackers[user_id] = thread
    thread.start()

    print(f"Started tracker for {user_id}")


def stop_all_trackers(timeout=10):
    _shutdown_event.set()
    for user_id, thread in active_trackers.items():
        thread.join(timeout=timeout)
