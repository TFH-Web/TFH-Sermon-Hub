# Tests for pipeline.embed_chunks: chunk rows and embeddings, with ollama.embed faked by conftest.
import pytest
from flask import Flask

from tsh import pipeline
from tsh.database import db
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding


def first_sermon() -> Sermon:
    """Return the first populated sermon, with no chunks yet."""
    return db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()


def chunks_for(sermon: Sermon) -> list[SermonChunk]:
    """Return the saved chunk rows for one sermon."""
    return db.session.scalars(
        db.select(SermonChunk).where(SermonChunk.sermon_id == sermon.id)
    ).all()


def test_embed_chunks_saves_chunks_and_one_embedding_each(app: Flask):
    """A sermon with a few segments gets chunk rows, and every chunk gets exactly one embedding."""
    sermon = first_sermon()
    sermon.transcript_segments = [
        {"start": 0.0, "end": 4.0, "text": "Grace and peace to you."},
        {"start": 4.0, "end": 9.5, "text": "Turn with me to Romans six."},
        {"start": 9.5, "end": 15.0, "text": "We are not under law but under grace."},
    ]
    db.session.commit()

    pipeline.embed_chunks(sermon)

    chunks = chunks_for(sermon)
    assert chunks
    assert chunks[0].start == 0.0
    assert chunks[-1].end == 15.0
    for chunk in chunks:
        # Select only the id: vec0 returns the vector as a float32 blob, which the JSON column type cannot read.
        embedding_ids = db.session.scalars(
            db.select(SermonChunkEmbedding.sermon_chunk_id).where(
                SermonChunkEmbedding.sermon_chunk_id == chunk.id
            )
        ).all()
        assert embedding_ids == [chunk.id]


def test_embed_chunks_skips_sermon_without_segments(app: Flask):
    """A sermon with no segments is left alone instead of raising."""
    sermon = first_sermon()
    sermon.transcript_segments = []
    db.session.commit()

    pipeline.embed_chunks(sermon)

    assert chunks_for(sermon) == []


def test_embedding_round_trips_through_vec0(app: Flask):
    """A saved embedding reads back as the same list of floats."""
    sermon = first_sermon()
    sermon.transcript_segments = [
        {"start": 0.0, "end": 4.0, "text": "Grace and peace."}
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)

    # The fake embed returns 0.1, which float32 cannot store exactly.
    saved = db.session.scalars(db.select(SermonChunkEmbedding)).one()
    assert saved.embedding == pytest.approx([0.1] * 768)

    # Multiples of 0.5 are exact in float32, so this comparison can be strict.
    vector = [i * 0.5 for i in range(768)]
    saved.embedding = vector
    db.session.commit()
    db.session.expire_all()

    saved = db.session.scalars(db.select(SermonChunkEmbedding)).one()
    assert saved.embedding == vector


def test_embed_chunks_keeps_identical_text_for_each_sermon(app: Flask):
    """Two sermons with the same transcript each get their own chunk rows and embeddings."""
    first, second = db.session.scalars(
        db.select(Sermon).order_by(Sermon.id).limit(2)
    ).all()
    segments = [
        {"start": 0.0, "end": 4.0, "text": "Grace and peace to you."},
        {"start": 4.0, "end": 9.5, "text": "Turn with me to Romans six."},
    ]
    first.transcript_segments = [dict(s) for s in segments]
    second.transcript_segments = [dict(s) for s in segments]
    db.session.commit()

    pipeline.embed_chunks(first)
    pipeline.embed_chunks(second)

    first_chunks = chunks_for(first)
    second_chunks = chunks_for(second)
    assert first_chunks
    assert [c.hash for c in first_chunks] == [c.hash for c in second_chunks]
    for chunk in first_chunks + second_chunks:
        embedding_ids = db.session.scalars(
            db.select(SermonChunkEmbedding.sermon_chunk_id).where(
                SermonChunkEmbedding.sermon_chunk_id == chunk.id
            )
        ).all()
        assert embedding_ids == [chunk.id]
