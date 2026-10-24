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


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (SermonSummarySource.AI, "ai"),
        (SermonSummarySource.MANUAL, "manual"),
        (None, None),
    ],
)
def test_sermon_responses_expose_summary_origin(app, client, source, expected):
    """Every way of reading a sermon reports the saved origin; an older summary with no origin stays null."""
    sermon_id = prepare_sermon(source)

    detail = client.get(f"/api/sermons/{sermon_id}")
    assert detail.json["summarySource"] == expected

    listed = client.get("/api/sermons")
    listed_sermon = next(s for s in listed.json if s["id"] == sermon_id)
    assert listed_sermon["summarySource"] == expected

    page = client.get("/api/sermons?page=1&pageSize=10")
    paged_sermon = next(s for s in page.json["items"] if s["id"] == sermon_id)
    assert paged_sermon["summarySource"] == expected


@pytest.mark.parametrize(
    "source", [SermonSummarySource.AI, SermonSummarySource.MANUAL, None]
)
def test_tag_only_save_keeps_summary_and_origin(app, client, source):
    sermon_id = prepare_sermon(source)

    response = client.patch(
        f"/api/sermons/{sermon_id}",
        json={"tags": [{"name": "faith"}]},
    )

    assert response.status_code == 200

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == source


# A save that is half applied would show on the older summary: valid text would flip its origin to manual.
@pytest.mark.parametrize("source", [SermonSummarySource.AI, None])
def test_save_with_an_invalid_field_retains_summary_and_origin(app, client, source):
    sermon_id = prepare_sermon(source)

    response = client.patch(
        f"/api/sermons/{sermon_id}",
        json={"summary": "New text", "tags": [{"name": "no-such-tag"}]},
    )

    assert response.status_code == 422
    assert "tags" in response.json["errors"]

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == source


@pytest.mark.parametrize(
    "source", [SermonSummarySource.AI, SermonSummarySource.MANUAL, None]
)
def test_regeneration_marks_ai_from_any_prior_origin(
    app, client, monkeypatch, source
):
    sermon_id = prepare_sermon(source)

    monkeypatch.setattr(
        pipeline,
        "summarize_transcript",
        lambda transcript: "New generated summary.",
    )
    monkeypatch.setattr(pipeline, "suggest_tags", lambda summary: [])

    response = client.post(f"/api/sermons/{sermon_id}/regenerate-summary")

    assert response.status_code == 202

    saved = reload_sermon(sermon_id)
    assert saved.summary == "New generated summary."
    assert saved.summary_source == SermonSummarySource.AI


def test_regeneration_of_an_unpublished_sermon_retains_content_and_origin(
    app, client, monkeypatch
):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)
    sermon = db.session.get(Sermon, sermon_id)
    sermon.status = UploadStatus.DRAFT
    db.session.commit()

    # Would replace the summary if the request were not refused.
    monkeypatch.setattr(
        pipeline,
        "summarize_transcript",
        lambda transcript: "Should not be saved.",
    )
    monkeypatch.setattr(pipeline, "suggest_tags", lambda summary: [])

    response = client.post(f"/api/sermons/{sermon_id}/regenerate-summary")

    assert response.status_code == 409

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == SermonSummarySource.MANUAL


def test_regeneration_without_a_transcript_retains_content_and_origin(
    app, client, monkeypatch
):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)
    sermon = db.session.get(Sermon, sermon_id)
    sermon.transcript = None
    db.session.commit()

    # Would replace the summary if the step ran without a transcript.
    monkeypatch.setattr(
        pipeline,
        "summarize_transcript",
        lambda transcript: "Should not be saved.",
    )
    monkeypatch.setattr(pipeline, "suggest_tags", lambda summary: [])

    response = client.post(f"/api/sermons/{sermon_id}/regenerate-summary")

    assert response.status_code == 202

    saved = reload_sermon(sermon_id)
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == SermonSummarySource.MANUAL


@pytest.fixture()
def reprocess_without_captions(monkeypatch):
    """Reprocessing also runs the transcript and embedding steps; neither is under test here."""
    monkeypatch.setattr(pipeline, "fetch_transcript", lambda sermon: None)
    monkeypatch.setattr(pipeline, "embed_chunks", lambda sermon: None)


def test_reprocess_pairs_the_new_summary_with_ai_origin(
    app, client, monkeypatch, reprocess_without_captions
):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)

    monkeypatch.setattr(
        pipeline,
        "summarize_transcript",
        lambda transcript: "New generated summary.",
    )
    monkeypatch.setattr(pipeline, "suggest_tags", lambda summary: [])

    response = client.post(f"/api/sermons/{sermon_id}/reprocess")

    assert response.status_code == 202

    saved = reload_sermon(sermon_id)
    assert saved.summary == "New generated summary."
    assert saved.summary_source == SermonSummarySource.AI


def test_reprocess_summary_failure_retains_content_and_origin(
    app, client, monkeypatch, reprocess_without_captions
):
    sermon_id = prepare_sermon(SermonSummarySource.MANUAL)

    def fail_generation(transcript):
        raise RuntimeError("Test generation failure")

    monkeypatch.setattr(pipeline, "summarize_transcript", fail_generation)

    response = client.post(f"/api/sermons/{sermon_id}/reprocess")

    assert response.status_code == 202

    # The summary is best effort, so the sermon is still published.
    saved = reload_sermon(sermon_id)
    assert saved.status == UploadStatus.PUBLISHED
    assert saved.summary == "Previously saved summary."
    assert saved.summary_source == SermonSummarySource.MANUAL
    assert "Test generation failure" in saved.processing_error