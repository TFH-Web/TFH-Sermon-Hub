# Finds the sermon chunks closest in meaning to a question, for AI chat.
# Stands in for the shared TFH-462 search service until it lands; keep the signature so
# switching over is a one-line change in chat.py.
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import func, type_coerce

from tsh import embeddings
from tsh.database import db
from tsh.models import (
    Float32Vector,
    Sermon,
    SermonChunk,
    SermonChunkEmbedding,
    UploadStatus,
)
from tsh.youtube_import import VIDEO_ID, parse_video_id

# How many chunks a question can draw on before the context budget trims them.
CANDIDATE_LIMIT = 8
# Cosine distance runs from 0 (same direction) to 2 (opposite). Chunks further than this
# from the question are not treated as evidence, so an unrelated question gets no sources.
MAX_DISTANCE = 0.6


@dataclass(frozen=True)
class RetrievedChunk:
    """One chunk of evidence, with what a citation needs to link back to its moment."""

    chunk_id: int
    sermon_id: int
    title: str
    youtube_video_id: str
    start_sec: float
    end_sec: float
    text: str
    distance: float


def retrieve_chunks(
    query: str, sermon_id: int | None = None, limit: int = CANDIDATE_LIMIT
) -> list[RetrievedChunk]:
    """Return up to limit relevant chunks from PUBLISHED sermons, nearest first.

    Only chunks embedded with the configured EMBEDDING_MODEL are eligible, so vectors from
    two models are never compared. sermon_id restricts eligibility before the limit is
    applied; a missing or unpublished sermon gives []. Chunks without a valid YouTube video
    id are skipped, since a citation must link to the video. Raises EmbeddingError for a
    dimension mismatch or a bad query vector, and whatever ollama raises if it is down.
    """
    embeddings.check_schema_dimension()
    vector = embeddings.embed_query(query)
    distance = func.vec_distance_cosine(
        SermonChunkEmbedding.embedding, type_coerce(vector, Float32Vector())
    ).label("distance")
    # Note: exact scan over every eligible vector, so filters apply before the limit;
    # move to a vec0 KNN with metadata columns if the archive outgrows a full scan.
    statement = (
        db.select(SermonChunk, Sermon, distance)
        .join(SermonChunkEmbedding, SermonChunkEmbedding.sermon_chunk_id == SermonChunk.id)
        .join(Sermon, Sermon.id == SermonChunk.sermon_id)
        .where(
            Sermon.status == UploadStatus.PUBLISHED,
            SermonChunk.embedding_model == embeddings.EMBEDDING_MODEL,
            distance <= MAX_DISTANCE,
        )
        .order_by(distance, SermonChunk.id)
        .limit(limit)
    )
    if sermon_id is not None:
        statement = statement.where(SermonChunk.sermon_id == sermon_id)

    results = []
    for chunk, sermon, chunk_distance in db.session.execute(statement):
        video_id = video_id_for(sermon)
        if video_id is None:
            continue
        results.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                sermon_id=sermon.id,
                title=sermon.title,
                youtube_video_id=video_id,
                start_sec=chunk.start,
                end_sec=chunk.end,
                text=chunk.text,
                distance=chunk_distance,
            )
        )
    return results


def video_id_for(sermon: Sermon) -> str | None:
    """Return the sermon's YouTube video id if it is a well-formed 11 character id, else None.

    Imported sermons store the id; sermons added by hand only have a link, the same
    fallback fetch_transcript uses.
    """
    video_id = sermon.youtube_video_id or parse_video_id(sermon.video_link or "")
    if video_id and re.fullmatch(VIDEO_ID, video_id):
        return video_id
    return None
