# Tests for pipeline.embed_chunks: chunk rows and embeddings, with ollama.embed faked by conftest.
import pytest
from flask import Flask

from tsh import pipeline
from tsh.embeddings import EMBEDDING_DIM
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
    assert saved.embedding == pytest.approx([0.1] * EMBEDDING_DIM)

    # Multiples of 0.5 are exact in float32, so this comparison can be strict.
    vector = [i * 0.5 for i in range(EMBEDDING_DIM)]
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


def embedding_ids() -> list[int]:
    """Return every sermon_chunk_id that has an embedding row."""
    return db.session.scalars(db.select(SermonChunkEmbedding.sermon_chunk_id)).all()


def set_segments(sermon: Sermon, text: str) -> None:
    """Give the sermon a single caption segment with the given text."""
    sermon.transcript_segments = [{"start": 0.0, "end": 5.0, "text": text}]
    db.session.commit()


def test_embed_chunks_rerun_reuses_unchanged_chunks(app: Flask):
    """Running twice with the same captions keeps the same chunk rows and embeddings."""
    sermon = first_sermon()
    set_segments(sermon, "Grace and peace to you.")
    pipeline.embed_chunks(sermon)
    before_chunks = [chunk.id for chunk in chunks_for(sermon)]
    before_embeddings = embedding_ids()

    set_segments(sermon, "Grace and peace to you.")
    pipeline.embed_chunks(sermon)

    assert [chunk.id for chunk in chunks_for(sermon)] == before_chunks
    assert embedding_ids() == before_embeddings


def test_embed_chunks_replaces_changed_chunks(app: Flask):
    """Changed captions delete the old chunk and its embedding, and embed the new chunk once."""
    sermon = first_sermon()
    set_segments(sermon, "Grace and peace to you.")
    pipeline.embed_chunks(sermon)

    set_segments(sermon, "Turn with me to Romans six.")
    pipeline.embed_chunks(sermon)

    chunks = chunks_for(sermon)
    assert [chunk.text for chunk in chunks] == ["Turn with me to Romans six."]
    # SQLite can hand the deleted chunk's id to the new chunk, so compare whole sets:
    # any embedding left over from the deleted chunk would show up as an extra row.
    assert embedding_ids() == [chunks[0].id]


def test_embed_chunks_leaves_other_sermons_alone(app: Flask):
    """Changing one sermon's captions does not touch another sermon's chunks."""
    first, second = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).all()[:2]
    set_segments(first, "Grace and peace to you.")
    set_segments(second, "We are not under law but under grace.")
    pipeline.embed_chunks(first)
    pipeline.embed_chunks(second)
    second_ids = [chunk.id for chunk in chunks_for(second)]

    set_segments(first, "Turn with me to Romans six.")
    pipeline.embed_chunks(first)

    assert [chunk.id for chunk in chunks_for(second)] == second_ids
    assert set(second_ids) <= set(embedding_ids())


def count_embed_calls(monkeypatch) -> list[list[str]]:
    """Wrap the fake ollama.embed so a test can see which texts were sent to it."""
    import ollama

    calls: list[list[str]] = []
    fake = ollama.embed

    def recording_embed(model: str, input: list[str], **kwargs):
        calls.append(list(input))
        return fake(model=model, input=input, **kwargs)

    monkeypatch.setattr("ollama.embed", recording_embed)
    return calls


def test_shifted_times_update_in_place_without_re_embedding(app: Flask, monkeypatch):
    """Captions with the same text but new times keep chunk ids and embeddings, with new times."""
    sermon = first_sermon()
    sermon.transcript_segments = [
        {"start": 0.0, "end": 4.0, "text": "Grace and peace to you."},
        {"start": 4.0, "end": 9.0, "text": "Turn with me to Romans six."},
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    before = {c.id: c.text for c in chunks_for(sermon)}
    before_embeddings = embedding_ids()
    calls = count_embed_calls(monkeypatch)

    sermon.transcript_segments = [
        {"start": 12.5, "end": 16.5, "text": "Grace and peace to you."},
        {"start": 16.5, "end": 21.5, "text": "Turn with me to Romans six."},
    ]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    chunks = chunks_for(sermon)
    assert {c.id: c.text for c in chunks} == before
    assert embedding_ids() == before_embeddings
    assert (chunks[0].start, chunks[-1].end) == (12.5, 21.5)
    assert calls == []


def test_repeated_text_keeps_each_source_time(app: Flask, monkeypatch):
    """The same words said twice become two chunks, each linking to its own time."""
    monkeypatch.setattr("tsh.embeddings.CHUNK_SIZE_MAX", 3)
    monkeypatch.setattr("tsh.embeddings.CHUNK_OVERLAP_PERCENT_MIN", 0)
    sermon = first_sermon()
    sermon.transcript_segments = [
        {"start": 0.0, "end": 3.0, "text": "God is good"},
        {"start": 3.0, "end": 6.0, "text": "all the time"},
        {"start": 60.0, "end": 63.0, "text": "God is good"},
    ]
    db.session.commit()

    pipeline.embed_chunks(sermon)

    repeated = sorted(
        (c for c in chunks_for(sermon) if c.text == "God is good"), key=lambda c: c.start
    )
    assert [(c.start, c.end) for c in repeated] == [(0.0, 3.0), (60.0, 63.0)]
    assert repeated[0].hash != repeated[1].hash
    assert set(c.id for c in chunks_for(sermon)) == set(embedding_ids())


def test_repeated_text_rerun_moves_only_the_changed_occurrence(app: Flask, monkeypatch):
    """Retiming the second repeat updates that chunk only, and nothing is re-embedded."""
    monkeypatch.setattr("tsh.embeddings.CHUNK_SIZE_MAX", 3)
    monkeypatch.setattr("tsh.embeddings.CHUNK_OVERLAP_PERCENT_MIN", 0)
    sermon = first_sermon()
    segments = [
        {"start": 0.0, "end": 3.0, "text": "God is good"},
        {"start": 60.0, "end": 63.0, "text": "God is good"},
    ]
    sermon.transcript_segments = [dict(s) for s in segments]
    db.session.commit()
    pipeline.embed_chunks(sermon)
    ids = sorted(c.id for c in chunks_for(sermon))
    calls = count_embed_calls(monkeypatch)

    segments[1] = {"start": 70.0, "end": 73.0, "text": "God is good"}
    sermon.transcript_segments = segments
    db.session.commit()
    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    chunks = sorted(chunks_for(sermon), key=lambda c: c.start)
    assert sorted(c.id for c in chunks) == ids
    assert [(c.start, c.end) for c in chunks] == [(0.0, 3.0), (70.0, 73.0)]
    assert calls == []
