# Tests for caption persistence, chunking handoff and inline or queued retries.
import fakeredis
import pytest
from redis import Redis
from rq import Queue, SimpleWorker

from tsh import captions, pipeline
from tsh.database import db
from tsh.models import Sermon, UploadStatus
from tsh.queue import QUEUE_NAME

SEGMENTS = [
    {"start": 1.25, "end": 3.5, "text": "Welcome to church."},
    {"start": 3.5, "end": 6.75, "text": "God is good."},
]


@pytest.fixture()
def sermon(app):
    """Use an existing draft sermon with a valid YouTube id and no storage keys."""
    sermon = db.session.scalar(db.select(Sermon).where(Sermon.status == UploadStatus.DRAFT))
    sermon.youtube_video_id = "F_OiCiZ3Y3Y"
    db.session.commit()
    return sermon


def test_caption_text_and_times_are_committed_before_chunking(sermon, monkeypatch):
    """Chunking receives clean persisted segments on the sermon, without a storage or audio key."""
    calls = []
    monkeypatch.setattr(captions, "get_transcript", lambda video_id: calls.append(video_id) or SEGMENTS)
    seen = []

    def chunk(s):
        db.session.expire_all()
        stored = db.session.get(Sermon, s.id)
        seen.append((stored.transcript, stored.transcript_segments))

    monkeypatch.setattr(pipeline, "embed_chunks", chunk)
    pipeline.start_processing(sermon)
    db.session.expire_all()
    assert calls == ["F_OiCiZ3Y3Y"]
    assert seen == [("Welcome to church. God is good.", SEGMENTS)]
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.storage_key is None
    assert sermon.audio_key is None


def test_caption_step_can_use_an_existing_youtube_link(sermon, monkeypatch):
    """A pre-import sermon can use its valid YouTube link when the saved id is absent."""
    sermon.youtube_video_id = None
    sermon.video_link = "https://youtu.be/F_OiCiZ3Y3Y"
    calls = []
    monkeypatch.setattr(captions, "get_transcript", lambda video_id: calls.append(video_id) or SEGMENTS)
    pipeline.start_processing(sermon)
    assert calls == ["F_OiCiZ3Y3Y"]
    assert sermon.transcript_segments == SEGMENTS


def test_invalid_video_link_fails_without_download(sermon, monkeypatch):
    """A sermon without a usable YouTube id fails with an actionable error."""
    sermon.youtube_video_id = None
    sermon.video_link = "https://example.com/video.mp4"
    monkeypatch.setattr(captions, "get_transcript", lambda *args: pytest.fail("unexpected download"))
    pipeline.start_processing(sermon)
    assert sermon.status == UploadStatus.FAILED
    assert "missing YouTube video id" in sermon.processing_error


@pytest.mark.parametrize("role", ["Admin", "Internal User"])
def test_transcript_endpoint_returns_saved_text_and_times(client, sermon, role):
    """Authorized readers receive the saved transcript and source times without a caption download."""
    sermon.transcript = "Welcome to church. God is good."
    sermon.transcript_segments = SEGMENTS
    db.session.commit()
    response = client.get(f"/api/sermons/{sermon.id}/transcript", headers={"X-Test-Roles": role})
    assert response.status_code == 200
    assert response.json == {"transcript": sermon.transcript, "segments": SEGMENTS}


def test_transcript_endpoint_before_captions_exist(client, sermon):
    """An unprocessed sermon returns no text and an empty segment list."""
    sermon.transcript = None
    sermon.transcript_segments = None
    db.session.commit()
    response = client.get(f"/api/sermons/{sermon.id}/transcript")
    assert response.status_code == 200
    assert response.json == {"transcript": None, "segments": []}


@pytest.mark.parametrize(("role", "status"), [("none", 401), ("Other", 403)])
def test_transcript_endpoint_requires_read_access(client, sermon, role, status):
    """Saved caption text and times use the same read permissions as the sermon."""
    response = client.get(f"/api/sermons/{sermon.id}/transcript", headers={"X-Test-Roles": role})
    assert response.status_code == status


def test_transcript_endpoint_missing_sermon(client):
    """Missing sermons return 404 instead of an empty transcript."""
    assert client.get("/api/sermons/999999/transcript").status_code == 404


@pytest.mark.parametrize("message", [
    "no usable captions; publish a caption track, then reprocess",
    "permission denied; authorize the TFH channel, then reprocess",
    "YouTube quota exceeded; wait for the daily quota reset, then reprocess",
    "invalid_grant: obtain a new TFH channel refresh token, then reprocess",
])
@pytest.mark.parametrize("queued", [False, True], ids=["inline", "queued"])
def test_caption_failure_preserves_old_data_and_reprocess_retries(app, client, sermon, monkeypatch, message, queued):
    """Caption failures preserve saved text and times, stop chunking, and recover through reprocess."""
    fake = fakeredis.FakeStrictRedis()
    if queued:
        app.config["REDIS_URL"] = "redis://fake:6379/0"
        monkeypatch.setattr(Redis, "from_url", lambda *args, **kwargs: fake)

    def drain():
        if queued:
            SimpleWorker([Queue(QUEUE_NAME, connection=fake)], connection=fake).work(burst=True)

    sermon.transcript = "An older transcript."
    sermon.transcript_segments = [{"start": 0.0, "end": 1.0, "text": "An older transcript."}]
    db.session.commit()
    chunks = []
    monkeypatch.setattr(pipeline, "embed_chunks", lambda s: chunks.append(s.transcript_segments))

    def fail(video_id):
        raise captions.CaptionError(message)

    monkeypatch.setattr(captions, "get_transcript", fail)
    pipeline.start_processing(sermon)
    drain()
    db.session.expire_all()
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error == "fetch_transcript: " + message
    assert sermon.transcript == "An older transcript."
    assert sermon.transcript_segments[0]["end"] == 1.0
    assert chunks == []

    monkeypatch.setattr(captions, "get_transcript", lambda video_id: SEGMENTS)
    result = client.post(f"/api/sermons/{sermon.id}/reprocess")
    assert result.status_code == 202
    if queued:
        assert result.json["status"] == "Processing"
    drain()
    db.session.expire_all()
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.transcript == "Welcome to church. God is good."
    assert sermon.transcript_segments == SEGMENTS
    assert chunks == [SEGMENTS]
