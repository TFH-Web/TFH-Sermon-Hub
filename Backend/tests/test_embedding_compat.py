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
