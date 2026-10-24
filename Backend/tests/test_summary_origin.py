import pytest

from tsh import pipeline
from tsh.database import db
from tsh.models import Sermon, SermonSummarySource, UploadStatus


def prepare_sermon(source):
    """Set up known saved content in the isolated test database."""
    sermon = db.session.get(Sermon, 1)
    sermon.summary = "Previously saved summary."
    sermon.summary_source = source
    sermon.transcript = "A transcript about grace."
    sermon.status = UploadStatus.PUBLISHED
    db.session.commit()
    return sermon.id


def reload_sermon(sermon_id):
    db.session.expire_all()
    return db.session.get(Sermon, sermon_id)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (SermonSummarySource.AI, "ai"),
        (SermonSummarySource.MANUAL, "manual"),
        (None, "manual"),
    ],
)
def test_manual_save_preserves_known_ai_origin(app, client, source, expected):
    sermon_id = prepare_sermon(source)

    response = client.patch(
        f"/api/sermons/{sermon_id}",
        json={"summary": "Updated by a staff member."},
    )

    assert response.status_code == 200
    assert response.json["summary"] == "Updated by a staff member."
    assert response.json["summarySource"] == expected

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Updated by a staff member."
    assert saved.summary_source.value == expected


def test_invalid_save_retains_previous_content_and_origin(app, client):
    sermon_id = prepare_sermon(SermonSummarySource.AI)

    response = client.patch(
        f"/api/sermons/{sermon_id}",
        json={"summary": None},
    )

    assert response.status_code == 422

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == SermonSummarySource.AI


def test_successful_regeneration_saves_ai_origin(app, client, monkeypatch):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)

    monkeypatch.setattr(
        pipeline,
        "summarize_transcript",
        lambda transcript: "New generated summary.",
    )
    monkeypatch.setattr(pipeline, "suggest_tags", lambda summary: [])

    response = client.post(
        f"/api/sermons/{sermon_id}/regenerate-summary",
    )

    assert response.status_code == 202

    saved = reload_sermon(sermon_id)
    assert saved.summary == "New generated summary."
    assert saved.summary_source == SermonSummarySource.AI


def test_generation_failure_retains_previous_content_and_origin(
    app, client, monkeypatch
):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)

    def fail_generation(transcript):
        raise RuntimeError("Test generation failure")

    monkeypatch.setattr(pipeline, "summarize_transcript", fail_generation)

    client.post(f"/api/sermons/{sermon_id}/regenerate-summary")

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == SermonSummarySource.MANUAL
    assert "Test generation failure" in saved.processing_error


def test_tagging_failure_rolls_back_new_summary_and_origin(
    app, client, monkeypatch
):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)

    monkeypatch.setattr(
        pipeline,
        "summarize_transcript",
        lambda transcript: "A summary that must not be saved.",
    )

    def fail_tags(summary):
        raise RuntimeError("Test tagging failure")

    monkeypatch.setattr(pipeline, "suggest_tags", fail_tags)

    client.post(f"/api/sermons/{sermon_id}/regenerate-summary")

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == SermonSummarySource.MANUAL
    assert "Test tagging failure" in saved.processing_error