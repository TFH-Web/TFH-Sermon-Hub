# Tests for pipeline.embed_chunks: chunk rows and embeddings, with ollama.embed faked by conftest.
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
