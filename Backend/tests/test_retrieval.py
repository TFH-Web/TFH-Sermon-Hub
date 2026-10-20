# Tests for retrieval.retrieve_chunks with fixed topic embeddings.
import pytest
from flask import Flask

from tsh import embeddings
from tsh.embeddings import EmbeddingError
from tsh.models import UploadStatus
from tsh.retrieval import retrieve_chunks
from tests.chat_helpers import add_sermon, use_topic_embeddings


@pytest.fixture(autouse=True)
def topic_embeddings(monkeypatch):
    use_topic_embeddings(monkeypatch)


def test_returns_relevant_published_chunks_nearest_first(app: Flask):
    sermon = add_sermon(
        "Under Grace",
        [("Grace is a gift.", 10.0, 20.0), ("Money is a tool.", 30.0, 40.0)],
    )

    [hit] = retrieve_chunks("What is grace?")

    assert hit.sermon_id == sermon.id
    assert hit.title == "Under Grace"
    assert hit.text == "Grace is a gift."
    assert (hit.start_sec, hit.end_sec) == (10.0, 20.0)
    assert hit.youtube_video_id == "abcdefghijk"
    assert hit.distance == pytest.approx(0.0, abs=1e-6)


def test_unrelated_question_finds_nothing(app: Flask):
    add_sermon("Under Grace", [("Grace is a gift.", 0.0, 5.0)])

    assert retrieve_chunks("Who won the game last night?") == []


@pytest.mark.parametrize(
    "status", [UploadStatus.DRAFT, UploadStatus.PROCESSING, UploadStatus.FAILED]
)
def test_unpublished_sermons_are_never_sources(app: Flask, status):
    add_sermon("Hidden", [("Grace is hidden here.", 0.0, 5.0)], status=status)

    assert retrieve_chunks("grace") == []


def test_sermon_filter_applies_before_the_limit(app: Flask):
    """Many closer chunks elsewhere do not crowd out the selected sermon's chunk."""
    for i in range(5):
        add_sermon(f"Other {i}", [("Grace upon grace.", 0.0, 5.0)], video_id=f"other{i:06d}")
    selected = add_sermon(
        "Selected", [("Grace for the selected sermon.", 60.0, 70.0)], video_id="selected123"
    )

    hits = retrieve_chunks("grace", sermon_id=selected.id, limit=2)

    assert [h.sermon_id for h in hits] == [selected.id]
    assert len(retrieve_chunks("grace", limit=2)) == 2


def test_selected_unpublished_sermon_gives_no_evidence(app: Flask):
    add_sermon("Published", [("Grace is a gift.", 0.0, 5.0)])
    draft = add_sermon("Draft", [("Grace in a draft.", 0.0, 5.0)], status=UploadStatus.DRAFT, video_id="draft123456")

    assert retrieve_chunks("grace", sermon_id=draft.id) == []


def test_selected_missing_sermon_gives_no_evidence(app: Flask):
    add_sermon("Published", [("Grace is a gift.", 0.0, 5.0)])

    assert retrieve_chunks("grace", sermon_id=99999) == []


def test_limit_caps_results(app: Flask):
    add_sermon("Many", [(f"Grace point {i}.", float(i), float(i + 1)) for i in range(6)])

    assert len(retrieve_chunks("grace", limit=3)) == 3


def test_chunks_from_another_model_are_not_compared(app: Flask):
    add_sermon("Old model", [("Grace is a gift.", 0.0, 5.0)], model="some-other-model")

    assert retrieve_chunks("grace") == []


def test_sermon_without_a_valid_video_id_is_skipped(app: Flask):
    """A citation has to link to a video, so a chunk that cannot is not evidence."""
    add_sermon("No video", [("Grace is a gift.", 0.0, 5.0)], video_id=None)
    add_sermon("Bad video", [("Grace is a gift.", 0.0, 5.0)], video_id="BROKENLINKTEST")

    assert retrieve_chunks("grace") == []


def test_video_id_falls_back_to_the_link(app: Flask):
    sermon = add_sermon("Linked", [("Grace is a gift.", 0.0, 5.0)])
    sermon.youtube_video_id = None
    sermon.video_link = "https://www.youtube.com/watch?v=PxTdE09QjH0"

    [hit] = retrieve_chunks("grace")

    assert hit.youtube_video_id == "PxTdE09QjH0"


def test_query_embedding_failure_propagates(app: Flask, monkeypatch):
    def down(*args, **kwargs):
        raise ConnectionError("ollama is down")

    monkeypatch.setattr("ollama.embed", down)

    with pytest.raises(ConnectionError):
        retrieve_chunks("grace")


def test_dimension_mismatch_is_rejected(app: Flask, monkeypatch):
    monkeypatch.setattr(embeddings, "EMBEDDING_DIM", 384)

    with pytest.raises(EmbeddingError, match="EMBEDDING_DIM is 384"):
        retrieve_chunks("grace")
