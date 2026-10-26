from datetime import date

from flask import Blueprint, current_app, g, jsonify, request
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError
from sqlalchemy import false, func
from sqlalchemy.orm import defer, with_expression
from tsh import chat as chat_service
from tsh import search as search_service
from tsh.auth import require_role
from tsh.embeddings import EmbeddingError

# API routes for series, speakers, and sermons
from marshmallow import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge

from tsh.database import db
from tsh import schemas
from tsh.models import (
    Series,
    Sermon,
    Speaker,
    SyncRun,
    SyncRunState,
    Tag,
    TagSource,
    UploadStatus,
    sermon_tag_m2m,
)
from tsh.pagination import paginate
from tsh.pipeline import regenerate_summary, start_processing
from tsh.queue import enqueue
from tsh.youtube_import import VideoImportError, active_sync_run, import_video, parse_video_id, start_sync
from tsh.schemas import (
    counted_speakers_schema,
    counted_tags_schema,
    series_page_schema,
    series_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
    tag_schema,
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

                                                                                # Post Sermon
@api.post("/sermons")
@require_role("Admin")
def create_sermon():
    """Create a new sermon from validated data and existing related records."""
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"message": "Validation failed", "errors": {"_schema": ["A JSON object is required"]}}), 422

    # Require references to existing records
    errors = {}
    speakers_data = payload.get("speaker", payload.get("speakers"))
    series_data = payload.get("series")
    tag_data = payload.get("tags", [])
                                                                                # Speaker
    if not isinstance(speakers_data, dict) or not isinstance(speakers_data.get("id"), int) or isinstance(speakers_data.get("id"), bool):
        errors["speakers"] = ["A valid speaker ID is required"]
                                                                                # Series
    if series_data is not None and (not isinstance(series_data, dict) or not isinstance(series_data.get("id"), int) or isinstance(series_data.get("id"), bool)):
        errors["series"] = ["A valid series ID is required"]
                                                                                # Tags
    if not isinstance(tag_data, list):
        errors["tags"] = ["Tags must be a list."]

    elif any(not isinstance(tag, dict) or not isinstance(tag.get("name"), str) for tag in tag_data):
        errors["tags"] = ["Each tag must contain the name of an existing tag."]

    if errors:
        return jsonify({"message": "Validation failed", "errors": errors}), 422

    # Resolve relationships without creating new speakers, series, or tags
    speaker = db.session.get(Speaker, speakers_data["id"])

                                                                                # Speaker
    if speaker is None:
        errors["speakers"] = ["Speaker not found"]
                                                                                # Series
    series = None
    if series_data is not None:
        series = db.session.get(Series, series_data["id"])
        if series is None:
            errors["series"] = ["Series not found"]
                                                                                # Tags
    tags = []
    tag_names = [tag["name"].strip() for tag in tag_data]

    if any(not name for name in tag_names):
        errors["tags"] = ["Tag names cannot be empty."]

    elif len(tag_names) != len(set(tag_names)):
        errors["tags"] = ["Duplicate tag names are not allowed."]

    else:
        for tag_name in tag_names:
            tag = db.session.execute(db.select(Tag).filter_by(name=tag_name)).scalar_one_or_none()
            if tag is None:
                errors.setdefault("tags", []).append(f'Tag "{tag_name}" not found')
            else:
                tags.append(tag)

    if errors:
        return jsonify({"message": "Validation failed", "errors": errors}), 422

    # Build trusted nested data from database records, not client-supplied
    # speaker names, series titles, or tag source values.
    normalized = dict(payload)
    normalized.pop("speakers", None)
    normalized.pop("speaker", None)
    normalized.pop("series", None)
    normalized.pop("tags", None)

    normalized["status"] = "draft"

    try:
        sermon = sermon_schema.load(normalized)
    except ValidationError as err:
        return jsonify({"message": "Validation failed", "errors": err.messages}), 422

    # Ensure relationships point to existing database records
    sermon.speaker = speaker
    sermon.series = series
    sermon.tags = tags

    try:
        db.session.add(sermon)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to create sermon")
        return jsonify({"message": "Failed to save sermon"}), 500
    return sermon_schema.dump(sermon), 201

                                                                                # PATCH Sermon
@api.patch("/sermons/<int:id>")
@require_role("Admin")
def update_sermon(id: int):
    """Partially update an existing sermon."""
    sermon = db.session.get(Sermon, id)

    # Return early if the sermon does not exist
    if sermon is None:
        return jsonify({"message": f"Sermon with id {id} not found"}), 404

    payload = request.get_json(silent=True)

    # Ensure the request contains a JSON object
    if not isinstance(payload, dict):
        return jsonify({"message": "Validation failed","errors": {"_schema": ["A JSON object is required"]},}), 422

    errors = {}

    # Resolve speaker if client supplied
    speaker = sermon.speaker
    if "speaker" in payload or "speakers" in payload:
        speaker_data = payload.get("speaker", payload.get("speakers"))

        if not isinstance(speaker_data, dict):
            errors["speaker"] = ["A valid speaker ID is required"]
        else:
            speaker_id = speaker_data.get("id")
            if (not isinstance(speaker_id, int)or isinstance(speaker_id, bool)):
                errors["speaker"] = ["A valid speaker ID is required"]
            else:
                speaker = db.session.get(Speaker, speaker_id)
                if speaker is None:
                    errors["speaker"] = ["Speaker not found"]

    # Resolve a series if client supplied
    series = sermon.series
    if "series" in payload:
        series_data = payload["series"]

        if series_data is None:
            series = None
        elif (not isinstance(series_data, dict)or not isinstance(series_data.get("id"), int)or isinstance(series_data.get("id"), bool)):
            errors["series"] = ["A valid series ID is required, or null"]
        else:
            series = db.session.get(Series, series_data["id"])
            if series is None:
                errors["series"] = ["Series not found"]

    # Resolve tags if client supplied
    tags = sermon.tags
    if "tags" in payload:
        tag_data = payload["tags"]

        if not isinstance(tag_data, list):
            errors["tags"] = ["Tags must be a list."]
        elif any(not isinstance(tag, dict)or not isinstance(tag.get("name"), str)for tag in tag_data):
            errors["tags"] = ["Each tag must contain the name of an existing tag."]
        else:
            tag_names = [tag["name"].strip() for tag in tag_data]

            if any(not name for name in tag_names):
                errors["tags"] = ["Tag names cannot be empty."]
            elif len(tag_names) != len(set(tag_names)):
                errors["tags"] = ["Duplicate tag names are not allowed."]
            else:
                tags = []
                for name in tag_names:
                    tag = db.session.execute(db.select(Tag).filter_by(name=name)).scalar_one_or_none()

                    if tag is None:
                        errors.setdefault("tags", []).append(f'Tag "{name}" not found')
                    else:
                        tags.append(tag)

    if errors:
        return jsonify({"message": "Validation failed","errors": errors,}), 422

    # Remove relationship fields before validating regular sermon fields
    # Marshmallow validates dates, status, and other schema-defined fields.
    scalar_data = dict(payload)
    for key in ("speaker", "speakers", "series", "tags", "id"):
        scalar_data.pop(key, None)

    try:
        if scalar_data:
            updates = sermon_schema.load(scalar_data, partial=True)

            for key in scalar_data:
                if hasattr(updates, key):
                    setattr(sermon, key, getattr(updates, key))

    except ValidationError as err:
        return jsonify({
            "message": "Validation failed",
            "errors": err.messages,
        }), 422

    # Apply the resolved relationships.
    sermon.speaker = speaker
    sermon.series = series
    sermon.tags = tags

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to update sermon %s", id)
        return jsonify({"message": "Failed to update sermon"}), 500

    return sermon_schema.dump(sermon), 200
                                                                                # DELETE Sermon
@api.delete("/sermons/<int:id>")
@require_role("Admin")
def delete_sermon(id: int):
    """Delete an existing sermon."""
    sermon = db.session.get(Sermon, id)

    if sermon is None:
        return jsonify({"message": f"Sermon with id {id} not found"}), 404

    try:
        db.session.delete(sermon)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to delete sermon %s", id)
        return jsonify({"message": "Failed to delete sermon"}), 500

    return "", 204

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


@api.post("/sermons/<int:id>/regenerate-summary")
@require_role("Admin")
def regenerate_sermon_summary(id: int):
    """Queue a new AI summary and tags for one sermon, for the "Regenerate with AI" button.

    Returns 202 with the sermon. Without REDIS_URL the job has already run, so the summary is the new one;
    with Redis the old summary stays until the worker finishes.
    Sends 401 without a valid token, 403 for non-Admins, 404 if the sermon does not exist,
    409 if the sermon is not PUBLISHED (nothing is queued), and 503 if Redis cannot be reached.
    """
    sermon = db.get_or_404(Sermon, id, description=f"Sermon with id {id} not found")
    # regenerate_summary skips unpublished sermons because they may not have a transcript yet.
    # Refusing here tells the admin why, instead of accepting a job that would do nothing.
    if sermon.status != UploadStatus.PUBLISHED:
        message = "Only published sermons can regenerate their summary"
        return jsonify({"error": message, "message": message}), 409
    try:
        enqueue(regenerate_summary, sermon.id)
    except (RedisConnectionError, RedisTimeoutError):
        current_app.logger.exception("Could not queue summary for sermon %s", id)
        message = "The job queue is unavailable. Please try again later."
        return jsonify({"error": message, "message": message}), 503
    return sermon_schema.dump(sermon), 202


def read_date_range(body) -> tuple[date | None, date | None]:
    """Read the optional "from" and "to" dates of a sync request body, e.g. {"from": "2026-09-01", "to": "2026-09-30"}.

    A missing or empty date is None, so no body at all means no range.
    Raises ValueError, with the message to send back, if a date cannot be read or "from" is after "to".
    """
    dates = []
    for key in ("from", "to"):
        value = body.get(key) if isinstance(body, dict) else None
        if value is None or value == "":
            dates.append(None)
            continue
        try:
            dates.append(date.fromisoformat(value))
        except (TypeError, ValueError):
            raise ValueError(f'"{key}" must be a date like 2026-09-01') from None

    date_from, date_to = dates
    if date_from and date_to and date_from > date_to:
        raise ValueError('"from" must be on or before "to"')
    return date_from, date_to


@api.post("/import/youtube")
@require_role("Admin")
def import_youtube():
    """Import every playlist and video from the YouTube channel.

    An optional body limits it to videos dated in a range, ends included: {"from": "2026-09-01", "to": "2026-09-30"}.
    Either date can be left out. See import_channel for which date is compared.
    Every submission is saved as a new SyncRun, and each response carries its "runId" and "state".
    Returns 202 with {"queued": true, "jobId": ..., "runId": ..., "state": "queued"} when the import was sent to
    the worker, or 200 with {"queued": false, "report": {...}, "runId": ..., "state": "succeeded"} when it already
    ran inline (no REDIS_URL). See ImportReport for the report fields, and GET /import/youtube/runs/<id> to follow a run.
    Sends 400 if a date cannot be read or "from" is after "to", 401 without a valid token, 403 for non-Admins,
    409 with the active run's "runId" if a sync is already queued or running, 502 if an inline run fails,
    and 503 if Redis cannot be reached. The 502 and 503 bodies also carry the failed run's "runId".
    """
    try:
        date_from, date_to = read_date_range(request.get_json(silent=True))
    except ValueError as e:
        return jsonify({"error": str(e), "message": str(e)}), 400

    active = active_sync_run()
    if active is not None:
        message = f"A YouTube sync is already {active.state.value}. Wait for run {active.id} to finish."
        return jsonify({"error": message, "message": message, "runId": active.id}), 409

    run = SyncRun(id=None, date_from=date_from, date_to=date_to)
    try:
        job = start_sync(run)
    except (RedisConnectionError, RedisTimeoutError):
        current_app.logger.exception("Could not queue the YouTube import")
        message = "The job queue is unavailable. Please try again later."
        return jsonify({"error": message, "message": message, "runId": run.id, "state": run.state.value}), 503

    if current_app.config["REDIS_URL"]:
        return jsonify({"queued": True, "jobId": job.id, "runId": run.id, "state": run.state.value}), 202

    # Inline, run_sync has already finished, and it loaded this same run object, so its outcome is already here.
    if run.state != SyncRunState.SUCCEEDED:
        message = f"YouTube import failed: {run.error}"
        return jsonify({"error": message, "message": message, "runId": run.id, "state": run.state.value}), 502
    return jsonify({"queued": False, "report": run.report, "runId": run.id, "state": run.state.value}), 200


@api.get("/import/youtube/runs")
@require_role("Admin")
def get_sync_runs():
    """List YouTube sync runs, newest first, with their counts but not their full reports.

    With ?page= (and optionally pageSize), returns the paginated envelope from paginate under the "runs" key.
    Without it, returns a plain list of the 20 most recent runs, since runs are never deleted and the list only grows.
    Reconciles lost workers before returning their persisted status.
    Sends 400 for a bad page or pageSize, 401 without a valid token, and 403 for non-Admins.
    """
    active_sync_run()
    query = db.select(SyncRun).options(defer(SyncRun.report)).order_by(SyncRun.id.desc())
    pagination = paginate(query, request, schemas.sync_runs_schema, "runs", default_page_size=20)
    if pagination is None:
        return schemas.sync_runs_schema.dump(db.session.scalars(query.limit(20)))
    return pagination


@api.get("/import/youtube/runs/<int:id>")
@require_role("Admin")
def get_sync_run(id: int):
    """Return one YouTube sync run with its full report (null until it succeeds).

    Reconciles lost workers so polling reaches a terminal state even if no new sync is submitted.
    Sends 401 without a valid token, 403 for non-Admins, and 404 with JSON error and message if there is no such run.
    """
    active_sync_run()
    run = db.get_or_404(SyncRun, id, description=f"Sync run with id {id} not found")
    return schemas.sync_run_schema.dump(run)


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


def find_tag_by_name_ci(name: str) -> Tag | None:
    """Look up a tag by case-insensitive name match, for duplicate checks."""
    return db.session.execute(
        db.select(Tag).filter(func.lower(Tag.name) == name.lower())
    ).scalar_one_or_none()

                                                                                # POST Tag
@api.post("/tags")
@require_role("Admin")
def create_tag():
    """Create a new manually-added tag."""
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"message": "Validation failed", "errors": {"_schema": ["A JSON object is required"]}}), 422

    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        return jsonify({"message": "Validation failed", "errors": {"name": ["Tag name is required"]}}), 422

    name = name.strip()
    if find_tag_by_name_ci(name) is not None:
        return jsonify({"message": "Validation failed", "errors": {"name": [f'Tag "{name}" already exists']}}), 422

    # Only the AI tagging pipeline creates AI-sourced tags; tags made through this
    # admin endpoint are always MANUAL.
    tag = Tag(name=name, source=TagSource.MANUAL, sermons=[])

    try:
        db.session.add(tag)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to create tag")
        return jsonify({"message": "Failed to save tag"}), 500

    return tag_schema.dump(tag), 201

                                                                                # PATCH Tag
@api.patch("/tags")
@api.patch("/tags/<name>")
@require_role("Admin")
def rename_tag(name: str | None = None):
    """Rename a tag, accepting query identifiers that cannot safely be URL path segments."""
    if name is None:
        name = request.args.get("name")
    if not isinstance(name, str) or not name.strip():
        return jsonify({"message": "Validation failed", "errors": {"name": ["Tag name is required"]}}), 422
    tag = db.session.execute(db.select(Tag).filter_by(name=name)).scalar_one_or_none()
    if tag is None:
        return jsonify({"message": f'Tag "{name}" not found'}), 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Validation failed", "errors": {"_schema": ["A JSON object is required"]}}), 422

    new_name = payload.get("newName")
    if not isinstance(new_name, str) or not new_name.strip():
        return jsonify({"message": "Validation failed", "errors": {"newName": ["New tag name is required"]}}), 422

    new_name = new_name.strip()
    if new_name.lower() != tag.name.lower():
        if find_tag_by_name_ci(new_name) is not None:
            return jsonify({"message": "Validation failed", "errors": {"newName": [f'Tag "{new_name}" already exists']}}), 422

    tag.name = new_name

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to rename tag %s", name)
        return jsonify({"message": "Failed to rename tag"}), 500

    return tag_schema.dump(tag), 200

                                                                                # DELETE Tag
@api.delete("/tags")
@api.delete("/tags/<name>")
@require_role("Admin")
def delete_tag(name: str | None = None):
    """Delete a tag. Its sermon associations are removed by the cascading FK on Tag.name."""
    if name is None:
        name = request.args.get("name")
    if not isinstance(name, str) or not name.strip():
        return jsonify({"message": "Validation failed", "errors": {"name": ["Tag name is required"]}}), 422
    tag = db.session.execute(db.select(Tag).filter_by(name=name)).scalar_one_or_none()
    if tag is None:
        return jsonify({"message": f'Tag "{name}" not found'}), 404

    try:
        db.session.delete(tag)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to delete tag %s", name)
        return jsonify({"message": "Failed to delete tag"}), 500

    return "", 204


@api.route("/")
def hello_world():
    return "<p>Hello, world!</p>"


@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/whoami")
@require_role("Internal User", "Admin")
def whoami():
    return jsonify({"roles": g.current_user_role})


@api.get("/search")
@require_role("Internal User", "Admin")
def search():
    """Search real Published sermons; see docs/search.md for scores and source fields."""
    try:
        return jsonify(search_service.search_sermons(request.args))
    except search_service.SearchInputError as error:
        message = str(error)
        return jsonify({"error": message, "message": message}), 400
    except EmbeddingError as error:
        # Compatibility errors are actionable configuration errors, not empty matches.
        return jsonify({"error": "embedding_incompatible", "message": str(error)}), 503
    except Exception as error:
        # Providers raise several unrelated exception types. Do not leak their raw
        # response bodies/credentials to clients or misreport an outage as no results.
        current_app.logger.warning("Sermon search failed (%s)", type(error).__name__)
        message = "Sermon search is unavailable right now. Please try again later."
        return jsonify({"error": "search_unavailable", "message": message}), 503


@api.post("/chat")
@require_role("Internal User", "InternalUser", "Admin")
def chat():
    """Answer a question from published TFH sermons only, with timestamped sources.

    Body: {"message": str, "sermonId": int | null, "history": [{"role": "user" | "assistant", "content": str}]}.
    See docs/ai-chat.md for the limits and the response. Returns 200 with the answer, or
    the fixed unsupported answer when published sermons do not support one.
    Sends 400 with per-field "errors" for an invalid body, 401 without a valid token,
    403 for other roles, 413 if the body is larger than chat.MAX_REQUEST_BYTES, 502 if
    the AI model fails, and 503 if the question cannot be embedded or searched.
    """
    limit = chat_service.MAX_REQUEST_BYTES
    # Cap the bytes actually read, not just the header, so a chunked body without
    # Content-Length is limited too. Werkzeug stops a chunked stream at the cap without an
    # error, so read one byte past it to tell an oversized body from one that fits.
    request.max_content_length = limit + 1
    try:
        too_large = len(request.get_data(cache=True)) > limit
    except RequestEntityTooLarge:
        too_large = True
    if too_large:
        message = f"Request body must be at most {limit} bytes."
        return jsonify({"error": message, "message": message}), 413
    try:
        data = chat_service.parse_chat_request(request.get_json(silent=True))
    except ValidationError as err:
        message = "Invalid chat request."
        return jsonify({"error": message, "message": message, "errors": err.messages}), 400
    try:
        return jsonify(chat_service.answer_question(data["message"], data["sermon_id"], data["history"]))
    except chat_service.SearchUnavailable:
        current_app.logger.exception("Chat could not search sermons")
        message = "Sermon search is unavailable right now. Please try again later."
        return jsonify({"error": message, "message": message}), 503
    except chat_service.AnswerUnavailable:
        current_app.logger.exception("Chat model failed")
        message = "The AI model could not answer right now. Please try again later."
        return jsonify({"error": message, "message": message}), 502
