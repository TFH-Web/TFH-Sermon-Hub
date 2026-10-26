# Tests for the CAPTIONS_ENABLED switch. TFH-614
# Every test that turns captions off also fails if anything reaches YouTube.
import pytest
import requests
from sqlalchemy import delete

from tsh import captions, create_app, embeddings, pipeline
from tsh.database import db
from tsh.models import Sermon, SermonChunk, SermonChunkEmbedding, UploadStatus

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


def test_text_only_transcript_is_preserved_but_not_published(app, sermon, no_network, monkeypatch):
    """Without timings or an index, cached text cannot supply timestamped search results."""
    sermon.transcript = SAVED_TEXT
    before = (sermon.summary, list(sermon.tags), sermon.processed_at)
    db.session.commit()
    app.config["CAPTIONS_ENABLED"] = "false"
    monkeypatch.setattr(pipeline, "embed_chunks", lambda s: pytest.fail("no timed captions to embed"))
    monkeypatch.setattr(pipeline, "summarize_sermon", lambda s: pytest.fail("deferred before summary"))

    pipeline.start_processing(sermon)

    db.session.expire_all()
    assert sermon.status == UploadStatus.DRAFT
    assert "no usable timed captions or compatible search index" in sermon.processing_error
    assert "reprocess" in sermon.processing_error
    assert sermon.transcript == SAVED_TEXT
    assert sermon.transcript_segments is None
    assert (sermon.summary, list(sermon.tags), sermon.processed_at) == before
    assert db.session.scalar(db.select(db.func.count()).select_from(SermonChunk)) == 0


def test_cached_timed_captions_rebuild_search_index_without_downloads(app, sermon, no_network):
    """The real embed step still indexes saved cues when caption downloads are disabled."""
    sermon.transcript = SAVED_TEXT
    sermon.transcript_segments = SEGMENTS
    db.session.commit()
    app.config["CAPTIONS_ENABLED"] = "false"

    pipeline.start_processing(sermon)

    db.session.expire_all()
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.transcript == SAVED_TEXT
    assert sermon.transcript_segments == SEGMENTS
    chunks = db.session.scalars(
        db.select(SermonChunk).join(SermonChunkEmbedding).where(SermonChunk.sermon_id == sermon.id)
    ).all()
    assert chunks
    assert all(chunk.embedding_model == embeddings.EMBEDDING_MODEL for chunk in chunks)
    assert chunks[0].start == SEGMENTS[0]["start"]


def test_current_cached_index_survives_missing_cues(app, sermon, no_network, monkeypatch):
    """An already usable index remains publishable without downloading or re-embedding."""
    sermon.transcript = SAVED_TEXT
    sermon.transcript_segments = SEGMENTS
    pipeline.embed_chunks(sermon)
    before = db.session.execute(
        db.select(SermonChunk.id, SermonChunk.hash, SermonChunkEmbedding.embedding)
        .join(SermonChunkEmbedding).where(SermonChunk.sermon_id == sermon.id)
    ).all()
    sermon.transcript_segments = None
    db.session.commit()
    app.config["CAPTIONS_ENABLED"] = "false"
    monkeypatch.setattr("ollama.embed", lambda **kw: pytest.fail("cached vectors were re-embedded"))

    pipeline.start_processing(sermon)

    db.session.expire_all()
    assert sermon.status == UploadStatus.PUBLISHED
    assert sermon.processing_error is None
    assert sermon.transcript == SAVED_TEXT
    assert sermon.transcript_segments is None
    after = db.session.execute(
        db.select(SermonChunk.id, SermonChunk.hash, SermonChunkEmbedding.embedding)
        .join(SermonChunkEmbedding).where(SermonChunk.sermon_id == sermon.id)
    ).all()
    assert after == before


@pytest.mark.parametrize("problem", ["missing_vector", "old_model", "stale", "dimension"])
def test_incompatible_cached_index_stays_retryable(app, sermon, no_network, monkeypatch, problem):
    """Unavailable/mismatched vectors are kept for deliberate repair instead of falsely publishing."""
    sermon.transcript = SAVED_TEXT
    sermon.transcript_segments = SEGMENTS
    pipeline.embed_chunks(sermon)
    chunk = db.session.scalar(db.select(SermonChunk).where(SermonChunk.sermon_id == sermon.id))
    if problem == "missing_vector":
        db.session.execute(
            delete(SermonChunkEmbedding)
            .where(SermonChunkEmbedding.sermon_chunk_id == chunk.id)
            .execution_options(synchronize_session=False)
        )
    elif problem == "old_model":
        chunk.embedding_model = "previous-model"
    elif problem == "stale":
        chunk.stale = True
    else:
        monkeypatch.setattr(embeddings, "EMBEDDING_DIM", 384)
    sermon.transcript_segments = None
    db.session.commit()
    before = (chunk.id, chunk.hash, chunk.text, chunk.embedding_model, chunk.stale)
    app.config["CAPTIONS_ENABLED"] = "false"
    monkeypatch.setattr("ollama.embed", lambda **kw: pytest.fail("deferred cache was re-embedded"))

    pipeline.start_processing(sermon)

    db.session.expire_all()
    assert sermon.status == UploadStatus.DRAFT
    assert "compatible search index" in sermon.processing_error
    assert sermon.transcript == SAVED_TEXT
    assert (chunk.id, chunk.hash, chunk.text, chunk.embedding_model, chunk.stale) == before


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
