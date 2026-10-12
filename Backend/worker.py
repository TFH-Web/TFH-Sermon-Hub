#!/usr/bin/env -S poetry run python3
# Runs the RQ worker that processes sermon jobs from the Redis queue.
from flask import Flask
from redis import Redis
from rq import Queue, Worker

from tsh.app import create_app
from tsh.queue import QUEUE_NAME


class FlaskWorker(Worker):
    """RQ worker that runs every job inside the Flask app context."""

    app: Flask

    def perform_job(self, job, queue) -> bool:
        """Run one job with the app context pushed, so it can use db and current_app.

        Returns RQ's result: True if the job finished, False if it failed.
        """
        # perform_job runs in the forked child, so each job gets its own context and database session.
        with self.app.app_context():
            return super().perform_job(job, queue)


def main():
    app = create_app("testing.cfg")
    redis_url = app.config["REDIS_URL"]
    if not redis_url:
        raise SystemExit(
            "REDIS_URL is not set. Without it jobs run inline in the Flask process, so no worker is needed."
        )

    connection = Redis.from_url(redis_url)
    FlaskWorker.app = app
    worker = FlaskWorker([Queue(QUEUE_NAME, connection=connection)], connection=connection)
    worker.work()


if __name__ == "__main__":
    main()
