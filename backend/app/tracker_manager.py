import threading
import logging
from track_redemption import run_tracker_for_streamer

logger = logging.getLogger(__name__)

# user_id -> (thread, per-user shutdown event)
active_trackers = {}


def start_tracker(streamer):
    user_id = streamer["twitch_user_id"]

    if user_id in active_trackers:
        logger.info("Tracker already running for %s", user_id)
        return

    shutdown_event = threading.Event()
    thread = threading.Thread(
        target=run_tracker_for_streamer,
        args=(streamer, shutdown_event),
        daemon=False,
    )

    active_trackers[user_id] = (thread, shutdown_event)
    thread.start()

    logger.info("Started tracker for %s", user_id)


def stop_tracker(user_id, timeout=10):
    """Stop the EventSub tracker for a single streamer, e.g. on account deletion."""
    entry = active_trackers.pop(user_id, None)
    if not entry:
        return
    thread, shutdown_event = entry
    shutdown_event.set()
    thread.join(timeout=timeout)
    logger.info("Stopped tracker for %s", user_id)


def stop_all_trackers(timeout=10):
    for user_id in list(active_trackers.keys()):
        stop_tracker(user_id, timeout=timeout)
