import threading
import logging
from track_redemption import run_tracker_for_streamer

logger = logging.getLogger(__name__)

active_trackers = {}
_shutdown_event = threading.Event()


def start_tracker(streamer):
    user_id = streamer["twitch_user_id"]

    if user_id in active_trackers:
        logger.info("Tracker already running for %s", user_id)
        return

    thread = threading.Thread(
        target=run_tracker_for_streamer,
        args=(streamer, _shutdown_event),
        daemon=False,
    )

    active_trackers[user_id] = thread
    thread.start()

    logger.info("Started tracker for %s", user_id)


def stop_all_trackers(timeout=10):
    _shutdown_event.set()
    for user_id, thread in active_trackers.items():
        thread.join(timeout=timeout)
