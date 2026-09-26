from flask import Blueprint, request
from sqlalchemy import false, func
from sqlalchemy.orm import with_expression

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
from tsh.schemas import (
    counted_speakers_schema,
    counted_tags_schema,
    series_schema,
    seriess_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
)

api = Blueprint("api", __name__, url_prefix="/api")


@api.route("/series")
def get_all_series():
    series = db.session.execute(db.select(Series)).scalars()
    result = seriess_schema.dump(series)
    return result


@api.route("/series/<int:id>")
def get_series(id: int):
    series = db.get_or_404(Series, id, description=f"Series with id {id} not found")
    result = series_schema.dump(series)
    return result


@api.route("/speakers")
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
def get_speaker(id: int):
    speaker = db.get_or_404(Speaker, id, description=f"Speaker with id {id} not found")
    result = speaker_schema.dump(speaker)
    return result


@api.route("/sermons")
def get_sermons():
    query = db.select(Sermon)

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
def get_sermon(id: int):
    sermon = db.get_or_404(Sermon, id, description=f"Sermon with id {id} not found")
    result = sermon_schema.dump(sermon)
    return result


@api.route("/tags")
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


@api.get("/search")
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
