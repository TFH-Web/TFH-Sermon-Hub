"""Summary origin is established by successful server writes, never client claims."""

import pytest
from sqlalchemy.exc import SQLAlchemyError

from tsh import pipeline
from tsh.database import db
from tsh.models import Sermon, SermonSummarySource, UploadStatus


@pytest.mark.parametrize(
    "origin, summary, expected",
    [
        (None, "New manual content", "manual"),
        (SermonSummarySource.MANUAL, "Edited manual content", "manual"),
        (SermonSummarySource.AI, "Edited generated content", "ai"),
        (None, None, None),
        (SermonSummarySource.MANUAL, "", None),
        (SermonSummarySource.AI, "  ", None),
    ],
)
def test_manual_summary_origin_persists_after_api_reload(
    app, client, origin, summary, expected
):
    sermon = db.session.get(Sermon, 1)
    sermon.summary_source = origin
    db.session.commit()
    response = client.patch("/api/sermons/1", json={"summary": summary})
    assert response.status_code == 200
    assert response.json["summarySource"] == expected
    db.session.remove()
    saved = client.get("/api/sermons/1").json
    assert saved["summary"] == summary
    assert saved["summarySource"] == expected


def test_metadata_edit_does_not_invent_origin_for_legacy_summary(app, client):
    sermon = db.session.get(Sermon, 1)
    sermon.summary = "Legacy content of unknown origin"
    db.session.commit()
    response = client.patch("/api/sermons/1", json={"title": "New title"})
    assert response.status_code == 200
    assert response.json["summarySource"] is None


def test_created_manual_summary_cannot_claim_ai_origin(app, client):
    response = client.post(
        "/api/sermons",
        json={
            "title": "Manually created",
            "youtubeVideoId": "abcdefghijk",
            "duration": 60,
            "date": "2026-10-25",
            "description": "Created by an admin",
            "speaker": {"id": 1},
            "summary": "A new manual summary",
            "summarySource": "ai",
        },
    )
    assert response.status_code == 201
    assert response.json["summarySource"] == "manual"


def test_successful_tracked_generation_marks_summary_as_ai(app, client):
    sermon = db.session.get(Sermon, 1)
    sermon.status = UploadStatus.PUBLISHED
    sermon.transcript = "A source transcript about grace."
    sermon.summary_source = SermonSummarySource.MANUAL
    db.session.commit()
    response = client.post("/api/sermons/1/regenerate-summary")
    assert response.status_code == 202
    saved = client.get("/api/sermons/1").json
    assert saved["summary"] == "Test summary."
    assert saved["summarySource"] == "ai"
    assert saved["summaryRegenState"] == "completed"


@pytest.mark.parametrize("failing_step", ["summarize_transcript", "save_ai_tags"])
def test_generation_failure_preserves_saved_origin_and_content(
    app, client, monkeypatch, failing_step
):
    sermon = db.session.get(Sermon, 1)
    sermon.status = UploadStatus.PUBLISHED
    sermon.transcript = "A source transcript about grace."
    sermon.summary = "Saved manual content"
    sermon.summary_source = SermonSummarySource.MANUAL
    db.session.commit()

    def fail_provider(*args, **kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(pipeline, failing_step, fail_provider)
    assert client.post("/api/sermons/1/regenerate-summary").status_code == 202
    saved = client.get("/api/sermons/1").json
    assert saved["summary"] == "Saved manual content"
    assert saved["summarySource"] == "manual"
    assert saved["summaryRegenState"] == "failed"


def test_rejected_or_failed_manual_save_preserves_origin(app, client, monkeypatch):
    sermon = db.session.get(Sermon, 1)
    sermon.summary = "Saved legacy content"
    db.session.commit()
    response = client.patch(
        "/api/sermons/1", json={"summary": "Must not save", "summarySource": "ai"}
    )
    assert response.status_code == 422

    def fail_commit():
        raise SQLAlchemyError("planned failure")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    assert (
        client.patch("/api/sermons/1", json={"summary": "Must roll back"}).status_code
        == 500
    )
    db.session.expire_all()
    saved = db.session.get(Sermon, 1)
    assert saved.summary == "Saved legacy content"
    assert saved.summary_source is None
