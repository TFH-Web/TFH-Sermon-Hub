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
    series_schema,
    seriess_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
    speakers_schema,
    tags_schema,
)

api = Blueprint("api", __name__, url_prefix="/api")


@api.route("/series")
def get_all_series():
    series = db.session.execute(db.select(Series)).scalars()
    result = seriess_schema.dump(series)
    return result


@api.route("/series/<int:id>")
def get_series(id: int):
    series = db.get_or_404(Series, id)
    result = series_schema.dump(series)
    return result


@api.route("/speakers")
def get_speakers():
    speakers = db.session.execute(db.select(Speaker)).scalars()
    result = speakers_schema.dump(speakers)
    return result


@api.route("/speakers/<int:id>")
def get_speaker(id: int):
    speaker = db.get_or_404(Speaker, id)
    result = speaker_schema.dump(speaker)
    return result


@api.route("/sermons")
def get_sermons():
    sermons = db.session.execute(db.select(Sermon)).scalars()
    result = sermons_schema.dump(sermons)
    return result


@api.route("/sermons/<int:id>")
def get_sermon(id: int):
    sermon = db.get_or_404(Sermon, id)
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
