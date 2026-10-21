"""Production configuration and entrypoints, without provider or Redis requests."""

import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import Mock

import pytest
from flask.config import Config
from sqlalchemy import inspect, text

import up
import worker
from tsh.database import db
from tsh.production import create_production_app


@pytest.fixture()
def production_environment(monkeypatch, tmp_path):
    values = {
        "TFH_ENV": "production",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'production.db').as_posix()}",
        "JWT_SECRET_KEY": "production-test-key-not-a-real-secret-00000000",
        "TENANT_ID": "test-tenant",
        "ENTRA_API_AUDIENCE": "test-api",
        "REDIS_URL": "redis://127.0.0.1:6379/1",
    }
    for name in ("TESTING", "AUTH_TEST_BYPASS", "FLASK_DEBUG", "ENTRA_API_SCOPE"):
        monkeypatch.delenv(name, raising=False)
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    return values


@pytest.mark.parametrize(
    "name",
    ["TFH_ENV", "SQLALCHEMY_DATABASE_URI", "JWT_SECRET_KEY", "TENANT_ID", "ENTRA_API_AUDIENCE", "REDIS_URL"],
)
def test_production_requires_explicit_settings(production_environment, monkeypatch, name):
    monkeypatch.delenv(name)
    with pytest.raises(RuntimeError, match=name):
        create_production_app()


@pytest.mark.parametrize("name", ["JWT_SECRET_KEY", "TENANT_ID", "ENTRA_API_AUDIENCE", "REDIS_URL", "ENTRA_API_SCOPE"])
def test_production_rejects_blank_settings(production_environment, monkeypatch, name):
    monkeypatch.setenv(name, " ")
    with pytest.raises(RuntimeError, match=name):
        create_production_app()


def test_production_rejects_short_secret(production_environment, monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "short-private-key")
    with pytest.raises(RuntimeError, match="at least 32") as error:
        create_production_app()
    assert "short-private-key" not in str(error.value)


@pytest.mark.parametrize("name", ["TESTING", "AUTH_TEST_BYPASS", "FLASK_DEBUG"])
@pytest.mark.parametrize("value", ["1", "true", "YES", "on", "unknown"])
def test_production_refuses_debug_and_bypasses(production_environment, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(RuntimeError, match=name):
        create_production_app()


@pytest.mark.parametrize("value", ["0", "false", "FALSE", "no", "off", ""])
def test_production_accepts_explicit_false_flags(production_environment, monkeypatch, value):
    for name in ("TESTING", "AUTH_TEST_BYPASS", "FLASK_DEBUG"):
        monkeypatch.setenv(name, value)
    app = create_production_app()
    assert app.testing is False
    assert app.debug is False
    assert app.config["AUTH_TEST_BYPASS"] is False


@pytest.mark.parametrize(
    "uri",
    [
        "sqlite:///:memory:",
        "sqlite:///relative.db",
        "sqlite:///file:memory?mode=memory&cache=shared&uri=true",
        "postgresql://localhost/sermons",
        "invalid-private-database-uri",
    ],
)
def test_production_rejects_nonpersistent_database_settings(production_environment, monkeypatch, uri):
    monkeypatch.setenv("SQLALCHEMY_DATABASE_URI", uri)
    with pytest.raises(RuntimeError, match="absolute SQLite file") as error:
        create_production_app()
    assert "invalid-private-database-uri" not in str(error.value)


def test_production_database_cannot_live_in_release_checkout(production_environment, monkeypatch):
    release_database = Path(__file__).resolve().parents[1] / "instance" / "production.db"
    monkeypatch.setenv("SQLALCHEMY_DATABASE_URI", f"sqlite:///{release_database.as_posix()}")
    with pytest.raises(RuntimeError, match="outside the application checkout"):
        create_production_app()


@pytest.mark.parametrize("url", ["http://localhost:6379", "redis://", "not-a-redis-url"])
def test_production_requires_a_redis_server(production_environment, monkeypatch, url):
    monkeypatch.setenv("REDIS_URL", url)
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        create_production_app()


def test_production_factory_uses_no_test_config_and_keeps_real_auth(
    production_environment, monkeypatch, tmp_path
):
    def unexpected(*args, **kwargs):
        raise AssertionError("Factory must not read testing.cfg or call providers")

    monkeypatch.setattr(Config, "from_pyfile", unexpected)
    monkeypatch.setattr("ollama.embed", unexpected)
    monkeypatch.setattr("tsh.llm.generate", unexpected)
    app = create_production_app()
    assert app.config["SQLALCHEMY_DATABASE_URI"] == production_environment["SQLALCHEMY_DATABASE_URI"]
    assert app.config["ENTRA_API_SCOPE"] == "access_as_user"
    assert app.config["REDIS_URL"] == production_environment["REDIS_URL"]
    assert app.testing is False
    assert app.debug is False
    assert app.config["AUTH_TEST_BYPASS"] is False
    client = app.test_client()
    assert client.get("/api/health").status_code == 200
    response = client.get("/api/sermons", headers={"X-Test-Roles": "Admin"})
    assert response.status_code == 401
    assert response.json["error"] == response.json["message"]
    assert not (tmp_path / "production.db").exists()


def test_production_honors_explicit_api_scope(production_environment, monkeypatch):
    monkeypatch.setenv("ENTRA_API_SCOPE", "staff_access")
    assert create_production_app().config["ENTRA_API_SCOPE"] == "staff_access"


def test_production_package_does_not_load_checkout_dotenv(production_environment, tmp_path):
    backend = Path(__file__).resolve().parents[1]
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(backend)
    probe = (
        "import dotenv\n"
        "def unexpected(*args, **kwargs):\n"
        "    raise AssertionError('Production must not load checkout dotenv files')\n"
        "dotenv.load_dotenv = unexpected\n"
        "import tsh\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe], cwd=tmp_path, env=environment,
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr


def test_worker_uses_production_factory_and_queue(production_environment, monkeypatch):
    app = create_production_app()
    production_factory = Mock(return_value=app)
    development_factory = Mock(side_effect=AssertionError("Must not load testing.cfg"))
    connection = object()
    connect = Mock(return_value=connection)
    queue = Mock(return_value=object())
    worker_instance = Mock()
    worker_type = Mock(return_value=worker_instance)
    monkeypatch.setattr(worker, "create_production_app", production_factory)
    monkeypatch.setattr(worker, "create_app", development_factory)
    monkeypatch.setattr(worker.Redis, "from_url", connect)
    monkeypatch.setattr(worker, "Queue", queue)
    monkeypatch.setattr(worker, "FlaskWorker", worker_type)

    worker.main()

    production_factory.assert_called_once_with()
    development_factory.assert_not_called()
    connect.assert_called_once_with(production_environment["REDIS_URL"])
    queue.assert_called_once_with("sermons", connection=connection)
    assert worker_type.app is app
    worker_instance.work.assert_called_once_with()


def test_up_uses_production_factory_for_isolated_database(production_environment, monkeypatch, tmp_path):
    app = create_production_app()
    production_factory = Mock(return_value=app)
    development_factory = Mock(side_effect=AssertionError("Must not load testing.cfg"))
    monkeypatch.setattr(up, "create_production_app", production_factory)
    monkeypatch.setattr(up, "create_app", development_factory)

    up.main()

    production_factory.assert_called_once_with()
    development_factory.assert_not_called()
    assert (tmp_path / "production.db").is_file()
    with app.app_context():
        assert {"sermon", "sync_run", "sermon_chunk_embedding"} <= set(inspect(db.engine).get_table_names())
        assert db.session.scalar(text("SELECT COUNT(*) FROM sermon")) == 0
        assert db.session.scalar(text("SELECT COUNT(*) FROM alembic_version")) == 1
        db.session.remove()
        db.engine.dispose()
