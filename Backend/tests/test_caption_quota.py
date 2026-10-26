# Tests for the shared YouTube caption quota breaker. TFH-613
# HTTP is faked and the clock is controlled, so no test calls YouTube or waits for midnight.
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import fakeredis
import pytest
import requests
from flask_migrate import upgrade
from redis import Redis
from rq import Queue, SimpleWorker
from sqlalchemy.exc import OperationalError

from tests.test_captions import SECRETS, VIDEO_ID, VTT, response, track
from tsh import caption_quota, captions, create_app, pipeline
from tsh.caption_backfill import QUOTA_ERROR
from tsh.database import db
from tsh.models import CaptionQuota, Sermon, UploadStatus
from tsh.queue import QUEUE_NAME

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"

# 3:32 pm in Los Angeles during daylight time, and the midnight that follows it.
NOW = datetime(2026, 10, 19, 22, 32, tzinfo=UTC)
RESET = datetime(2026, 10, 20, 7, 0, tzinfo=UTC)


def utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=UTC)


@pytest.fixture()
def clock(monkeypatch):
    """Control what caption_quota thinks the time is."""
    state = SimpleNamespace(now=NOW)
    monkeypatch.setattr(caption_quota, "utcnow", lambda: state.now)
    return state


@pytest.fixture()
def configured(app):
    """Use fake OAuth credentials; the shared app fixture clears all real ones."""
    app.config.update(dict(zip(captions.OAUTH_SETTINGS, SECRETS[:3])))
    return app


@pytest.fixture()
def youtube(monkeypatch):
    """Fake the OAuth and caption endpoints and record every request.

    Set .failure to (status, reason) to make the caption list refuse; otherwise captions download.
    """
    state = SimpleNamespace(calls=[], failure=None)

    def request(session, method, url, **kwargs):
        state.calls.append(url)
        if url == captions.TOKEN_URI:
            return response(
                body={"access_token": SECRETS[3], "expires_in": 3600, "token_type": "Bearer"}
            )
        if state.failure:
            status, reason = state.failure
            return response(status, {"error": {"errors": [{"reason": reason}]}})
        if url == captions.API:
            return response(body={"items": [track("track")]})
        return response(content=VTT)

    monkeypatch.setattr(requests.Session, "request", request)
    return state


@pytest.fixture()
def sermon(app):
    """Use an existing draft sermon with a valid YouTube id and no storage keys."""
    sermon = db.session.scalar(db.select(Sermon).where(Sermon.status == UploadStatus.DRAFT))
    sermon.youtube_video_id = VIDEO_ID
    db.session.commit()
    return sermon


@pytest.mark.parametrize(
    "now,reset",
    [
        ("2026-10-19T22:32:00", "2026-10-20T07:00:00"),  # 3:32 pm PDT
        ("2026-10-20T06:59:59", "2026-10-20T07:00:00"),  # one second before midnight PDT
        ("2026-10-20T07:00:00", "2026-10-21T07:00:00"),  # exactly midnight: the next one, not now
        # Spring forward on 2026-03-08: midnight is still PST, the following midnight is PDT.
        ("2026-03-08T01:00:00", "2026-03-08T08:00:00"),  # Mar 7, 5 pm PST
        ("2026-03-08T08:00:00", "2026-03-09T07:00:00"),  # Mar 8 midnight PST, a 23 hour day
        ("2026-03-08T20:00:00", "2026-03-09T07:00:00"),  # Mar 8, 1 pm PDT
        # Fall back on 2026-11-01: midnight is still PDT, the following midnight is PST.
        ("2026-11-01T05:00:00", "2026-11-01T07:00:00"),  # Oct 31, 10 pm PDT
        ("2026-11-01T07:00:00", "2026-11-02T08:00:00"),  # Nov 1 midnight PDT, a 25 hour day
        ("2026-11-01T20:00:00", "2026-11-02T08:00:00"),  # Nov 1, noon PST
    ],
)
def test_reset_is_the_next_los_angeles_midnight(now, reset):
    """The reset is local midnight, including on the 23 and 25 hour days around daylight saving."""
    assert caption_quota.next_reset(utc(now)) == utc(reset)


@pytest.mark.parametrize("reason", sorted(captions.DAILY_QUOTA_REASONS))
def test_daily_quota_refusal_opens_breaker_and_stops_requests(
    configured, youtube, clock, reason
):
    """The first refusal opens the breaker; the next attempt sends nothing to YouTube."""
    youtube.failure = (403, reason)
    with pytest.raises(captions.CaptionQuotaError) as first:
        captions.get_transcript(VIDEO_ID)
    assert youtube.calls == [captions.TOKEN_URI, captions.API]
    assert str(first.value).startswith("YouTube quota exceeded")
    assert "2026-10-20 00:00 PDT" in str(first.value)
    assert all(secret not in str(first.value) for secret in SECRETS)
    assert db.session.get(CaptionQuota, 1).blocked_until == RESET.replace(tzinfo=None)

    with pytest.raises(captions.CaptionQuotaError) as second:
        captions.get_transcript(VIDEO_ID)
    assert youtube.calls == [captions.TOKEN_URI, captions.API]
    assert str(second.value) == str(first.value)


@pytest.mark.parametrize(
    "status,reason",
    [
        (429, "rateLimitExceeded"),
        (403, "userRateLimitExceeded"),
        (403, "forbidden"),
        (404, "notFound"),
    ],
)
def test_other_failures_do_not_open_breaker(configured, youtube, clock, status, reason):
    """Short rate limits, permission errors and missing videos must not block later captions."""
    youtube.failure = (status, reason)
    with pytest.raises(captions.CaptionError) as raised:
        captions.get_transcript(VIDEO_ID)
    assert not isinstance(raised.value, captions.CaptionQuotaError)
    assert caption_quota.blocked_until() is None


def test_requests_resume_exactly_at_reset(configured, youtube, clock):
    """Blocked until the reset moment, then the same call downloads captions again."""
    caption_quota.open_breaker()
    clock.now = RESET - timedelta(seconds=1)
    with pytest.raises(captions.CaptionQuotaError):
        captions.get_transcript(VIDEO_ID)
    assert youtube.calls == []

    clock.now = RESET
    assert caption_quota.blocked_until() is None
    assert captions.get_transcript(VIDEO_ID) == [
        {"start": 1.0, "end": 3.0, "text": "Hello church."}
    ]
    assert youtube.calls


def test_block_survives_a_restart(tmp_path, clock, monkeypatch):
    """A second app on the same database file, like a restarted worker, still sends no requests."""
    uri = f"sqlite:///{(tmp_path / 'restart.db').as_posix()}"
    settings = {"TESTING": True, "SQLALCHEMY_DATABASE_URI": uri, "REDIS_URL": ""}

    first = create_app(config_path="", settings=settings)
    with first.app_context():
        upgrade(directory=str(MIGRATIONS))
        assert caption_quota.open_breaker() == RESET
        db.session.remove()
        db.engine.dispose()

    monkeypatch.setattr(
        requests.Session,
        "request",
        lambda *args, **kwargs: pytest.fail("a blocked caption attempt reached YouTube"),
    )
    second = create_app(config_path="", settings=settings)
    with second.app_context():
        assert caption_quota.blocked_until() == RESET
        with pytest.raises(captions.CaptionQuotaError):
            captions.get_transcript(VIDEO_ID)
        db.session.remove()
        db.engine.dispose()


def test_failing_to_save_the_block_still_reports_quota(
    configured, youtube, clock, monkeypatch
):
    """A database error must not hide the quota message from the admin."""

    def broken_insert(*args, **kwargs):
        raise OperationalError("INSERT", {}, Exception("database is locked"))

    monkeypatch.setattr(caption_quota, "insert", broken_insert)
    youtube.failure = (403, "quotaExceeded")
    with pytest.raises(captions.CaptionQuotaError, match="2026-10-20 00:00 PDT"):
        captions.get_transcript(VIDEO_ID)
    assert caption_quota.blocked_until() is None


@pytest.mark.parametrize("queued", [False, True], ids=["inline", "queued"])
def test_quota_blocked_sermon_fails_with_reset_time_and_retries_after_it(
    app, configured, youtube, clock, sermon, monkeypatch, queued
):
    """Inline and RQ runs end FAILED, never stuck PROCESSING, and publish after the reset."""
    fake = fakeredis.FakeStrictRedis()
    if queued:
        app.config["REDIS_URL"] = "redis://fake:6379/0"
        monkeypatch.setattr(Redis, "from_url", lambda *args, **kwargs: fake)

    def run():
        pipeline.start_processing(sermon)
        if queued:
            SimpleWorker([Queue(QUEUE_NAME, connection=fake)], connection=fake).work(burst=True)
        db.session.expire_all()

    monkeypatch.setattr(pipeline, "embed_chunks", lambda s: None)
    youtube.failure = (403, "quotaExceeded")
    run()
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error.startswith(QUOTA_ERROR)
    assert "2026-10-20 00:00 PDT" in sermon.processing_error
    assert len(youtube.calls) == 2

    # Retrying while the breaker is open is allowed and still sends nothing.
    run()
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error.startswith(QUOTA_ERROR)
    assert len(youtube.calls) == 2

    clock.now = RESET
    youtube.failure = None
    run()
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.transcript == "Hello church."