"""Batch caps, quota stops and restart behavior use a real DB and fake downloads."""

import pytest

from tsh import captions, pipeline
from tsh.caption_backfill import QUOTA_ERROR
from tsh.database import db
from tsh.models import Sermon, UploadStatus

SEGMENTS = [{"start": 1, "end": 2, "text": "Saved captions."}]


@pytest.fixture()
def pending(app, monkeypatch):
    sermons = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).all()
    for index, sermon in enumerate(sermons):
        sermon.youtube_video_id = f"video{index:06d}"
        sermon.status = UploadStatus.DRAFT
        sermon.transcript = None
        sermon.transcript_segments = None
        sermon.processing_error = None
    db.session.commit()
    for name in captions.OAUTH_SETTINGS:
        app.config[name] = "fake-oauth-value"
    calls = []
    monkeypatch.setattr(
        captions, "get_transcript", lambda video_id: calls.append(video_id) or SEGMENTS
    )
    return sermons, calls


def test_batch_limit_and_resume_skip_completed_transcripts(runner, pending):
    _, calls = pending
    assert runner.invoke(args=["backfill-captions", "--limit", "2"]).exit_code == 0
    assert len(calls) == 2
    assert runner.invoke(args=["backfill-captions", "--limit", "2"]).exit_code == 0
    assert len(calls) == len(set(calls)) == 4
    db.session.expire_all()
    saved = db.session.scalars(
        db.select(Sermon).where(Sermon.transcript.is_not(None))
    ).all()
    assert len(saved) == 4
    assert all(sermon.transcript_segments == SEGMENTS for sermon in saved)


def test_quota_stops_batch_and_later_run_resumes(runner, pending, monkeypatch):
    _, calls = pending

    def download(video_id):
        calls.append(video_id)
        if len(calls) == 2:
            raise captions.CaptionError(
                "YouTube quota exceeded; wait for the daily quota reset, then reprocess"
            )
        return SEGMENTS

    monkeypatch.setattr(captions, "get_transcript", download)
    result = runner.invoke(args=["backfill-captions", "--limit", "4"])
    assert result.exit_code == 0
    assert "Stopped: daily YouTube quota exhausted" in result.output
    assert "attempted: 2; succeeded: 1; failed: 1" in result.output
    assert len(calls) == 2
    failed = db.session.scalar(
        db.select(Sermon).where(Sermon.status == UploadStatus.FAILED)
    )
    assert failed.processing_error.startswith(QUOTA_ERROR)
    retry_id = failed.youtube_video_id
    result = runner.invoke(args=["backfill-captions", "--limit", "2"])
    assert result.exit_code == 0
    assert "succeeded: 2; failed: 0" in result.output
    assert retry_id in calls[2:]


def test_failed_only_retries_old_caption_without_reprocessing_other_rows(
    runner, pending
):
    sermons, calls = pending
    sermon = sermons[0]
    sermon.status = UploadStatus.FAILED
    sermon.transcript = "Previous saved captions."
    sermon.processing_error = "fetch_transcript: no usable captions"
    db.session.commit()
    result = runner.invoke(args=["backfill-captions", "--failed-only", "--limit", "2"])
    assert result.exit_code == 0
    assert calls == [sermon.youtube_video_id]
    assert sermon.transcript == "Saved captions."
    assert sermon.processing_error is None


def test_default_backfill_skips_other_failures_and_processing_jobs(runner, pending):
    sermons, calls = pending
    sermons[0].status = UploadStatus.FAILED
    sermons[0].processing_error = "fetch_transcript: no usable captions"
    sermons[1].status = UploadStatus.PROCESSING
    db.session.commit()
    result = runner.invoke(args=["backfill-captions", "--limit", "6"])
    assert result.exit_code == 0
    assert len(calls) == 4
    assert sermons[0].youtube_video_id not in calls
    assert sermons[1].youtube_video_id not in calls


def test_dry_run_needs_no_credentials_and_changes_nothing(app, runner, pending):
    sermons, calls = pending
    for name in captions.OAUTH_SETTINGS:
        app.config[name] = ""
    result = runner.invoke(args=["backfill-captions", "--dry-run", "--limit", "2"])
    assert result.exit_code == 0
    assert "selected: 2" in result.output
    assert calls == []
    assert all(
        sermon.status == UploadStatus.DRAFT and sermon.transcript is None
        for sermon in sermons
    )


def test_missing_credentials_fail_before_processing(app, runner, pending):
    sermons, calls = pending
    app.config["YOUTUBE_OAUTH_REFRESH_TOKEN"] = ""
    result = runner.invoke(args=["backfill-captions"])
    assert result.exit_code == 1
    assert "YOUTUBE_OAUTH_REFRESH_TOKEN" in result.output
    assert calls == []
    assert all(sermon.status == UploadStatus.DRAFT for sermon in sermons)


def test_revoked_token_stops_after_first_attempt(runner, pending, monkeypatch):
    _, calls = pending

    def download(video_id):
        calls.append(video_id)
        raise captions.CaptionError(
            "invalid_grant: OAuth refresh token expired or was revoked"
        )

    monkeypatch.setattr(captions, "get_transcript", download)
    result = runner.invoke(args=["backfill-captions", "--limit", "6"])
    assert result.exit_code == 1
    assert "Stopped: fix the channel OAuth credentials" in result.output
    assert len(calls) == 1


def test_batch_checks_results_inline_even_with_redis_configured(
    app, runner, pending, monkeypatch
):
    _, calls = pending
    app.config["REDIS_URL"] = "redis://unreachable:6379/0"
    monkeypatch.setattr(
        pipeline, "enqueue", lambda *args: pytest.fail("unexpected queued batch")
    )
    result = runner.invoke(args=["backfill-captions", "--limit", "2"])
    assert result.exit_code == 0
    assert len(calls) == 2


@pytest.mark.parametrize("limit", ["0", "-1", "41"])
def test_invalid_batch_limits_do_not_process(runner, pending, limit):
    _, calls = pending
    result = runner.invoke(args=["backfill-captions", "--limit", limit])
    assert result.exit_code == 2
    assert calls == []
