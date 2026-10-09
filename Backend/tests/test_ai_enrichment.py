"""Tests for TFH-501..504. The LLM is faked, so no Ollama or API key is needed.

Uses the `app` fixture from tests/conftest.py, which runs migrations and
populate(). populate() already seeds the tags faith/hope/healing/grace (AI)
and anxiety/fear/life (MANUAL), so every tag name used here is deliberately
one populate() does NOT create. Otherwise a test could pass or fail depending
on seed data it does not own.
"""

import json
from datetime import date

import pytest

from tsh import llm, pipeline, summarize, tagging
from tsh.database import db
from tsh.models import Sermon, Speaker, Tag, TagSource, UploadStatus

# Names populate() does not seed, so these tests never collide with it.
NEW_TAG = "covenant"
SEEDED_MANUAL = "stewardship"
SEEDED_AI = "discipleship"


# ---------- helpers ----------


def make_sermon(transcript: str | None = "Grace and faith. " * 10) -> Sermon:
    speaker = Speaker(id=None, first_name="Enrich", last_name="Tester")
    sermon = Sermon(
        id=None,
        title="Test Sermon",
        video_link="https://example.com/v",
        duration=60,
        date=date(2026, 1, 1),
        description="desc",
        tags=[],
        transcript=transcript,
        summary=None,
        speaker_id=None,
        speaker=speaker,
        series_id=None,
        series=None,
    )
    db.session.add(sermon)
    db.session.commit()
    return sermon


def make_tag(name: str, source: TagSource) -> Tag:
    tag = Tag(name=name, source=source, sermons=[])
    db.session.add(tag)
    db.session.commit()
    return tag


@pytest.fixture(autouse=True)
def stub_transcript(monkeypatch):
    monkeypatch.setattr(pipeline, "fetch_transcript", lambda sermon: None)


# ---------- 501: provider switch ----------


@pytest.mark.real_llm
def test_unknown_provider_raises(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "nonsense")
    with pytest.raises(llm.LLMError):
        llm.generate("hi")


@pytest.mark.real_llm
def test_anthropic_requires_model(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("LLM_MODEL", raising=False)
    with pytest.raises(llm.LLMError):
        llm.generate("hi")


@pytest.mark.real_llm
def test_provider_is_read_per_call(monkeypatch):
    """The switch must be an env change, not an import-time constant."""
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm, "_ollama", lambda p, s, j=False: "from-ollama")
    monkeypatch.setattr(llm, "_anthropic", lambda p, s, m: "from-anthropic")
    assert llm.generate("hi") == "from-ollama"
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    assert llm.generate("hi") == "from-anthropic"


class FakeResponse:
    def __init__(self, text="ok"):
        self._text = text

    def raise_for_status(self):
        pass

    def json(self):
        return {"message": {"content": self._text}}


@pytest.mark.real_llm
def test_ollama_always_sets_num_ctx(monkeypatch):
    """Ollama defaults to 2048 tokens and truncates silently past that."""
    sent = {}
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.delenv("OLLAMA_NUM_CTX", raising=False)
    monkeypatch.setattr(llm.requests, "post", lambda url, **kw: sent.update(kw) or FakeResponse())
    llm.generate("hi")
    assert sent["json"]["options"]["num_ctx"] == llm.DEFAULT_NUM_CTX
    assert sent["json"]["options"]["num_ctx"] >= 8192  # must fit summarize's combine step


@pytest.mark.real_llm
def test_ollama_num_ctx_is_overridable(monkeypatch):
    sent = {}
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_NUM_CTX", "4096")
    monkeypatch.setattr(llm.requests, "post", lambda url, **kw: sent.update(kw) or FakeResponse())
    llm.generate("hi")
    assert sent["json"]["options"]["num_ctx"] == 4096


@pytest.mark.real_llm
def test_json_mode_only_set_when_asked(monkeypatch):
    sent = {}
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm.requests, "post", lambda url, **kw: sent.update(kw) or FakeResponse())
    llm.generate("hi")
    assert "format" not in sent["json"]
    llm.generate("hi", json_mode=True)
    assert sent["json"]["format"] == "json"


def test_tag_suggestion_requests_json_mode(monkeypatch):
    """503 relies on constrained output because a 3B model ignores the instruction."""
    seen = {}

    def fake(prompt, system="", **kw):
        seen.update(kw)
        return '{"tags": ["faith"]}'

    monkeypatch.setattr(llm, "generate", fake)
    tagging.suggest_tags("summary", existing=["faith"])
    assert seen.get("json_mode") is True


# ---------- 502: chunk + summarize ----------


def test_chunk_text_respects_size():
    chunks = summarize.chunk_text("This is a sentence. " * 500, size=300)
    assert len(chunks) > 1
    assert all(len(c) <= 300 for c in chunks)


def test_chunk_text_hard_slices_unpunctuated_text():
    chunks = summarize.chunk_text("word " * 2000, size=500)
    assert all(len(c) <= 500 for c in chunks)
    assert "".join(c.replace(" ", "") for c in chunks) == "word" * 2000


def test_chunk_text_loses_no_words():
    text = "Alpha beta. Gamma delta epsilon. Zeta eta theta iota. " * 80
    chunks = summarize.chunk_text(text, size=200)
    assert " ".join(chunks).split() == text.split()


def test_short_transcript_is_summarized_once(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "generate", lambda p, system="", **kw: calls.append(p) or "SUMMARY")
    assert summarize.summarize_transcript("A short sermon.") == "SUMMARY"
    assert len(calls) == 1


def test_long_transcript_maps_then_reduces(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "generate", lambda p, system="", **kw: calls.append(p) or "x")
    summarize.summarize_transcript("Sentence here. " * 2000)  # ~30k chars
    assert len(calls) > 2  # several chunk summaries plus the final combine
    assert "cohesive summary" in calls[-1]


def test_empty_transcript_rejected():
    with pytest.raises(ValueError):
        summarize.summarize_transcript("   ")


# ---------- 503: suggest tags ----------


@pytest.mark.parametrize(
    "raw",
    [
        '{"tags": ["faith", "hope"]}',
        '```json\n{"tags": ["faith", "hope"]}\n```',
        'Sure! Here you go: {"tags": ["faith", "hope"]} Hope that helps.',
    ],
)
def test_parse_tag_response_tolerates_noise(raw):
    assert tagging.parse_tag_response(raw) == ["faith", "hope"]


@pytest.mark.parametrize(
    "raw", ["", "no json here", '{"tags": "faith"}', '{"tags": [1, 2]}', "{bad json}"]
)
def test_parse_tag_response_bad_input_returns_empty(raw):
    assert tagging.parse_tag_response(raw) == []


def test_suggest_prefers_existing_and_matches_their_case(monkeypatch):
    monkeypatch.setattr(llm, "generate", lambda p, system="", **kw: '{"tags": ["FAITH", "Grace"]}')
    # Returns the stored spelling, not the model's, so no case-variant duplicates.
    assert tagging.suggest_tags("summary", existing=["faith", "grace", "hope"]) == [
        "faith",
        "grace",
    ]


def test_suggest_sends_existing_tags_to_the_model(monkeypatch):
    seen = {}

    def fake(prompt, system="", **kw):
        seen["prompt"] = prompt
        seen["kw"] = kw
        return '{"tags": ["faith"]}'

    monkeypatch.setattr(llm, "generate", fake)
    tagging.suggest_tags("summary", existing=["faith", "hope"])
    assert "faith" in seen["prompt"] and "hope" in seen["prompt"]


def test_suggest_limits_new_tags_and_drops_long_ones(monkeypatch):
    long_tag = "x" * 40  # Tag.name is String(32)
    reply = f'{{"tags": ["faith", "covenant", "sabbath", "third new", "{long_tag}"]}}'
    monkeypatch.setattr(llm, "generate", lambda p, system="", **kw: reply)
    result = tagging.suggest_tags("summary", existing=["faith"])
    assert result == ["faith", "covenant", "sabbath"]  # 2 new max, over-long dropped
    assert all(len(t) <= 32 for t in result)


def test_suggest_dedupes_case_variants(monkeypatch):
    monkeypatch.setattr(
        llm, "generate", lambda p, system="", **kw: '{"tags": ["faith", "Faith", "FAITH"]}'
    )
    assert tagging.suggest_tags("summary", existing=["faith"]) == ["faith"]


def test_suggest_survives_unusable_model_output(monkeypatch):
    monkeypatch.setattr(llm, "generate", lambda p, system="", **kw: "I'm sorry, I can't do that.")
    assert tagging.suggest_tags("summary", existing=["faith"]) == []


def test_get_existing_tag_names_reads_the_db(app):
    with app.app_context():
        make_tag(SEEDED_MANUAL, TagSource.MANUAL)
        assert SEEDED_MANUAL in tagging.get_existing_tag_names()


# ---------- 504: save tags with source=AI, never overwriting manual ----------


def test_new_tags_saved_as_ai(app):
    with app.app_context():
        sermon = make_sermon()
        tagging.save_ai_tags(sermon, [NEW_TAG])
        assert db.session.get(Tag, NEW_TAG).source == TagSource.AI
        assert [t.name for t in sermon.tags] == [NEW_TAG]


def test_manual_tag_is_reused_and_stays_manual(app):
    with app.app_context():
        make_tag(SEEDED_MANUAL, TagSource.MANUAL)
        sermon = make_sermon()
        tagging.save_ai_tags(sermon, [SEEDED_MANUAL.upper()])  # different case on purpose
        assert db.session.get(Tag, SEEDED_MANUAL).source == TagSource.MANUAL
        assert [t.name for t in sermon.tags] == [SEEDED_MANUAL]
        assert db.session.get(Tag, SEEDED_MANUAL.upper()) is None  # no duplicate row


def test_existing_ai_tag_is_reused_not_recreated(app):
    with app.app_context():
        make_tag(SEEDED_AI, TagSource.AI)
        sermon = make_sermon()
        tagging.save_ai_tags(sermon, [SEEDED_AI])
        assert db.session.scalar(db.select(db.func.count()).select_from(Tag).where(
            Tag.name == SEEDED_AI
        )) == 1


def test_rerun_never_removes_or_duplicates(app):
    with app.app_context():
        manual = make_tag(SEEDED_MANUAL, TagSource.MANUAL)
        sermon = make_sermon()
        sermon.tags.append(manual)
        db.session.commit()

        tagging.save_ai_tags(sermon, [NEW_TAG])
        tagging.save_ai_tags(sermon, [NEW_TAG, "sabbath"])  # re-run, overlapping

        assert sorted(t.name for t in sermon.tags) == sorted([SEEDED_MANUAL, NEW_TAG, "sabbath"])
        assert db.session.get(Tag, SEEDED_MANUAL).source == TagSource.MANUAL


def test_save_returns_only_newly_attached(app):
    with app.app_context():
        sermon = make_sermon()
        first = tagging.save_ai_tags(sermon, [NEW_TAG])
        second = tagging.save_ai_tags(sermon, [NEW_TAG])
        assert [t.name for t in first] == [NEW_TAG]
        assert second == []  # already attached, nothing added


# ---------- pipeline integration: tsh.pipeline.summarize_sermon ----------


def fake_llm(summary="A summary about grace.", tags=None):
    """One fake standing in for both the summary and the tag call."""
    tags = tags if tags is not None else [SEEDED_MANUAL.upper(), NEW_TAG]

    def fake(prompt, system="", **kw):
        if "Return JSON" in prompt:
            return json.dumps({"tags": tags})
        return summary

    return fake


def patch_llm(monkeypatch, fake):
    """Both modules call llm.generate, so one patch covers summary and tags."""
    monkeypatch.setattr(llm, "generate", fake)


def reload(sermon_id: int) -> Sermon:
    db.session.expire_all()
    return db.session.get(Sermon, sermon_id)


def test_summarize_sermon_writes_summary_and_tags(app, monkeypatch):
    patch_llm(monkeypatch, fake_llm())
    with app.app_context():
        make_tag(SEEDED_MANUAL, TagSource.MANUAL)
        sermon = make_sermon()

        pipeline.summarize_sermon(sermon)
        db.session.commit()  # _run_step does this in the real pipeline

        assert sermon.summary == "A summary about grace."
        assert sorted(t.name for t in sermon.tags) == sorted([SEEDED_MANUAL, NEW_TAG])
        assert db.session.get(Tag, SEEDED_MANUAL).source == TagSource.MANUAL
        assert db.session.get(Tag, NEW_TAG).source == TagSource.AI


def test_summarize_sermon_skips_without_transcript(app, monkeypatch):
    """No transcript is not an error here: fetch_transcript reports that failure.

    populate() seeds sermons with no transcript, and the existing pipeline tests
    assert a clean run leaves processing_error empty, so raising here breaks them.
    """
    called = []
    patch_llm(monkeypatch, lambda p, system="", **kw: called.append(p) or "x")
    with app.app_context():
        sermon = make_sermon(transcript=None)
        pipeline.summarize_sermon(sermon)
        assert sermon.summary is None
        assert called == []  # never pays for an LLM call it cannot use


def test_failed_tagging_rolls_back_the_summary(app, monkeypatch):
    """_run_step must leave no partial result: no summary saved if tagging dies."""

    def fake(prompt, system="", **kw):
        if "Return JSON" in prompt:
            raise llm.LLMError("ollama is down")
        return "SUMMARY"

    patch_llm(monkeypatch, fake)
    with app.app_context():
        sermon = make_sermon()
        error = pipeline._run_step("summarize_sermon", pipeline.summarize_sermon, sermon.id)
        assert error.startswith("summarize_sermon: ")
        assert reload(sermon.id).summary is None


def test_sermon_still_publishes_when_summary_fails(app, monkeypatch):
    """The pipeline treats the summary as best effort, so a dead LLM must not block publishing."""

    def fake(prompt, system="", **kw):
        raise llm.LLMError("ollama is down")

    patch_llm(monkeypatch, fake)
    with app.app_context():
        sermon = make_sermon()
        pipeline.process_sermon(sermon.id)

        saved = reload(sermon.id)
        assert saved.status == UploadStatus.PUBLISHED
        assert saved.processing_error.startswith("summarize_sermon: ")
        assert saved.processed_at is not None


def test_full_pipeline_run_populates_summary_and_tags(app, monkeypatch):
    patch_llm(monkeypatch, fake_llm())
    with app.app_context():
        sermon = make_sermon()
        pipeline.process_sermon(sermon.id)

        saved = reload(sermon.id)
        assert saved.status == UploadStatus.PUBLISHED
        assert saved.processing_error is None
        assert saved.summary == "A summary about grace."
        assert NEW_TAG in [t.name for t in saved.tags]