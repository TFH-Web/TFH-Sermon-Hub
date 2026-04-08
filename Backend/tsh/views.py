from tsh.models import (
    Sermon,
    serialize_to_dict,
    Speaker,
    serialize_many_to_dicts,
    Series,
    Tag,
)
from flask import jsonify, request, Blueprint
from tsh.database import db

api = Blueprint("api", __name__)


@api.route("/series")
def get_all_series():
    series = db.session.execute(db.select(Series)).scalars()
    return jsonify(serialize_many_to_dicts(series))


@api.route("/series/<int:id>")
def get_series(id: int):
    series = db.get_or_404(Series, id)
    return jsonify(serialize_to_dict(series))


@api.route("/speakers")
def get_speakers():
    speakers = db.session.execute(db.select(Speaker)).scalars()
    return jsonify(serialize_many_to_dicts(speakers))


@api.route("/speakers/<int:id>")
def get_speaker(id: int):
    speaker = db.get_or_404(Speaker, id)
    return jsonify(serialize_to_dict(speaker))


@api.route("/sermons")
def get_sermons():
    sermons = db.session.execute(db.select(Sermon)).scalars()
    return jsonify(serialize_many_to_dicts(sermons))


@api.route("/sermons/<int:id>")
def get_sermon(id: int):
    sermon = db.get_or_404(Sermon, id)
    return jsonify(serialize_to_dict(sermon))


@api.route("/tags")
def get_tags():
    tags = db.session.execute(db.select(Tag)).scalars()
    return jsonify(serialize_many_to_dicts(tags))


@api.route("/")
def hello_world():
    return "<p>Hello, world!</p>"


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


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

    return jsonify(filtered)
