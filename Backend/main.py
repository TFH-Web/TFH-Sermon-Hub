from models import Sermon, serialize_to_dict, Speaker, serialize_many_to_dicts, Series, Tag
from flask import jsonify
from database import db
from app import app

@app.route("/series")
def get_all_series():
    series = db.session.execute(db.select(Series)).scalars()
    return jsonify(serialize_many_to_dicts(series))

@app.route("/series/<int:id>")
def get_series(id: int):
    series = db.get_or_404(Series, id)
    return jsonify(serialize_to_dict(series))

@app.route("/speakers")
def get_speakers():
    speakers = db.session.execute(db.select(Speaker)).scalars()
    return jsonify(serialize_many_to_dicts(speakers))

@app.route("/speakers/<int:id>")
def get_speaker(id: int):
    speaker = db.get_or_404(Speaker, id)
    return jsonify(serialize_to_dict(speaker))


@app.route("/sermons")
def get_sermons():
    sermons = db.session.execute(db.select(Sermon)).scalars()
    return jsonify(serialize_many_to_dicts(sermons))

@app.route("/sermons/<int:id>")
def get_sermon(id: int):
    sermon = db.get_or_404(Sermon, id)
    return jsonify(serialize_to_dict(sermon))

@app.route("/tags")
def get_tags():
    tags = db.session.execute(db.select(Tag)).scalars()
    return jsonify(serialize_many_to_dicts(tags))
