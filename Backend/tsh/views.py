from flask import Blueprint, request
from sqlalchemy import func
from sqlalchemy.orm import with_expression

from tsh.database import db
from tsh.models import (
    Series,
    Sermon,
    Speaker,
    Tag,
    sermon_tag_m2m,
)
from tsh.schemas import (
    counted_tags_schema,
    series_page_schema,
    series_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
    speakers_schema,
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


@api.route("/series")
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
def get_series(id: int):
    series = db.get_or_404(Series, id, description=f"Series with id {id} not found")
    result = series_schema.dump(series)
    return result


@api.route("/speakers")
def get_speakers():
    speakers = db.session.execute(db.select(Speaker)).scalars()
    result = speakers_schema.dump(speakers)
    return result


@api.route("/speakers/<int:id>")
def get_speaker(id: int):
    speaker = db.get_or_404(Speaker, id, description=f"Speaker with id {id} not found")
    result = speaker_schema.dump(speaker)
    return result


@api.route("/sermons")
def get_sermons():
    sermons = db.session.execute(db.select(Sermon)).scalars()
    result = sermons_schema.dump(sermons)
    return result


@api.route("/sermons/<int:id>")
def get_sermon(id: int):
    sermon = db.get_or_404(Sermon, id, description=f"Sermon with id {id} not found")
    result = sermon_schema.dump(sermon)
    return result


@api.route("/tags")
def get_tags():
    tags = db.session.execute(
        db.select(Tag)
        .join(sermon_tag_m2m)
        .group_by(Tag.name)
        .options(with_expression(Tag.count, func.count(Tag.name)))
    ).scalars()
    result = counted_tags_schema.dump(tags)
    return result


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
