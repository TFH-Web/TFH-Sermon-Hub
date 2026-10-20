# Tests for SyncRun records and run_sync, with import_channel faked so YouTube is never called.
from datetime import date

import pytest
from flask import Flask

from tsh import youtube, youtube_import
from tsh.database import db
from tsh.models import SyncRun, SyncRunState
from tsh.youtube_import import ImportReport, run_sync


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
