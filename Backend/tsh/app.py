import os

from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate
from werkzeug.exceptions import HTTPException, InternalServerError

from tsh.views import api


def create_app(
    config_path: str = "testing.cfg",
    settings: dict | None = None,
    test_config: dict | None = None,
    **kwargs,
) -> Flask:
    app = Flask(__name__)
    CORS(app, origins=['http://localhost:5173'])
    if config_path:
        app.config.from_pyfile(config_path)
    if settings:
        app.config.update(settings)
    if test_config:
        app.config.update(test_config)
    if kwargs:
        app.config.update(kwargs)

    # The one place REDIS_URL is read. Config wins over the environment, so tests can force inline jobs.
    app.config.setdefault("REDIS_URL", os.environ.get("REDIS_URL", ""))

    # YouTube import settings, read the same way. Defaults match the TFH channel, so only the key has to be set.
    youtube_defaults = {
        "YOUTUBE_API_KEY": "",
        "YOUTUBE_CHANNEL_ID": "UCua-IeYiJ1LiNQ6ydGZbIaw",
        # The master list of every sermon. Its videos are imported, but it is never a series.
        "YOUTUBE_MASTER_PLAYLIST": "TFH Latest Messages",
        # Worship songs and full Sunday services, not messages.
        "YOUTUBE_IGNORE_PLAYLISTS": "Worship Focus,TFH Worship Moments,"
        "Worship Resources To Help You Change The Atmosphere - After God's Heart - Pt2,Church Online",
        "YOUTUBE_SERIES_ALIASES": "Book of James=The Book of James",
        # Sermons run up to about 45 minutes and full services about 90, so 60 catches services without cutting long sermons.
        "YOUTUBE_MAX_MINUTES": "60",
    }
    for name, default in youtube_defaults.items():
        app.config.setdefault(name, os.environ.get(name, default))

    from tsh.database import db
    db.init_app(app)

    # render_as_batch lets migrations change columns on SQLite, which cannot ALTER a column in place
    Migrate(app, db, render_as_batch=True)


    @app.errorhandler(404)
    def handle_not_found(e):
        message = getattr(e, "description", "Not found") or "Not found"
        return jsonify({"error": message, "message": message}), 404

    @app.errorhandler(500)
    @app.errorhandler(InternalServerError)
    def handle_internal_server_error(e):
        return jsonify({"error": "Internal server error", "message": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        if isinstance(e, HTTPException):
            return e
        app.logger.exception(e)
        return jsonify({"error": "Internal server error", "message": "Internal server error"}), 500

    app.register_blueprint(api)

    return app

