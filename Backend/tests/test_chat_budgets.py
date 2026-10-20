# Tests for chat budgets, the response schema, provider limits and authorization.
import pytest
from flask.testing import FlaskClient

from tsh import llm
from tsh.chat import (
    CONTEXT_CHAR_BUDGET,
    MAX_OUTPUT_TOKENS,
    answer_question,
    fit_context_budget,
)
from tsh.retrieval import CANDIDATE_LIMIT, RetrievedChunk
from tests.chat_helpers import add_sermon, use_fake_llm, use_topic_embeddings
from tests.test_ai_enrichment import FakeResponse, fake_anthropic


@pytest.fixture(autouse=True)
def topic_embeddings(monkeypatch):
    use_topic_embeddings(monkeypatch)


def evidence(*lengths: int) -> list[RetrievedChunk]:
    return [
        RetrievedChunk(i, 1, "T", "abcdefghijk", float(i), float(i + 1), "g" * n, 0.0)
        for i, n in enumerate(lengths, start=1)
    ]


def test_budget_keeps_nearest_chunks_that_fit():
    kept = fit_context_budget(evidence(2000, 2000, 2000, 10))

    assert [c.chunk_id for c in kept] == [1, 2, 3]
    assert sum(len(c.text) for c in kept) <= CONTEXT_CHAR_BUDGET


def test_budget_stops_at_first_chunk_that_does_not_fit():
    """A smaller, further chunk is not pulled in past a closer one that was cut."""
    kept = fit_context_budget(evidence(3000, 4000, 10))

    assert [c.chunk_id for c in kept] == [1]


def test_oversized_first_chunk_is_cut_to_the_budget():
    [kept] = fit_context_budget(evidence(CONTEXT_CHAR_BUDGET + 500))

    assert len(kept.text) == CONTEXT_CHAR_BUDGET


def test_prompt_evidence_respects_candidate_limit_and_budget(app, monkeypatch):
    add_sermon("Long", [(f"Grace point {i}. " + "x" * 1500, float(i), float(i + 1)) for i in range(12)])
    fake = use_fake_llm(monkeypatch)

    answer_question("grace", None, [])

    prompt = fake.calls[0]["prompt"]
    assert prompt.count("<evidence ") <= CANDIDATE_LIMIT
    # Each chunk is about 1515 characters, so three fit in the 6000 character budget.
    assert prompt.count("<evidence ") == 3


def test_chat_passes_the_output_limit(app, monkeypatch):
    add_sermon("Grace", [("Grace is a gift.", 0.0, 5.0)])
    fake = use_fake_llm(monkeypatch)

    answer_question("grace", None, [])

    assert fake.calls[0]["max_tokens"] == MAX_OUTPUT_TOKENS


@pytest.mark.real_llm
def test_ollama_caps_output_tokens(monkeypatch):
    sent = {}
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm.requests, "post", lambda url, **kw: sent.update(kw) or FakeResponse())

    llm.generate("hi", max_tokens=MAX_OUTPUT_TOKENS)

    assert sent["json"]["options"]["num_predict"] == MAX_OUTPUT_TOKENS


@pytest.mark.real_llm
def test_anthropic_caps_output_tokens(monkeypatch):
    import types

    module = fake_anthropic(monkeypatch, content=[types.SimpleNamespace(type="text", text="ok")])
    sent = {}
    original = module.Anthropic

    class Recording(original):
        def __init__(self):
            super().__init__()
            create = self.messages.create
            self.messages.create = lambda **kw: sent.update(kw) or create(**kw)

    module.Anthropic = Recording

    llm.generate("hi", max_tokens=MAX_OUTPUT_TOKENS)

    assert sent["max_tokens"] == MAX_OUTPUT_TOKENS


@pytest.mark.real_llm
def test_chat_works_with_either_provider(client: FlaskClient, monkeypatch):
    """The provider is switched by LLM_PROVIDER alone; chat code is the same for both."""
    import types

    add_sermon("Grace", [("Grace is a gift.", 0.0, 5.0)])
    fake_anthropic(monkeypatch, content=[types.SimpleNamespace(type="text", text="A gift [1].")])
    assert client.post("/api/chat", json={"message": "grace"}).json["answer"] == "A gift [1]."

    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm.requests, "post", lambda url, **kw: FakeResponse("Free [1]."))
    assert client.post("/api/chat", json={"message": "grace"}).json["answer"] == "Free [1]."


def test_response_schema_is_exact(client: FlaskClient, monkeypatch):
    add_sermon("Grace", [("Grace is a gift.", 1.0, 5.0)])
    use_fake_llm(monkeypatch, "A gift [1].")

    body = client.post("/api/chat", json={"message": "grace"}).json

    assert set(body) == {"answer", "ai_generated", "supported", "sources"}
    [source] = body["sources"]
    assert set(source) == {
        "source_id", "chunk_id", "sermon_id", "title", "youtube_video_id",
        "start_sec", "end_sec", "url",
    }
    assert isinstance(source["source_id"], int) and isinstance(source["chunk_id"], int)
    assert isinstance(source["start_sec"], float) and isinstance(source["end_sec"], float)


@pytest.mark.parametrize("roles, status", [("none", 401), ("Guest", 403), ("", 403)])
def test_unauthorized_requests_never_reach_the_model(client: FlaskClient, monkeypatch, roles, status):
    add_sermon("Grace", [("Grace is a gift.", 0.0, 5.0)])
    fake = use_fake_llm(monkeypatch)

    res = client.post("/api/chat", json={"message": "grace"}, headers={"X-Test-Roles": roles})

    assert res.status_code == status
    assert fake.calls == []
