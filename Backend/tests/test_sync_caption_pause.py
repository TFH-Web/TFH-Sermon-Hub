# Tests for the paused-captions fields on YouTube sync reports. TFH-617
# The real pipeline runs here (test_youtube_import.py stubs its caption step), with YouTube faked and the network blocked.
import json

import pytest
import requests

from tests.test_captions import SECRETS
from tests.test_sync_runs import fake_redis, reload, run_worker  # noqa: F401 (fixtures)
from tests.test_youtube_import import FakeChannel, channel  # noqa: F401 (fixtures)
from tsh import caption_quota, captions, pipeline
from tsh.database import db
from tsh.models import Sermon, SyncRunState, UploadStatus
from tsh.youtube_import import ImportReport, import_channel


@pytest.fixture()
def no_network(monkeypatch):
    """Fail the test if any HTTP request is made."""
    monkeypatch.setattr(
        requests.Session, "request",
        lambda *args, **kwargs: pytest.fail("a request reached YouTube while captions were paused"),
    )


def imported(channel: FakeChannel) -> list[Sermon]:
    """The sermons the fake channel's videos became."""
    db.session.expire_all()
    return db.session.scalars(
        db.select(Sermon).where(Sermon.youtube_video_id.in_(list(channel.videos)))
    ).all()


def test_open_breaker_is_reported_and_run_still_succeeds(client, channel, no_network):
    """A saved quota block shows in the report; the sync itself still succeeds and sends no request."""
    caption_quota.open_breaker()
    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    assert res.json["state"] == "succeeded"
    report = res.json["report"]
    assert report["caption_pause"].startswith("YouTube quota exceeded")
    assert report["sermons_created"] > 0
    assert report["caption_deferred"] == report["sermons_created"]
    assert report["queue_failures"] == []
    sermons = imported(channel)
    assert len(sermons) == report["sermons_created"]
    assert all(s.status == UploadStatus.FAILED and s.processing_error.startswith(captions.QUOTA_PREFIX) for s in sermons)


def test_captions_off_is_reported(app, client, channel, no_network):
    """With CAPTIONS_ENABLED false the sermons are saved as drafts and the report says captions are off."""
    app.config["CAPTIONS_ENABLED"] = "false"
    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    assert res.json["state"] == "succeeded"
    report = res.json["report"]
    assert "CAPTIONS_ENABLED" in report["caption_pause"]
    assert report["caption_deferred"] == report["sermons_created"] > 0
    assert all(s.status == UploadStatus.DRAFT for s in imported(channel))


def test_expired_sign_in_is_reported_from_the_sermons(client, channel, monkeypatch):
    """A sign-in failure has no saved state, so the report takes it from the sermons that hit it."""
    def expired(video_id):
        raise captions.CaptionAuthError(captions.auth_message("invalid_grant"))

    monkeypatch.setattr(captions, "get_transcript", expired)
    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    report = res.json["report"]
    assert report["caption_pause"].startswith("YouTube sign-in expired, refresh the token")
    assert report["caption_deferred"] == report["sermons_created"] > 0
    assert [secret for secret in SECRETS if secret in json.dumps(report)] == []


def test_clean_sync_has_no_pause(client, channel, monkeypatch):
    """When captions download normally, the pause fields stay empty."""
    monkeypatch.setattr(pipeline, "fetch_transcript", lambda sermon: None)
    report = client.post("/api/import/youtube").json["report"]

    assert report["sermons_created"] > 0
    assert report["caption_pause"] is None
    assert report["caption_deferred"] == 0


def test_skip_processing_import_sets_no_pause_fields(app, channel):
    """Without processing no caption job is started, so nothing is deferred even while the block is open."""
    caption_quota.open_breaker()
    report = import_channel(process=False)

    assert report.sermons_created > 0
    assert report.caption_pause is None
    assert report.caption_deferred == 0


def test_redis_sync_reports_a_snapshot(client, channel, fake_redis):  # noqa: F811
    """With the worker the caption jobs have not run when the report is built, so only the saved block is known."""
    caption_quota.open_breaker()
    res = client.post("/api/import/youtube")
    assert res.status_code == 202
    run_id = res.json["runId"]
    assert reload(run_id).state == SyncRunState.QUEUED

    # The first burst runs the sync, which queues one job per new sermon; the second makes sure those have run too.
    run_worker(fake_redis)
    run_worker(fake_redis)

    run = reload(run_id)
    assert run.state == SyncRunState.SUCCEEDED
    assert run.report["caption_pause"].startswith("YouTube quota exceeded")
    assert run.report["caption_deferred"] == 0
    detail = client.get(f"/api/import/youtube/runs/{run_id}").json
    assert detail["report"]["caption_pause"] == run.report["caption_pause"]
    assert detail["report"]["caption_deferred"] == 0
    # The sermon jobs ran after the report was saved and each recorded the block on its own.
    sermons = imported(channel)
    assert len(sermons) == run.sermons_created
    assert all((s.processing_error or "").startswith(captions.QUOTA_PREFIX) for s in sermons)


def test_report_keys_are_stable(client, channel, monkeypatch):
    """Both keys are snake_case members of the report; the run list still leaves the report out."""
    empty = ImportReport().as_dict()
    assert empty["caption_pause"] is None
    assert empty["caption_deferred"] == 0

    monkeypatch.setattr(pipeline, "fetch_transcript", lambda sermon: None)
    run_id = client.post("/api/import/youtube").json["runId"]
    detail = client.get(f"/api/import/youtube/runs/{run_id}").json
    assert {"caption_pause", "caption_deferred"} <= set(detail["report"])
    listed = client.get("/api/import/youtube/runs").json
    assert "report" not in listed[0]
