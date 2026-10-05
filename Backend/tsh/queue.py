# Runs background jobs on the Redis queue, or right away in this process when REDIS_URL is not set.
from typing import Any, Callable

from flask import current_app

QUEUE_NAME = "sermons"

# RQ kills jobs after 180 seconds by default, which is too short for a long sermon.
JOB_TIMEOUT = 15 * 60


def enqueue(func: Callable, *args) -> Any:
    """Run func(*args) as a background job.

    With REDIS_URL set, pushes the job to the "sermons" RQ queue with a 15 minute timeout and returns the RQ job.
    Without it, calls func(*args) right away and returns its result.
    Raises redis.ConnectionError or redis.TimeoutError if REDIS_URL is set but Redis cannot be reached.
    """
    redis_url = current_app.config["REDIS_URL"]
    if not redis_url:
        return func(*args)

    # Imported here so the inline path never loads RQ. RQ needs fork, and some of the team runs the backend on plain Windows.
    from redis import Redis
    from rq import Queue

    queue = Queue(QUEUE_NAME, connection=Redis.from_url(redis_url))
    return queue.enqueue(func, *args, job_timeout=JOB_TIMEOUT)
