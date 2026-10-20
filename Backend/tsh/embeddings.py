import os
from collections import Counter
from functools import reduce
from math import ceil, isfinite

import ollama
from blake3 import blake3

from tsh.models import Sermon, SermonChunk
from tsh.transcripts import TranscriptSegment, concatenate, segment_length

CHUNK_SIZE_MAX = int(os.environ.get("CHUNK_SIZE_MAX", "500"))
CHUNK_OVERLAP_PERCENT_MIN = int(os.environ.get("CHUNK_OVERLAP_PERCENT_MIN", "30"))
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text")


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
    """Return one embedding per text, in order, from EMBEDDING_MODEL on ollama.

    Returns [] without calling ollama when texts is empty. Raises whatever ollama raises
    if the server or model is unavailable, and ValueError if it returns the wrong number
    of vectors.
    """
    if not texts:
        return []
    batch = ollama.embed(model=EMBEDDING_MODEL, input=texts)
    vectors = list(batch.embeddings)
    if len(vectors) != len(texts):
        raise ValueError(
            f"{EMBEDDING_MODEL} returned {len(vectors)} embeddings for {len(texts)} chunks"
        )
    return vectors


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

    pieces = [
        piece
        for segment in sorted(segments, key=lambda s: s["start"])
        for piece in _split_segment(segment, size_max)
    ]

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
    return {**reduce(concatenate, window), "end": max(s["end"] for s in window)}
