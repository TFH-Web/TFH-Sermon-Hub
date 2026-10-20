# Tests for POST /api/chat citations, AI attribution and error responses, with a fake LLM.
import pytest
from flask.testing import FlaskClient

from tsh import embeddings
from tsh.chat import UNSUPPORTED_ANSWER, verify_citations
from tsh.llm import LLMError
from tests.chat_helpers import add_sermon, use_fake_llm, use_topic_embeddings


@pytest.fixture(autouse=True)
def topic_embeddings(monkeypatch):
    use_topic_embeddings(monkeypatch)


@pytest.fixture()
def two_grace_chunks(app):
    """One published sermon with two grace chunks, retrieved as evidence [1] and [2]."""
    return add_sermon(
        "Under Grace",
        [("Grace is a gift.", 75.5, 90.0), ("Grace changes who you are.", 300.0, 320.0)],
        video_id="JQSUGFQO5FU",
    )


def ask(client: FlaskClient, message: str = "What is grace?", **body):
    return client.post("/api/chat", json={"message": message, **body})


def test_answer_returns_verified_sources(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, "Grace is a gift [1]. It changes you [2].")

    res = ask(client)

    assert res.status_code == 200
    assert res.json["answer"] == "Grace is a gift [1]. It changes you [2]."
    assert res.json["ai_generated"] is True
    assert res.json["supported"] is True
    first, second = res.json["sources"]
    assert first == {
        "source_id": 1,
        "chunk_id": first["chunk_id"],
        "sermon_id": two_grace_chunks.id,
        "title": "Under Grace",
        "youtube_video_id": "JQSUGFQO5FU",
        "start_sec": 75.5,
        "end_sec": 90.0,
        "url": "https://www.youtube.com/watch?v=JQSUGFQO5FU&t=75s",
    }
    assert (second["source_id"], second["start_sec"]) == (2, 300.0)
    assert second["url"].endswith("&t=300s")


def test_only_cited_evidence_becomes_a_source(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, "Grace changes you [2].")

    res = ask(client)

    assert [s["source_id"] for s in res.json["sources"]] == [2]


def test_mixed_valid_and_invented_citations_decline_the_whole_answer(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, "Grace is a gift [1][7]. Also [0] and [source 3].")

    res = ask(client)

    assert res.json == {"answer": UNSUPPORTED_ANSWER, "ai_generated": True, "supported": False, "sources": []}


@pytest.mark.parametrize("reference", ["[3]", "[0]", "[1,3]", "[1a]", "[source 2]", "[1,]", "[[1]]", "[1"])
def test_invalid_reference_cannot_leave_an_unsupported_claim(client: FlaskClient, monkeypatch, two_grace_chunks, reference):
    use_fake_llm(monkeypatch, f"Grace is a gift [1]. An unsupported claim {reference}.")

    res = ask(client)

    assert res.status_code == 200
    assert res.json == {"answer": UNSUPPORTED_ANSWER, "ai_generated": True, "supported": False, "sources": []}


def test_answer_with_only_invented_citations_is_declined(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, "Grace is in Romans [9].")

    res = ask(client)

    assert res.status_code == 200
    assert res.json == {"answer": UNSUPPORTED_ANSWER, "ai_generated": True, "supported": False, "sources": []}


def test_answer_without_citations_is_declined(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, "Grace is unmerited favor, as every theologian knows.")

    res = ask(client)

    assert res.json["supported"] is False
    assert res.json["sources"] == []


def test_links_never_come_from_model_output(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, "Watch https://evil.example/watch?v=x [1].")

    [source] = ask(client).json["sources"]

    assert source["url"] == "https://www.youtube.com/watch?v=JQSUGFQO5FU&t=75s"


def test_no_evidence_returns_unsupported_without_sources(client: FlaskClient, monkeypatch, two_grace_chunks):
    llm = use_fake_llm(monkeypatch, "Money is a tool [1].")

    res = ask(client, "What about money?")

    assert llm.calls == []
    assert res.json == {"answer": UNSUPPORTED_ANSWER, "ai_generated": True, "supported": False, "sources": []}


def test_provider_failure_is_502_json(client: FlaskClient, monkeypatch, two_grace_chunks):
    use_fake_llm(monkeypatch, LLMError("Ollama request failed"))

    res = ask(client)

    assert res.status_code == 502
    assert res.json["error"] == res.json["message"]
    assert "AI model" in res.json["message"]
    assert "Ollama" not in res.json["message"]


@pytest.mark.parametrize("error", [ConnectionError("refused"), RuntimeError("model not found")])
def test_embedding_failure_is_503_json(client: FlaskClient, monkeypatch, two_grace_chunks, error):
    def down(*args, **kwargs):
        raise error

    monkeypatch.setattr("ollama.embed", down)
    llm = use_fake_llm(monkeypatch)

    res = ask(client)

    assert res.status_code == 503
    assert res.json["error"] == res.json["message"]
    assert llm.calls == []


def test_embedding_dimension_mismatch_is_503_json(client: FlaskClient, monkeypatch, two_grace_chunks):
    monkeypatch.setattr(embeddings, "EMBEDDING_DIM", 384)

    res = ask(client)

    assert res.status_code == 503
    assert set(res.json) == {"error", "message"}


@pytest.mark.parametrize(
    "reply, count, answer, cited",
    [
        ("A [1].", 1, "A [1].", [1]),
        ("A [1, 2]. B [2].", 2, "A [1][2]. B [2].", [1, 2]),
        ("A [2][1].", 2, "A [2][1].", [2, 1]),
        ("A [3].", 2, "", []),
        ("A [1,3].", 2, "", []),
        ("A [01].", 2, "A [1].", [1]),
        ("No citations.", 2, "No citations.", []),
    ],
)
def test_verify_citations(reply, count, answer, cited):
    assert verify_citations(reply, count) == (answer, cited)


def test_oversized_citation_number_is_declined():
    assert verify_citations("A [1]. B [" + "9" * 5000 + "].", 2) == ("", [])
