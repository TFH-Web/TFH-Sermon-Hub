"""The strict YouTube link rule, the source links built from it, and the legacy link report. TFH-620, TFH-622"""

import math

import pytest
from flask import Flask
from flask.testing import FlaskCliRunner

from tsh import chat
from tsh.database import db
from tsh.models import Sermon
from tsh.retrieval import RetrievedChunk
from tsh.video_link_report import link_problem
from tsh.youtube_links import (
    InvalidVideoLink,
    is_video_id,
    parse_video_id,
    resolve_video,
    source_url,
    watch_url,
)

ID = "JQSUGFQO5FU"
OTHER_ID = "F_OiCiZ3Y3Y"
CANONICAL = f"https://www.youtube.com/watch?v={ID}"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={ID}",
        f"https://youtube.com/watch?v={ID}&t=42s",
        f"https://m.youtube.com/watch?feature=share&v={ID}",
        f"http://www.youtube.com/watch?v={ID}",
        f"HTTPS://WWW.YOUTUBE.COM/watch?v={ID}",
        f"https://www.youtube.com/watch?v={ID}#t=10",
        f"https://youtu.be/{ID}",
        f"https://youtu.be/{ID}?si=abc",
        f"https://youtu.be/{ID}/",
        f"https://www.youtube.com/shorts/{ID}",
        f"https://www.youtube.com/shorts/{ID}/",
        f"https://m.youtube.com/shorts/{ID}?feature=share",
        f"  https://youtu.be/{ID}  ",
    ],
)
def test_accepted_formats_give_the_video_id(url: str):
    """The watch, youtu.be and shorts formats all give the same 11 character id."""
    assert parse_video_id(url) == ID


@pytest.mark.parametrize(
    "url",
    [
        # Hosts that only look like YouTube.
        f"https://www.youtube.com.evil.example/watch?v={ID}",
        f"https://youtube.com.evil.example/watch?v={ID}",
        f"https://evilyoutube.com/watch?v={ID}",
        f"https://notyoutu.be/{ID}",
        f"https://youtu.be.evil.example/{ID}",
        f"https://www.youtube.co/watch?v={ID}",
        f"https://youtube.com./watch?v={ID}",
        f"https://music.youtube.com/watch?v={ID}",
        f"https://www.youtube-nocookie.com/embed/{ID}",
        f"https://vimeo.com/{ID}",
        # A real host in the user name or a port, with the real destination after it.
        f"https://youtube.com@evil.example/watch?v={ID}",
        f"https://www.youtube.com:443/watch?v={ID}",
        f"https://www.youtube.com:evil@evil.example/watch?v={ID}",
        f"https://user:pass@youtu.be/{ID}",
        # Characters that hide a second host.
        f"https://evil.example\\@youtu.be/{ID}",
        f"https://youtu.be/{ID} https://evil.example",
        f"https://youtu.be/{ID}\r\nHost: evil.example",
        f"https://youtu.be/{ID}\n/extra",
        f"https://youtu.be/\t{ID}",
        "https://youtu.be/JQSUGFQO5FÜ",
        "https://youtubе.com/watch?v=JQSUGFQO5FU",
        # Schemes that are not http or https, or no scheme at all.
        f"javascript:alert(1)//youtu.be/{ID}",
        "javascript:alert(document.cookie)",
        "data:text/html,<script>alert(1)</script>",
        f"ftp://youtu.be/{ID}",
        f"file:///youtu.be/{ID}",
        f"//youtu.be/{ID}",
        f"youtu.be/{ID}",
        f"www.youtube.com/watch?v={ID}",
        ID,
        "",
        "   ",
        # Ids that are the wrong length or use other characters.
        "https://youtu.be/short",
        f"https://youtu.be/{ID}x",
        f"https://youtu.be/{ID[:-1]}",
        f"https://www.youtube.com/watch?v={ID}x",
        "https://www.youtube.com/watch?v=JQSUGFQO5F!",
        "https://www.youtube.com/watch?v=",
        "https://www.youtube.com/watch",
        # Two videos in one link, or a shape that is not a single video.
        f"https://www.youtube.com/watch?v={ID}&v={OTHER_ID}",
        f"https://youtu.be/{ID}/extra",
        f"https://www.youtube.com/shorts/{ID}/extra",
        f"https://www.youtube.com/watch/{ID}",
        f"https://www.youtube.com/embed/{ID}",
        f"https://www.youtube.com/live/{ID}",
        f"https://www.youtube.com/v/{ID}",
        "https://www.youtube.com/playlist?list=PLi-eigZZRtCDca4NYmnxCgv-yvjDFOPYe",
        "https://www.youtube.com/@TFHchannel",
    ],
)
def test_deceptive_and_unsupported_links_give_nothing(url: str):
    """Look-alike hosts, hidden second hosts, other schemes and wrong-length ids are all refused."""
    assert parse_video_id(url) is None


@pytest.mark.parametrize("value", [None, 123, 4.5, True, [CANONICAL], {"url": CANONICAL}, b"https://youtu.be/" + ID.encode()])
def test_a_link_that_is_not_text_gives_nothing(value):
    assert parse_video_id(value) is None


def test_video_id_is_exactly_eleven_safe_characters():
    assert is_video_id(ID)
    assert is_video_id("a-_Z0-9aBcD")
    for bad in ["", "short", ID + "x", ID[:-1], "JQSUGFQO5F!", "JQSUGFQO5F ", "JQSUGFQO5F\n", None, 12345678901]:
        assert not is_video_id(bad), bad


def test_watch_url_is_https_and_built_from_the_id():
    assert watch_url(ID) == CANONICAL
    with pytest.raises(InvalidVideoLink):
        watch_url("not an id")


@pytest.mark.parametrize(
    ("link", "video_id"),
    [
        (f"https://youtu.be/{ID}?si=abc", None),
        (f"http://m.youtube.com/watch?v={ID}&t=9s", None),
        (None, ID),
        (f"https://youtu.be/{ID}", ID),
        (CANONICAL, ID),
    ],
)
def test_resolve_gives_the_canonical_link_and_the_id(link, video_id):
    """A link, an id, or both that agree always end up as the HTTPS watch link plus the id."""
    assert resolve_video(link, video_id) == (CANONICAL, ID)


@pytest.mark.parametrize(
    ("link", "video_id", "words"),
    [
        (f"https://youtu.be/{ID}", OTHER_ID, "different videos"),
        (CANONICAL, OTHER_ID, "different videos"),
        ("https://evil.example/watch?v=" + ID, None, "videoLink"),
        ("javascript:alert(1)", None, "videoLink"),
        (123, None, "videoLink"),
        ("", None, "videoLink"),
        (None, "short", "youtubeVideoId"),
        (None, 12345678901, "youtubeVideoId"),
        (CANONICAL, "short", "youtubeVideoId"),
        (None, None, "Send"),
    ],
)
def test_resolve_refuses_bad_or_conflicting_values(link, video_id, words):
    """A bad link, a bad id, a link and id for different videos, or neither all raise a message for the client."""
    with pytest.raises(InvalidVideoLink, match=words):
        resolve_video(link, video_id)


@pytest.mark.parametrize(
    ("start", "seconds"),
    [
        (0, 0),
        (75, 75),
        (75.9, 75),
        (0.4, 0),
        (-1, 0),
        (-0.5, 0),
        (math.nan, 0),
        (math.inf, 0),
        (-math.inf, 0),
        (None, 0),
        ("30", 0),
        (True, 0),
        ([5], 0),
    ],
)
def test_source_url_only_uses_a_finite_start_of_at_least_zero(start, seconds):
    """Any other start time links to the beginning of the video instead of passing the value along."""
    assert source_url(ID, start) == f"{CANONICAL}&t={seconds}s"


def test_source_url_refuses_an_id_that_is_not_valid():
    with pytest.raises(InvalidVideoLink):
        source_url("javascript:alert(1)", 5)


def make_chunk(start_sec, video_id: str = ID) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=1,
        sermon_id=1,
        title="A sermon",
        youtube_video_id=video_id,
        start_sec=start_sec,
        end_sec=99.0,
        text="Some words.",
        distance=0.1,
    )


@pytest.mark.parametrize(("start", "tail"), [(75.8, "&t=75s"), (-30.0, "&t=0s"), (math.nan, "&t=0s"), (math.inf, "&t=0s")])
def test_chat_source_link_is_built_from_the_stored_id_and_a_safe_start(start, tail):
    """The link in a chat source is the canonical watch link plus a start the server worked out."""
    source = chat.source_for(1, make_chunk(start))

    assert source["url"] == CANONICAL + tail
    assert source["youtube_video_id"] == ID


def test_chat_source_never_takes_a_link_from_the_chunk_text():
    """A link inside the retrieved text, which could be model or user written, is never what the source links to."""
    chunk = make_chunk(10.0)
    chunk = RetrievedChunk(**{**chunk.__dict__, "text": "Watch https://evil.example/phish instead"})

    assert chat.source_for(1, chunk)["url"] == CANONICAL + "&t=10s"


@pytest.mark.parametrize(
    ("link", "video_id", "problem"),
    [
        (CANONICAL, None, None),
        (CANONICAL, ID, None),
        ("https://youtu.be/BROKENLINKTEST", None, "not a valid YouTube video link"),
        ("https://evil.example/watch?v=" + ID, None, "not a valid YouTube video link"),
        ("", None, "not a valid YouTube video link"),
        (CANONICAL, "short", "not a valid 11 character id"),
        (CANONICAL, OTHER_ID, "different videos"),
    ],
)
def test_link_problem_names_what_is_wrong(link, video_id, problem):
    result = link_problem(link, video_id)

    if problem is None:
        assert result is None
    else:
        assert problem in result


def test_report_lists_bad_links_and_changes_nothing(app: Flask, runner: FlaskCliRunner):
    """The seed data has one legacy link that is not a real video id. The report names it and edits nothing."""
    before = db.session.execute(db.select(Sermon.id, Sermon.video_link, Sermon.youtube_video_id).order_by(Sermon.id)).all()

    result = runner.invoke(args=["check-video-links"])

    assert result.exit_code == 0
    assert "BROKENLINKTEST" in result.output
    assert "need a corrected link" in result.output
    db.session.expire_all()
    after = db.session.execute(db.select(Sermon.id, Sermon.video_link, Sermon.youtube_video_id).order_by(Sermon.id)).all()
    assert after == before


def test_report_is_clean_when_every_link_is_good(app: Flask, runner: FlaskCliRunner):
    """With every link fixed, the report says 0 need a correction."""
    for sermon in db.session.scalars(db.select(Sermon)):
        sermon.video_link = CANONICAL
        sermon.youtube_video_id = None
    db.session.commit()

    result = runner.invoke(args=["check-video-links"])

    assert result.exit_code == 0
    assert "0 need a corrected link" in result.output
    assert "no saved video id" in result.output