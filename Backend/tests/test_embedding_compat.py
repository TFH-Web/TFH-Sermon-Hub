# Tests for embedding dimension, value and model checks, with fixed vectors and ollama faked.
from types import SimpleNamespace

import pytest
from flask import Flask

from tsh import embeddings, pipeline
from tsh.database import db
from tsh.embeddings import EMBEDDING_DIM, EmbeddingError, validate_vector
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding

SEGMENTS = [{"start": 0.0, "end": 4.0, "text": "Grace and peace to you."}]


def first_sermon() -> Sermon:
    return db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()


def fake_vectors(monkeypatch, vector: list) -> None:
    """Make ollama.embed return the given vector for every input."""
    monkeypatch.setattr(
        "ollama.embed",
        lambda model, input, **kw: SimpleNamespace(embeddings=[list(vector) for _ in input]),
    )


def test_valid_vector_is_returned_as_floats():
    vector = [1] + [0.5] * (EMBEDDING_DIM - 1)
    assert validate_vector(vector) == [1.0] + [0.5] * (EMBEDDING_DIM - 1)


@pytest.mark.parametrize(
    "vector, message",
    [
        ([0.1] * (EMBEDDING_DIM - 1), "dimensions"),
        ([0.1] * (EMBEDDING_DIM + 1), "dimensions"),
        ([], "dimensions"),
        ([float("nan")] + [0.1] * (EMBEDDING_DIM - 1), "finite"),
        ([float("inf")] + [0.1] * (EMBEDDING_DIM - 1), "finite"),
        (["0.1"] * EMBEDDING_DIM, "finite"),
        ([True] * EMBEDDING_DIM, "finite"),
        (None, "list of numbers"),
        ("0.1", "list of numbers"),
    ],
)
def test_invalid_vectors_are_rejected(vector, message):
    with pytest.raises(EmbeddingError, match=message):
        validate_vector(vector)


def test_embed_query_uses_the_configured_model(monkeypatch):
    seen = []

    def fake_embed(model, input, **kw):
        seen.append(model)
        return SimpleNamespace(embeddings=[[0.25] * EMBEDDING_DIM])

    monkeypatch.setattr("ollama.embed", fake_embed)
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "test-model")

    assert embeddings.embed_query("grace") == [0.25] * EMBEDDING_DIM
    assert seen == ["test-model"]


def test_embed_chunks_records_the_model(app: Flask, monkeypatch):
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "test-model")
    sermon = first_sermon()
    sermon.transcript_segments = SEGMENTS
    db.session.commit()

    pipeline.embed_chunks(sermon)

    models = db.session.scalars(db.select(SermonChunk.embedding_model)).all()
    assert models == ["test-model"]


def test_wrong_length_chunk_vector_is_not_saved(app: Flask, monkeypatch):
    fake_vectors(monkeypatch, [0.1] * 384)
    sermon = first_sermon()
    sermon.transcript_segments = SEGMENTS
    db.session.commit()

    with pytest.raises(EmbeddingError, match="384 dimensions"):
        pipeline.embed_chunks(sermon)

    assert db.session.scalars(db.select(SermonChunk)).all() == []
    assert db.session.scalars(db.select(SermonChunkEmbedding.sermon_chunk_id)).all() == []


def test_non_finite_query_vector_is_rejected(monkeypatch):
    fake_vectors(monkeypatch, [float("nan")] * EMBEDDING_DIM)

    with pytest.raises(EmbeddingError, match="finite"):
        embeddings.embed_query("grace")


def test_schema_dimension_matches_constant(app: Flask):
    embeddings.check_schema_dimension()


def embedded_sermon(monkeypatch, model: str) -> Sermon:
    """Return a sermon whose chunk was embedded by the given model name."""
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", model)
    sermon = first_sermon()
    sermon.transcript_segments = SEGMENTS
    db.session.commit()
    pipeline.embed_chunks(sermon)
    return sermon


def saved_vectors() -> dict[int, list[float]]:
    db.session.expire_all()
    return {e.sermon_chunk_id: e.embedding for e in db.session.scalars(db.select(SermonChunkEmbedding))}


def no_ollama(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise AssertionError("ollama should not be called")

    monkeypatch.setattr("ollama.embed", fail)


def test_model_change_requires_reembed(app: Flask, monkeypatch):
    """After EMBEDDING_MODEL changes, reprocessing refuses to mix vectors and names the fix."""
    sermon = embedded_sermon(monkeypatch, "old-model")
    before = saved_vectors()
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "new-model")
    no_ollama(monkeypatch)
    sermon.transcript_segments = SEGMENTS + [{"start": 4.0, "end": 8.0, "text": "New words."}]
    db.session.commit()

    with pytest.raises(EmbeddingError, match="old-model but EMBEDDING_MODEL is new-model; run flask reembed"):
        pipeline.embed_chunks(sermon)

    assert saved_vectors() == before


def test_unrecorded_model_requires_reembed(app: Flask, monkeypatch):
    """Vectors saved before models were recorded count as a mismatch."""
    sermon = embedded_sermon(monkeypatch, "nomic-embed-text")
    db.session.execute(db.update(SermonChunk).values(embedding_model=None))
    db.session.commit()
    no_ollama(monkeypatch)

    with pytest.raises(EmbeddingError, match="an unrecorded model"):
        pipeline.embed_chunks(sermon)


def test_same_model_rerun_is_allowed(app: Flask, monkeypatch):
    sermon = embedded_sermon(monkeypatch, "nomic-embed-text")
    pipeline.embed_chunks(sermon)


def test_reembed_replaces_vectors_and_records_model(app: Flask, monkeypatch):
    sermon = embedded_sermon(monkeypatch, "old-model")
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "new-model")
    # Multiples of 0.5 are exact in float32, so the saved vector compares exactly.
    fake_vectors(monkeypatch, [0.5] * EMBEDDING_DIM)

    assert pipeline.reembed_sermon(sermon.id) == 1

    assert list(saved_vectors().values()) == [[0.5] * EMBEDDING_DIM]
    assert db.session.scalars(db.select(SermonChunk.embedding_model)).all() == ["new-model"]
    # Now consistent, so a normal rerun works and needs no new vectors.
    no_ollama(monkeypatch)
    pipeline.embed_chunks(sermon)


def test_reembed_failure_keeps_old_vectors(app: Flask, monkeypatch):
    sermon = embedded_sermon(monkeypatch, "old-model")
    before = saved_vectors()
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "new-model")
    fake_vectors(monkeypatch, [0.5] * 384)

    with pytest.raises(EmbeddingError, match="384 dimensions"):
        pipeline.reembed_sermon(sermon.id)

    assert saved_vectors() == before
    assert db.session.scalars(db.select(SermonChunk.embedding_model)).all() == ["old-model"]


def test_reembed_command_only_touches_mismatched_sermons(app: Flask, monkeypatch, runner):
    first, second = db.session.scalars(db.select(Sermon).order_by(Sermon.id).limit(2)).all()
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "old-model")
    first.transcript_segments = SEGMENTS
    db.session.commit()
    pipeline.embed_chunks(first)
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "new-model")
    second.transcript_segments = SEGMENTS
    db.session.commit()
    pipeline.embed_chunks(second)

    result = runner.invoke(args=["reembed"])

    assert result.exit_code == 0, result.output
    assert f"sermon {first.id}: re-embedded 1 chunks" in result.output
    assert f"sermon {second.id}" not in result.output
    assert "re-embedded 1 chunks in 1 sermons with new-model" in result.output
    # Running again finds nothing left to do.
    assert "re-embedded 0 chunks in 0 sermons" in runner.invoke(args=["reembed"]).output


def test_reembed_command_reports_failure(app: Flask, monkeypatch, runner):
    sermon = embedded_sermon(monkeypatch, "old-model")
    monkeypatch.setattr(embeddings, "EMBEDDING_MODEL", "new-model")
    fake_vectors(monkeypatch, [float("inf")] * EMBEDDING_DIM)

    result = runner.invoke(args=["reembed"])

    assert result.exit_code != 0
    assert f"sermon {sermon.id}: Embedding contains a value that is not a finite number" in result.output


def test_dimension_mismatch_with_schema_fails_before_embedding(app: Flask, monkeypatch):
    """Code built for another size refuses to run against this table instead of saving bad vectors."""
    monkeypatch.setattr(embeddings, "EMBEDDING_DIM", 384)
    no_ollama(monkeypatch)
    sermon = first_sermon()
    sermon.transcript_segments = SEGMENTS
    db.session.commit()

    with pytest.raises(EmbeddingError, match="stores 768-dimension vectors but EMBEDDING_DIM is 384"):
        pipeline.embed_chunks(sermon)


def test_query_vector_with_wrong_dimension_is_rejected(monkeypatch):
    fake_vectors(monkeypatch, [0.1] * (EMBEDDING_DIM * 2))

    with pytest.raises(EmbeddingError, match=f"{EMBEDDING_DIM * 2} dimensions"):
        embeddings.embed_query("grace")


def test_fixed_valid_vector_round_trips(app: Flask, monkeypatch):
    vector = [(i % 7) * 0.5 - 1.5 for i in range(EMBEDDING_DIM)]
    fake_vectors(monkeypatch, vector)
    embedded_sermon(monkeypatch, "nomic-embed-text")

    assert list(saved_vectors().values()) == [vector]
