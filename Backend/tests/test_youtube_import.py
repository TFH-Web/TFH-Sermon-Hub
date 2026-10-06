# Tests for the YouTube import, its endpoints and the import-youtube command. YouTube is faked, so no network.
from datetime import date

import fakeredis
import pytest
from flask import Flask
from flask.testing import FlaskClient, FlaskCliRunner
from redis import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from rq import Queue

from tsh import pipeline, views, youtube
from tsh.database import db
from tsh.models import Series, Sermon, Speaker, UploadStatus
from tsh.queue import QUEUE_NAME
from tsh.youtube_import import import_channel, parse_video_id

BOILERPLATE = "Broadcasted live from The Father's House in Vacaville, CA.\nhttps://example.com"


def video(id: str, title: str, description: str = BOILERPLATE, published_at: str = "2026-09-06T17:00:00Z",
          duration: str = "PT38M25S", privacy: str = "public") -> dict:
    return {"id": id, "title": title, "description": description, "published_at": published_at,
            "duration": duration, "privacy": privacy}


class FakeChannel:
    """Stands in for tsh.youtube. Tests change playlists, items and videos to shape what YouTube returns."""

    def __init__(self):
        self.playlists = [
            ("PLholy", "Holy Spirit"),
            ("PLjesus", "Who Is Jesus?"),
            ("PLtest1", "Testimonies"),
            # Same series as the one above, the title only differs by case.
            ("PLtest2", "testimonies"),
            # Aliased to "The Book of James" by the default YOUTUBE_SERIES_ALIASES.
            ("PLjames", "Book of James"),
            # Already in the test database.
            ("PLnewgr", "New Ground"),
            ("PLworsh", "Worship Focus"),
            ("PLgone", "Gone Playlist"),
            ("PLmaster", "TFH Latest Messages"),
        ]
        self.items = {
            "PLholy": ["vGuide00001", "vTwoSer0001"],
            "PLjesus": ["vTwoSer0001", "vMulti00001"],
            "PLtest1": ["vTestim0001"],
            "PLtest2": ["vTestim0002"],
            "PLjames": ["vJames00001"],
            "PLnewgr": ["vOlder00001"],
            "PLworsh": ["vSong000001"],
            "PLmaster": ["vGuide00001", "vMaster0001", "vPriv000001", "vDeleted001", "vLong000001",
                         "vNoSpk00001", "vEmpty00001", "vSr00000001", "vLive000001"],
        }
        self.videos = {v["id"]: v for v in [
            # 00:30 UTC on Monday is Sunday afternoon in Vacaville.
            video("vGuide00001", "The Guide: Holy Spirit - Dave Patterson",
                  "Pastor Dave on being led by the Spirit.\n\n" + BOILERPLATE, published_at="2026-09-07T00:30:00Z"),
            video("vTwoSer0001", "Fire: Holy Spirit - Jon Laurenzo"),
            video("vMulti00001", "Jesus, The Servant of All: Who Is Jesus? - Joseph Zwanziger & James Cooper"),
            video("vTestim0001", "God of Restoration - Seth's Story"),
            video("vTestim0002", "Freedom Found - Hilary Harris"),
            video("vJames00001", "Faith Works: The Book of James - Rich Harris"),
            video("vOlder00001", 'New Ground PT2 - "Owners of the Promise" - Jon Laurenzo - 1.12.26'),
            video("vSong000001", "Goodness of God"),
            video("vMaster0001", 'Gospel of Mark PT7 - "Jesus in the Storm" - Jude Fouquier - 5.26.24'),
            video("vLong000001", "The Father's House - Pursuit", duration="PT1H1M"),
            video("vNoSpk00001", "Day 17 - Don't Faint", duration="PT48S"),
            video("vEmpty00001", "Quiet Strength - Tosha Zwanziger", description="", privacy="unlisted"),
            video("vSr00000001", '"A Prayer Pattern" - Jude Fouquier Sr. - 10.22.23'),
            # Upcoming premieres and live streams report a length of P0D until they finish.
            video("vLive000001", "Sunday Live - Dave Patterson", duration="P0D"),
        ]}
        self.hidden = {"vPriv000001": "Private video"}
        self.items_read: list[str] = []

    def list_playlists(self, channel_id: str) -> list[dict]:
        return [{"id": id, "title": title, "item_count": len(self.items.get(id, [])), "privacy": "public"}
                for id, title in self.playlists]

    def list_playlist_items(self, playlist_id: str) -> list[dict]:
        self.items_read.append(playlist_id)
        if playlist_id == "PLgone":
            raise youtube.YouTubeError("playlistItems: HTTP 404: playlistNotFound", status=404)
        return [{"video_id": v, "title": self.hidden.get(v, "A video"),
                 "privacy": "private" if v in self.hidden else "public"} for v in self.items[playlist_id]]

    def get_videos(self, video_ids: list[str]) -> list[dict]:
        # Deleted videos and hidden ones are not returned by videos.list.
        return [dict(self.videos[v]) for v in video_ids if v in self.videos and v not in self.hidden]


@pytest.fixture()
def channel(app: Flask, monkeypatch) -> FakeChannel:
    fake = FakeChannel()
    for name in ("list_playlists", "list_playlist_items", "get_videos"):
        monkeypatch.setattr(youtube, name, getattr(fake, name))
    return fake


def sermon_for(video_id: str) -> Sermon:
    db.session.expire_all()
    return db.session.scalar(db.select(Sermon).where(Sermon.youtube_video_id == video_id))


def count(model, *where) -> int:
    return db.session.scalar(db.select(db.func.count()).select_from(model).where(*where))


def test_import_report(app: Flask, channel: FakeChannel):
    """The report counts what was created and lists everything skipped or needing a look."""
    report = import_channel().as_dict()

    assert report == {
        "series_created": 4,
        "sermons_created": 11,
        "sermons_updated": 0,
        "sermons_unchanged": 0,
        "skipped_playlists": ["Gone Playlist (PLgone): playlistItems: HTTP 404: playlistNotFound"],
        "skipped_private": ["vPriv000001", "vDeleted001"],
        "skipped_not_ready": ["Sunday Live - Dave Patterson (vLive000001)"],
        "skipped_too_long": ["The Father's House - Pursuit (vLong000001): 61 min"],
        "multiple_series": ["Fire: Holy Spirit - Jon Laurenzo (vTwoSer0001): kept Holy Spirit, also in Who Is Jesus?"],
        "unknown_speakers": ["God of Restoration - Seth's Story (vTestim0001)", "Day 17 - Don't Faint (vNoSpk00001)"],
        "multiple_speakers": [
            "Jesus, The Servant of All: Who Is Jesus? - Joseph Zwanziger & James Cooper (vMulti00001): "
            "Joseph Zwanziger & James Cooper"
        ],
        "queue_failures": [],
    }


def test_import_maps_video_to_sermon(app: Flask, channel: FakeChannel):
    """A video becomes a sermon with a clean title, the speaker, the series, the local date and no boilerplate."""
    import_channel()

    sermon = sermon_for("vGuide00001")
    assert sermon.title == "The Guide"
    assert (sermon.speaker.first_name, sermon.speaker.last_name) == ("Dave", "Patterson")
    assert sermon.series.title == "Holy Spirit"
    assert sermon.series.youtube_playlist_id == "PLholy"
    assert sermon.date == date(2026, 9, 6)
    assert sermon.duration == 38 * 60 + 25
    assert sermon.video_link == "https://www.youtube.com/watch?v=vGuide00001"
    assert sermon.description == "Pastor Dave on being led by the Spirit."
    # Inline mode, so start_processing has already run the pipeline.
    assert sermon.status == UploadStatus.PUBLISHED


def test_import_series_rules(app: Flask, channel: FakeChannel):
    """Ignored playlists are never read, the master list is never a series, and playlists merge by case and alias."""
    import_channel()

    assert "PLworsh" not in channel.items_read
    assert sermon_for("vSong000001") is None
    assert count(Series, Series.title == "TFH Latest Messages") == 0
    assert sermon_for("vMaster0001").series is None

    testimonies = db.session.scalars(db.select(Series).where(db.func.lower(Series.title) == "testimonies")).all()
    assert len(testimonies) == 1
    assert testimonies[0].youtube_playlist_id == "PLtest1"
    assert sermon_for("vTestim0002").series == testimonies[0]

    assert sermon_for("vJames00001").series.title == "The Book of James"
    assert count(Series, Series.title == "Book of James") == 0

    new_ground = sermon_for("vOlder00001").series
    assert new_ground.title == "New Ground"
    assert new_ground.youtube_playlist_id == "PLnewgr"
    assert count(Series, Series.title == "New Ground") == 1

    # A video in two series keeps the first one.
    assert sermon_for("vTwoSer0001").series.title == "Holy Spirit"


def test_import_titles_and_speakers(app: Flask, channel: FakeChannel):
    """Titles are cleaned for every format, speakers are reused, and unknown or several speakers are handled."""
    import_channel()

    assert sermon_for("vJames00001").title == "Faith Works"
    assert sermon_for("vOlder00001").title == "Owners of the Promise"
    # No series, so the older title keeps its context.
    assert sermon_for("vMaster0001").title == "Gospel of Mark, Part 7: Jesus in the Storm"

    # Jon Laurenzo is already in the test database, so he is reused, not added again.
    assert count(Speaker, Speaker.first_name == "Jon", Speaker.last_name == "Laurenzo") == 1
    assert sermon_for("vTwoSer0001").speaker == sermon_for("vOlder00001").speaker

    # Jude Fouquier Sr. is a different person from Jude Fouquier.
    assert sermon_for("vSr00000001").speaker.last_name == "Fouquier Sr."
    assert sermon_for("vSr00000001").speaker != sermon_for("vMaster0001").speaker

    unknown = sermon_for("vNoSpk00001")
    assert (unknown.speaker.first_name, unknown.speaker.last_name) == ("Unknown", "Speaker")
    assert unknown.title == "Day 17 - Don't Faint"
    assert sermon_for("vTestim0001").speaker == unknown.speaker

    multi = sermon_for("vMulti00001")
    assert (multi.speaker.first_name, multi.speaker.last_name) == ("Joseph", "Zwanziger")
    assert multi.description == "Speakers: Joseph Zwanziger & James Cooper"


def test_import_skips_and_edge_cases(app: Flask, channel: FakeChannel):
    """Private, deleted, too-long and still-streaming videos are skipped; unlisted and very short ones are imported."""
    import_channel()

    for skipped in ("vPriv000001", "vDeleted001", "vLong000001", "vLive000001"):
        assert sermon_for(skipped) is None
    empty = sermon_for("vEmpty00001")
    assert empty.description == "Quiet Strength"
    assert sermon_for("vNoSpk00001").duration == 48


def test_import_speaker_after_colon(app: Flask, channel: FakeChannel):
    """A "<Title>: <Speaker>" title finds a speaker already in the database, or one who first appears later in the run."""
    # Read before vMulti00001, which is the first video to name Joseph Zwanziger.
    channel.items["PLholy"].insert(0, "vColon00001")
    channel.items["PLmaster"].append("vColon00002")
    channel.videos["vColon00001"] = video("vColon00001", "You Will Receive Power: Joseph Zwanziger")
    # Tosha Zwanziger is already in the test database.
    channel.videos["vColon00002"] = video("vColon00002", "Strength for Today | Tosha Zwanziger")

    report = import_channel()

    power = sermon_for("vColon00001")
    assert power.title == "You Will Receive Power"
    assert (power.speaker.first_name, power.speaker.last_name) == ("Joseph", "Zwanziger")
    assert power.speaker == sermon_for("vMulti00001").speaker
    assert power.description == "You Will Receive Power"
    strength = sermon_for("vColon00002")
    assert strength.title == "Strength for Today"
    assert (strength.speaker.first_name, strength.speaker.last_name) == ("Tosha", "Zwanziger")
    assert not any("vColon" in line for line in report.unknown_speakers)
    assert count(Speaker, Speaker.first_name == "Joseph", Speaker.last_name == "Zwanziger") == 1


def test_rerun_creates_nothing(app: Flask, channel: FakeChannel):
    """A second run with nothing new on YouTube creates nothing and changes nothing."""
    import_channel()
    sermons, series, speakers = count(Sermon), count(Series), count(Speaker)

    report = import_channel()

    assert (report.sermons_created, report.series_created, report.sermons_updated) == (0, 0, 0)
    assert report.sermons_unchanged == 11
    assert (count(Sermon), count(Series), count(Speaker)) == (sermons, series, speakers)
    # Already reported on the first run.
    assert report.multiple_series == []
    assert report.unknown_speakers == []


def test_rerun_keeps_admin_edits(app: Flask, channel: FakeChannel):
    """A re-run updates only duration, date and link; admin edits to title, description, speaker and summary stay."""
    import_channel()
    sermon = sermon_for("vGuide00001")
    other = db.session.scalar(db.select(Speaker).where(Speaker.first_name == "Hilary"))
    sermon.title = "Led by the Spirit"
    sermon.description = "Written by an admin."
    sermon.speaker = other
    sermon.summary = "Admin summary"
    db.session.commit()

    channel.videos["vGuide00001"].update(
        title="Renamed On YouTube: Holy Spirit - Dave Patterson", duration="PT40M", published_at="2026-09-13T17:00:00Z"
    )
    report = import_channel()

    assert report.sermons_updated == 1
    sermon = sermon_for("vGuide00001")
    assert (sermon.title, sermon.description, sermon.summary) == ("Led by the Spirit", "Written by an admin.", "Admin summary")
    assert sermon.speaker == other
    assert sermon.duration == 40 * 60
    assert sermon.date == date(2026, 9, 13)


def test_rerun_fills_missing_series(app: Flask, channel: FakeChannel):
    """A sermon first imported with no series gets one when its video later shows up in a series playlist."""
    import_channel()
    assert sermon_for("vMaster0001").series is None

    channel.playlists.insert(0, ("PLmark", "Gospel of Mark"))
    channel.items["PLmark"] = ["vMaster0001"]
    report = import_channel()

    assert report.sermons_updated == 1
    sermon = sermon_for("vMaster0001")
    assert sermon.series.title == "Gospel of Mark"
    # The title was set on the first run and is not redone.
    assert sermon.title == "Gospel of Mark, Part 7: Jesus in the Storm"


def test_youtube_failure_saves_nothing(app: Flask, channel: FakeChannel, monkeypatch):
    """If YouTube fails partway through, the error is raised and nothing from the run is saved."""
    series_before = count(Series)

    def broken(video_ids):
        raise youtube.YouTubeError("videos: HTTP 500: backendError", status=500)

    monkeypatch.setattr(youtube, "get_videos", broken)

    with pytest.raises(youtube.YouTubeError):
        import_channel()

    db.session.rollback()
    assert count(Series) == series_before
    assert count(Sermon, Sermon.youtube_video_id.is_not(None)) == 0


def test_queue_failure_is_per_sermon(app: Flask, channel: FakeChannel, monkeypatch):
    """A sermon that cannot be queued is left FAILED and listed, and the import goes on to the next one."""
    calls = []

    def broken_enqueue(func, *args):
        calls.append(args)
        raise RuntimeError("boom")

    monkeypatch.setattr(pipeline, "enqueue", broken_enqueue)

    report = import_channel()

    assert len(calls) == 11
    assert report.sermons_created == 11
    assert len(report.queue_failures) == 11
    assert report.queue_failures[0].endswith(": boom")
    assert count(Sermon, Sermon.processing_error == "queue: boom", Sermon.status == UploadStatus.FAILED) == 11


def test_redis_down_stops_queueing(app: Flask, channel: FakeChannel, monkeypatch):
    """After the first Redis error the rest are set FAILED without trying, so a dead Redis does not stall the import."""
    calls = []

    def redis_down(func, *args):
        calls.append(args)
        raise RedisConnectionError("Connection refused")

    monkeypatch.setattr(pipeline, "enqueue", redis_down)

    report = import_channel()

    assert len(calls) == 1
    assert len(report.queue_failures) == 11
    assert report.queue_failures[0].endswith(": Connection refused")
    assert all(f.endswith(": Redis unavailable") for f in report.queue_failures[1:])
    assert count(Sermon, Sermon.processing_error == "queue: Connection refused") == 1
    assert count(Sermon, Sermon.processing_error == "queue: Redis unavailable", Sermon.status == UploadStatus.FAILED) == 10


@pytest.mark.parametrize(
    ("url", "video_id"),
    [
        ("https://www.youtube.com/watch?v=F_OiCiZ3Y3Y", "F_OiCiZ3Y3Y"),
        ("https://youtube.com/watch?v=F_OiCiZ3Y3Y&t=42s", "F_OiCiZ3Y3Y"),
        ("https://m.youtube.com/watch?feature=share&v=F_OiCiZ3Y3Y", "F_OiCiZ3Y3Y"),
        ("https://youtu.be/F_OiCiZ3Y3Y?si=abc", "F_OiCiZ3Y3Y"),
        ("https://www.youtube.com/shorts/tBAMaHsskKg", "tBAMaHsskKg"),
        ("  https://youtu.be/F_OiCiZ3Y3Y  ", "F_OiCiZ3Y3Y"),
        ("https://vimeo.com/123456789", None),
        ("https://www.youtube.com/playlist?list=PLi-eigZZRtCDca4NYmnxCgv-yvjDFOPYe", None),
        ("https://youtu.be/short", None),
        ("F_OiCiZ3Y3Y", None),
        ("https://www.youtube.com.evil.example/watch?v=F_OiCiZ3Y3Y", None),
    ],
)
def test_parse_video_id(url: str, video_id: str | None):
    """watch?v=, youtu.be and /shorts/ links give the video id; anything else gives None."""
    assert parse_video_id(url) == video_id


@pytest.mark.parametrize("path", ["/api/import/youtube", "/api/import/youtube/video"])
@pytest.mark.parametrize(("roles", "status_code"), [("none", 401), ("Internal User", 403)])
def test_import_endpoints_admin_only(client: FlaskClient, channel: FakeChannel, path: str, roles: str, status_code: int):
    """Both import endpoints are Admin only, and nothing is imported for anyone else."""
    res = client.post(path, json={"url": "https://youtu.be/vGuide00001"}, headers={"X-Test-Roles": roles})

    assert res.status_code == status_code
    assert channel.items_read == []
    assert count(Sermon, Sermon.youtube_video_id.is_not(None)) == 0


def test_sync_inline(client: FlaskClient, channel: FakeChannel):
    """Without Redis the sync runs in the request and returns 200 with the report, since it has already finished."""
    res = client.post("/api/import/youtube")

    assert res.status_code == 200
    assert res.json["queued"] is False
    assert res.json["report"]["sermons_created"] == 11


def test_sync_queued(app: Flask, client: FlaskClient, channel: FakeChannel, monkeypatch):
    """With Redis the sync is put on the queue and returns 202 with the job id, without importing yet."""
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr(Redis, "from_url", lambda *args, **kwargs: fake)
    app.config["REDIS_URL"] = "redis://fake:6379/0"

    res = client.post("/api/import/youtube")

    assert res.status_code == 202
    assert res.json["queued"] is True
    assert Queue(QUEUE_NAME, connection=fake).job_ids == [res.json["jobId"]]
    assert channel.items_read == []


def test_sync_youtube_failure(app: Flask, client: FlaskClient):
    """A YouTube failure during an inline sync sends 502 with the reason. Here the key is missing, as in tests."""
    res = client.post("/api/import/youtube")

    assert res.status_code == 502
    assert res.json["error"] == "YouTube import failed: YOUTUBE_API_KEY is not set"


def test_sync_redis_down(client: FlaskClient, channel: FakeChannel, monkeypatch):
    """If the sync cannot be queued, it sends 503."""
    def redis_down(*args):
        raise RedisConnectionError("Connection refused")

    monkeypatch.setattr(views, "enqueue", redis_down)

    res = client.post("/api/import/youtube")

    assert res.status_code == 503
    assert res.json["error"] == "The job queue is unavailable. Please try again later."


def test_import_video(client: FlaskClient, channel: FakeChannel):
    """One video imports with 201, the series named in its title is created, and a second import sends 200."""
    res = client.post("/api/import/youtube/video", json={"url": "https://www.youtube.com/watch?v=vGuide00001"})

    assert res.status_code == 201
    assert res.json["title"] == "The Guide"
    assert res.json["series"]["title"] == "Holy Spirit"
    assert res.json["speaker"]["lastName"] == "Patterson"
    assert res.json["status"] == "Published"

    again = client.post("/api/import/youtube/video", json={"url": "https://youtu.be/vGuide00001"})
    assert again.status_code == 200
    assert again.json["id"] == res.json["id"]


def test_import_video_then_sync_links_series(client: FlaskClient, channel: FakeChannel):
    """A series created by a single-video import gets its playlist id from the next sync, without a copy."""
    client.post("/api/import/youtube/video", json={"url": "https://youtu.be/vGuide00001"})
    assert sermon_for("vGuide00001").series.youtube_playlist_id is None

    client.post("/api/import/youtube")

    assert count(Series, Series.title == "Holy Spirit") == 1
    assert sermon_for("vGuide00001").series.youtube_playlist_id == "PLholy"


@pytest.mark.parametrize(
    "body",
    [None, {}, {"url": 5}, {"url": ""}, {"url": "https://vimeo.com/123456789"}, ["https://youtu.be/vGuide00001"]],
)
def test_import_video_bad_url(client: FlaskClient, channel: FakeChannel, body):
    """A missing, empty or non-YouTube URL sends 400 and imports nothing."""
    res = client.post("/api/import/youtube/video", json=body)

    assert res.status_code == 400
    assert "YouTube video URL" in res.json["error"]


@pytest.mark.parametrize(
    ("video_id", "status_code", "error"),
    [
        ("vDeleted001", 404, "Video not found, or it is private or deleted"),
        ("vPriv000001", 404, "Video not found, or it is private or deleted"),
        ("vLong000001", 422, "Video is 61 minutes, over the 60 minute limit for sermons"),
        ("vLive000001", 422, "Video is not finished streaming yet"),
    ],
)
def test_import_video_not_importable(client: FlaskClient, channel: FakeChannel, video_id: str, status_code: int, error: str):
    """Private, deleted, too-long and still-streaming videos are refused with a reason, and nothing is saved."""
    res = client.post("/api/import/youtube/video", json={"url": f"https://youtu.be/{video_id}"})

    assert res.status_code == status_code
    assert res.json["error"] == error
    assert sermon_for(video_id) is None


def test_import_video_youtube_failure(client: FlaskClient):
    """A YouTube failure on a single video sends 502."""
    res = client.post("/api/import/youtube/video", json={"url": "https://youtu.be/vGuide00001"})

    assert res.status_code == 502
    assert res.json["error"] == "YouTube request failed: YOUTUBE_API_KEY is not set"


def test_cli_prints_report(runner: FlaskCliRunner, channel: FakeChannel):
    """flask import-youtube runs the import and prints the counts and the lists."""
    result = runner.invoke(args=["import-youtube"])

    assert result.exit_code == 0
    assert "sermons_created: 11" in result.output
    assert "unknown_speakers (2):" in result.output
    assert "  Day 17 - Don't Faint (vNoSpk00001)" in result.output
