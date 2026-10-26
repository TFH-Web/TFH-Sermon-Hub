"""Shared hybrid chunk retrieval for sermon search and grounded AI chat."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from math import isfinite

from sqlalchemy import and_, case, func, or_, type_coerce
from sqlalchemy.orm import load_only

from tsh import embeddings
from tsh.database import db
from tsh.models import (
    Float32Vector,
    Sermon,
    SermonChunk,
    SermonChunkEmbedding,
    Speaker,
    UploadStatus,
)
from tsh.search_ranking import MAX_DISTANCE, KeywordQuery, blend_score, normalize_text
from tsh.youtube_import import VIDEO_ID, parse_video_id

# How many chunks a question can draw on before the context budget trims them.
CANDIDATE_LIMIT = 8


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
    distance: float | None
    score: float = 0.0
    lexical_score: float = 0.0


def _speaker_filter(speaker: str | None) -> str:
    value = normalize_text(speaker or "")
    return "" if value in ("any", "all", "all speakers") else value


def sermon_filters(
    *,
    sermon_id: int | None = None,
    speaker: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple:
    """Shared SQL eligibility; call speaker_matches too for Unicode name matching."""
    conditions = [Sermon.status == UploadStatus.PUBLISHED]
    if sermon_id is not None:
        conditions.append(Sermon.id == sermon_id)
    name = _speaker_filter(speaker)
    if name.isdecimal():
        conditions.append(Sermon.speaker_id == int(name))
    if date_from is not None:
        conditions.append(Sermon.date >= date_from)
    if date_to is not None:
        conditions.append(Sermon.date <= date_to)
    return tuple(conditions)


def speaker_matches(
    speaker: str | None, speaker_id: int, first_name: str, last_name: str
) -> bool:
    """Match a speaker ID or full name, including Unicode casefold equivalence."""
    value = _speaker_filter(speaker)
    if not value:
        return True
    if value.isdecimal():
        return speaker_id == int(value)
    return value == normalize_text(f"{first_name} {last_name}")


def retrieve_chunks(
    query: str,
    sermon_id: int | None = None,
    limit: int | None = CANDIDATE_LIMIT,
    *,
    speaker: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[RetrievedChunk]:
    """Rank eligible chunks by semantic and keyword evidence, before optional limiting.

    limit=None returns all admitted chunks so search can group/count before paging.
    Missing-model or unembedded chunks may supply lexical evidence only; chunks recorded
    with another model are excluded. CASE guards cosine evaluation so legacy vectors
    are never compared. Provider/schema/vector failures propagate instead of returning
    a misleading empty result. Nonpositive limits return [] without embedding.
    """
    if limit is not None and limit <= 0:
        return []
    embeddings.check_schema_dimension()
    vector = embeddings.validate_vector(embeddings.embed_query(query))
    if not any(vector):
        raise embeddings.EmbeddingError(
            "Query embedding must be nonzero for cosine search"
        )
    keywords = KeywordQuery(query)
    has_vector = and_(
        SermonChunk.embedding_model == embeddings.EMBEDDING_MODEL,
        SermonChunkEmbedding.sermon_chunk_id.is_not(None),
    )
    distance = case(
        (
            has_vector,
            func.vec_distance_cosine(
                SermonChunkEmbedding.embedding, type_coerce(vector, Float32Vector())
            ),
        ),
        else_=None,
    ).label("distance")
    # Exact sqlite-vec scan over eligible rows, not a globally truncated nearest-neighbor
    # page. Selecting only needed fields avoids loading captions, summaries or raw vectors.
    statement = (
        db.select(SermonChunk, Sermon, distance, Speaker.first_name, Speaker.last_name)
        .join(Sermon, Sermon.id == SermonChunk.sermon_id)
        .join(Speaker, Speaker.id == Sermon.speaker_id)
        .outerjoin(
            SermonChunkEmbedding, SermonChunkEmbedding.sermon_chunk_id == SermonChunk.id
        )
        .options(
            load_only(
                SermonChunk.id, SermonChunk.text, SermonChunk.start, SermonChunk.end
            ),
            load_only(
                Sermon.id,
                Sermon.title,
                Sermon.youtube_video_id,
                Sermon.video_link,
                Sermon.speaker_id,
            ),
        )
        .where(
            *sermon_filters(
                sermon_id=sermon_id,
                speaker=speaker,
                date_from=date_from,
                date_to=date_to,
            ),
            SermonChunk.stale.is_(False),
            or_(
                SermonChunk.embedding_model == embeddings.EMBEDDING_MODEL,
                SermonChunk.embedding_model.is_(None),
            ),
        )
    )

    results = []
    # All eligibility and hybrid scores precede the limit; a lexical hit outside a
    # semantic top-k must remain visible, and invalid sources cannot consume a slot.
    with db.session.execute(statement.execution_options(yield_per=32)) as rows:
        for chunk, sermon, chunk_distance, first_name, last_name in rows:
            if not speaker_matches(speaker, sermon.speaker_id, first_name, last_name):
                continue
            if not isinstance(sermon.title, str) or not sermon.title.strip():
                continue
            if not isinstance(chunk.text, str) or not chunk.text.strip():
                continue
            times = (chunk.start, chunk.end)
            if not all(
                isinstance(value, (int, float)) and isfinite(value) for value in times
            ):
                continue
            if chunk.start < 0 or chunk.end < chunk.start:
                continue
            video_id = video_id_for(sermon)
            if video_id is None:
                continue
            if chunk_distance is not None and not isfinite(chunk_distance):
                chunk_distance = None
            lexical_score = keywords.score(chunk.text)
            if (
                not (chunk_distance is not None and chunk_distance <= MAX_DISTANCE)
                and lexical_score == 0
            ):
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
                    score=blend_score(chunk_distance, lexical_score),
                    lexical_score=lexical_score,
                )
            )
    results.sort(key=lambda hit: (-hit.score, hit.chunk_id))
    return results if limit is None else results[:limit]


def video_id_for(sermon: Sermon) -> str | None:
    """Return the sermon's YouTube video id if it is a well-formed 11 character id, else None.

    Imported sermons store the id; sermons added by hand only have a link, the same
    fallback fetch_transcript uses.
    """
    video_id = sermon.youtube_video_id or parse_video_id(sermon.video_link or "")
    if video_id and re.fullmatch(VIDEO_ID, video_id):
        return video_id
    return None
