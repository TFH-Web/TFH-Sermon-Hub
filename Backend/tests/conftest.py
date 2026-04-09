from flask import Flask
from flask.testing import FlaskClient, FlaskCliRunner
from tsh import create_app
from tests.populate import populate
import pytest


@pytest.fixture()
def app() -> Flask:
    app = create_app("testing.cfg")
    app.config.update(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        }
    )

    with app.app_context():
        from tsh.database import db
        from tsh.models import Series, Speaker, Tag, Sermon, sermon_tag_m2m  # noqa: F401

        # setup
        db.create_all()
        populate(app)

        yield app

        # teardown
        db.drop_all()


@pytest.fixture()
def client(app: Flask) -> FlaskClient:
    return app.test_client()

@pytest.fixture()
def runner(app: Flask) -> FlaskCliRunner:
    return app.test_cli_runner()

