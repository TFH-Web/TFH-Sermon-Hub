import os
import re
from collections import Counter
from functools import reduce
from math import ceil, isfinite

import ollama
from blake3 import blake3
from sqlalchemy import text

from tsh.database import db
from tsh.models import Sermon, SermonChunk
from tsh.transcripts import TranscriptSegment, concatenate, segment_length

CHUNK_SIZE_MAX = int(os.environ.get("CHUNK_SIZE_MAX", "500"))
CHUNK_OVERLAP_PERCENT_MIN = int(os.environ.get("CHUNK_OVERLAP_PERCENT_MIN", "30"))
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text")
# The one vector length used for chunks and queries. It must match the FLOAT[n] column of
# the sermon_chunk_embedding vec0 table and the output size of EMBEDDING_MODEL. Changing
# it needs a new migration for the table and a full re-embed, not just a new value here.
EMBEDDING_DIM = 768
VEC_TABLE = "sermon_chunk_embedding"


class EmbeddingError(ValueError):
    """Raised when vectors, the vec0 schema or the recorded model do not match the settings."""


def chunk(sermon: Sermon, segments: list[TranscriptSegment]) -> list[SermonChunk]:
    """Return unsaved SermonChunk rows for the sermon's caption segments, in time order.

    Returns [] when there is no caption text. Raises ValueError for invalid chunk
    settings or segment times; see _chunk.
    """
    seen: Counter[str] = Counter()
    chunks = []
    for piece in _chunk(segments):
        chunks.append(
            SermonChunk(
                id=None,
                sermon_id=sermon.id,
                sermon=sermon,
                hash=chunk_hash(piece["text"], seen[piece["text"]]),
                text=piece["text"],
                start=piece["start"],
                end=piece["end"],
            )
        )
        seen[piece["text"]] += 1
    return chunks


def chunk_hash(text: str, occurrence: int) -> bytes:
    """Return the identity of the occurrence-th chunk (from 0) with this text in a sermon.

    Times are left out on purpose, so a caption timing change keeps the chunk and its
    embedding and only moves its start and end. The occurrence index keeps repeated text
    at different times as separate chunks, each with its own source time, instead of
    collapsing them into one. The first occurrence hashes the text alone, so chunks
    saved before this rule keep their identity and are not embedded again.
    """
    if occurrence == 0:
        return blake3(text.encode()).digest()
    return blake3(f"{text}\0{occurrence}".encode()).digest()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return one validated embedding per text, in order, from EMBEDDING_MODEL on ollama.

    Returns [] without calling ollama when texts is empty. Raises whatever ollama raises
    if the server or model is unavailable, and EmbeddingError if it returns the wrong
    number of vectors or any vector fails validate_vector.
    """
    if not texts:
        return []
    batch = ollama.embed(model=EMBEDDING_MODEL, input=texts)
    vectors = list(batch.embeddings)
    if len(vectors) != len(texts):
        raise EmbeddingError(
            f"{EMBEDDING_MODEL} returned {len(vectors)} embeddings for {len(texts)} chunks"
        )
    return [validate_vector(vector) for vector in vectors]


def embed_query(text: str) -> list[float]:
    """Return the validated embedding of a search or chat query.

    Uses the same EMBEDDING_MODEL and EMBEDDING_DIM as chunks, so query and chunk vectors
    are comparable. Raises the same errors as embed_texts.
    """
    return embed_texts([text])[0]


def validate_vector(vector: object) -> list[float]:
    """Return the vector as a list of floats if it can be saved or searched safely.

    Raises EmbeddingError unless it has exactly EMBEDDING_DIM finite numbers. A model with
    a different output size, or a NaN or infinity, would otherwise be stored or compared
    and give meaningless search results instead of a clear failure.
    """
    if isinstance(vector, (str, bytes)) or not hasattr(vector, "__len__"):
        raise EmbeddingError(f"Embedding must be a list of numbers, got {type(vector).__name__}")
    values = list(vector)  # ty: ignore[invalid-argument-type]
    if len(values) != EMBEDDING_DIM:
        raise EmbeddingError(
            f"Embedding has {len(values)} dimensions but EMBEDDING_DIM is {EMBEDDING_DIM}; "
            f"check that EMBEDDING_MODEL ({EMBEDDING_MODEL}) outputs {EMBEDDING_DIM} values"
        )
    if not all(
        isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v)
        for v in values
    ):
        raise EmbeddingError("Embedding contains a value that is not a finite number")
    return [float(v) for v in values]


def check_schema_dimension() -> None:
    """Raise EmbeddingError unless the vec0 table stores EMBEDDING_DIM-length vectors.

    Reads the dimension from the table's CREATE statement, since sqlite-vec has no other
    way to report it. Catches a database migrated for one size running with code for another.
    """
    sql = db.session.scalar(
        text("SELECT sql FROM sqlite_master WHERE name = :name"), {"name": VEC_TABLE}
    )
    match = re.search(r"FLOAT\[(\d+)\]", sql or "", re.IGNORECASE)
    if match is None:
        raise EmbeddingError(f"Cannot find the {VEC_TABLE} vector column; run flask db upgrade")
    if int(match[1]) != EMBEDDING_DIM:
        raise EmbeddingError(
            f"{VEC_TABLE} stores {match[1]}-dimension vectors but EMBEDDING_DIM is {EMBEDDING_DIM}"
        )


def _chunk(
    segments: list[TranscriptSegment],
    size_max: int | None = None,
    overlap_percent: int | None = None,
) -> list[TranscriptSegment]:
    """Group timed segments into overlapping chunks of at most size_max words.

    Returns [] for no segments or only blank ones. A cue longer than size_max words is
    split into pieces of at most size_max words, each with a time range inside the
    cue's own range. Overlap is kept when it fits; a chunk never exceeds size_max even
    if that means less overlap than overlap_percent. Raises ValueError for invalid
    settings or a segment whose times are not finite or end before they start.
    """
    size_max = CHUNK_SIZE_MAX if size_max is None else size_max
    overlap_percent = (
        CHUNK_OVERLAP_PERCENT_MIN if overlap_percent is None else overlap_percent
    )
    validate_chunk_settings(size_max, overlap_percent)

    # Splitting a long cue can put its later pieces after the start of another cue.
    # Sort the pieces themselves so overlapping captions keep their source order.
    pieces = sorted(
        (piece for segment in segments for piece in _split_segment(segment, size_max)),
        key=lambda piece: piece["start"],
    )

    window: list[TranscriptSegment] = []
    window_len = 0
    chunks = []

    for piece in pieces:
        piece_len = segment_length(piece)
        if window and window_len + piece_len > size_max:
            chunks.append(_join(window))
            window_len = _shift_window(
                window, window_len, piece_len, size_max, overlap_percent
            )
        window.append(piece)
        window_len += piece_len

    if window:
        chunks.append(_join(window))
    return chunks


def validate_chunk_settings(size_max: int, overlap_percent: int) -> None:
    """Raise ValueError unless size_max >= 1 and 0 <= overlap_percent < 100.

    An overlap of 100% or more would carry the whole window forward, so chunking
    would never make progress through the transcript.
    """
    if isinstance(size_max, bool) or not isinstance(size_max, int) or size_max < 1:
        raise ValueError(f"CHUNK_SIZE_MAX must be a whole number >= 1, got {size_max!r}")
    if (
        isinstance(overlap_percent, bool)
        or not isinstance(overlap_percent, int)
        or not 0 <= overlap_percent < 100
    ):
        raise ValueError(
            f"CHUNK_OVERLAP_PERCENT_MIN must be a whole number from 0 to 99, got {overlap_percent!r}"
        )


def _split_segment(segment: TranscriptSegment, size_max: int) -> list[TranscriptSegment]:
    """Return the segment as pieces of at most size_max words, or [] if it has no text.

    Piece times are spread by word position, which is only an estimate, but keeps every
    piece inside the cue's own range so source links still land in the right cue.
    """
    start, end = segment["start"], segment["end"]
    if not (isfinite(start) and isfinite(end)) or end < start:
        raise ValueError(f"Invalid caption segment times: start={start!r}, end={end!r}")
    words = segment["text"].split()
    if not words:
        return []
    if len(words) <= size_max:
        return [segment]
    step = (end - start) / len(words)
    return [
        {
            "start": start + i * step,
            "end": end if i + size_max >= len(words) else start + (i + size_max) * step,
            "text": " ".join(words[i : i + size_max]),
        }
        for i in range(0, len(words), size_max)
    ]


def _shift_window(
    window: list[TranscriptSegment],
    window_len: int,
    next_len: int,
    size_max: int,
    overlap_percent: int,
) -> int:
    """Drop segments from the front of the window and return its new word count.

    Keeps at least overlap_percent of the previous chunk's words as overlap, unless the
    next segment would not fit beside them. size_max is the hard limit.
    """
    overlap_len = ceil(window_len * overlap_percent / 100)
    while window and (
        window_len - segment_length(window[0]) > overlap_len
        or window_len + next_len > size_max
    ):
        window_len -= segment_length(window.pop(0))
    return window_len


def _join(window: list[TranscriptSegment]) -> TranscriptSegment:
    """Concatenate the window into one chunk spanning its earliest start to latest end.

    Overlapping cues can end out of order, so the last cue's end is not always the latest.
    """
    return {
        **reduce(concatenate, window),
        "start": min(s["start"] for s in window),
        "end": max(s["end"] for s in window),
    }
