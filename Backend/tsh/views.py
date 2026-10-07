from flask import Blueprint, current_app, g, jsonify, request
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError
from sqlalchemy import false, func
from sqlalchemy.orm import defer, with_expression
from tsh.auth import require_role

from tsh.database import db
from tsh.models import (
    Series,
    Sermon,
    Speaker,
    Tag,
    UploadStatus,
    sermon_tag_m2m,
)
from tsh.pagination import paginate
from tsh.pipeline import start_processing
from tsh.queue import enqueue
from tsh.youtube import YouTubeError
from tsh.youtube_import import VideoImportError, import_channel, import_video, parse_video_id
from tsh.schemas import (
    counted_speakers_schema,
    counted_tags_schema,
    series_page_schema,
    series_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
)

api = Blueprint("api", __name__, url_prefix="/api")


DEFAULT_PER_PAGE = 12
MAX_PER_PAGE = 100


def read_page_args() -> tuple[int, int]:
    # Anything missing or not a number falls back to default, and the numbers are kept in range so nobody can ask for page 0 or a million rows.
    page = max(request.args.get("page", default=1, type=int), 1)
    per_page = request.args.get("per_page", default=DEFAULT_PER_PAGE, type=int)
    per_page = min(max(per_page, 1), MAX_PER_PAGE)
    return page, per_page

# TODO: use paginate()
@api.route("/series")
@require_role("Internal User", "Admin")
def get_all_series():
    page, per_page = read_page_args()

    total = db.session.scalar(db.select(func.count()).select_from(Series))

    # One row per series, with its number worked out across ALL of its sermons.
    # The page limit only decides which series come back, never which sermons get counted, so a card shows the same numbers on any page.
    # outerjoin keeps series that have no sermons, with a count of 0.
    last_sermon_date = func.max(Sermon.date)
    rows = db.session.execute(
        db.select(
            Series,
            func.count(Sermon.id),
            func.min(Sermon.date),
            last_sermon_date,
        )
        .outerjoin(Sermon, Sermon.series_id == Series.id)
        .group_by(Series.id)

        # Most recently preached first, empty series at the end.
        # Series.id break ties, so the order never shifts between page requests.
        .order_by(last_sermon_date.desc().nulls_last(), Series.id)
        .limit(per_page)
        .offset((page - 1) * per_page)
    ).all()

    # Speakers for just the series on this page, in one query rather than one query per card
    series_ids = [series.id for series, *_ in rows]
    speaker_by_series: dict[int, list[Speaker]] = {sid: [] for sid in series_ids}
    speaker_rows = db.session.execute(
        db.select(Sermon.series_id, Speaker)
        .join(Speaker, Sermon.speaker_id == Speaker.id)
        .where(Sermon.series_id.in_(series_ids))
        .distinct()
        .order_by(Speaker.last_name, Speaker.first_name)
    ).all()
    for series_id, speaker in speaker_rows:
        speaker_by_series[series_id].append(speaker)

    items = [
        {
            "id": series.id,
            "title": series.title,
            "sermon_count": sermon_count,
            "first_date": first_date,
            "last_date": last_date,
            "speakers": speaker_by_series[series.id],
        }
        for series, sermon_count, first_date, last_date in rows
    ]

    return series_page_schema.dump(
        {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    )


@api.route("/series/<int:id>")
@require_role("Internal User", "Admin")
def get_series(id: int):
    series = db.get_or_404(Series, id, description=f"Series with id {id} not found")
    result = series_schema.dump(series)
    return result


@api.route("/speakers")
@require_role("Internal User", "Admin")
def get_speakers():
    query = (
        db.select(Speaker)
        .join(Sermon, isouter=True)
        .group_by(Speaker.id)
        .options(with_expression(Speaker.sermon_count, func.count(Sermon.id)))
    )

    sort_param = request.args.get("sort", "Default").strip().lower()
    if sort_param == 'a-z':
        query = query.order_by(Speaker.first_name.asc(), Speaker.id.asc())
    elif sort_param == 'z-a':
        query = query.order_by(Speaker.first_name.desc(), Speaker.id.desc())

    pagination = paginate(query, request, counted_speakers_schema, "speakers", max_page_size=30)
    if pagination is None:
        speakers = db.session.execute(query).scalars()
        return counted_speakers_schema.dump(speakers)

    return pagination


@api.route("/speakers/<int:id>")
@require_role("Internal User", "Admin")
def get_speaker(id: int):
    speaker = db.get_or_404(Speaker, id, description=f"Speaker with id {id} not found")
    result = speaker_schema.dump(speaker)
    return result


@api.route("/sermons")
@require_role("Internal User", "Admin")
def get_sermons():
    query = db.select(Sermon).options(
        defer(Sermon.transcript), defer(Sermon.transcript_segments)
    )

    # 1. Status filter
    status_param = request.args.get("status", "").strip()
    if status_param and status_param.lower() != "all":
        matching_status = next(
            (
                s
                for s in UploadStatus
                if s.value.lower() == status_param.lower()
                or s.name.lower() == status_param.lower()
            ),
            None,
        )
        if matching_status:
            query = query.where(Sermon.status == matching_status)
        else:
            query = query.where(false())

    # 2. Tag / topic filter (topics correspond to tags, identified by name)
    # Uses EXISTS subquery to prevent sermon duplication and keep counts accurate
    topic_param = (request.args.get("topic") or request.args.get("tag") or "").strip()
    if topic_param and topic_param.lower() != "all":
        query = query.where(
            Sermon.tags.any(func.lower(Tag.name) == topic_param.lower())
        )

    # 3. Speaker filter (by ID or full name)
    speaker_param = (
        request.args.get("speaker_id")
        or request.args.get("speakerId")
        or request.args.get("speaker")
        or ""
    ).strip()
    if speaker_param and speaker_param.lower() not in ("all", "all speakers"):
        if speaker_param.isdigit():
            query = query.where(Sermon.speaker_id == int(speaker_param))
        else:
            query = query.where(
                Sermon.speaker.has(
                    func.lower(Speaker.first_name + " " + Speaker.last_name)
                    == speaker_param.lower()
                )
            )

    # 4. Series filter (by ID or title)
    series_param = (
        request.args.get("series_id")
        or request.args.get("seriesId")
        or request.args.get("series")
        or ""
    ).strip()
    if series_param and series_param.lower() not in ("all", "all series"):
        if series_param.isdigit():
            query = query.where(Sermon.series_id == int(series_param))
        else:
            query = query.where(
                Sermon.series.has(func.lower(Series.title) == series_param.lower())
            )

    # 5. Sorting: "Newest" (default), "Oldest", and "Relevance" (behaves as Newest)
    # Sermon ID is used as secondary tie-breaker to ensure stable ordering
    sort_param = request.args.get("sort", "Newest").strip().lower()
    if sort_param == "oldest":
        query = query.order_by(Sermon.date.asc(), Sermon.id.asc())
    else:
        query = query.order_by(Sermon.date.desc(), Sermon.id.desc())

    # 6. Opt-in pagination
    pagination = paginate(query, request, sermons_schema, "sermons")
    if pagination is None:
        # Legacy mode: return complete unpaginated array
        sermons = db.session.execute(query).scalars().all()
        return sermons_schema.dump(sermons)

    return pagination


@api.route("/sermons/<int:id>")
@require_role("Internal User", "Admin")
def get_sermon(id: int):
    sermon = db.get_or_404(Sermon, id, description=f"Sermon with id {id} not found")
    result = sermon_schema.dump(sermon)
    return result


@api.get("/sermons/<int:id>/transcript")
@require_role("Internal User", "Admin")
def get_sermon_transcript(id: int):
    """Return saved transcript text and cue times; 401/403 without access, 404 for a missing sermon."""
    sermon = db.get_or_404(Sermon, id, description=f"Sermon with id {id} not found")
    # Keep the cue list out of library responses, which already load many sermons at once.
    return {"transcript": sermon.transcript, "segments": sermon.transcript_segments or []}


@api.post("/sermons/<int:id>/reprocess")
@require_role("Admin")
def reprocess_sermon(id: int):
    """Run the processing pipeline on a sermon again.

    Sets status PROCESSING, clears processing_error and queues the job.
    Returns 202 with the sermon. Without REDIS_URL the job has already run, so the status is final.
    Sends 401 without a valid token, 403 for non-Admins, 404 if the sermon does not exist,
    and 503 if Redis cannot be reached (the sermon is left FAILED with the reason).
    """
    sermon = db.get_or_404(Sermon, id, description=f"Sermon with id {id} not found")
    try:
        start_processing(sermon)
    except (RedisConnectionError, RedisTimeoutError):
        current_app.logger.exception("Could not queue sermon %s", id)
        message = "The job queue is unavailable. Please try again later."
        return jsonify({"error": message, "message": message}), 503
    return sermon_schema.dump(sermon), 202


@api.post("/import/youtube")
@require_role("Admin")
def import_youtube():
    """Import every playlist and video from the YouTube channel.

    Returns 202 with {"queued": true, "jobId": ...} when the import was sent to the worker, or
    200 with {"queued": false, "report": {...}} when it already ran inline (no REDIS_URL). See ImportReport for the fields.
    Sends 401 without a valid token, 403 for non-Admins, 502 if YouTube fails during an inline run,
    and 503 if Redis cannot be reached.
    """
    try:
        result = enqueue(import_channel)
    except (RedisConnectionError, RedisTimeoutError):
        current_app.logger.exception("Could not queue the YouTube import")
        message = "The job queue is unavailable. Please try again later."
        return jsonify({"error": message, "message": message}), 503
    except YouTubeError as e:
        current_app.logger.exception("YouTube import failed")
        message = f"YouTube import failed: {e}"
        return jsonify({"error": message, "message": message}), 502

    if current_app.config["REDIS_URL"]:
        return jsonify({"queued": True, "jobId": result.id}), 202
    return jsonify({"queued": False, "report": result.as_dict()}), 200


@api.post("/import/youtube/video")
@require_role("Admin")
def import_youtube_video():
    """Import one video from a YouTube URL in the body: {"url": "..."}. Runs right away, not on the worker.

    Accepts youtube.com/watch?v=, youtu.be/ and youtube.com/shorts/ URLs.
    Returns 201 with the new sermon, or 200 with the existing one if the video was already imported.
    Sends 400 if the URL is missing or not a YouTube video URL, 401 without a valid token, 403 for non-Admins,
    404 if the video is private, deleted or missing, 422 if it is still streaming or longer than YOUTUBE_MAX_MINUTES,
    and 502 if YouTube fails.
    """
    body = request.get_json(silent=True) or {}
    url = body.get("url") if isinstance(body, dict) else None
    video_id = parse_video_id(url) if isinstance(url, str) else None
    if video_id is None:
        message = "Send a YouTube video URL as {\"url\": \"...\"}, e.g. https://www.youtube.com/watch?v=..."
        return jsonify({"error": message, "message": message}), 400

    try:
        sermon, created = import_video(video_id)
    except VideoImportError as e:
        return jsonify({"error": str(e), "message": str(e)}), e.status
    return sermon_schema.dump(sermon), 201 if created else 200


@api.route("/tags")
@require_role("Internal User", "Admin")
def get_tags():
    query = (
        db.select(Tag)
        .outerjoin(sermon_tag_m2m)
        .group_by(Tag.name)
        .options(
            with_expression(Tag.count, func.count(sermon_tag_m2m.c.sermon_id))
        )
        .order_by(Tag.name.asc())
    )

    # Opt-in: only tags attached to at least one sermon (e.g. for filter choices)
    used_param = request.args.get("used", "").strip().lower()
    if used_param in ("true", "1"):
        query = query.having(func.count(sermon_tag_m2m.c.sermon_id) > 0)

    pagination = paginate(query, request, counted_tags_schema, "tags")
    if pagination is None:
        tags = db.session.execute(query).scalars()
        return counted_tags_schema.dump(tags)

    return pagination


@api.route("/")
def hello_world():
    return "<p>Hello, world!</p>"


@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/whoami")
@require_role("Internal User")
def whoami():
    return jsonify({"roles": g.current_user_role})


@api.get("/search")
@require_role("Internal User", "Admin")
def search():
    query = request.args.get("q", "").strip().lower()
    content_type = request.args.get("type", "all").strip().lower()
    speaker = request.args.get("speaker", "any").strip()
    date = request.args.get("date", "any").strip()

    results = [
        {
            "id": 1,
            "title": "Faith Over Fear",
            "type": "sermon",
            "speaker": "Dave",
            "date": "2024",
            "summary": "A sermon about trusting God when fear and anxiety feel overwhelming.",
            "ai_score": 0.97,
        },
        {
            "id": 2,
            "title": "Overcoming Anxiety Transcript",
            "type": "transcript",
            "speaker": "Dave",
            "date": "2024",
            "summary": "Transcript discussing anxiety, prayer, and peace.",
            "ai_score": 0.93,
        },
        {
            "id": 3,
            "title": "Grace Notes",
            "type": "note",
            "speaker": "Michael",
            "date": "2023",
            "summary": "Staff notes focused on grace, healing, and hope.",
            "ai_score": 0.88,
        },
        {
            "id": 4,
            "title": "Hope in Hard Times",
            "type": "sermon",
            "speaker": "Tim",
            "date": "2022",
            "summary": "A sermon on hope, resilience, and endurance through hardship.",
            "ai_score": 0.84,
        },
    ]

    filtered = results

    if query:
        filtered = [
            item
            for item in filtered
            if query in item["title"].lower() or query in item["summary"].lower()
        ]

    if content_type != "all":
        filtered = [item for item in filtered if item["type"] == content_type]

    if speaker.lower() != "any":
        filtered = [
            item for item in filtered if item["speaker"].lower() == speaker.lower()
        ]

    if date.lower() != "any":
        filtered = [item for item in filtered if item["date"] == date]

    filtered.sort(key=lambda item: item["ai_score"], reverse=True)

    return filtered


