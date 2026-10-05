# Tests for queued mode: jobs go to a fake Redis and a SimpleWorker runs them, plus the worker entrypoint.
import fakeredis
import pytest
from flask import Flask
from flask.testing import FlaskClient
from redis import Redis
from rq import Queue, SimpleWorker

import worker
from tsh import pipeline
from tsh.database import db
from tsh.models import Sermon, UploadStatus
from tsh.queue import JOB_TIMEOUT, QUEUE_NAME, enqueue


@pytest.fixture()
def fake_redis(app: Flask, monkeypatch) -> fakeredis.FakeStrictRedis:
    """Turn on queued mode with one shared fake Redis behind every connection."""
    fake = fakeredis.FakeStrictRedis()
    # enqueue imports Redis inside the function, so patch the class, not tsh.queue.
    monkeypatch.setattr(Redis, "from_url", lambda *args, **kwargs: fake)
    app.config["REDIS_URL"] = "redis://fake:6379/0"
    return fake


def run_worker(fake: fakeredis.FakeStrictRedis) -> None:
    # SimpleWorker runs jobs in this process instead of forking, so it works under pytest
    # and the jobs see the test's app context and database.
    queue = Queue(QUEUE_NAME, connection=fake)
    SimpleWorker([queue], connection=fake).work(burst=True)


def reload(sermon_id: int) -> Sermon:
    db.session.expire_all()
    return db.session.get(Sermon, sermon_id)


def sermon_with_status(status: UploadStatus) -> Sermon:
    return db.session.scalars(db.select(Sermon).where(Sermon.status == status)).first()


def test_enqueue_pushes_to_queue(app: Flask, fake_redis):
    """With REDIS_URL set, enqueue does not run the job; it lands on the "sermons" queue with a 15 minute timeout."""
    calls = []

    job = enqueue(calls.append, 1)

    assert calls == []
    queue = Queue(QUEUE_NAME, connection=fake_redis)
    assert queue.job_ids == [job.id]
    assert job.timeout == JOB_TIMEOUT == 900


def test_reprocess_queued_then_worker_publishes(app: Flask, client: FlaskClient, fake_redis):
    """Reprocess returns 202 with PROCESSING and the sermon waits; the worker then publishes it."""
    sermon = sermon_with_status(UploadStatus.DRAFT)

    res = client.post(f"/api/sermons/{sermon.id}/reprocess")

    assert res.status_code == 202
    assert res.json["status"] == "Processing"
    assert reload(sermon.id).status == UploadStatus.PROCESSING

    run_worker(fake_redis)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.processed_at is not None


def test_queued_failure_then_retry(app: Flask, client: FlaskClient, fake_redis, monkeypatch):
    """A required step raising in the worker sets FAILED with "<step>: <error>"; reprocessing it publishes and clears the error."""
    def no_captions(s: Sermon) -> None:
        raise RuntimeError("no captions")

    real_fetch_transcript = pipeline.fetch_transcript
    monkeypatch.setattr(pipeline, "fetch_transcript", no_captions)
    sermon = sermon_with_status(UploadStatus.DRAFT)

    pipeline.start_processing(sermon)
    run_worker(fake_redis)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error == "fetch_transcript: no captions"
    assert sermon.processed_at is None

    monkeypatch.setattr(pipeline, "fetch_transcript", real_fetch_transcript)

    res = client.post(f"/api/sermons/{sermon.id}/reprocess")
    assert res.status_code == 202
    run_worker(fake_redis)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.processed_at is not None


def test_worker_exits_without_redis_url(app: Flask, monkeypatch):
    """worker.py stops with a clear message when REDIS_URL is empty."""
    app.config["REDIS_URL"] = ""
    monkeypatch.setattr(worker, "create_app", lambda *args, **kwargs: app)

    with pytest.raises(SystemExit, match="REDIS_URL is not set"):
        worker.main()
