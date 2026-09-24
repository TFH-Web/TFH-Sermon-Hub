import pytest  # noqa: F401
from flask.testing import FlaskClient
from syrupy.data import Snapshot

from tsh.schemas import (
    counted_speaker_schema,
    counted_speakers_schema,
    series_schema,
    seriess_schema,
    sermon_schema,
    sermons_schema,
)


def test_series(client: FlaskClient, snapshot: Snapshot):
    from tsh.models import Series

    res = client.get("/api/series")
    seriess: list[Series] = seriess_schema.loads(res.data)
    assert seriess == snapshot

    for series in seriess:
        res = client.get(f"/api/series/{series.id}")
        res_series: Series = series_schema.loads(res.data)
        assert res_series == series


def test_speakers(client, snapshot):
    from tsh.models import Speaker

    res = client.get("/api/speakers")
    speakers: list[Speaker] = counted_speakers_schema.loads(res.data)
    assert speakers == snapshot

    for speaker in speakers:
        res = client.get(f"/api/speakers/{speaker.id}")
        res_speaker: Speaker = counted_speaker_schema.loads(res.data)
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


def test_sermons_legacy_array_preserved(client: FlaskClient):
    """Opt-in pagination: requests without page return a plain JSON array."""
    res = client.get("/api/sermons")
    assert res.status_code == 200
    assert isinstance(res.json, list)
    assert len(res.json) == 6

    # Filters also work on legacy unpaginated requests
    res_filtered = client.get("/api/sermons?status=Draft")
    assert res_filtered.status_code == 200
    assert isinstance(res_filtered.json, list)
    assert len(res_filtered.json) == 2
    titles = [s["title"] for s in res_filtered.json]
    assert "Power of Community" in titles
    assert "Worship as a Lifestyle" in titles


def test_sermons_filtering_individual(client: FlaskClient):
    """Test individual status, topic/tag, speaker, and series filters."""
    # Status
    res = client.get("/api/sermons?status=Published&page=1")
    assert res.status_code == 200
    assert res.json["total"] == 2
    assert all(s["status"] == "Published" for s in res.json["items"])

    # Topic / Tag (identified by name, case-insensitive)
    res = client.get("/api/sermons?topic=FAITH&page=1")
    assert res.status_code == 200
    assert res.json["total"] == 4
    # Ensure tag filtering does not duplicate sermons or inflate totals
    ids = [s["id"] for s in res.json["items"]]
    assert len(ids) == len(set(ids))

    res_anxiety = client.get("/api/sermons?topic=anxiety&page=1")
    assert res_anxiety.status_code == 200
    assert res_anxiety.json["total"] == 1
    assert res_anxiety.json["items"][0]["title"] == "Bold Faith"

    # Speaker
    res_speaker = client.get("/api/sermons?speaker_id=1&page=1")
    assert res_speaker.status_code == 200
    assert res_speaker.json["total"] == 6

    res_speaker_name = client.get("/api/sermons?speaker=Dave%20Patterson&page=1")
    assert res_speaker_name.status_code == 200
    assert res_speaker_name.json["total"] == 6

    # Series
    res_series = client.get("/api/sermons?series_id=1&page=1")
    assert res_series.status_code == 200
    assert res_series.json["total"] == 2
    assert all(s["series"]["id"] == 1 for s in res_series.json["items"])

    res_series_title = client.get("/api/sermons?series=Fearless&page=1")
    assert res_series_title.status_code == 200
    assert res_series_title.json["total"] == 1
    assert res_series_title.json["items"][0]["title"] == "Worship as a Lifestyle"


def test_sermons_filtering_combined_and_no_matches(client: FlaskClient):
    """Combined filters must use AND; no matches must return empty result."""
    # Matching combination: series 1 AND status Published AND topic faith
    res = client.get("/api/sermons?series_id=1&status=Published&topic=faith&page=1")
    assert res.status_code == 200
    assert res.json["total"] == 2
    assert len(res.json["items"]) == 2

    # Non-matching combination: series 1 AND status Draft -> 0 matches
    res_empty = client.get("/api/sermons?series_id=1&status=Draft&page=1")
    assert res_empty.status_code == 200
    assert res_empty.json["total"] == 0
    assert res_empty.json["totalPages"] == 0
    assert res_empty.json["items"] == []

    # Non-existent series ID
    res_none = client.get("/api/sermons?series_id=9999&page=1")
    assert res_none.status_code == 200
    assert res_none.json["total"] == 0
    assert res_none.json["items"] == []


def test_sermons_sorting(client: FlaskClient):
    """Test Newest, Oldest, and Relevance sorting."""
    # Newest: date descending (2026-02-23 down to 2026-01-19)
    res_newest = client.get("/api/sermons?sort=Newest&page=1&pageSize=10")
    assert res_newest.status_code == 200
    dates = [s["date"] for s in res_newest.json["items"]]
    assert dates == sorted(dates, reverse=True)

    # Oldest: date ascending (2026-01-19 up to 2026-02-23)
    res_oldest = client.get("/api/sermons?sort=Oldest&page=1&pageSize=10")
    assert res_oldest.status_code == 200
    dates_asc = [s["date"] for s in res_oldest.json["items"]]
    assert dates_asc == sorted(dates_asc)

    # Relevance behaves like Newest
    res_rel = client.get("/api/sermons?sort=Relevance&page=1&pageSize=10")
    assert res_rel.status_code == 200
    assert [s["id"] for s in res_rel.json["items"]] == [
        s["id"] for s in res_newest.json["items"]
    ]


def test_sermons_sorting_date_tie_breaker(app, client: FlaskClient):
    """Stable ordering when sermon dates match, broken by sermon ID."""
    from datetime import date

    from tsh.database import db
    from tsh.models import Sermon, Speaker, UploadStatus

    with app.app_context():
        speaker = db.session.execute(db.select(Speaker)).scalars().first()
        s1 = Sermon(
            id=None,
            title="Tie Sermon A",
            video_link="https://youtu.be/sampleA",
            duration=1200,
            date=date(2025, 6, 1),
            description="Tie date test A",
            tags=[],
            transcript=None,
            summary=None,
            status=UploadStatus.PUBLISHED,
            speaker=speaker,
            speaker_id=speaker.id,
            series=None,
            series_id=None,
        )
        s2 = Sermon(
            id=None,
            title="Tie Sermon B",
            video_link="https://youtu.be/sampleB",
            duration=1300,
            date=date(2025, 6, 1),
            description="Tie date test B",
            tags=[],
            transcript=None,
            summary=None,
            status=UploadStatus.PUBLISHED,
            speaker=speaker,
            speaker_id=speaker.id,
            series=None,
            series_id=None,
        )
        db.session.add_all([s1, s2])
        db.session.commit()
        s1_id = s1.id
        s2_id = s2.id

    assert s2_id > s1_id

    # For Newest: higher id first when dates match
    res_newest = client.get("/api/sermons?sort=Newest&page=1&pageSize=20")
    items_newest = res_newest.json["items"]
    tie_ids_newest = [s["id"] for s in items_newest if s["id"] in (s1_id, s2_id)]
    assert tie_ids_newest == [s2_id, s1_id]

    # For Oldest: lower id first when dates match
    res_oldest = client.get("/api/sermons?sort=Oldest&page=1&pageSize=20")
    items_oldest = res_oldest.json["items"]
    tie_ids_oldest = [s["id"] for s in items_oldest if s["id"] in (s1_id, s2_id)]
    assert tie_ids_oldest == [s1_id, s2_id]


def test_sermons_pagination_pages(client: FlaskClient):
    """Test first, middle, last, and out-of-range pages with accurate metadata."""
    # 6 sermons total (or 8 after tie-breaker test in same run, let's query total first)
    res_all = client.get("/api/sermons?page=1&pageSize=100")
    total = res_all.json["total"]
    page_size = 2
    expected_pages = (total + page_size - 1) // page_size

    # First page
    res_p1 = client.get(f"/api/sermons?page=1&pageSize={page_size}")
    assert res_p1.status_code == 200
    assert res_p1.json["page"] == 1
    assert res_p1.json["pageSize"] == page_size
    assert res_p1.json["total"] == total
    assert res_p1.json["totalPages"] == expected_pages
    assert len(res_p1.json["items"]) == page_size

    # Middle page
    res_p2 = client.get(f"/api/sermons?page=2&pageSize={page_size}")
    assert res_p2.status_code == 200
    assert res_p2.json["page"] == 2
    assert len(res_p2.json["items"]) == page_size
    assert res_p1.json["items"][0]["id"] != res_p2.json["items"][0]["id"]

    # Last page
    res_last = client.get(f"/api/sermons?page={expected_pages}&pageSize={page_size}")
    assert res_last.status_code == 200
    assert res_last.json["page"] == expected_pages
    assert len(res_last.json["items"]) > 0

    # Out of range page: consistent empty items list
    res_oor = client.get(
        f"/api/sermons?page={expected_pages + 10}&pageSize={page_size}"
    )
    assert res_oor.status_code == 200
    assert res_oor.json["items"] == []
    assert res_oor.json["total"] == total
    assert res_oor.json["totalPages"] == expected_pages
    assert res_oor.json["page"] == expected_pages + 10


def test_sermons_matches_outside_first_unfiltered_page(client: FlaskClient):
    """Sermon outside the first unfiltered page is found when filter is applied."""
    # With pageSize=2, page 1 contains sermons 1 and 2
    res_unfiltered_p1 = client.get("/api/sermons?page=1&pageSize=2&sort=Newest")
    p1_ids = [s["id"] for s in res_unfiltered_p1.json["items"]]
    assert 4 not in p1_ids  # Sermon 4 is on a later page

    # When filtering by its series (series_id=4), sermon 4 appears on page 1
    res_filtered = client.get("/api/sermons?page=1&pageSize=2&series_id=4")
    assert res_filtered.status_code == 200
    assert res_filtered.json["total"] == 1
    assert res_filtered.json["items"][0]["id"] == 4


def test_sermons_pagination_invalid_inputs(client: FlaskClient):
    """Test validation of invalid page and pageSize parameters."""
    for bad_page in ["0", "-1", "-99", "abc", "1.5"]:
        res = client.get(f"/api/sermons?page={bad_page}")
        assert res.status_code == 400
        assert res.is_json
        assert "error" in res.json
        assert "message" in res.json

    for bad_size in ["0", "-1", "xyz", "2.5"]:
        res = client.get(f"/api/sermons?page=1&pageSize={bad_size}")
        assert res.status_code == 400
        assert res.is_json
        assert "error" in res.json
