# Tests for SyncRun records, run_sync and the sync run endpoints, with import_channel faked so YouTube is never called.
from datetime import date, datetime, timedelta

import fakeredis
import pytest
from flask import Flask
from flask.testing import FlaskClient
from redis import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from rq import Queue, SimpleWorker

from tsh import youtube, youtube_import
from tsh.database import db
from tsh.models import SyncRun, SyncRunState, utcnow
from tsh.queue import QUEUE_NAME
from tsh.youtube_import import STALE_QUEUED_SYNC_AFTER, STALE_SYNC_AFTER, ImportReport, run_sync


def new_run(**fields) -> int:
    """Save a new SyncRun with the given fields and return its id."""
    run = SyncRun(id=None, **fields)
    db.session.add(run)
    db.session.commit()
    return run.id


def reload(run_id: int) -> SyncRun:
    """Return the run as saved in the database, not the copy in the session."""
    db.session.expire_all()
    return db.session.get(SyncRun, run_id)


@pytest.fixture()
def fake_import(monkeypatch) -> list[tuple]:
    """Replace import_channel with one that returns a fixed report and records the dates it was called with."""
    calls = []

    def import_channel(date_from=None, date_to=None):
        calls.append((date_from, date_to))
        return ImportReport(series_created=1, sermons_created=3, sermons_updated=2, sermons_unchanged=5,
                            skipped_private=["vPrivate001"])

    monkeypatch.setattr(youtube_import, "import_channel", import_channel)
    return calls


def test_new_run_is_queued(app: Flask):
    """A new run starts QUEUED with created_at set and nothing else filled in."""
    run = reload(new_run(date_from=date(2026, 9, 1)))

    assert run.state == SyncRunState.QUEUED
    assert run.created_at is not None
    assert run.started_at is None and run.finished_at is None
    assert run.report is None and run.error is None
    assert run.date_from == date(2026, 9, 1) and run.date_to is None


def test_run_succeeds_with_report_and_counts(app: Flask, fake_import: list[tuple]):
    """A run that imports cleanly is SUCCEEDED with its report, counts and both timestamps."""
    run_id = new_run(date_from=date(2026, 9, 1), date_to=date(2026, 9, 30))

    run_sync(run_id)

    run = reload(run_id)
    assert fake_import == [(date(2026, 9, 1), date(2026, 9, 30))]
    assert run.state == SyncRunState.SUCCEEDED
    assert run.error is None
    assert run.report["skipped_private"] == ["vPrivate001"]
    assert (run.series_created, run.sermons_created, run.sermons_updated, run.sermons_unchanged) == (1, 3, 2, 5)
    assert run.created_at <= run.started_at <= run.finished_at


def test_worker_failure_marks_run_failed(app: Flask, monkeypatch):
    """If the import raises, the run is FAILED with the error and finished_at, and the job does not raise."""
    def broken(date_from=None, date_to=None):
        raise youtube.YouTubeError("videos: HTTP 500: backendError", status=500)

    monkeypatch.setattr(youtube_import, "import_channel", broken)
    run_id = new_run()

    run_sync(run_id)

    run = reload(run_id)
    assert run.state == SyncRunState.FAILED
    assert run.error == "videos: HTTP 500: backendError"
    assert run.started_at is not None and run.finished_at is not None
    assert run.report is None and run.sermons_created is None


def test_new_run_keeps_prior_runs(app: Flask, fake_import: list[tuple]):
    """Starting another sync adds a row with a new id and leaves the earlier run and its report as they were."""
    first_id = new_run()
    run_sync(first_id)
    second_id = new_run(date_from=date(2026, 9, 7))

    assert second_id != first_id
    first, second = reload(first_id), reload(second_id)
    assert first.state == SyncRunState.SUCCEEDED and first.sermons_created == 3
    assert second.state == SyncRunState.QUEUED and second.report is None
    assert db.session.scalar(db.select(db.func.count()).select_from(SyncRun)) == 2


def test_missing_run_is_ignored(app: Flask, fake_import: list[tuple]):
    """A job for a run that no longer exists does nothing instead of importing."""
    run_sync(999)

    assert fake_import == []


@pytest.fixture()
def fake_redis(app: Flask, monkeypatch) -> fakeredis.FakeStrictRedis:
    """Turn on queued mode with a fake Redis of this test's own, so no queued job carries over to another test."""
    fake = fakeredis.FakeStrictRedis(server=fakeredis.FakeServer())
    # enqueue imports Redis inside the function, so patch the class, not tsh.queue.
    monkeypatch.setattr(Redis, "from_url", lambda *args, **kwargs: fake)
    app.config["REDIS_URL"] = "redis://fake:6379/0"
    return fake


def run_worker(fake: fakeredis.FakeStrictRedis) -> None:
    """Run every queued job with a SimpleWorker, which works in this process so jobs see the test's database."""
    SimpleWorker([Queue(QUEUE_NAME, connection=fake)], connection=fake).work(burst=True)


def long_ago() -> datetime:
    """Return a time just past STALE_SYNC_AFTER, so a run started then counts as lost."""
    return utcnow() - STALE_SYNC_AFTER - timedelta(minutes=1)


@pytest.fixture()
def broken_import(monkeypatch):
    """Make import_channel fail the way it does when YouTube is down."""
    def broken(date_from=None, date_to=None):
        raise youtube.YouTubeError("videos: HTTP 500: backendError", status=500)

    monkeypatch.setattr(youtube_import, "import_channel", broken)


def test_late_job_for_a_failed_run_does_nothing(app: Flask, fake_import: list[tuple]):
    """A job that turns up after its run was given up on is not run, so it cannot overlap a newer sync."""
    run_id = new_run(state=SyncRunState.FAILED, error="worker: no result within 20 minutes")

    run_sync(run_id)

    assert fake_import == []
    assert reload(run_id).state == SyncRunState.FAILED


def test_submit_inline_returns_run_and_report(client: FlaskClient, fake_import: list[tuple]):
    """Inline, the sync has finished by the response: 200 with the report, the run id and its state."""
    res = client.post("/api/import/youtube", json={"from": "2026-09-01", "to": "2026-09-30"})

    assert res.status_code == 200
    assert res.json["queued"] is False
    assert res.json["state"] == "succeeded"
    assert res.json["report"]["sermons_created"] == 3
    run = reload(res.json["runId"])
    assert run.state == SyncRunState.SUCCEEDED
    assert (run.date_from, run.date_to) == (date(2026, 9, 1), date(2026, 9, 30))


def test_submit_inline_failure(client: FlaskClient, broken_import):
    """An inline sync that fails sends 502 with the reason and the run id, and the run is saved as FAILED."""
    res = client.post("/api/import/youtube")

    assert res.status_code == 502
    assert res.json["error"] == "YouTube import failed: videos: HTTP 500: backendError"
    assert res.json["state"] == "failed"
    run = reload(res.json["runId"])
    assert run.state == SyncRunState.FAILED
    assert run.error == "videos: HTTP 500: backendError"
    assert run.finished_at is not None


def test_submit_queue_failure(client: FlaskClient, fake_import: list[tuple], monkeypatch):
    """If the job cannot be queued: 503, and the run is FAILED with "queue: <error>" instead of staying QUEUED."""
    def redis_down(*args):
        raise RedisConnectionError("Connection refused")

    monkeypatch.setattr(youtube_import, "enqueue", redis_down)

    res = client.post("/api/import/youtube")

    assert res.status_code == 503
    assert res.json["error"] == "The job queue is unavailable. Please try again later."
    run = reload(res.json["runId"])
    assert run.state == SyncRunState.FAILED
    assert run.error == "queue: Connection refused"
    assert run.finished_at is not None
    assert fake_import == []


@pytest.mark.parametrize("state", [SyncRunState.QUEUED, SyncRunState.RUNNING])
def test_submit_while_active_is_409(client: FlaskClient, fake_import: list[tuple], state: SyncRunState):
    """A sync already queued or running blocks a new one: 409 with its id, and no new run is made."""
    active_id = new_run(state=state, started_at=utcnow() if state == SyncRunState.RUNNING else None)

    res = client.post("/api/import/youtube")

    assert res.status_code == 409
    assert res.json["runId"] == active_id
    assert res.json["error"] == res.json["message"]
    assert db.session.scalar(db.select(db.func.count()).select_from(SyncRun)) == 1
    assert fake_import == []


def test_lost_running_run_is_failed_and_new_sync_allowed(client: FlaskClient, fake_import: list[tuple]):
    """A run RUNNING past the job timeout is set FAILED with a "worker:" error, and the new sync goes ahead."""
    lost_id = new_run(state=SyncRunState.RUNNING, created_at=long_ago(), started_at=long_ago())

    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    assert res.json["runId"] != lost_id
    lost = reload(lost_id)
    assert lost.state == SyncRunState.FAILED
    assert lost.error == "worker: no result within 20 minutes"
    assert lost.finished_at is not None


def test_lost_queued_run_is_failed_after_a_day(client: FlaskClient, fake_import: list[tuple]):
    """A run QUEUED for over a day was dropped from the queue, so it no longer blocks new syncs."""
    lost_id = new_run(created_at=utcnow() - STALE_QUEUED_SYNC_AFTER - timedelta(minutes=1))

    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    lost = reload(lost_id)
    assert lost.state == SyncRunState.FAILED
    assert lost.error == "worker: no result within 1440 minutes"


def test_queued_run_waiting_behind_sermon_jobs_still_blocks(client: FlaskClient, fake_import: list[tuple]):
    """A run queued longer than one job timeout may just be waiting its turn, so it stays active."""
    waiting_id = new_run(created_at=long_ago())

    res = client.post("/api/import/youtube")

    assert res.status_code == 409
    assert res.json["runId"] == waiting_id
    assert reload(waiting_id).state == SyncRunState.QUEUED


@pytest.mark.parametrize("path", ["/api/import/youtube/runs", "/api/import/youtube/runs?page=1", "/api/import/youtube/runs/{id}"])
@pytest.mark.parametrize("state, age, minutes", [
    (SyncRunState.RUNNING, STALE_SYNC_AFTER, 20),
    (SyncRunState.QUEUED, STALE_QUEUED_SYNC_AFTER, 1440),
])
def test_status_poll_records_lost_workers_without_a_new_submission(client: FlaskClient, fake_import, path, state, age, minutes):
    old = utcnow() - age - timedelta(minutes=1)
    run_id = new_run(state=state, created_at=old, started_at=old if state == SyncRunState.RUNNING else None)
    url = path.format(id=run_id)

    res = client.get(url)

    assert res.status_code == 200
    body = res.json
    if "?page" in url:
        body = body["runs"][0]
    elif isinstance(body, list):
        body = body[0]
    assert body["state"] == "failed"
    assert body["error"] == f"worker: no result within {minutes} minutes"
    assert body["finishedAt"] is not None
    persisted = reload(run_id)
    assert persisted.state == SyncRunState.FAILED
    finished_at = persisted.finished_at
    # Repeated polls keep the outcome stable, and a late queued job never imports.
    assert client.get(url).status_code == 200
    run_sync(run_id)
    assert reload(run_id).finished_at == finished_at
    assert fake_import == []
    assert db.session.scalar(db.select(db.func.count()).select_from(SyncRun)) == 1


@pytest.mark.parametrize("path", ["/api/import/youtube/runs", "/api/import/youtube/runs/{id}"])
def test_polling_preserves_a_sync_waiting_behind_sermon_jobs(client: FlaskClient, path):
    run_id = new_run(created_at=utcnow() - timedelta(hours=1))

    res = client.get(path.format(id=run_id))

    assert res.status_code == 200
    assert reload(run_id).state == SyncRunState.QUEUED
    assert reload(run_id).finished_at is None


@pytest.mark.parametrize("roles, status_code", [("none", 401), ("Internal User", 403)])
@pytest.mark.parametrize("path", ["/api/import/youtube/runs", "/api/import/youtube/runs/{id}"])
def test_unauthorized_status_requests_do_not_change_runs(client: FlaskClient, roles, status_code, path):
    run_id = new_run(state=SyncRunState.RUNNING, created_at=long_ago(), started_at=long_ago())

    res = client.get(path.format(id=run_id), headers={"X-Test-Roles": roles})

    assert res.status_code == status_code
    assert reload(run_id).state == SyncRunState.RUNNING
    assert reload(run_id).finished_at is None


def test_submit_queued_then_worker_completes(client: FlaskClient, fake_import: list[tuple], fake_redis):
    """With Redis: 202 with the job and run ids, the run waits QUEUED, and the worker running the job completes it."""
    fake = fake_redis
    res = client.post("/api/import/youtube")

    assert res.status_code == 202
    assert res.json["queued"] is True
    assert res.json["state"] == "queued"
    queue = Queue(QUEUE_NAME, connection=fake)
    assert queue.job_ids == [res.json["jobId"]]
    run_id = res.json["runId"]
    assert reload(run_id).state == SyncRunState.QUEUED
    assert fake_import == []

    run_worker(fake)

    run = reload(run_id)
    assert run.state == SyncRunState.SUCCEEDED
    assert run.sermons_created == 3
    detail = client.get(f"/api/import/youtube/runs/{run_id}")
    assert detail.json["state"] == "succeeded"


def test_run_detail(client: FlaskClient, fake_import: list[tuple]):
    """The detail endpoint returns the run with camelCase keys, ISO dates and the full report."""
    run_id = client.post("/api/import/youtube", json={"from": "2026-09-01"}).json["runId"]

    res = client.get(f"/api/import/youtube/runs/{run_id}")

    assert res.status_code == 200
    assert res.json["id"] == run_id
    assert res.json["dateFrom"] == "2026-09-01"
    assert res.json["dateTo"] is None
    assert res.json["sermonsCreated"] == 3
    assert res.json["report"]["skipped_private"] == ["vPrivate001"]
    assert datetime.fromisoformat(res.json["finishedAt"]) >= datetime.fromisoformat(res.json["createdAt"])


def test_run_detail_missing_is_404(client: FlaskClient):
    """An unknown run id sends 404 with JSON error and message."""
    res = client.get("/api/import/youtube/runs/999")

    assert res.status_code == 404
    assert res.json["error"] == res.json["message"] == "Sync run with id 999 not found"


def test_run_list_newest_first_without_reports(client: FlaskClient):
    """The list is newest first, has the counts but no report, and pages with ?page= like the other lists."""
    first = new_run(state=SyncRunState.SUCCEEDED, sermons_created=4, report={"sermons_created": 4})
    second = new_run(state=SyncRunState.FAILED, error="videos: HTTP 500: backendError")

    res = client.get("/api/import/youtube/runs")

    assert res.status_code == 200
    assert [r["id"] for r in res.json] == [second, first]
    assert all("report" not in r for r in res.json)
    assert res.json[1]["sermonsCreated"] == 4
    assert res.json[0]["error"] == "videos: HTTP 500: backendError"

    page = client.get("/api/import/youtube/runs?page=1&pageSize=1")
    assert page.status_code == 200
    assert [r["id"] for r in page.json["runs"]] == [second]
    assert page.json["total"] == 2


@pytest.mark.parametrize(("method", "path"), [
    ("post", "/api/import/youtube"),
    ("get", "/api/import/youtube/runs"),
    ("get", "/api/import/youtube/runs/1"),
])
@pytest.mark.parametrize(("roles", "status_code"), [("none", 401), ("Internal User", 403)])
def test_sync_run_endpoints_admin_only(client: FlaskClient, fake_import: list[tuple], method: str, path: str,
                                       roles: str, status_code: int):
    """Every sync run endpoint is Admin only, and a refused submission creates no run."""
    new_run(state=SyncRunState.SUCCEEDED)

    res = getattr(client, method)(path, headers={"X-Test-Roles": roles})

    assert res.status_code == status_code
    assert db.session.scalar(db.select(db.func.count()).select_from(SyncRun)) == 1


def test_submit_queued_then_worker_fails(client: FlaskClient, fake_redis, broken_import):
    """With Redis, an import that raises in the worker leaves the run FAILED with the error, shown by the detail endpoint."""
    res = client.post("/api/import/youtube")
    assert res.status_code == 202
    run_id = res.json["runId"]

    run_worker(fake_redis)

    detail = client.get(f"/api/import/youtube/runs/{run_id}")
    assert detail.status_code == 200
    assert detail.json["state"] == "failed"
    assert detail.json["error"] == "videos: HTTP 500: backendError"
    assert detail.json["report"] is None
    assert detail.json["startedAt"] is not None and detail.json["finishedAt"] is not None
    # The job swallows the failure on purpose, so RQ itself records no failed job.
    assert Queue(QUEUE_NAME, connection=fake_redis).failed_job_registry.count == 0


def test_submit_queued_with_redis_down(app: Flask, client: FlaskClient, fake_import: list[tuple], monkeypatch):
    """With REDIS_URL set but Redis unreachable, the real enqueue fails: 503, and the run is FAILED with "queue:"."""
    server = fakeredis.FakeServer()
    server.connected = False
    monkeypatch.setattr(Redis, "from_url", lambda *args, **kwargs: fakeredis.FakeStrictRedis(server=server))
    app.config["REDIS_URL"] = "redis://fake:6379/0"

    res = client.post("/api/import/youtube")

    assert res.status_code == 503
    assert res.json["state"] == "failed"
    run = reload(res.json["runId"])
    assert run.state == SyncRunState.FAILED
    assert run.error.startswith("queue: ")
    assert run.finished_at is not None
    assert fake_import == []


def test_bad_dates_create_no_run(client: FlaskClient, fake_import: list[tuple]):
    """A 400 for an unreadable date is sent before any run is saved."""
    res = client.post("/api/import/youtube", json={"from": "next week"})

    assert res.status_code == 400
    assert db.session.scalar(db.select(db.func.count()).select_from(SyncRun)) == 0


@pytest.mark.parametrize("failure", ["worker", "queue", "lost"])
def test_next_sync_after_a_failure_succeeds_and_keeps_both(client: FlaskClient, fake_import: list[tuple],
                                                           monkeypatch, failure: str):
    """After a failed run, whether the import raised, the job could not be queued or the worker was lost,
    the next submission succeeds and the list keeps both runs, newest first."""
    def fail(*args):
        if failure == "worker":
            raise ValueError("import broke")
        raise RedisConnectionError("Connection refused")

    if failure == "lost":
        failed_id = new_run(state=SyncRunState.RUNNING, created_at=long_ago(), started_at=long_ago())
    else:
        with monkeypatch.context() as patch:
            patch.setattr(youtube_import, "import_channel" if failure == "worker" else "enqueue", fail)
            first = client.post("/api/import/youtube")
        assert first.status_code == (502 if failure == "worker" else 503)
        failed_id = first.json["runId"]

    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    assert res.json["state"] == "succeeded"
    runs = client.get("/api/import/youtube/runs").json
    assert [(r["id"], r["state"]) for r in runs] == [(res.json["runId"], "succeeded"), (failed_id, "failed")]
    assert runs[1]["error"].startswith({"worker": "import broke", "queue": "queue: ", "lost": "worker: "}[failure])
