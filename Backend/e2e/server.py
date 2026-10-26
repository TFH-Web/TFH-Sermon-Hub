"""Loopback-only Flask fixture for the real-API browser smoke test.

Run only through ``npm run e2e:integration``. Nothing is seeded in the unit-test
database: migrations and the real import/pipeline create this fixture's records.
"""

import os
from pathlib import Path
import signal
import socket
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

VIDEO_ID = "e2eGrace001"
TITLE = "Grace for the Journey"
START_SEC = 75.5
EVIDENCE = "Grace is freely given to everyone who asks. We receive grace as a gift."


def require_test_mode(environ=None):
    environ = os.environ if environ is None else environ
    if environ.get("TFH_E2E") != "1":
        raise RuntimeError("The browser fixture requires TFH_E2E=1")
    if environ.get("TFH_ENV", "").strip().lower() in {"production", "prod", "staging"}:
        raise RuntimeError("The browser fixture must never run in production or staging")


def deny_outbound_connections(*_args, **_kwargs):
    raise RuntimeError("External network access is disabled in the browser fixture")


def create_fixture_app(database_path: Path):
    """Create only a new, explicitly owned database with fake provider boundaries."""
    require_test_mode()
    if not database_path.is_absolute() or database_path.exists():
        raise RuntimeError("The browser fixture requires a new absolute database path")
    # Prevent tsh.__init__ from discovering a developer's .env. Explicit settings
    # below also override inherited queue, authentication and caption settings.
    os.environ["PYTHON_DOTENV_DISABLED"] = "1"
    os.environ["EMBEDDING_MODEL"] = "tfh-e2e-fixed-768"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    import ollama
    from flask_migrate import upgrade
    from sqlalchemy import text
    from tsh import captions, create_app, llm, youtube
    from tsh.database import db
    from tsh.embeddings import EMBEDDING_DIM
    from tsh.models import Sermon, SermonChunk

    calls = {"youtube": 0, "captions": 0, "embeddings": 0, "summary": 0, "tags": 0, "chat": 0}

    def get_videos(ids):
        assert ids == [VIDEO_ID], "Only the fixture video may be imported"
        calls["youtube"] += 1
        return [{
            "id": VIDEO_ID, "title": TITLE, "description": "A message about grace.",
            "published_at": "2026-10-18T17:00:00Z", "duration": "PT10M", "privacy": "public",
        }]

    def get_transcript(video_id):
        assert video_id == VIDEO_ID
        calls["captions"] += 1
        return [{"start": START_SEC, "end": 91.25, "text": EVIDENCE}]

    def embed(model, input, **_kwargs):
        assert model == "tfh-e2e-fixed-768"
        calls["embeddings"] += 1
        vectors = []
        for value in input:
            vector = [0.0] * EMBEDDING_DIM
            vector[0 if "grace" in value.lower() else 1] = 1.0
            vectors.append(vector)
        return SimpleNamespace(embeddings=vectors)

    def generate(prompt, system="", **_kwargs):
        if '<evidence number="' in prompt:
            assert EVIDENCE in prompt, "Chat must receive the persisted caption evidence"
            calls["chat"] += 1
            return "Grace is freely given to everyone who asks [1]."
        if "Return JSON" in prompt:
            calls["tags"] += 1
            return '{"tags": ["grace"]}'
        calls["summary"] += 1
        return "Grace is freely given to everyone who asks."

    youtube.get_videos = get_videos
    captions.get_transcript = get_transcript
    ollama.embed = embed
    llm.generate = generate
    app = create_app(None, settings={
        "TESTING": True, "AUTH_TEST_BYPASS": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///" + database_path.as_posix(),
        "JWT_SECRET_KEY": "browser-fixture-only-no-real-identity-0000000000000000000000",
        "REDIS_URL": "", "PIPELINE_DUMMY_DELAY": 0,
        "YOUTUBE_API_KEY": "", "YOUTUBE_OAUTH_CLIENT_ID": "",
        "YOUTUBE_OAUTH_CLIENT_SECRET": "", "YOUTUBE_OAUTH_REFRESH_TOKEN": "",
        "CAPTIONS_ENABLED": True, "YOUTUBE_TIMEZONE": "America/Los_Angeles",
    })
    with app.app_context():
        upgrade(directory=str(Path(__file__).resolve().parents[1] / "migrations"))

    @app.after_request
    def identify_fixture(response):
        response.headers["X-TFH-E2E"] = "real-flask"
        return response

    @app.get("/__e2e__/proof")
    def proof():
        return {
            "calls": calls,
            "sermons": db.session.query(Sermon).count(),
            "chunks": db.session.query(SermonChunk).count(),
            "vectors": db.session.execute(text("SELECT count(*) FROM sermon_chunk_embedding")).scalar_one(),
            "sqlite_vec": db.session.execute(text("SELECT vec_version()")).scalar_one(),
        }

    return app


def main():
    require_test_mode()
    from werkzeug.serving import make_server

    def stop_server(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_server)
    # The only database accepted by the CLI lives inside its own temporary root.
    # No user-supplied database URI, testing.cfg, existing file or user DB is read.
    with TemporaryDirectory(prefix="tfh-browser-e2e-") as scratch:
        with patch.object(socket.socket, "connect", deny_outbound_connections), patch.object(
            socket, "create_connection", deny_outbound_connections
        ):
            app = create_fixture_app(Path(scratch) / "sermonhub.sqlite3")
            server = make_server("127.0.0.1", 6200, app, threaded=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
                from tsh.database import db

                with app.app_context():
                    db.session.remove()
                    db.engine.dispose()


if __name__ == "__main__":
    main()
