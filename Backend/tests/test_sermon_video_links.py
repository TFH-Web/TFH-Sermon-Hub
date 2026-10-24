"""Create and edit refuse unsafe video links and never half save a sermon. TFH-620, TFH-622"""

import pytest
from flask.testing import FlaskClient

from tsh.database import db
from tsh.models import Sermon

ID = "JQSUGFQO5FU"
OTHER_ID = "F_OiCiZ3Y3Y"
CANONICAL = f"https://www.youtube.com/watch?v={ID}"
OTHER_CANONICAL = f"https://www.youtube.com/watch?v={OTHER_ID}"

# Each one is refused on its own, and a PATCH or POST that carries it must save nothing.
BAD_VIDEOS = [
    pytest.param({"videoLink": "https://www.youtube.com.evil.example/watch?v=" + ID}, id="lookalike-host"),
    pytest.param({"videoLink": "https://youtube.com@evil.example/watch?v=" + ID}, id="host-in-user-name"),
    pytest.param({"videoLink": "javascript:alert(1)"}, id="javascript-scheme"),
    pytest.param({"videoLink": "ftp://youtu.be/" + ID}, id="ftp-scheme"),
    pytest.param({"videoLink": "https://youtu.be/short"}, id="short-id"),
    pytest.param({"videoLink": "https://vimeo.com/123456789"}, id="other-site"),
    pytest.param({"videoLink": ""}, id="empty-link"),
    pytest.param({"videoLink": 12345}, id="link-not-text"),
    pytest.param({"videoLink": None}, id="null-link-and-no-id"),
    pytest.param({"youtubeVideoId": "short"}, id="short-stored-id"),
    pytest.param({"youtubeVideoId": 12345678901}, id="stored-id-not-text"),
    pytest.param({"videoLink": f"https://youtu.be/{ID}", "youtubeVideoId": OTHER_ID}, id="link-and-id-disagree"),
]


def first_sermon_id() -> int:
    return db.session.scalar(db.select(Sermon.id).order_by(Sermon.id))


def saved(sermon_id: int) -> tuple:
    """What is stored for the sermon right now, read fresh from the database."""
    db.session.expire_all()
    sermon = db.session.get(Sermon, sermon_id)
    return (sermon.title, sermon.video_link, sermon.youtube_video_id)


def sermon_count() -> int:
    db.session.expire_all()
    return db.session.scalar(db.select(db.func.count()).select_from(Sermon))


def new_sermon_body(**video) -> dict:
    return {
        "title": "A new sermon",
        "duration": 1800,
        "date": "2026-10-01",
        "description": "About hope.",
        "speaker": {"id": 1},
        "series": None,
        "tags": [],
        **video,
    }


def assert_video_error(res):
    """The refusal is JSON, HTTP 400, with both an error and a message."""
    assert res.status_code == 400
    assert res.is_json
    assert res.json["error"]
    assert res.json["message"]


@pytest.mark.parametrize("video", BAD_VIDEOS)
def test_create_refuses_a_bad_video_and_saves_nothing(app, client: FlaskClient, video: dict):
    """POST /sermons sends 400 with error and message for each unsafe link or id, and adds no sermon."""
    before = sermon_count()

    res = client.post("/api/sermons", json=new_sermon_body(**video))

    assert_video_error(res)
    assert sermon_count() == before


@pytest.mark.parametrize("video", BAD_VIDEOS)
def test_edit_refuses_a_bad_video_and_changes_nothing(app, client: FlaskClient, video: dict):
    """PATCH /sermons/<id> sends 400 for each unsafe link or id, and the sermon stays exactly as it was."""
    sermon_id = first_sermon_id()
    before = saved(sermon_id)

    res = client.patch(f"/api/sermons/{sermon_id}", json=video)

    assert_video_error(res)
    assert saved(sermon_id) == before


@pytest.mark.parametrize("video", BAD_VIDEOS)
def test_edit_with_a_bad_video_does_not_save_the_other_fields(app, client: FlaskClient, video: dict):
    """A request with a good title and a bad link saves neither: the title is not changed either."""
    sermon_id = first_sermon_id()
    before = saved(sermon_id)

    res = client.patch(f"/api/sermons/{sermon_id}", json={"title": "Changed title", **video})

    assert_video_error(res)
    assert saved(sermon_id) == before


@pytest.mark.parametrize(
    "link",
    [
        f"https://youtu.be/{ID}?si=abc",
        f"https://m.youtube.com/watch?feature=share&v={ID}&t=9s",
        f"https://www.youtube.com/shorts/{ID}",
        f"http://youtube.com/watch?v={ID}",
        CANONICAL,
    ],
)
def test_edit_saves_the_canonical_link_and_the_id_together(app, client: FlaskClient, link: str):
    """Any accepted format is saved as the HTTPS watch link, with the id saved beside it."""
    sermon_id = first_sermon_id()

    res = client.patch(f"/api/sermons/{sermon_id}", json={"videoLink": link})

    assert res.status_code == 200
    assert res.json["videoLink"] == CANONICAL
    assert res.json["youtubeVideoId"] == ID
    assert saved(sermon_id)[1:] == (CANONICAL, ID)


def test_edit_with_only_an_id_saves_the_link_built_from_it(app, client: FlaskClient):
    sermon_id = first_sermon_id()

    res = client.patch(f"/api/sermons/{sermon_id}", json={"youtubeVideoId": OTHER_ID})

    assert res.status_code == 200
    assert saved(sermon_id)[1:] == (OTHER_CANONICAL, OTHER_ID)


def test_edit_with_a_link_and_the_same_id_is_fine(app, client: FlaskClient):
    sermon_id = first_sermon_id()

    res = client.patch(f"/api/sermons/{sermon_id}", json={"videoLink": f"https://youtu.be/{ID}", "youtubeVideoId": ID})

    assert res.status_code == 200
    assert saved(sermon_id)[1:] == (CANONICAL, ID)


def test_edit_that_leaves_the_video_alone_keeps_an_old_unchecked_link(app, client: FlaskClient):
    """The seed data has a legacy link that is not a real video. Editing something else does not touch or reject it."""
    legacy = db.session.scalar(db.select(Sermon).where(Sermon.video_link.like("%BROKENLINKTEST")))
    sermon_id, link = legacy.id, legacy.video_link

    res = client.patch(f"/api/sermons/{sermon_id}", json={"series": None})

    assert res.status_code == 200
    assert saved(sermon_id)[1] == link


def test_edit_refuses_a_video_another_sermon_already_uses(app, client: FlaskClient):
    """The saved id is unique, so a second sermon cannot take it. The answer is a 409, not a server error."""
    first, second = db.session.scalars(db.select(Sermon.id).order_by(Sermon.id).limit(2)).all()
    owner = db.session.get(Sermon, first)
    owner.video_link, owner.youtube_video_id = CANONICAL, ID
    db.session.commit()
    before = saved(second)

    res = client.patch(f"/api/sermons/{second}", json={"videoLink": f"https://youtu.be/{ID}"})

    assert res.status_code == 409
    assert res.json["error"] and res.json["message"]
    assert saved(second) == before


def test_edit_can_save_the_sermons_own_video_again(app, client: FlaskClient):
    """Saving the same video on the sermon that already owns it is not a conflict."""
    sermon_id = first_sermon_id()
    sermon = db.session.get(Sermon, sermon_id)
    sermon.video_link, sermon.youtube_video_id = CANONICAL, ID
    db.session.commit()

    res = client.patch(f"/api/sermons/{sermon_id}", json={"videoLink": f"https://youtu.be/{ID}"})

    assert res.status_code == 200


def test_create_refuses_a_video_another_sermon_already_uses(app, client: FlaskClient):
    owner = db.session.get(Sermon, first_sermon_id())
    owner.video_link, owner.youtube_video_id = CANONICAL, ID
    db.session.commit()
    before = sermon_count()

    res = client.post("/api/sermons", json=new_sermon_body(videoLink=f"https://youtu.be/{ID}"))

    assert res.status_code == 409
    assert res.json["error"] and res.json["message"]
    assert sermon_count() == before


@pytest.mark.parametrize(("roles", "status_code"), [("none", 401), ("Nobody", 403), ("Internal User", 403)])
def test_only_admins_can_write_a_video_link(app, client: FlaskClient, roles: str, status_code: int):
    """Without a token the answer is 401 and for a role that is not Admin it is 403. Nothing is saved."""
    sermon_id = first_sermon_id()
    before = saved(sermon_id)
    count = sermon_count()
    headers = {"X-Test-Roles": roles}

    patched = client.patch(f"/api/sermons/{sermon_id}", json={"videoLink": CANONICAL}, headers=headers)
    created = client.post("/api/sermons", json=new_sermon_body(videoLink=CANONICAL), headers=headers)

    assert patched.status_code == status_code
    assert created.status_code == status_code
    assert saved(sermon_id) == before
    assert sermon_count() == count