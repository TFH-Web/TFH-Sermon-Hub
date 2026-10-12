import os
from collections.abc import Sequence
from functools import reduce
from math import ceil

import ollama
from blake3 import blake3

from tsh.database import db
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding
from tsh.transcripts import TranscriptSegment

CHUNK_SIZE_MAX = int(os.environ.get("CHUNK_SIZE_MAX", "500"))
CHUNK_OVERLAP_PERCENT_MIN = int(os.environ.get("CHUNK_OVERLAP_PERCENT_MIN", "30"))
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text")


def chunk(sermon: Sermon, segments: list[TranscriptSegment]) -> list[SermonChunk]:
    return [
        SermonChunk(
            id=None,
            sermon_id=sermon.id,
            hash=blake3(chunk["text"].encode()).digest(),
            text=chunk["text"],
            start=chunk["start"],
            end=chunk["end"],
        )
        for chunk in _chunk(segments)
    ]


def embed(sermon: Sermon) -> list[SermonChunkEmbedding]:
    chunks: Sequence[SermonChunk] = db.session.scalars(
        db.select(SermonChunk)
        .join(SermonChunkEmbedding, isouter=True)
        .where(SermonChunk.sermon_id == sermon.id)
        .where(SermonChunkEmbedding.sermon_chunk_id.is_(None))
    ).all()

    input = [chunk.text for chunk in chunks]
    batch = ollama.embed(model=EMBEDDING_MODEL, input=input)
    return [
        SermonChunkEmbedding(
            sermon_chunk_id=chunk.id,
            embedding=embedding,
        )
        for (chunk, embedding) in zip(chunks, batch.embeddings, strict=True)
    ]


def _chunk(segments: list[TranscriptSegment]) -> list[TranscriptSegment]:
    segments.sort(key=lambda s: s["start"])

    window = []
    window_len = 0
    chunks = []

    for segment in segments:
        segment_len = len(segment)
        if window_len + segment_len > CHUNK_SIZE_MAX:
            _append_new_chunk(window, chunks)
            window_len = _shift_window(window, window_len)
        window.append(segment)
        window_len += segment_len

    _append_new_chunk(window, chunks)
    return chunks


def _shift_window(window: list[TranscriptSegment], window_len: int) -> int:
    new_window_len = ceil(len(window) * CHUNK_OVERLAP_PERCENT_MIN / 100)
    while window_len - len(window[0]) > new_window_len:
        chunk = window.pop(0)
        window_len -= len(chunk)
    return window_len


def _append_new_chunk(
    window: list[TranscriptSegment], chunks: list[TranscriptSegment]
) -> None:
    chunk = reduce(lambda acc, segment: acc + segment, window)
    chunks.append(chunk)
