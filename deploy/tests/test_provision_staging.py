"""Local disposable-filesystem tests: no user, service, or server changes."""

import importlib.util
import json
from pathlib import Path
import sqlite3

import pytest

SPEC = importlib.util.spec_from_file_location(
    "provision_staging", Path(__file__).resolve().parents[1] / "provision_staging.py"
)
provision = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provision)

PUBLIC = {
    "TENANT_ID": "11111111-1111-4111-8111-111111111111",
    "CLIENT_ID": "22222222-2222-4222-8222-222222222222",
    "ENTRA_API_AUDIENCE": "22222222-2222-4222-8222-222222222222",
    "ENTRA_API_SCOPE": "access_as_user",
}


@pytest.fixture()
def paths(tmp_path, monkeypatch):
    for name, relative in {
        "RELEASES_DIR": "opt/releases",
        "CONFIG_DIR": "etc",
        "ENV_FILE": "etc/.env",
        "STATE_DIR": "state",
        "DATABASE": "state/sermonhub.sqlite3",
        "SOURCE_BACKUP": "old-backup/database.sqlite3",
    }.items():
        monkeypatch.setattr(provision, name, tmp_path / relative)
    provision.CONFIG_DIR.mkdir()
    provision.STATE_DIR.mkdir()
    # Windows tests cannot change ownership; record the exact requested metadata.
    changes = []
    monkeypatch.setattr(provision, "metadata", lambda *arguments: changes.append(arguments))
    return changes


def test_public_config_is_identity_only(tmp_path):
    path = tmp_path / "public.json"
    path.write_text(json.dumps(PUBLIC), encoding="utf-8")
    assert provision.public_configuration(path) == PUBLIC


@pytest.mark.parametrize("updates", [
    {"JWT_SECRET_KEY": "must-not-be-accepted"},
    {"TENANT_ID": "not-a-uuid"},
    {"ENTRA_API_SCOPE": "openid"},
])
def test_public_config_rejects_secrets_and_invalid_identity(tmp_path, updates):
    path = tmp_path / "public.json"
    path.write_text(json.dumps({**PUBLIC, **updates}), encoding="utf-8")
    with pytest.raises(ValueError, match="Public JSON") as error:
        provision.public_configuration(path)
    assert "must-not-be-accepted" not in str(error.value)


def test_release_must_be_a_real_direct_staging_child(paths):
    release = provision.RELEASES_DIR / "release-1"
    for relative in ("Backend/poetry.lock", "Backend/tsh/production.py", "Backend/up.py"):
        target = release / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("", encoding="utf-8")
    assert provision.release_directory(str(release)) == release.resolve()
    private = release / "Backend/.env"
    private.write_text("secret", encoding="utf-8")
    with pytest.raises(ValueError, match="private/local"):
        provision.release_directory(str(release))
    with pytest.raises(ValueError, match="absolute"):
        provision.release_directory("relative/release")


def test_prepare_preserves_existing_environment_and_secret(paths):
    assert provision.prepare_environment(PUBLIC, 1234) is True
    original = provision.ENV_FILE.read_bytes()
    environment = provision.read_environment(provision.ENV_FILE)
    assert len(environment["JWT_SECRET_KEY"]) >= 64
    assert environment["LLM_PROVIDER"] == "cloud-pending"
    assert environment["LLM_MODEL"] == ""
    assert environment["EMBEDDING_MODEL"] == "cloud-pending"
    assert environment["OLLAMA_HOST"] == "http://127.0.0.1:9"
    assert environment["TESTING"] == "false"
    assert environment["AUTH_TEST_BYPASS"] == "false"
    assert provision.prepare_environment(PUBLIC, 1234) is False
    assert provision.ENV_FILE.read_bytes() == original
    assert any(arguments[1:] == (0, 1234, 0o640) for arguments in paths)


@pytest.mark.parametrize("name,value", [
    ("AUTH_TEST_BYPASS", "true"),
    ("TESTING", "true"),
    ("FLASK_DEBUG", "true"),
    ("TENANT_ID", "33333333-3333-4333-8333-333333333333"),
    ("REDIS_URL", "redis://127.0.0.1:6379/0"),
    ("LLM_PROVIDER", "ollama"),
])
def test_existing_unsafe_environment_is_rejected_not_replaced(paths, name, value):
    content = provision.new_environment(PUBLIC)
    lines = [line for line in content.splitlines() if not line.startswith(name + "=")]
    lines.append(f"{name}={json.dumps(value)}")
    content = "\n".join(lines) + "\n"
    provision.ENV_FILE.write_text(content, encoding="utf-8")
    with pytest.raises(ValueError):
        provision.prepare_environment(PUBLIC, 1234)
    assert provision.ENV_FILE.read_text(encoding="utf-8") == content


def test_database_bootstrap_uses_only_server_snapshot_once(paths):
    provision.SOURCE_BACKUP.parent.mkdir()
    with sqlite3.connect(provision.SOURCE_BACKUP) as source:
        source.execute("CREATE TABLE fixture (value TEXT)")
        source.execute("INSERT INTO fixture VALUES ('server snapshot')")
    snapshot = provision.SOURCE_BACKUP.read_bytes()
    assert provision.prepare_database(1234, 1234) is True
    with sqlite3.connect(provision.DATABASE) as current:
        assert current.execute("SELECT value FROM fixture").fetchone() == ("server snapshot",)
        current.execute("UPDATE fixture SET value='staging changed'")
    assert provision.prepare_database(1234, 1234) is False
    with sqlite3.connect(provision.DATABASE) as current:
        assert current.execute("SELECT value FROM fixture").fetchone() == ("staging changed",)
    assert provision.SOURCE_BACKUP.read_bytes() == snapshot
    assert any(arguments[1:] == (1234, 1234, 0o600) for arguments in paths)


def test_missing_bootstrap_does_not_create_an_empty_database(paths):
    with pytest.raises(ValueError, match="fixed server bootstrap"):
        provision.prepare_database(1234, 1234)
    assert not provision.DATABASE.exists()


def test_corrupt_bootstrap_is_not_published(paths):
    provision.SOURCE_BACKUP.parent.mkdir()
    provision.SOURCE_BACKUP.write_bytes(b"not a SQLite database")
    with pytest.raises(sqlite3.DatabaseError):
        provision.prepare_database(1234, 1234)
    assert not provision.DATABASE.exists()
    assert list(provision.STATE_DIR.iterdir()) == []


def test_bootstrap_foreign_key_violations_are_not_published(paths):
    provision.SOURCE_BACKUP.parent.mkdir()
    with sqlite3.connect(provision.SOURCE_BACKUP) as source:
        source.execute("CREATE TABLE parent (id INTEGER PRIMARY KEY)")
        source.execute("CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))")
        source.execute("INSERT INTO child VALUES (1234)")
    with pytest.raises(ValueError, match="foreign-key violations"):
        provision.prepare_database(1234, 1234)
    assert not provision.DATABASE.exists()
    assert list(provision.STATE_DIR.iterdir()) == []


def test_symlink_is_rejected_before_access(paths, monkeypatch):
    monkeypatch.setattr(Path, "is_symlink", lambda self: self == provision.ENV_FILE)
    with pytest.raises(ValueError, match="symlink"):
        provision.prepare_environment(PUBLIC, 1234)
    assert not provision.ENV_FILE.exists()
