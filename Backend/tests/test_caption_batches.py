# Tests for caption batches (backfill-captions) over mocked YouTube HTTP and a controlled clock. TFH-617
# One download at a time is covered in test_captions.py and test_caption_quota.py; these run whole batches.
from datetime import timedelta
from types import SimpleNamespace

import pytest
import requests

from tests.test_caption_quota import RESET, clock, configured  # noqa: F401 (fixtures)
from tests.test_captions import SECRETS, VTT, response, track
from tsh import caption_quota, captions, pipeline
from tsh.caption_backfill import QUOTA_ERROR, backfill_captions_command
from tsh.database import db
from tsh.models import CaptionQuota, Sermon, UploadStatus


@pytest.fixture()
def drafts(app, configured, monkeypatch):  # noqa: F811
    """Every seeded sermon as a draft with a valid video id, no transcript and no error."""
    sermons = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).all()
    for index, sermon in enumerate(sermons):
        sermon.youtube_video_id = f"video{index:06d}"
        sermon.status = UploadStatus.DRAFT
        sermon.transcript = None
        sermon.transcript_segments = None
        sermon.processing_error = None
    db.session.commit()
    # The batch tests are about captions, not chunking.
    monkeypatch.setattr(pipeline, "embed_chunks", lambda sermon: None)
    assert len(sermons) >= 4, "the batch tests need a few sermons to page through"
    return sermons


@pytest.fixture()
def http(monkeypatch):
    """Fake the OAuth and caption endpoints and record every request as (url, videoId).

    Set refusal to (status, reason) to refuse caption lists from the refuse_from-th attempt on (1 = every one).
    Set token_error to make the token exchange answer invalid_grant, with the fake secrets in Google's text.
    """
    state = SimpleNamespace(calls=[], attempts=0, refusal=None, refuse_from=1, token_error=False)

    def request(session, method, url, **kwargs):
        state.calls.append((url, (kwargs.get("params") or {}).get("videoId")))
        if url == captions.TOKEN_URI:
            if state.token_error:
                return response(400, {"error": "invalid_grant", "error_description": " ".join(SECRETS)})
            return response(body={"access_token": SECRETS[3], "expires_in": 3600, "token_type": "Bearer"})
        if url == captions.API:
            state.attempts += 1
            if state.refusal and state.attempts >= state.refuse_from:
                status, reason = state.refusal
                return response(status, {"error": {"message": " ".join(SECRETS), "errors": [{"reason": reason}]}})
            return response(body={"items": [track("track")]})
        return response(content=VTT)

    monkeypatch.setattr(requests.Session, "request", request)
    return state


def attempted(http) -> list[str]:
    """The video ids that reached YouTube's caption list, one per sermon attempt."""
    return [video_id for url, video_id in http.calls if url == captions.API]


def run(runner, *args):
    return runner.invoke(args=["backfill-captions", *args])


def snapshot() -> list[tuple]:
    """Every sermon's status, error and transcript as saved, to prove a run changed nothing."""
    db.session.expire_all()
    return [
        (s.id, s.status, s.processing_error, s.transcript)
        for s in db.session.scalars(db.select(Sermon).order_by(Sermon.id))
    ]


def leaked(*texts: str) -> list[str]:
    return [secret for secret in SECRETS if any(secret in text for text in texts)]


def test_limit_bounds_attempts_and_rerun_resumes(runner, drafts, http, clock):  # noqa: F811
    """Each run attempts at most --limit sermons, and the next run continues with different ones."""
    first = run(runner, "--limit", "2")
    assert first.exit_code == 0
    assert len(attempted(http)) == 2
    assert f"remaining: {len(drafts) - 2}" in first.output
    assert "Limit reached" in first.output
    assert "not a daily allowance" in first.output

    second = run(runner, "--limit", "2")
    assert second.exit_code == 0
    tried = attempted(http)
    assert len(tried) == len(set(tried)) == 4
    db.session.expire_all()
    assert sum(1 for sermon in drafts if sermon.transcript == "Hello church.") == 4


def test_quota_refusal_mid_batch_opens_breaker_and_stops(runner, drafts, http, clock):  # noqa: F811
    """YouTube refusing the second download stops the batch, saves the block and marks that sermon retryable."""
    http.refusal, http.refuse_from = (403, "quotaExceeded"), 2
    result = run(runner, "--limit", "4")

    assert result.exit_code == 0
    assert "Stopped: daily YouTube quota exhausted" in result.output
    assert "attempted: 2; succeeded: 1; failed: 1" in result.output
    assert len(attempted(http)) == 2
    db.session.expire_all()
    assert db.session.get(CaptionQuota, 1).blocked_until == RESET.replace(tzinfo=None)
    failed = db.session.scalar(db.select(Sermon).where(Sermon.status == UploadStatus.FAILED))
    assert failed.processing_error.startswith(QUOTA_ERROR)
    assert "2026-10-20 00:00 PDT" in failed.processing_error
    assert leaked(result.output, failed.processing_error) == []


def test_rerun_while_blocked_sends_nothing_then_resumes_after_reset(runner, drafts, http, clock):  # noqa: F811
    """Until the reset a rerun only pauses; at the reset the quota-failed sermon and the rest are finished."""
    http.refusal, http.refuse_from = (403, "quotaExceeded"), 2
    run(runner, "--limit", "4")
    failed_id = db.session.scalar(db.select(Sermon.id).where(Sermon.status == UploadStatus.FAILED))
    calls_before = len(http.calls)
    saved = snapshot()

    clock.now = RESET - timedelta(seconds=1)
    blocked = run(runner, "--limit", "4")
    assert blocked.exit_code == 0
    assert "Paused:" in blocked.output
    assert len(http.calls) == calls_before
    assert snapshot() == saved

    clock.now = RESET
    http.refusal = None
    resumed = run(runner, "--limit", "40")
    assert resumed.exit_code == 0
    assert "Paused" not in resumed.output
    db.session.expire_all()
    assert db.session.get(Sermon, failed_id).transcript == "Hello church."
    assert all(sermon.transcript == "Hello church." for sermon in drafts)
    assert not any(sermon.status == UploadStatus.PROCESSING for sermon in drafts)


def test_breaker_open_at_start_makes_no_requests(runner, drafts, http, clock):  # noqa: F811
    """With the block already saved, a dry run warns and a real run pauses without touching any sermon."""
    caption_quota.open_breaker()
    saved = snapshot()

    dry = run(runner, "--dry-run", "--limit", "2")
    assert dry.exit_code == 0
    assert "Note: YouTube quota exceeded" in dry.output

    real = run(runner, "--limit", "2")
    assert real.exit_code == 0
    assert "Paused: YouTube quota exceeded" in real.output
    assert f"attempted: 0; succeeded: 0; failed: 0; remaining: {len(drafts)}" in real.output
    assert http.calls == []
    assert snapshot() == saved


def test_captions_off_makes_no_requests_in_a_batch(app, runner, drafts, http):
    """With CAPTIONS_ENABLED false the batch refuses to run and the dry run still lists sermons."""
    app.config["CAPTIONS_ENABLED"] = "false"
    saved = snapshot()

    real = run(runner, "--limit", "2")
    assert real.exit_code == 1
    assert "Captions are turned off" in real.output

    dry = run(runner, "--dry-run", "--limit", "2")
    assert dry.exit_code == 0
    assert http.calls == []
    assert snapshot() == saved


def test_invalid_grant_stops_after_one_attempt(runner, drafts, http, clock):  # noqa: F811
    """A revoked refresh token stops the batch at the first sermon, with a safe message and no quota block."""
    http.token_error = True
    result = run(runner, "--limit", "4")

    assert result.exit_code == 1
    assert "YouTube sign-in expired, refresh the token (invalid_grant)" in result.output
    assert "Stopped: fix the channel OAuth credentials" in result.output
    assert f"attempted: 1; succeeded: 0; failed: 1; remaining: {len(drafts) - 1}" in result.output
    assert all(url == captions.TOKEN_URI for url, _ in http.calls)
    assert caption_quota.blocked_until() is None
    db.session.expire_all()
    errors = [sermon.processing_error or "" for sermon in drafts]
    assert leaked(result.output, *errors) == []


def test_permission_denied_stops_after_one_attempt_without_opening_breaker(runner, drafts, http, clock):  # noqa: F811
    """A refused request on a working sign-in stops the batch and points at permissions, not the token."""
    http.refusal = (403, "forbidden")
    result = run(runner, "--limit", "4")

    assert result.exit_code == 1
    assert "permission denied" in result.output
    assert "sign-in expired" not in result.output
    assert len(attempted(http)) == 1
    assert caption_quota.blocked_until() is None
    assert leaked(result.output) == []


def test_retryable_states_after_failures(runner, drafts, http, clock):  # noqa: F811
    """Quota failures are picked up again by a plain run; sign-in failures wait for --failed-only."""
    quota_failed, auth_failed = drafts[0], drafts[1]
    quota_failed.status = UploadStatus.FAILED
    quota_failed.processing_error = QUOTA_ERROR + "; no caption requests are sent until tomorrow, then reprocess."
    auth_failed.status = UploadStatus.FAILED
    auth_failed.processing_error = "fetch_transcript: " + captions.auth_message("invalid_grant")
    db.session.commit()
    quota_id, auth_id = quota_failed.youtube_video_id, auth_failed.youtube_video_id

    plain = run(runner, "--limit", "40")
    assert plain.exit_code == 0
    assert quota_id in attempted(http)
    assert auth_id not in attempted(http)

    retried = run(runner, "--failed-only", "--limit", "40")
    assert retried.exit_code == 0
    assert attempted(http)[-1] == auth_id
    db.session.expire_all()
    assert not any(sermon.status == UploadStatus.PROCESSING for sermon in drafts)
    assert all(sermon.transcript == "Hello church." for sermon in drafts)


def test_limit_option_bounds(runner, drafts):
    """--limit defaults to 35 and tops out at 40 (0, -1 and 41 are rejected in test_caption_backfill.py)."""
    option = next(param for param in backfill_captions_command.params if param.name == "limit")
    assert option.default == 35
    assert (option.type.min, option.type.max) == (1, 40)
    assert run(runner, "--dry-run", "--limit", "40").exit_code == 0


def test_pause_reason_priority(app, clock):  # noqa: F811
    """Nothing is paused by default; an open breaker or the off switch says why, and off wins."""
    assert captions.pause_reason() is None

    caption_quota.open_breaker()
    assert captions.pause_reason().startswith("YouTube quota exceeded")
    assert "2026-10-20 00:00 PDT" in captions.pause_reason()

    app.config["CAPTIONS_ENABLED"] = "false"
    assert captions.pause_reason() == captions.DISABLED_MESSAGE


def test_pause_prefixes_match_what_the_pipeline_saves(app, drafts, http, clock):  # noqa: F811
    """The backfill and the sync report recognise pauses by prefix, so the pipeline's wording must keep matching."""
    http.token_error = True
    pipeline.process_sermon(drafts[0].id)
    db.session.expire_all()
    assert drafts[0].processing_error.startswith(captions.AUTH_PREFIX)

    http.token_error = False
    app.config["CAPTIONS_ENABLED"] = "false"
    pipeline.process_sermon(drafts[1].id)
    db.session.expire_all()
    assert drafts[1].processing_error.startswith(captions.DISABLED_PREFIX)

    app.config["CAPTIONS_ENABLED"] = "true"
    caption_quota.open_breaker()
    calls_before = len(http.calls)
    pipeline.process_sermon(drafts[2].id)
    db.session.expire_all()
    assert drafts[2].processing_error.startswith(captions.QUOTA_PREFIX)
    assert len(http.calls) == calls_before
