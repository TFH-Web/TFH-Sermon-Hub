from collections.abc import Sequence

from flask import Flask
from pytest import MonkeyPatch
from sqlalchemy.sql import text

from tests.test_chunking import words
from tsh import pipeline
from tsh.database import db
from tsh.models import (
    Series,
    Sermon,
    SermonChunk,
    SermonChunkEmbedding,
    Speaker,
    Tag,
    sermon_tag_m2m,
)


def first_sermon() -> Sermon | None:
    """Return the first populated sermon, with no chunks yet."""
    return db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()


def chunks_for(id: int) -> Sequence[SermonChunk]:
    return db.session.scalars(
        db.select(SermonChunk).where(SermonChunk.sermon_id == id)
    ).all()


def tag_associations_for(id: int) -> Sequence[Tag]:
    return db.session.scalars(
        db.select(sermon_tag_m2m).where(sermon_tag_m2m.c.sermon_id == id)
    ).all()


def speaker_for(id: int) -> Speaker:
    return db.session.scalar(
        db.select(Speaker)
        .join(Sermon, Sermon.speaker_id == Speaker.id)
        .where(Sermon.id == id)
    )


def series_for(id: int) -> Series:
    return db.session.scalar(
        db.select(Series)
        .join(Sermon, Sermon.series_id == Series.id)
        .where(Sermon.id == id)
    )


def embeddings_for(id: int) -> Sequence[SermonChunkEmbedding]:
    return db.session.scalars(
        db.select(SermonChunkEmbedding)
        .join(SermonChunk, SermonChunk.id == SermonChunkEmbedding.sermon_chunk_id)
        .where(SermonChunk.sermon_id == id)
        .order_by(SermonChunk.start.asc())
    ).all()


def test_sermon_deletion_removes_tag_associations_and_orphan_records(app: Flask):
    sermon = first_sermon()
    assert sermon != None

    sermon.transcript_segments = [
        {"start": 0.0, "end": 6.0, "text": words(6)},
        {"start": 6.0, "end": 12.0, "text": words(7)},
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    id = sermon.id

    assert len(chunks_for(id)) > 0
    assert len(tag_associations_for(id)) > 0
    assert speaker_for(id) != None
    assert series_for(id) != None
    assert len(embeddings_for(id)) > 0

    db.session.delete(sermon)
    db.session.commit()

    assert len(chunks_for(id)) == 0
    assert len(tag_associations_for(id)) == 0
    assert speaker_for(id) == None
    assert series_for(id) == None
    assert len(embeddings_for(id)) == 0


def test_sermon_transcript_edits_update_chunks(app: Flask, monkeypatch: MonkeyPatch):
    monkeypatch.setattr("tsh.embeddings.CHUNK_SIZE_MAX", 2)
    monkeypatch.setattr("tsh.embeddings.CHUNK_OVERLAP_PERCENT_MIN", 0)

    sermon = first_sermon()
    assert sermon != None

    sermon.transcript_segments = [
        {"start": 0.0, "end": 6.0, "text": "a b"},
        {"start": 6.0, "end": 12.0, "text": "c d e"},
        {"start": 12.0, "end": 18.0, "text": "f g h"},
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    id = sermon.id

    e1 = [e.sermon_chunk.id for e in embeddings_for(id)]

    sermon.transcript_segments = [
        {"start": 0.0, "end": 6.0, "text": "b b"},
        {"start": 6.0, "end": 12.0, "text": "c d g"},
        {"start": 12.0, "end": 18.0, "text": "h f e"},
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    e2 = [e.sermon_chunk.id for e in embeddings_for(id)]

    assert len(e1) == len(e2) == 5
    for i, v in enumerate([False, True, False, False, False]):
        assert (e1[i] == e2[i]) == v
    assert e1[4] == e2[2]
