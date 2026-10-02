from datetime import datetime

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.operations import BatchOperations
from flask_migrate import downgrade, upgrade
from sqlalchemy import inspect, text

import down
import up
from tests.populate import populate
from tsh import create_app
from tsh.database import db
from tsh.models import Sermon
from tsh.schemas import sermon_schema


@pytest.fixture()
def migration_app(tmp_path, monkeypatch):
    app = create_app(
        config_path="",
        settings={
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'migration.db').as_posix()}",
        },
    )
    monkeypatch.setattr(up, "create_app", lambda *args, **kwargs: app)
    monkeypatch.setattr(down, "create_app", lambda *args, **kwargs: app)
    yield app
    with app.app_context():
        db.session.remove()
        db.engine.dispose()


def seed_baseline(app, legacy=False):
    """Seed the pre-Sprint 7 schema without querying the newer model columns."""
    with app.app_context():
        upgrade(directory=str(up.MIGRATIONS), revision=up.BASELINE)
        with db.engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO speaker (id, first_name, last_name, role) "
                "VALUES (1, 'Test', 'Speaker', 'Guest Speaker')"
            ))
            connection.execute(text("INSERT INTO series VALUES (1, 'Test series')"))
            connection.execute(text("INSERT INTO tag VALUES ('faith', 'MANUAL')"))
            connection.execute(text(
                "INSERT INTO sermon "
                "(id, title, video_link, duration, date, description, transcript, "
                "summary, speaker_id, series_id, status) VALUES "
                "(1, 'Test sermon', 'https://youtu.be/test', 1200, '2026-01-01', "
                "'Description', 'Transcript', 'Summary', 1, 1, 'PUBLISHED')"
            ))
            connection.execute(text("INSERT INTO Sermon_Tag VALUES (1, 'faith')"))
            if legacy:
                connection.execute(text("DROP TABLE alembic_version"))


def assert_preserved(app):
    with app.app_context():
        sermon = db.session.get(Sermon, 1)
        assert sermon.title == "Test sermon"
        assert sermon.transcript == "Transcript"
        assert sermon.summary == "Summary"
        assert sermon.speaker.last_name == "Speaker"
        assert sermon.series.title == "Test series"
        assert [tag.name for tag in sermon.tags] == ["faith"]
        assert sermon.storage_key is None
        assert sermon.audio_key is None
        assert sermon.processing_error is None
        assert sermon.processed_at is None
        with db.engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_fresh_migrations_match_models_and_serve_seeded_data(migration_app):
    up.main()
    with migration_app.app_context():
        with db.engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            assert compare_metadata(context, db.metadata) == []
        populate(migration_app)
        sermon = db.session.get(Sermon, 1)
        sermon.video_link = "https://example.com/" + "long-video-path/" * 30
        sermon.storage_key = "videos/1.mp4"
        sermon.audio_key = "audio/1.mp3"
        sermon.processing_error = "An error\nwith details"
        sermon.processed_at = datetime(2026, 10, 1, 12, 30)
        db.session.commit()

    response = migration_app.test_client().get("/api/sermons/1")
    assert response.status_code == 200
    assert len(response.json["videoLink"]) > 32
    assert response.json["storageKey"] == "videos/1.mp4"
    assert response.json["audioKey"] == "audio/1.mp3"
    assert response.json["processingError"] == "An error\nwith details"
    assert response.json["processedAt"] == "2026-10-01T12:30:00"
    assert sermon_schema.load(response.json).processed_at == datetime(2026, 10, 1, 12, 30)


@pytest.mark.parametrize("legacy", [True, False], ids=["create_all", "versioned"])
def test_upgrade_preserves_existing_data_and_can_repeat(migration_app, legacy):
    seed_baseline(migration_app, legacy=legacy)
    up.main()
    assert_preserved(migration_app)
    up.main()
    assert_preserved(migration_app)


def test_downgrade_and_upgrade_preserve_relationships(migration_app):
    up.main()
    with migration_app.app_context():
        populate(migration_app)
        with db.engine.connect() as connection:
            before = connection.execute(text(
                "SELECT * FROM Sermon_Tag ORDER BY sermon_id, tag_name"
            )).all()
        downgrade(directory=str(up.MIGRATIONS), revision=up.BASELINE)
        upgrade(directory=str(up.MIGRATIONS))
        with db.engine.connect() as connection:
            after = connection.execute(text(
                "SELECT * FROM Sermon_Tag ORDER BY sermon_id, tag_name"
            )).all()
        assert after == before


def test_down_then_up_recreates_schema(migration_app):
    up.main()
    with migration_app.app_context():
        populate(migration_app)
    down.main()
    up.main()
    with migration_app.app_context():
        assert set(db.metadata.tables) <= set(inspect(db.engine).get_table_names())
        populate(migration_app)
    assert migration_app.test_client().get("/api/sermons/1").status_code == 200


def test_failed_upgrade_rolls_back_schema_data_and_version(migration_app, monkeypatch):
    seed_baseline(migration_app)

    def fail_add_column(*args, **kwargs):
        raise ValueError("Simulated migration failure")

    with monkeypatch.context() as patch:
        patch.setattr(BatchOperations, "add_column", fail_add_column)
        with migration_app.app_context(), pytest.raises(ValueError, match="Simulated"):
            upgrade(directory=str(up.MIGRATIONS))

    with migration_app.app_context(), db.engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == up.BASELINE
        columns = {column["name"]: column for column in inspect(connection).get_columns("sermon")}
        assert str(columns["video_link"]["type"]) == "VARCHAR(32)"
        assert "storage_key" not in columns
        assert "_alembic_tmp_sermon" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT * FROM Sermon_Tag")).all() == [(1, "faith")]
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1

    up.main()
    assert_preserved(migration_app)


def test_legacy_down_then_up_recreates_schema(migration_app):
    seed_baseline(migration_app, legacy=True)
    down.main()
    up.main()
    with migration_app.app_context():
        populate(migration_app)
    assert migration_app.test_client().get("/api/sermons/1").status_code == 200
