from pathlib import Path

from flask import Flask
from flask.testing import FlaskClient, FlaskCliRunner
from flask_migrate import upgrade
from tsh import create_app
from tests.populate import populate
import pytest


@pytest.fixture()
def app():
    app = create_app(
        "testing.cfg",
        settings={
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            # Always run jobs inline, even when .env or devenv sets REDIS_URL for the whole shell.
            "REDIS_URL": "",
            # A delay set in testing.cfg would slow every test that runs the pipeline.
            "PIPELINE_DUMMY_DELAY": 0,
            # Tests must never call the real YouTube API with the key from .env.
            "YOUTUBE_API_KEY": "",
            "YOUTUBE_OAUTH_CLIENT_ID": "",
            "YOUTUBE_OAUTH_CLIENT_SECRET": "",
            "YOUTUBE_OAUTH_REFRESH_TOKEN": "",
        },
    )

    with app.app_context():
        from tsh.database import db
        from tsh.models import Series, Speaker, Tag, Sermon, sermon_tag_m2m  # noqa: F401

        # setup
        upgrade(directory=str(Path(__file__).resolve().parents[1] / "migrations"))
        populate(app)

        yield app

        # teardown
        db.drop_all()



def pytest_configure(config):
    config.addinivalue_line("markers", "real_llm: leave tsh.llm.generate unpatched (for tests of llm.py itself)")


@pytest.fixture(autouse=True)
def no_real_llm(request, monkeypatch):
    """Keep the suite off the network. TFH-461."""
    if request.node.get_closest_marker("real_llm"):
        return

    def fake_generate(prompt: str, system: str = "", **kwargs) -> str:
        if "Return JSON" in prompt:
            return '{"tags": []}'
        return "Test summary."

    monkeypatch.setattr("tsh.llm.generate", fake_generate)


@pytest.fixture()
def client(app: Flask) -> FlaskClient:
    return app.test_client()

@pytest.fixture()
def runner(app: Flask) -> FlaskCliRunner:
    return app.test_cli_runner()

