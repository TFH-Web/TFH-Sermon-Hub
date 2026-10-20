# Tests for embeddings._chunk: empty input, oversized cues, settings, and source time ranges.
import pytest
from flask import Flask

from tsh import pipeline
from tsh.database import db
from tsh.embeddings import _chunk, validate_chunk_settings
from tsh.models import Sermon, SermonChunk


def words(n: int, prefix: str = "w") -> str:
    """Return n distinct space-separated words."""
    return " ".join(f"{prefix}{i}" for i in range(n))


def word_count(chunk) -> int:
    return len(chunk["text"].split())


def test_empty_input_gives_no_chunks():
    assert _chunk([], size_max=10, overlap_percent=30) == []


def test_blank_segments_give_no_chunks():
    segments = [{"start": 0.0, "end": 1.0, "text": "   "}]
    assert _chunk(segments, size_max=10, overlap_percent=30) == []


def test_oversized_first_cue_is_split_within_its_range():
    """A first cue longer than the limit splits into bounded pieces instead of failing."""
    segments = [{"start": 10.0, "end": 35.0, "text": words(25)}]

    chunks = _chunk(segments, size_max=10, overlap_percent=0)

    assert [word_count(c) for c in chunks] == [10, 10, 5]
    assert " ".join(c["text"] for c in chunks) == words(25)
    assert chunks[0]["start"] == 10.0
    assert chunks[-1]["end"] == 35.0
    for c in chunks:
        assert 10.0 <= c["start"] <= c["end"] <= 35.0
    # Pieces follow each other in time without gaps or overlap.
    for earlier, later in zip(chunks, chunks[1:]):
        assert earlier["end"] == pytest.approx(later["start"])


def test_oversized_cue_after_others_still_respects_the_limit():
    """Overlap is dropped when it would push a chunk past the limit."""
    segments = [
        {"start": 0.0, "end": 2.0, "text": words(6, "a")},
        {"start": 2.0, "end": 12.0, "text": words(30, "b")},
    ]

    chunks = _chunk(segments, size_max=10, overlap_percent=50)

    assert all(word_count(c) <= 10 for c in chunks)
    assert chunks[0]["text"] == words(6, "a")
    assert chunks[-1]["end"] == 12.0


def test_chunks_keep_overlap_and_stay_bounded():
    segments = [
        {"start": float(i), "end": float(i + 1), "text": words(3, f"s{i}_")}
        for i in range(10)
    ]

    chunks = _chunk(segments, size_max=9, overlap_percent=30)

    assert len(chunks) > 1
    assert all(word_count(c) <= 9 for c in chunks)
    for earlier, later in zip(chunks, chunks[1:]):
        # The next chunk starts inside the previous one, so context carries over.
        assert later["start"] < earlier["end"]
        assert later["text"].split()[0] in earlier["text"].split()
    assert chunks[0]["start"] == 0.0
    assert chunks[-1]["end"] == 10.0


def test_chunk_end_is_latest_end_for_overlapping_cues():
    """A long cue that ends after a later short cue still sets the chunk's end."""
    segments = [
        {"start": 0.0, "end": 9.0, "text": "long cue"},
        {"start": 1.0, "end": 2.0, "text": "short cue"},
    ]

    [chunk] = _chunk(segments, size_max=10, overlap_percent=30)

    assert (chunk["start"], chunk["end"]) == (0.0, 9.0)


@pytest.mark.parametrize("cue_words", [6, 8, 13])
def test_oversized_overlapping_cues_preserve_source_order_and_ranges(cue_words):
    segments = [
        {"start": 0.0, "end": float(cue_words), "text": words(cue_words)},
        {"start": 1.0, "end": 2.0, "text": "overlapping"},
    ]

    chunks = _chunk(segments, size_max=4, overlap_percent=0)

    starts = [c["start"] for c in chunks]
    assert starts == sorted(starts)
    assert all(word_count(c) <= 4 for c in chunks)
    [overlapping] = [c for c in chunks if "overlapping" in c["text"]]
    assert overlapping["start"] == 1.0
    assert overlapping["end"] >= 2.0
    assert overlapping["text"].startswith("overlapping")


def test_embedded_overlapping_cue_keeps_its_source_time(app: Flask, monkeypatch):
    monkeypatch.setattr("tsh.embeddings.CHUNK_SIZE_MAX", 4)
    monkeypatch.setattr("tsh.embeddings.CHUNK_OVERLAP_PERCENT_MIN", 0)
    sermon = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()
    sermon.transcript_segments = [
        {"start": 0.0, "end": 6.0, "text": words(6)},
        {"start": 1.0, "end": 2.0, "text": "overlapping"},
    ]
    db.session.commit()

    pipeline.embed_chunks(sermon)
    db.session.expire_all()

    [overlapping] = db.session.scalars(
        db.select(SermonChunk).where(
            SermonChunk.sermon_id == sermon.id,
            SermonChunk.text.contains("overlapping"),
        )
    ).all()
    assert (overlapping.start, overlapping.end) == (1.0, 6.0)


def test_input_segments_are_not_modified():
    segments = [
        {"start": 1.0, "end": 2.0, "text": "b"},
        {"start": 0.0, "end": 5.0, "text": "a"},
    ]
    copy = [dict(s) for s in segments]

    _chunk(segments, size_max=10, overlap_percent=30)

    assert segments == copy


@pytest.mark.parametrize("size_max", [0, -5, 1.5, True, "500"])
def test_invalid_chunk_size_is_rejected(size_max):
    with pytest.raises(ValueError, match="CHUNK_SIZE_MAX"):
        validate_chunk_settings(size_max, 30)


@pytest.mark.parametrize("overlap", [-1, 100, 150, 2.5, None])
def test_invalid_overlap_is_rejected(overlap):
    with pytest.raises(ValueError, match="CHUNK_OVERLAP_PERCENT_MIN"):
        validate_chunk_settings(500, overlap)


@pytest.mark.parametrize("size_max, overlap", [(1, 0), (500, 30), (10, 99)])
def test_valid_settings_are_accepted(size_max, overlap):
    validate_chunk_settings(size_max, overlap)


@pytest.mark.parametrize(
    "start, end", [(5.0, 4.0), (float("nan"), 1.0), (0.0, float("inf"))]
)
def test_invalid_segment_times_are_rejected(start, end):
    with pytest.raises(ValueError, match="segment times"):
        _chunk([{"start": start, "end": end, "text": "hi"}], size_max=10, overlap_percent=0)


def test_embed_chunks_with_blank_segments_keeps_existing_chunks(app: Flask):
    """Blank captions do not wipe a sermon's existing chunks."""
    sermon = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()
    sermon.transcript_segments = [{"start": 0.0, "end": 4.0, "text": "Grace and peace."}]
    db.session.commit()
    pipeline.embed_chunks(sermon)

    sermon.transcript_segments = [{"start": 0.0, "end": 4.0, "text": " "}]
    db.session.commit()
    pipeline.embed_chunks(sermon)

    texts = db.session.scalars(
        db.select(SermonChunk.text).where(SermonChunk.sermon_id == sermon.id)
    ).all()
    assert texts == ["Grace and peace."]


def test_embed_chunks_with_bad_settings_fails_without_writing(app: Flask, monkeypatch):
    """Invalid settings raise before any chunk is saved."""
    monkeypatch.setattr("tsh.embeddings.CHUNK_OVERLAP_PERCENT_MIN", 100)
    sermon = db.session.scalars(db.select(Sermon).order_by(Sermon.id)).first()
    sermon.transcript_segments = [{"start": 0.0, "end": 4.0, "text": "Grace and peace."}]
    db.session.commit()

    with pytest.raises(ValueError, match="CHUNK_OVERLAP_PERCENT_MIN"):
        pipeline.embed_chunks(sermon)

    assert db.session.scalars(db.select(SermonChunk)).all() == []
