# Tests that caption reprocessing is deterministic and that failures leave no half-replaced chunks.
from types import SimpleNamespace

import pytest
from flask import Flask

from tsh import embeddings, pipeline
from tsh.database import db
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding, UploadStatus

OLD = [
    {"start": 0.0, "end": 4.0, "text": "Grace and peace to you."},
    {"start": 4.0, "end": 9.0, "text": "Turn with me to Romans six."},
]
NEW = [
    {"start": 0.0, "end": 4.0, "text": "Grace and peace to you."},
    {"start": 4.0, "end": 9.0, "text": "Open your Bibles to Ephesians two."},
]


@pytest.fixture(autouse=True)
def one_chunk_per_segment(monkeypatch):
    """Make each test segment its own chunk, so a caption change touches exactly one chunk."""
    monkeypatch.setattr("tsh.embeddings.CHUNK_SIZE_MAX", 6)
    monkeypatch.setattr("tsh.embeddings.CHUNK_OVERLAP_PERCENT_MIN", 0)


def two_sermons() -> tuple[Sermon, Sermon]:
    first, second = db.session.scalars(db.select(Sermon).order_by(Sermon.id).limit(2)).all()
    return first, second


def snapshot(sermon: Sermon) -> list[tuple]:
    """Return every chunk of the sermon with its times and saved vector, for exact comparison."""
    db.session.expire_all()
    chunks = db.session.scalars(
        db.select(SermonChunk).where(SermonChunk.sermon_id == sermon.id).order_by(SermonChunk.id)
    ).all()
    vectors = {
        e.sermon_chunk_id: e.embedding
        for e in db.session.scalars(
            db.select(SermonChunkEmbedding).where(
                SermonChunkEmbedding.sermon_chunk_id.in_([c.id for c in chunks])
            )
        )
    }
    return [(c.id, c.hash, c.text, c.start, c.end, vectors.get(c.id)) for c in chunks]


def embed_with(sermon: Sermon, segments: list[dict]) -> None:
    sermon.transcript_segments = [dict(s) for s in segments]
    db.session.commit()
    pipeline.embed_chunks(sermon)


def all_vector_ids() -> set[int]:
    return set(db.session.scalars(db.select(SermonChunkEmbedding.sermon_chunk_id)))


def all_chunk_ids() -> set[int]:
    return set(db.session.scalars(db.select(SermonChunk.id)))


def failing_embed(model: str, input: list[str], **kwargs):
    raise ConnectionError("ollama is down")


def test_chunking_is_deterministic(app: Flask):
    sermon, _ = two_sermons()
    first = [(c.hash, c.text, c.start, c.end) for c in embeddings.chunk(sermon, OLD)]
    second = [(c.hash, c.text, c.start, c.end) for c in embeddings.chunk(sermon, OLD)]
    assert first == second


def test_unchanged_rerun_changes_nothing(app: Flask):
    sermon, _ = two_sermons()
    embed_with(sermon, OLD)
    before = snapshot(sermon)

    embed_with(sermon, OLD)

    assert snapshot(sermon) == before


def test_changed_captions_replace_only_changed_chunks(app: Flask):
    sermon, _ = two_sermons()
    embed_with(sermon, OLD)
    kept = [row for row in snapshot(sermon) if row[2] == "Grace and peace to you."]

    embed_with(sermon, NEW)

    after = snapshot(sermon)
    assert {row[2] for row in after} == {s["text"] for s in NEW}
    assert [row for row in after if row[2] == "Grace and peace to you."] == kept
    assert all(row[5] is not None for row in after)
    assert all_vector_ids() == all_chunk_ids()


def test_embedding_failure_keeps_old_chunks_and_vectors(app: Flask, monkeypatch):
    """An ollama failure on a rerun leaves the sermon exactly as it was."""
    sermon, other = two_sermons()
    embed_with(sermon, OLD)
    embed_with(other, NEW)
    before, other_before = snapshot(sermon), snapshot(other)
    monkeypatch.setattr("ollama.embed", failing_embed)

    with pytest.raises(ConnectionError):
        embed_with(sermon, NEW)

    assert snapshot(sermon) == before
    assert snapshot(other) == other_before


def test_embedding_failure_on_first_run_saves_no_chunks(app: Flask, monkeypatch):
    sermon, _ = two_sermons()
    monkeypatch.setattr("ollama.embed", failing_embed)

    with pytest.raises(ConnectionError):
        embed_with(sermon, OLD)

    assert snapshot(sermon) == []


def test_short_embedding_batch_is_rejected_before_writing(app: Flask, monkeypatch):
    """A batch with fewer vectors than chunks fails clearly instead of pairing them wrongly."""
    sermon, _ = two_sermons()
    embed_with(sermon, OLD)
    before = snapshot(sermon)
    monkeypatch.setattr(
        "ollama.embed", lambda model, input, **kw: SimpleNamespace(embeddings=[])
    )

    with pytest.raises(ValueError, match="returned 0 embeddings for 1 chunks"):
        embed_with(sermon, NEW)

    assert snapshot(sermon) == before


def test_database_failure_mid_replace_rolls_back(app: Flask, monkeypatch):
    """If saving the new vectors fails, the stale chunks deleted earlier come back."""
    sermon, other = two_sermons()
    embed_with(sermon, OLD)
    embed_with(other, NEW)
    before, other_before = snapshot(sermon), snapshot(other)

    def broken_add_all(objects):
        list(objects)
        raise RuntimeError("disk full")

    monkeypatch.setattr(db.session, "add_all", broken_add_all)

    with pytest.raises(RuntimeError, match="disk full"):
        embed_with(sermon, NEW)

    monkeypatch.undo()
    assert snapshot(sermon) == before
    assert snapshot(other) == other_before
    assert all_vector_ids() == all_chunk_ids()


def test_process_sermon_records_embedding_failure(app: Flask, monkeypatch):
    """Through the pipeline, an embedding failure marks the sermon FAILED and keeps its chunks."""
    sermon, _ = two_sermons()
    embed_with(sermon, OLD)
    before = snapshot(sermon)
    monkeypatch.setattr(pipeline, "fetch_transcript", lambda s: None)
    sermon.transcript_segments = [dict(s) for s in NEW]
    db.session.commit()
    monkeypatch.setattr("ollama.embed", failing_embed)

    pipeline.process_sermon(sermon.id)

    db.session.expire_all()
    sermon = db.session.get(Sermon, sermon.id)
    assert sermon.status == UploadStatus.FAILED
    assert sermon.processing_error == "embed_chunks: ollama is down"
    assert snapshot(sermon) == before
