# Tests for the CAPTIONS_ENABLED switch. TFH-614
# Every test that turns captions off also fails if anything reaches YouTube.
import pytest
import requests

from tsh import captions, create_app, pipeline
from tsh.database import db
from tsh.models import Sermon, UploadStatus

VIDEO_ID = "F_OiCiZ3Y3Y"
SEGMENTS = [
    {"start": 1.25, "end": 3.5, "text": "Welcome to church."},
    {"start": 3.5, "end": 6.75, "text": "God is good."},
]
SAVED_TEXT = "Welcome to church. God is good."


@pytest.fixture()
def sermon(app):
    """Use an existing draft sermon with a valid YouTube id and no saved transcript."""
    sermon = db.session.scalar(db.select(Sermon).where(Sermon.status == UploadStatus.DRAFT))
    sermon.youtube_video_id = VIDEO_ID
    sermon.transcript = None
    sermon.transcript_segments = None
    db.session.commit()
    return sermon


@pytest.fixture()
def no_network(monkeypatch):
    """Fail the test if any HTTP request is made."""
    monkeypatch.setattr(
        requests.Session, "request",
        lambda *args, **kwargs: pytest.fail("a caption request was made while captions are off"),
    )


def make_app(monkeypatch, **settings):
    """Build an app without touching the database, so the flag can be checked on its own."""
    return create_app(None, settings={
        "TESTING": True, "AUTH_TEST_BYPASS": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "REDIS_URL": "", **settings,
    })


@pytest.mark.parametrize(("value", "expected"), [
    (True, True), (False, False),
    ("true", True), ("TRUE", True), (" yes ", True), ("1", True), ("on", True), ("", True),
    ("false", False), ("False", False), ("0", False), ("no", False), ("off", False),
])
def test_flag_values_are_parsed(value, expected):
    """Real on/off words work in any case; a blank value keeps the default of on."""
    assert captions.parse_flag(value, "CAPTIONS_ENABLED") is expected


@pytest.mark.parametrize("value", ["flase", "2", "disabled", None])
def test_unrecognized_flag_value_raises(value):
    """A typo is rejected with the setting name instead of being guessed."""
    with pytest.raises(ValueError, match="CAPTIONS_ENABLED"):
        captions.parse_flag(value, "CAPTIONS_ENABLED")


def test_captions_are_on_when_nothing_is_set(monkeypatch):
    """With no setting and no environment variable, captions stay enabled."""
    monkeypatch.delenv("CAPTIONS_ENABLED", raising=False)
    app = make_app(monkeypatch)
    with app.app_context():
        assert captions.captions_enabled() is True


def test_environment_string_turns_captions_off(monkeypatch):
    """CAPTIONS_ENABLED=false in the environment is read as a real false, not a non-empty string."""
    monkeypatch.setenv("CAPTIONS_ENABLED", "false")
    app = make_app(monkeypatch)
    with app.app_context():
        assert captions.captions_enabled() is False


def test_a_typo_stops_the_app_from_starting(monkeypatch):
    """A bad value fails at startup, so a mistyped kill switch can't quietly leave captions on."""
    with pytest.raises(ValueError, match="CAPTIONS_ENABLED"):
        make_app(monkeypatch, CAPTIONS_ENABLED="flase")


def test_download_makes_no_request_when_off(app, no_network):
    """get_transcript refuses before any OAuth or caption request."""
    app.config["CAPTIONS_ENABLED"] = "false"
    with pytest.raises(captions.CaptionsDisabledError, match="captions are turned off"):
        captions.get_transcript(VIDEO_ID)


@pytest.mark.parametrize("saved", [None, "", "   "])
def test_sermon_without_a_transcript_stays_a_draft(app, sermon, no_network, monkeypatch, saved):
    """With nothing saved there is nothing to publish, and the reason is on the sermon."""
    sermon.transcript = saved
    db.session.commit()
    app.config["CAPTIONS_ENABLED"] = "false"
    monkeypatch.setattr(pipeline, "embed_chunks", lambda s: pytest.fail("embedded without a transcript"))
    pipeline.start_processing(sermon)
    db.session.expire_all()
    assert sermon.status == UploadStatus.DRAFT
    assert sermon.processing_error == "fetch_transcript: " + captions.DISABLED_MESSAGE
    assert not (sermon.transcript or "").strip()


def test_saved_transcript_is_kept_and_still_publishes(app, sermon, no_network, monkeypatch):
    """Valid saved captions are not touched, and the rest of the pipeline still runs."""
    sermon.transcript = SAVED_TEXT
    sermon.transcript_segments = SEGMENTS
    db.session.commit()
    app.config["CAPTIONS_ENABLED"] = "false"
    embedded = []
    monkeypatch.setattr(pipeline, "embed_chunks", lambda s: embedded.append(s.id))
    pipeline.start_processing(sermon)
    db.session.expire_all()
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.transcript == SAVED_TEXT
    assert sermon.transcript_segments == SEGMENTS
    assert embedded == [sermon.id]


def test_reprocess_endpoint_with_captions_off(app, client, sermon, no_network):
    """An admin's reprocess request succeeds and leaves the sermon as a draft with the reason."""
    app.config["CAPTIONS_ENABLED"] = "false"
    res = client.post(f"/api/sermons/{sermon.id}/reprocess")
    assert res.status_code == 202
    assert res.json["status"] == "Draft"
    assert "captions are turned off" in res.json["processingError"]


def test_turning_captions_back_on_lets_reprocess_download(app, sermon, monkeypatch):
    """Nothing is stuck after the switch goes back on: the next reprocess fetches and publishes."""
    app.config["CAPTIONS_ENABLED"] = "false"
    pipeline.start_processing(sermon)
    db.session.expire_all()
    assert sermon.status == UploadStatus.DRAFT

    app.config["CAPTIONS_ENABLED"] = "true"
    monkeypatch.setattr(captions, "get_transcript", lambda video_id: SEGMENTS)
    monkeypatch.setattr(pipeline, "embed_chunks", lambda s: None)
    pipeline.start_processing(sermon)
    db.session.expire_all()
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.transcript == SAVED_TEXT
    assert sermon.processing_error is None


def test_backfill_refuses_to_run_when_off(app, runner, sermon, no_network):
    """The batch command stops with a clear message instead of rewriting every sermon's status."""
    app.config["CAPTIONS_ENABLED"] = "false"
    for name in captions.OAUTH_SETTINGS:
        app.config[name] = "fake-oauth-value"
    result = runner.invoke(args=["backfill-captions", "--limit", "1"])
    assert result.exit_code == 1
    assert "Captions are turned off" in result.output
    db.session.expire_all()
    assert db.session.get(Sermon, sermon.id).status == UploadStatus.DRAFT


def test_backfill_dry_run_still_works_when_off(app, runner, sermon, no_network):
    """A dry run only lists sermons, so it stays available."""
    app.config["CAPTIONS_ENABLED"] = "false"
    result = runner.invoke(args=["backfill-captions", "--dry-run"])
    assert result.exit_code == 0
    assert "Dry run" in result.output