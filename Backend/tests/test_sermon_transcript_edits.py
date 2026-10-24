from collections.abc import Sequence

from flask import Flask
from sqlalchemy.sql import text

from tests.test_chunking import words
from tsh import pipeline
from tsh.database import db
from tsh.models import Series, Sermon, SermonChunk, Speaker, Tag, sermon_tag_m2m


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


def embedding_count_for(id: int) -> int:
    t = text(
        "SELECT COUNT(*) FROM sermon_chunk_embedding WHERE sermon_chunk_id IN (SELECT id FROM sermon_chunk WHERE sermon_id=:id)"
    )
    return db.session.scalar(t, {'id': id})


def test_sermon_deletion_removes_tag_associations_and_orphan_records(app: Flask):
    sermon = first_sermon()
    assert sermon != None

    sermon.transcript_segments = [
        {"start": 0.0, "end": 6.0, "text": words(6)},
        {"start": 1.0, "end": 2.0, "text": "overlapping"},
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    id = sermon.id

    assert len(chunks_for(id)) > 0
    assert len(tag_associations_for(id)) > 0
    assert speaker_for(id) != None
    assert series_for(id) != None
    assert embedding_count_for(id) > 0

    db.session.delete(sermon)
    db.session.commit()

    assert len(chunks_for(id)) == 0
    assert len(tag_associations_for(id)) == 0
    assert speaker_for(id) == None
    assert series_for(id) == None
    assert embedding_count_for(id) == 0
