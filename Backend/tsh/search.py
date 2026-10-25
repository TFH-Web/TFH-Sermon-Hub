"""Published-sermon search: shared chunk retrieval, metadata recall and paging."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy.orm import defer, joinedload, selectinload

from tsh import retrieval
from tsh.database import db
from tsh.models import Sermon
from tsh.pagination import validate_page, validate_page_size
from tsh.search_ranking import WORDS, KeywordQuery, blend_score

MAX_QUERY_CHARS = 1000
METADATA_SNIPPET_CHARS = 500
ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class SearchInputError(ValueError):
    """A query/filter/page value does not follow the public search contract."""


@dataclass(frozen=True)
class SearchOptions:
    query: str
    content_type: str
    speaker: str | None
    date_from: date | None
    date_to: date | None
    page: int | None
    page_size: int | None


def _today() -> date:
    return datetime.now(
        ZoneInfo(current_app.config.get("YOUTUBE_TIMEZONE", "America/Los_Angeles"))
    ).date()


def _iso_date(value: str) -> date:
    if not ISO_DATE.fullmatch(value):
        raise SearchInputError("Use YYYY-MM-DD for search dates")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise SearchInputError("Invalid search date") from error


def _date_bounds(value: str) -> tuple[date | None, date | None]:
    value = value.strip().casefold()
    if value in ("", "any", "all"):
        return None, None
    days = {"24h": 1, "7d": 7, "14d": 14, "28d": 28, "1y": 365}
    if value in days:
        today = _today()
        return today - timedelta(days=days[value]), today
    if re.fullmatch(r"[0-9]{4}", value):
        try:
            return date(int(value), 1, 1), date(int(value), 12, 31)
        except ValueError as error:
            raise SearchInputError("Invalid search year") from error
    if value.startswith("custom|"):
        parts = value.split("|")
        if len(parts) != 3:
            raise SearchInputError("Invalid custom date range")
        return tuple(_iso_date(part) if part else None for part in parts[1:])
    raise SearchInputError("Invalid date filter")


def parse_options(args: Mapping[str, str]) -> SearchOptions:
    """Validate filters and the existing opt-in pagination rules before embedding."""
    query = args.get("q", "").strip()
    if len(query) > MAX_QUERY_CHARS:
        raise SearchInputError(
            f"Search query must be {MAX_QUERY_CHARS} characters or fewer"
        )
    content_type = args.get("type", "all").strip().casefold()
    if content_type not in ("all", "sermon", "transcript", "note"):
        raise SearchInputError("Unsupported content type")
    speaker = (
        args.get("speaker_id") or args.get("speakerId") or args.get("speaker") or "any"
    ).strip()
    if len(speaker) > 200:
        raise SearchInputError("Speaker filter must be 200 characters or fewer")
    if speaker.isdecimal() and (
        len(speaker) > 19 or not 1 <= int(speaker) <= 2**63 - 1
    ):
        raise SearchInputError("Speaker ID must be a positive database ID")
    start, end = _date_bounds(args.get("date", "any"))
    explicit_start = args.get("date_from") or args.get("dateFrom")
    explicit_end = args.get("date_to") or args.get("dateTo")
    if explicit_start:
        start = max(filter(None, (start, _iso_date(explicit_start.strip()))))
    if explicit_end:
        end = min(filter(None, (end, _iso_date(explicit_end.strip()))))
    if start and end and start > end:
        raise SearchInputError("Date range start must not be after its end")

    page = page_size = None
    if "page" in args:
        page = validate_page(args["page"])
        if not isinstance(page, int):
            raise SearchInputError(page[0]["message"])
        page_size = validate_page_size(
            args.get("pageSize") or args.get("page_size") or args.get("per_page"),
            default=10,
            max=100,
        )
        if not isinstance(page_size, int):
            raise SearchInputError(page_size[0]["message"])
    return SearchOptions(query, content_type, speaker, start, end, page, page_size)


def _result(
    sermon: Sermon,
    options: SearchOptions,
    snippet: str,
    score: float,
    chunk: retrieval.RetrievedChunk | None = None,
) -> dict:
    video_id = chunk.youtube_video_id if chunk else retrieval.video_id_for(sermon)
    return {
        "id": sermon.id,
        "sermonId": sermon.id,
        "title": sermon.title,
        "type": "transcript" if options.content_type == "transcript" else "sermon",
        "speaker": f"{sermon.speaker.first_name} {sermon.speaker.last_name}",
        "date": sermon.date.isoformat(),
        "series": sermon.series.title if sermon.series else "",
        "snippet": snippet,
        "summary": snippet,
        "score": score,
        "ai_score": score,
        "chunk_id": chunk.chunk_id if chunk else None,
        "start_sec": chunk.start_sec if chunk else None,
        "end_sec": chunk.end_sec if chunk else None,
        "youtube_video_id": video_id,
        # Never send an unchecked stored URL for a client to render as a link.
        "video_link": f"https://www.youtube.com/watch?v={video_id}"
        if video_id
        else None,
    }


def _metadata_snippet(text: str, keywords: KeywordQuery) -> str:
    """Keep a matching word visible without inventing a transcript location."""
    text = text.strip()
    if len(text) <= METADATA_SNIPPET_CHARS:
        return text
    first_match = next(
        (
            word
            for word in WORDS.finditer(text)
            if word.group().casefold() in keywords.terms
        ),
        None,
    )
    start = max(0, first_match.start() - 80) if first_match else 0
    prefix = "…" if start else ""
    end = min(len(text), start + METADATA_SNIPPET_CHARS - len(prefix))
    excerpt = text[start:end]
    if end < len(text):
        excerpt = excerpt[:-1].rstrip() + "…"
    return prefix + excerpt


def _matching_sermons(options: SearchOptions) -> list[dict]:
    if (
        not options.query
        or not re.search(r"\w", options.query)
        or options.content_type == "note"
    ):
        return []
    # No global top-k: page size must never change the admitted matching set or total.
    chunks = retrieval.retrieve_chunks(
        options.query,
        limit=None,
        speaker=options.speaker,
        date_from=options.date_from,
        date_to=options.date_to,
    )
    statement = (
        db.select(Sermon)
        .where(
            *retrieval.sermon_filters(
                speaker=options.speaker,
                date_from=options.date_from,
                date_to=options.date_to,
            )
        )
        .options(
            defer(Sermon.transcript),
            defer(Sermon.transcript_segments),
            joinedload(Sermon.speaker),
            joinedload(Sermon.series),
            selectinload(Sermon.tags),
        )
    )
    sermons = {
        sermon.id: sermon
        for sermon in db.session.scalars(statement)
        if retrieval.speaker_matches(
            options.speaker,
            sermon.speaker_id,
            sermon.speaker.first_name,
            sermon.speaker.last_name,
        )
    }
    results = {}
    for chunk in chunks:
        if chunk.sermon_id in sermons and chunk.sermon_id not in results:
            # Retrieval is score/chunk-ID ordered. Keep the full saved chunk so the
            # snippet actually starts at start_sec rather than an invented text offset.
            results[chunk.sermon_id] = _result(
                sermons[chunk.sermon_id],
                options,
                chunk.text.strip(),
                chunk.score,
                chunk,
            )

    if options.content_type != "transcript":
        keywords = KeywordQuery(options.query)
        for sermon in sermons.values():
            if sermon.id in results:
                continue  # An admitted source chunk is preferable to timeless metadata.
            fields = [
                sermon.title,
                sermon.description,
                sermon.summary or "",
                f"{sermon.speaker.first_name} {sermon.speaker.last_name}",
                sermon.series.title if sermon.series else "",
                *(tag.name for tag in sorted(sermon.tags, key=lambda tag: tag.name)),
            ]
            score, text = max(
                ((keywords.score(text), text) for text in fields),
                key=lambda item: item[0],
            )
            if score > 0:
                results[sermon.id] = _result(
                    sermon,
                    options,
                    _metadata_snippet(text, keywords),
                    blend_score(None, score),
                )
    return sorted(results.values(), key=lambda result: (-result["score"], result["id"]))


def search_sermons(args: Mapping[str, str]) -> dict | list[dict]:
    """Return a complete legacy array or a page with a distinct-sermon matching total."""
    options = parse_options(args)
    results = _matching_sermons(options)
    if options.page is None:
        return results
    total = len(results)
    offset = (options.page - 1) * options.page_size
    items = results[offset : offset + options.page_size]
    pages = math.ceil(total / options.page_size)
    return {
        "items": items,
        "results": items,
        "total": total,
        "page": options.page,
        "pageSize": options.page_size,
        "page_size": options.page_size,
        "totalPages": pages,
        "total_pages": pages,
    }
