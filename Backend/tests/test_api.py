import pytest  # noqa: F401
from flask.testing import FlaskClient
from syrupy.data import Snapshot

from tsh.schemas import (
    series_schema,
    sermon_schema,
    sermons_schema,
    speaker_schema,
    speakers_schema,
)


def test_series(client: FlaskClient, snapshot: Snapshot):
    res = client.get("/api/series")
    assert res.json == snapshot

    for item in res.json["items"]:
        res_series = series_schema.loads(client.get(f"/api/series/{item['id']}").data)
        assert res_series.id == item["id"]
        assert res_series.title == item["title"]


def all_series(client: FlaskClient) -> dict[str, dict]:
    res = client.get("/api/series?per_page=100")
    return {s["title"]: s for s in res.json["items"]}


def test_series_pagination(client: FlaskClient):
    pages = [
        client.get(f"/api/series?page={n}&per_page=2").json for n in (1, 2, 3)
    ]

    assert [p["total"] for p in pages] == [5, 5, 5]
    assert [len(p["items"]) for p in pages] == [2, 2, 1]

    # Every series appears exactly once across the pages
    ids = [s["id"] for p in pages for s in p["items"]]
    assert len(ids) == len(set(ids)) == 5


def test_series_stats_ignore_page(client: FlaskClient):
    # The ticket's "complete when": a card shows the same numbers whichever page it lands on
    expected = {s["id"]: s for s in all_series(client).values()}
    for n in (1, 2, 3):
        for s in client.get(f"/api/series?page={n}&per_page=2").json["items"]:
            assert s == expected[s["id"]]


def test_series_stats(client: FlaskClient):
    series = all_series(client)["Live Your Best Life"]

    assert series["sermonCount"] == 2
    assert series["firstDate"] == "2026-02-16"
    assert series["lastDate"] == "2026-02-23"
    assert [sp["lastName"] for sp in series["speakers"]] == ["Patterson"]


def test_empty_series(client: FlaskClient):
    empty = all_series(client)["New Ground"]

    assert empty["sermonCount"] == 0
    assert empty["firstDate"] is None
    assert empty["lastDate"] is None
    assert empty["speakers"] == []


def test_series_bad_page_args(client: FlaskClient):
    # Nonsense values fall back to something sensible instead of erroring
    res = client.get("/api/series?page=-4&per_page=abc").json
    assert res["page"] == 1
    assert res["perPage"] == 12

    res = client.get("/api/series?per_page=5000").json
    assert res["perPage"] == 100


def test_speakers(client, snapshot):
    from tsh.models import Speaker

    res = client.get("/api/speakers")
    speakers: list[Speaker] = speakers_schema.loads(res.data)
    assert speakers == snapshot

    for speaker in speakers:
        res = client.get(f"/api/speakers/{speaker.id}")
        res_speaker: Speaker = speaker_schema.loads(res.data)
        assert res_speaker == speaker


def test_sermons(client, snapshot):
    from tsh.models import Sermon

    res = client.get("/api/sermons")
    sermons: list[Sermon] = sermons_schema.loads(res.data)
    assert sermons == snapshot

    for sermon in sermons:
        res = client.get(f"/api/sermons/{sermon.id}")
        res_sermon: Sermon = sermon_schema.loads(res.data)
        assert res_sermon == sermon


def test_get_id_404(client: FlaskClient):
    slugs = [
        "series",
        "speakers",
        "sermons",
    ]

    for slug in slugs:
        res = client.get(f"/api/{slug}/10000")
        assert res.status == "404 NOT FOUND"
        assert res.is_json
        assert "10000 not found" in res.json["error"]
        assert res.json["message"] == res.json["error"]


def test_404_mistyped_url(client: FlaskClient):
    res = client.get("/api/nonexistent-route")
    assert res.status_code == 404
    assert res.is_json
    assert "error" in res.json
    # Distinguish mistyped URL from missing sermon
    assert "sermon" not in res.json["error"].lower()


def test_error_500(app, client: FlaskClient):
    from flask import abort

    app.add_url_rule("/api/test-500", "test_500", lambda: abort(500))
    res = client.get("/api/test-500")
    assert res.status_code == 500
    assert res.is_json
    assert res.json == {
        "error": "Internal server error",
        "message": "Internal server error",
    }


def test_health(client: FlaskClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.is_json
    assert res.json == {"status": "ok"}


def test_tags(client: FlaskClient):
    from tsh.schemas import counted_tags_schema

    res = client.get("/api/tags")
    assert res.status_code == 200
    assert res.is_json
    tags = counted_tags_schema.loads(res.data)
    assert len(tags) > 0
    tag_names = [t.name for t in tags]
    assert "faith" in tag_names
    assert "grace" in tag_names


def test_dev_database_untouched(app):
    import os
    import sqlite3
    from tsh.database import db

    # Verify test database is in-memory
    assert app.config["SQLALCHEMY_DATABASE_URI"] == "sqlite:///:memory:"
    assert db.engine.url.database == ":memory:"

    # Verify development database file exists and is untouched
    dev_db_path = os.path.join(app.instance_path, "testing.db")
    if os.path.exists(dev_db_path):
        conn = sqlite3.connect(dev_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM series")
        count_before = cursor.fetchone()[0]
        conn.close()

        # Adding data to test database does not affect development database
        from tsh.models import Series
        with app.app_context():
            db.session.add(Series(id=None, title="Temporary Test Series"))
            db.session.commit()

        conn = sqlite3.connect(dev_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM series")
        count_after = cursor.fetchone()[0]
        conn.close()

        assert count_before == count_after

