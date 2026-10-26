"""The "Regenerate with AI" request is tracked on the sermon, so it survives navigation and reloads."""

import json
from datetime import timedelta

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.orm import Session

from tests.test_ai_enrichment import NEW_TAG, fake_llm, patch_llm, published_sermon, reload
from tsh import llm, pipeline, views
from tsh.database import db
from tsh.models import Sermon, SummaryRegenState, Tag, TagSource, UploadStatus, utcnow
from tsh.schemas import sermon_schema

URL = "/api/sermons/{}/regenerate-summary"


@pytest.fixture()
def delayed(monkeypatch):
    """Hold queued jobs like a busy worker, so a test decides when each one runs."""
    jobs = []
    monkeypatch.setattr(views, "enqueue", lambda fn, *args: jobs.append((fn, args)))
    return jobs


def run(job):
    fn, args = job
    fn(*args)
    db.session.expire_all()


def post(client, sermon, **kwargs):
    return client.post(URL.format(sermon.id), **kwargs)


def test_new_sermon_starts_idle(app, client):
    sermon = published_sermon()

    body = client.get(f"/api/sermons/{sermon.id}").json

    assert body["summaryRegenState"] == "idle"
    assert body["summaryRegenError"] is None
    assert body["summaryRegenRequestedAt"] is None
    assert body["summaryRegenStartedAt"] is None
    assert body["summaryRegenFinishedAt"] is None


def test_delayed_worker_state_is_visible_from_any_page(app, client, monkeypatch, delayed):
    """Queued until the worker starts, then completed with the new summary, readable on a fresh request."""
    patch_llm(monkeypatch, fake_llm(tags=[NEW_TAG]))
    sermon = published_sermon()

    res = post(client, sermon)

    assert res.status_code == 202
    assert res.json["summaryRegenState"] == "queued"
    assert res.json["summaryRegenRequestedAt"] is not None
    assert res.json["summary"] == "Old summary."
    seen_later = client.get(f"/api/sermons/{sermon.id}").json
    assert seen_later["summaryRegenState"] == "queued"
    assert len(delayed) == 1

    run(delayed[0])

    done = client.get(f"/api/sermons/{sermon.id}").json
    assert done["summaryRegenState"] == "completed"
    assert done["summaryRegenError"] is None
    assert done["summaryRegenStartedAt"] is not None
    assert done["summaryRegenFinishedAt"] is not None
    assert done["summary"] == "A summary about grace."


def test_inline_mode_finishes_before_the_response(app, client, monkeypatch):
    patch_llm(monkeypatch, fake_llm())
    sermon = published_sermon()

    res = post(client, sermon)

    assert res.status_code == 202
    assert res.json["summaryRegenState"] == "completed"
    assert res.json["summary"] == "A summary about grace."


def test_worker_marks_running_while_it_works(app, client, monkeypatch, delayed):
    sermon = published_sermon()
    states = []

    def fake(prompt, system="", **kw):
        states.append(reload(sermon.id).summary_regen_state)
        return "A summary about grace."

    patch_llm(monkeypatch, fake)
    post(client, sermon)

    run(delayed[0])

    assert states[0] == SummaryRegenState.RUNNING


def test_provider_failure_is_saved_and_can_be_retried(app, client, monkeypatch, delayed):
    def broken(prompt, system="", **kw):
        raise llm.LLMError("model offline")

    patch_llm(monkeypatch, broken)
    sermon = published_sermon()
    post(client, sermon)

    run(delayed[0])

    failed = client.get(f"/api/sermons/{sermon.id}").json
    assert failed["summaryRegenState"] == "failed"
    assert "model offline" in failed["summaryRegenError"]
    assert not failed["summaryRegenError"].startswith("summarize_sermon:")
    assert failed["summaryRegenFinishedAt"] is not None
    assert failed["summary"] == "Old summary."

    patch_llm(monkeypatch, fake_llm())
    retry = post(client, sermon)

    assert retry.status_code == 202
    assert retry.json["summaryRegenState"] == "queued"
    assert retry.json["summaryRegenError"] is None
    assert retry.json["summaryRegenFinishedAt"] is None
    run(delayed[1])
    assert reload(sermon.id).summary == "A summary about grace."


def test_repeat_clicks_queue_one_job(app, client, delayed):
    sermon = published_sermon()

    first = post(client, sermon)
    second = post(client, sermon)

    assert first.status_code == 202
    assert second.status_code == 409
    assert second.json["error"] == "A summary is already being regenerated for this sermon"
    assert len(delayed) == 1


def test_new_request_is_allowed_after_completion(app, client, monkeypatch, delayed):
    patch_llm(monkeypatch, fake_llm())
    sermon = published_sermon()
    post(client, sermon)
    run(delayed[0])

    again = post(client, sermon)

    assert again.status_code == 202
    assert again.json["summaryRegenState"] == "queued"
    assert len(delayed) == 2


@pytest.mark.parametrize(("roles", "status_code"), [("none", 401), ("Internal User", 403)])
def test_rejected_request_leaves_state_idle(app, client, delayed, roles, status_code):
    sermon = published_sermon()

    res = post(client, sermon, headers={"X-Test-Roles": roles})

    assert res.status_code == status_code
    assert delayed == []
    assert reload(sermon.id).summary_regen_state == SummaryRegenState.IDLE


def test_unpublished_sermon_is_refused_and_stays_idle(app, client, delayed):
    sermon = published_sermon()
    sermon.status = UploadStatus.DRAFT
    db.session.commit()

    res = post(client, sermon)

    assert res.status_code == 409
    assert res.json["error"] == "Only published sermons can regenerate their summary"
    assert delayed == []
    assert reload(sermon.id).summary_regen_state == SummaryRegenState.IDLE


def test_fresh_running_request_blocks_a_new_one(app, client, delayed):
    sermon = published_sermon()
    sermon.summary_regen_state = SummaryRegenState.RUNNING
    sermon.summary_regen_run_id = "a" * 32
    sermon.summary_regen_started_at = utcnow() - timedelta(minutes=1)
    db.session.commit()

    res = post(client, sermon)

    assert res.status_code == 409
    assert delayed == []
    assert reload(sermon.id).summary_regen_run_id == "a" * 32


def test_stale_request_is_taken_over_and_the_old_job_does_nothing(app, client, monkeypatch, delayed):
    calls = []

    def fake(prompt, system="", **kw):
        calls.append(prompt)
        return "A summary about grace."

    patch_llm(monkeypatch, fake)
    sermon = published_sermon()
    post(client, sermon)
    old_job = delayed[0]
    stuck = reload(sermon.id)
    stuck.summary_regen_requested_at = utcnow() - pipeline.REGEN_STALE_AFTER - timedelta(minutes=1)
    db.session.commit()

    res = post(client, sermon)

    assert res.status_code == 202
    assert len(delayed) == 2

    run(old_job)

    assert calls == []
    assert reload(sermon.id).summary_regen_state == SummaryRegenState.QUEUED

    run(delayed[1])

    assert reload(sermon.id).summary_regen_state == SummaryRegenState.COMPLETED
    assert reload(sermon.id).summary == "A summary about grace."


def test_old_job_cannot_overwrite_the_state_of_a_newer_request(app, client, monkeypatch, delayed):
    """A job that is replaced while it is still writing must not mark the newer request finished."""
    sermon = published_sermon()

    def fake(prompt, system="", **kw):
        # Mid-run, the request is taken over by a newer one.
        row = reload(sermon.id)
        row.summary_regen_run_id = "b" * 32
        row.summary_regen_state = SummaryRegenState.QUEUED
        db.session.commit()
        return "A summary about grace."

    patch_llm(monkeypatch, fake)
    post(client, sermon)

    run(delayed[0])

    saved = reload(sermon.id)
    assert saved.summary_regen_run_id == "b" * 32
    assert saved.summary_regen_state == SummaryRegenState.QUEUED
    assert saved.summary_regen_finished_at is None


def replace_request_from_another_session(sermon_id: int) -> None:
    """Commit a newer result without refreshing the old worker's ORM identity map."""
    with Session(db.engine) as writer:
        newer = writer.get(Sermon, sermon_id)
        newer.summary_regen_run_id = "b" * 32
        newer.summary_regen_state = SummaryRegenState.COMPLETED
        newer.summary_regen_finished_at = utcnow()
        newer.summary = "Newer successfully completed summary."
        newer.processing_error = "newer request's processing note"
        newer.tags = [Tag(name="newer-result", source=TagSource.AI, sermons=[])]
        writer.commit()


@pytest.mark.parametrize("provider_fails", [False, True])
def test_replaced_worker_preserves_newer_content_tags_and_errors(
    app, client, monkeypatch, delayed, provider_fails
):
    sermon = published_sermon()

    def fake(prompt, system="", **kwargs):
        if kwargs.get("json_mode"):
            return json.dumps({"tags": ["superseded-suggestion"]})
        replace_request_from_another_session(sermon.id)
        if provider_fails:
            raise llm.LLMError("old request's provider failed")
        return "Old delayed summary must not replace the newer result."

    patch_llm(monkeypatch, fake)
    post(client, sermon)

    run(delayed[0])

    saved = reload(sermon.id)
    assert saved.summary_regen_run_id == "b" * 32
    assert saved.summary_regen_state == SummaryRegenState.COMPLETED
    assert saved.summary == "Newer successfully completed summary."
    assert saved.processing_error == "newer request's processing note"
    assert saved.summary_regen_error is None
    assert {tag.name for tag in saved.tags} == {"newer-result"}
    assert db.session.get(Tag, "superseded-suggestion") is None


def test_tracked_tagging_failure_rolls_back_summary_and_tag_rows(app, client, monkeypatch, delayed):
    sermon = published_sermon()
    original = Tag(name="kept-manual", source=TagSource.MANUAL, sermons=[])
    sermon.tags = [original]
    db.session.commit()
    save_tags = pipeline.save_ai_tags

    def failing_save(row, names):
        save_tags(row, names)
        raise RuntimeError("tag persistence failed")

    monkeypatch.setattr(pipeline, "save_ai_tags", failing_save)
    patch_llm(monkeypatch, fake_llm(tags=["failed-suggestion"]))
    post(client, sermon)

    run(delayed[0])

    saved = reload(sermon.id)
    assert saved.summary_regen_state == SummaryRegenState.FAILED
    assert saved.summary_regen_error == "tag persistence failed"
    assert saved.summary == "Old summary."
    assert {tag.name for tag in saved.tags} == {"kept-manual"}
    assert db.session.get(Tag, "failed-suggestion") is None


def test_completed_job_replay_does_not_generate_again(app, client, monkeypatch, delayed):
    calls = []
    provider = fake_llm()

    def fake(*args, **kwargs):
        calls.append(args)
        return provider(*args, **kwargs)

    patch_llm(monkeypatch, fake)
    sermon = published_sermon()
    post(client, sermon)
    run(delayed[0])
    calls_after_completion = len(calls)

    run(delayed[0])

    assert len(calls) == calls_after_completion
    assert reload(sermon.id).summary_regen_state == SummaryRegenState.COMPLETED


def test_unpublishing_during_generation_preserves_the_cleared_content(app, client, monkeypatch, delayed):
    sermon = published_sermon()

    def fake(prompt, system="", **kwargs):
        if kwargs.get("json_mode"):
            return '{"tags": []}'
        with Session(db.engine) as writer:
            changed = writer.get(Sermon, sermon.id)
            changed.status = UploadStatus.DRAFT
            changed.summary = None
            changed.tags = []
            writer.commit()
        return "This summary belongs to the old published source."

    patch_llm(monkeypatch, fake)
    post(client, sermon)

    run(delayed[0])

    saved = reload(sermon.id)
    assert saved.status == UploadStatus.DRAFT
    assert saved.summary is None
    assert saved.tags == []
    assert saved.summary_regen_state == SummaryRegenState.FAILED
    assert saved.summary_regen_error == "The sermon is no longer published"


def test_redis_down_releases_the_claim(app, client, monkeypatch):
    sermon = published_sermon()

    def broken(*args):
        raise RedisConnectionError("down")

    monkeypatch.setattr(views, "enqueue", broken)

    res = post(client, sermon)

    assert res.status_code == 503
    assert res.json["error"] == "The job queue is unavailable. Please try again later."
    saved = reload(sermon.id)
    assert saved.summary_regen_state == SummaryRegenState.IDLE
    assert saved.summary_regen_run_id is None

    queued = []
    monkeypatch.setattr(views, "enqueue", lambda fn, *args: queued.append(args))

    assert post(client, sermon).status_code == 202
    assert len(queued) == 1


def test_sermon_unpublished_before_the_worker_runs(app, client, monkeypatch, delayed):
    calls = []
    patch_llm(monkeypatch, lambda prompt, system="", **kw: calls.append(prompt) or "x")
    sermon = published_sermon()
    post(client, sermon)
    row = reload(sermon.id)
    row.status = UploadStatus.DRAFT
    db.session.commit()

    run(delayed[0])

    saved = reload(sermon.id)
    assert saved.summary_regen_state == SummaryRegenState.FAILED
    assert saved.summary_regen_error == "The sermon is no longer published"
    assert saved.summary == "Old summary."
    assert calls == []


def test_call_without_a_run_id_does_not_track_state(app, monkeypatch):
    """The job as it was before tracking still works and leaves the state alone."""
    patch_llm(monkeypatch, fake_llm())
    sermon = published_sermon()

    pipeline.regenerate_summary(sermon.id)

    saved = reload(sermon.id)
    assert saved.summary == "A summary about grace."
    assert saved.summary_regen_state == SummaryRegenState.IDLE
    assert saved.summary_regen_requested_at is None


def test_schema_ignores_regeneration_fields_sent_back(app, client):
    """The page may send a sermon back whole. The server-owned fields in it are dropped, not saved."""
    sermon = published_sermon()
    body = client.get(f"/api/sermons/{sermon.id}").json
    body.update(summaryRegenState="running", summaryRegenError="forged", summaryRegenRunId="x")

    loaded = sermon_schema.load(body)

    assert loaded.summary_regen_state == SummaryRegenState.IDLE
    assert loaded.summary_regen_error is None
