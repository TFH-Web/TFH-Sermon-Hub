# Tests for the background job queue, the processing pipeline and the reprocess endpoint. Inline mode only, no Redis.
import pytest
from flask import Flask
from flask.testing import FlaskClient
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from tsh import pipeline
from tsh.database import db
from tsh.models import Sermon, UploadStatus
from tsh.queue import enqueue


def sermon_with_status(status: UploadStatus) -> Sermon:
    return db.session.scalars(db.select(Sermon).where(Sermon.status == status)).first()


def reload(sermon_id: int) -> Sermon:
    db.session.expire_all()
    return db.session.get(Sermon, sermon_id)


def fail(message: str):
    def step(sermon: Sermon) -> None:
        raise RuntimeError(message)

    return step


def test_enqueue_runs_inline_without_redis(app: Flask, monkeypatch):
    """With REDIS_URL empty in config, enqueue runs the job right away, even if the environment sets REDIS_URL."""
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6399/0")
    assert app.config["REDIS_URL"] == ""
    assert enqueue(lambda a, b: a + b, 2, 3) == 5


def test_process_sermon_success(app: Flask):
    """A run where every step passes ends PUBLISHED with processed_at set and no error."""
    sermon = sermon_with_status(UploadStatus.FAILED)
    sermon.processing_error = "fetch_transcript: old error"
    db.session.commit()

    pipeline.process_sermon(sermon.id)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.processed_at is not None


def test_process_sermon_marks_processing_first(app: Flask, monkeypatch):
    """process_sermon sets PROCESSING and clears the old error before the first step runs."""
    sermon = sermon_with_status(UploadStatus.FAILED)
    sermon.processing_error = "embed_chunks: old error"
    db.session.commit()
    seen = []

    def spy(s: Sermon) -> None:
        current = reload(s.id)
        seen.append((current.status, current.processing_error))

    monkeypatch.setattr(pipeline, "fetch_transcript", spy)
    pipeline.process_sermon(sermon.id)

    assert seen == [(UploadStatus.PROCESSING, None)]


@pytest.mark.parametrize("step", ["fetch_transcript", "embed_chunks"])
def test_required_step_failure(app: Flask, monkeypatch, step: str):
    """A required step raising sets FAILED with "<step>: <error>" and does not publish."""
    sermon = sermon_with_status(UploadStatus.DRAFT)
    monkeypatch.setattr(pipeline, step, fail("no captions"))

    pipeline.process_sermon(sermon.id)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error == f"{step}: no captions"
    assert sermon.processed_at is None


def test_failed_step_changes_are_rolled_back(app: Flask, monkeypatch):
    """Whatever a failing step changed before raising is not saved."""
    sermon = sermon_with_status(UploadStatus.DRAFT)

    def half_done(s: Sermon) -> None:
        s.transcript = "partial"
        raise RuntimeError("cut off")

    monkeypatch.setattr(pipeline, "fetch_transcript", half_done)
    pipeline.process_sermon(sermon.id)

    assert reload(sermon.id).transcript is None


def test_summary_failure_still_publishes(app: Flask, monkeypatch):
    """The summary step raising still publishes, saves the error, and keeps the old summary."""
    sermon = sermon_with_status(UploadStatus.PUBLISHED)
    old_summary = sermon.summary
    monkeypatch.setattr(pipeline, "summarize_sermon", fail("model down"))

    pipeline.process_sermon(sermon.id)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error == "summarize_sermon: model down"
    assert sermon.summary == old_summary
    assert sermon.processed_at is not None


def test_error_without_message_uses_exception_name(app: Flask, monkeypatch):
    """An exception with no message is saved as its class name."""
    sermon = sermon_with_status(UploadStatus.DRAFT)

    def raise_bare(s: Sermon) -> None:
        raise ValueError()

    monkeypatch.setattr(pipeline, "embed_chunks", raise_bare)
    pipeline.process_sermon(sermon.id)

    assert reload(sermon.id).processing_error == "embed_chunks: ValueError"


def test_process_missing_sermon(app: Flask):
    """A job for a deleted sermon does nothing and does not raise."""
    pipeline.process_sermon(999999)


def test_dummy_delay(app: Flask, monkeypatch):
    """PIPELINE_DUMMY_DELAY makes each run sleep that many seconds; 0 means no sleep."""
    sleeps = []
    monkeypatch.setattr(pipeline.time, "sleep", sleeps.append)
    sermon = sermon_with_status(UploadStatus.DRAFT)

    pipeline.process_sermon(sermon.id)
    assert sleeps == []

    app.config["PIPELINE_DUMMY_DELAY"] = 2
    pipeline.process_sermon(sermon.id)
    assert sleeps == [2.0]


def test_start_processing_runs_pipeline_inline(app: Flask):
    """Without Redis, start_processing runs the whole pipeline before it returns. No storage_key needed."""
    sermon = sermon_with_status(UploadStatus.DRAFT)
    assert sermon.storage_key is None

    pipeline.start_processing(sermon)

    assert reload(sermon.id).status == UploadStatus.PUBLISHED


def test_start_processing_queue_failure(app: Flask, monkeypatch):
    """If the job cannot be queued, the sermon is set FAILED with a "queue:" error and the error is raised."""
    def broken_enqueue(*args):
        raise RedisConnectionError("Redis is down")

    monkeypatch.setattr(pipeline, "enqueue", broken_enqueue)
    sermon = sermon_with_status(UploadStatus.DRAFT)

    with pytest.raises(RedisConnectionError):
        pipeline.start_processing(sermon)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error == "queue: Redis is down"


def test_regenerate_summary_skips_unpublished(app: Flask, monkeypatch):
    """regenerate_summary does nothing unless the sermon is PUBLISHED, so a transcript error is kept."""
    calls = []
    monkeypatch.setattr(pipeline, "summarize_sermon", calls.append)
    sermon = sermon_with_status(UploadStatus.FAILED)
    sermon.processing_error = "fetch_transcript: no captions"
    db.session.commit()

    pipeline.regenerate_summary(sermon.id)

    assert calls == []
    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error == "fetch_transcript: no captions"


def test_regenerate_summary_clears_only_summary_errors(app: Flask):
    """A successful regenerate clears an old summary error but leaves any other error alone."""
    sermon = sermon_with_status(UploadStatus.PUBLISHED)
    sermon.processing_error = "summarize_sermon: model down"
    db.session.commit()
    pipeline.regenerate_summary(sermon.id)
    assert reload(sermon.id).processing_error is None

    sermon = reload(sermon.id)
    sermon.processing_error = "embed_chunks: old error"
    db.session.commit()
    pipeline.regenerate_summary(sermon.id)
    assert reload(sermon.id).processing_error == "embed_chunks: old error"


def test_regenerate_summary_failure(app: Flask, monkeypatch):
    """A failed regenerate saves the summary error and leaves the sermon PUBLISHED."""
    monkeypatch.setattr(pipeline, "summarize_sermon", fail("model down"))
    sermon = sermon_with_status(UploadStatus.PUBLISHED)

    pipeline.regenerate_summary(sermon.id)

    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error == "summarize_sermon: model down"


def test_reprocess(app: Flask, client: FlaskClient):
    """Admins get 202 with the sermon; inline mode has already finished the run."""
    sermon = sermon_with_status(UploadStatus.FAILED)

    res = client.post(f"/api/sermons/{sermon.id}/reprocess")

    assert res.status_code == 202
    assert res.json["id"] == sermon.id
    assert res.json["status"] == "Published"
    assert res.json["processingError"] is None


@pytest.mark.parametrize(
    ("roles", "status_code"),
    [("none", 401), ("Internal User", 403)],
)
def test_reprocess_auth(app: Flask, client: FlaskClient, roles: str, status_code: int):
    """Reprocess is Admin only: 401 with no token, 403 for Internal Users, and the sermon is untouched."""
    sermon = sermon_with_status(UploadStatus.FAILED)

    res = client.post(f"/api/sermons/{sermon.id}/reprocess", headers={"X-Test-Roles": roles})

    assert res.status_code == status_code
    assert reload(sermon.id).status == UploadStatus.FAILED


def test_reprocess_missing_sermon(client: FlaskClient):
    """Reprocessing a sermon that does not exist sends 404."""
    res = client.post("/api/sermons/999999/reprocess")
    assert res.status_code == 404


@pytest.mark.parametrize("error", [RedisConnectionError, RedisTimeoutError])
def test_reprocess_redis_down(app: Flask, client: FlaskClient, monkeypatch, error):
    """When Redis cannot be reached, reprocess sends 503 with a clear message and the sermon is left FAILED."""
    def broken_enqueue(*args):
        raise error("Timeout connecting to server")

    monkeypatch.setattr(pipeline, "enqueue", broken_enqueue)
    sermon = sermon_with_status(UploadStatus.DRAFT)

    res = client.post(f"/api/sermons/{sermon.id}/reprocess")

    assert res.status_code == 503
    assert res.json["error"] == "The job queue is unavailable. Please try again later."
    sermon = reload(sermon.id)
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error.startswith("queue:")
