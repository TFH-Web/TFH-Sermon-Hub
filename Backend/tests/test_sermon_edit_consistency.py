"""API edits/deletion must preserve or invalidate real sqlite-vec rows atomically."""

from datetime import datetime
from hashlib import sha256

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import SQLAlchemyError

from tsh import pipeline
from tsh.database import db
from tsh.models import (
    Sermon,
    SermonChunk,
    SermonChunkEmbedding,
    SermonSummarySource,
    SummaryRegenState,
    Tag,
    TagSource,
    UploadStatus,
    sermon_tag_m2m,
)
from tsh.retrieval import retrieve_chunks

OLD_ID = "JQSUGFQO5FU"
OTHER_ID = "F_OiCiZ3Y3Y"
NEW_ID = "abcdefghijk"


def vector_rows():
    # Never join through chunks here: that would conceal orphaned vec0 records.
    rows = db.session.execute(
        text(
            "SELECT sermon_chunk_id, embedding FROM sermon_chunk_embedding ORDER BY sermon_chunk_id"
        )
    )
    return [(row[0], sha256(row[1]).hexdigest()) for row in rows]


def snapshot(sermon_id):
    db.session.expire_all()
    sermon = db.session.get(Sermon, sermon_id)
    return {
        "title": sermon.title,
        "date": sermon.date,
        "duration": sermon.duration,
        "description": sermon.description,
        "video": sermon.video_link,
        "video_id": sermon.youtube_video_id,
        "summary": sermon.summary,
        "summary_source": sermon.summary_source,
        "transcript": sermon.transcript,
        "segments": sermon.transcript_segments,
        "status": sermon.status,
        "error": sermon.processing_error,
        "processed_at": sermon.processed_at,
        "storage": sermon.storage_key,
        "audio": sermon.audio_key,
        "speaker": sermon.speaker_id,
        "series": sermon.series_id,
        "tags": sorted(tag.name for tag in sermon.tags),
        "regen": sermon.summary_regen_state,
        "regen_id": sermon.summary_regen_run_id,
        "chunks": list(
            db.session.scalars(
                select(SermonChunk.id).where(SermonChunk.sermon_id == sermon_id)
            )
        ),
        "vectors": vector_rows(),
    }


@pytest.fixture
def indexed(app):
    manual = Tag(name="manual-539", source=TagSource.MANUAL, sermons=[])
    generated = Tag(name="generated-539", source=TagSource.AI, sermons=[])
    db.session.add_all([manual, generated])
    for sermon_id, video_id in ((1, OLD_ID), (2, OTHER_ID)):
        sermon = db.session.get(Sermon, sermon_id)
        sermon.video_link = f"https://www.youtube.com/watch?v={video_id}"
        sermon.youtube_video_id = video_id
        sermon.status = UploadStatus.PUBLISHED
        sermon.summary = f"Saved summary {sermon_id}."
        sermon.summary_source = SermonSummarySource.AI
        sermon.transcript = f"Saved source {sermon_id}."
        sermon.transcript_segments = [
            {"start": 10.0, "end": 20.0, "text": sermon.transcript}
        ]
        sermon.tags = [manual, generated]
        sermon.storage_key = "saved-video"
        sermon.audio_key = "saved-audio"
        sermon.processed_at = datetime(2026, 10, 20)
        sermon.summary_regen_state = SummaryRegenState.COMPLETED
        sermon.summary_regen_run_id = f"completed-{sermon_id}"
        db.session.commit()
        pipeline.embed_chunks(sermon)
    assert len(vector_rows()) == 2
    return 1, 2


def test_metadata_and_manual_summary_patch_persist_without_replacing_evidence(
    client, indexed
):
    target, other = indexed
    before = snapshot(target)
    other_before = snapshot(other)
    payload = {
        "title": "Edited title",
        "date": "2030-01-01",
        "duration": 333,
        "description": "Edited description",
        "summary": "A manual summary.",
    }
    response = client.patch(f"/api/sermons/{target}", json=payload)
    assert response.status_code == 200
    for key, value in payload.items():
        assert response.json[key] == value
    assert client.get(f"/api/sermons/{target}").json["summary"] == payload["summary"]
    assert response.json["summarySource"] == "ai"
    after = snapshot(target)
    for key in (
        "transcript",
        "segments",
        "chunks",
        "vectors",
        "tags",
        "processed_at",
        "status",
    ):
        assert after[key] == before[key]
    assert snapshot(other) == other_before


def test_same_video_canonicalization_preserves_existing_derived_records(
    client, indexed
):
    target, _ = indexed
    before = snapshot(target)
    response = client.patch(
        f"/api/sermons/{target}", json={"videoLink": f"https://youtu.be/{OLD_ID}?t=10"}
    )
    assert response.status_code == 200
    assert response.json["summarySource"] == "ai"
    assert snapshot(target) == before


def test_replacing_video_clears_only_its_evidence_and_requires_explicit_reprocessing(
    client, indexed
):
    target, other = indexed
    target_chunks = snapshot(target)["chunks"]
    other_before = snapshot(other)
    response = client.patch(
        f"/api/sermons/{target}", json={"videoLink": f"https://youtu.be/{NEW_ID}"}
    )
    assert response.json["summarySource"] is None
    assert response.status_code == 200
    assert response.json["videoLink"] == f"https://www.youtube.com/watch?v={NEW_ID}"
    assert response.json["youtubeVideoId"] == NEW_ID
    for field in (
        "transcript",
        "transcriptSegments",
        "summary",
        "processedAt",
        "storageKey",
        "audioKey",
    ):
        assert response.json[field] is None
    assert response.json["status"] == "Draft"
    assert response.json["summaryRegenState"] == "idle"
    assert [tag["name"] for tag in response.json["tags"]] == ["manual-539"]
    assert not set(target_chunks).intersection(row[0] for row in vector_rows())
    assert not db.session.scalar(
        select(SermonChunk.id).where(SermonChunk.sermon_id == target)
    )
    assert target not in {hit.sermon_id for hit in retrieve_chunks("Saved source")}
    # The one changed global vector list is checked separately from the other record.
    other_after = snapshot(other)
    assert other_after.pop("vectors") == [
        row for row in other_before.pop("vectors") if row[0] not in target_chunks
    ]
    assert other_after == other_before
    assert db.session.get(Tag, "generated-539") is not None


@pytest.mark.parametrize("processed", [True, False])
def test_api_delete_removes_vec0_rows_without_touching_other_sermons(
    client, indexed, processed
):
    target, other = indexed
    target_chunks = snapshot(target)["chunks"]
    if not processed:
        db.session.execute(
            delete(SermonChunkEmbedding)
            .where(SermonChunkEmbedding.sermon_chunk_id.in_(target_chunks))
            .execution_options(synchronize_session=False)
        )
        db.session.execute(delete(SermonChunk).where(SermonChunk.sermon_id == target))
        db.session.get(Sermon, target).status = UploadStatus.DRAFT
        db.session.commit()
    other_before = snapshot(other)
    response = client.delete(f"/api/sermons/{target}")
    assert response.status_code == 204
    assert db.session.get(Sermon, target) is None
    assert client.get(f"/api/sermons/{target}").status_code == 404
    assert not set(target_chunks).intersection(row[0] for row in vector_rows())
    assert not db.session.scalar(
        select(sermon_tag_m2m.c.sermon_id).where(sermon_tag_m2m.c.sermon_id == target)
    )
    assert target not in {hit.sermon_id for hit in retrieve_chunks("Saved source")}
    after = snapshot(other)
    assert after.pop("vectors") == [
        row for row in other_before.pop("vectors") if row[0] not in target_chunks
    ]
    assert after == other_before


@pytest.mark.parametrize(
    "payload",
    [
        {"transcript": "Untimed replacement"},
        {"transcriptSegments": []},
        {"status": "Published"},
        {"processingError": "forged"},
        {"processedAt": "2030-01-01T00:00:00"},
        {"storageKey": "forged"},
        {"audioKey": "forged"},
        {"summaryRegenState": "completed"},
        {"summaryRegenRunId": "forged"},
        {"summarySource": "ai"},
        {"date": "not-a-date"},
        {"duration": -1},
        {"title": "  "},
        {"description": "  "},
        {"unexpected": True},
        {"videoLink": f"https://youtu.be/{NEW_ID}", "summary": "Must not partly save"},
    ],
)
def test_rejected_patch_does_not_save_other_valid_fields(client, indexed, payload):
    target, _ = indexed
    before = snapshot(target)
    response = client.patch(
        f"/api/sermons/{target}", json={"title": "Must not save", **payload}
    )
    assert response.status_code == 422
    assert response.is_json
    assert snapshot(target) == before


@pytest.mark.parametrize("state", ["processing", "queued", "running"])
@pytest.mark.parametrize(
    "payload", [{"summary": "A manual edit"}, {"youtubeVideoId": NEW_ID}]
)
def test_active_worker_rejects_source_or_summary_changes_but_allows_metadata(
    client, indexed, state, payload
):
    target, _ = indexed
    sermon = db.session.get(Sermon, target)
    if state == "processing":
        sermon.status = UploadStatus.PROCESSING
    else:
        sermon.summary_regen_state = SummaryRegenState(state)
    db.session.commit()
    before = snapshot(target)
    response = client.patch(f"/api/sermons/{target}", json=payload)
    assert response.status_code == 409
    assert response.json["error"] and response.json["message"]
    assert snapshot(target) == before
    assert (
        client.patch(
            f"/api/sermons/{target}", json={"title": "Metadata only"}
        ).status_code
        == 200
    )
    assert snapshot(target)["vectors"] == before["vectors"]


@pytest.mark.parametrize("operation", ["delete", "replace"])
def test_database_failure_rolls_back_vectors_and_record_changes(
    client, indexed, monkeypatch, operation
):
    target, _ = indexed
    before = snapshot(target)

    def fail_commit():
        raise SQLAlchemyError("planned transaction failure")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    response = (
        client.delete(f"/api/sermons/{target}")
        if operation == "delete"
        else client.patch(
            f"/api/sermons/{target}",
            json={"title": "Must roll back", "youtubeVideoId": NEW_ID},
        )
    )
    assert response.status_code == 500
    assert snapshot(target) == before


@pytest.mark.parametrize(
    "roles, expected",
    [("none", 401), ("Internal User", 403), ("InternalUser", 403), ("Nobody", 403)],
)
def test_non_admins_cannot_edit_or_delete_indexed_content(
    client, indexed, roles, expected
):
    target, _ = indexed
    before = snapshot(target)
    headers = {"X-Test-Roles": roles}
    assert (
        client.patch(
            f"/api/sermons/{target}", json={"title": "Denied"}, headers=headers
        ).status_code
        == expected
    )
    assert (
        client.delete(f"/api/sermons/{target}", headers=headers).status_code == expected
    )
    assert snapshot(target) == before


def test_missing_sermons_return_json_not_found(client):
    for response in (
        client.patch("/api/sermons/999999", json={"title": "Missing"}),
        client.delete("/api/sermons/999999"),
    ):
        assert response.status_code == 404
        assert response.is_json and response.json["message"]
