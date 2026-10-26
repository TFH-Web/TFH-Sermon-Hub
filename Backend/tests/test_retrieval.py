# Tests for retrieval.retrieve_chunks with fixed topic embeddings.
import pytest
from flask import Flask
from datetime import date
from types import SimpleNamespace

from tsh import embeddings
from tsh.embeddings import EmbeddingError
from tsh.database import db
from tsh.models import SermonChunk, Speaker, UploadStatus
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
        add_sermon(
            f"Other {i}", [("Grace upon grace.", 0.0, 5.0)], video_id=f"other{i:06d}"
        )
    selected = add_sermon(
        "Selected",
        [("Grace for the selected sermon.", 60.0, 70.0)],
        video_id="selected123",
    )

    hits = retrieve_chunks("grace", sermon_id=selected.id, limit=2)

    assert [h.sermon_id for h in hits] == [selected.id]
    assert len(retrieve_chunks("grace", limit=2)) == 2


def test_selected_unpublished_sermon_gives_no_evidence(app: Flask):
    add_sermon("Published", [("Grace is a gift.", 0.0, 5.0)])
    draft = add_sermon(
        "Draft",
        [("Grace in a draft.", 0.0, 5.0)],
        status=UploadStatus.DRAFT,
        video_id="draft123456",
    )

    assert retrieve_chunks("grace", sermon_id=draft.id) == []


def test_selected_missing_sermon_gives_no_evidence(app: Flask):
    add_sermon("Published", [("Grace is a gift.", 0.0, 5.0)])

    assert retrieve_chunks("grace", sermon_id=99999) == []


def test_limit_caps_results(app: Flask):
    add_sermon(
        "Many", [(f"Grace point {i}.", float(i), float(i + 1)) for i in range(6)]
    )

    assert len(retrieve_chunks("grace", limit=3)) == 3


def test_chunks_from_another_model_are_not_compared(app: Flask):
    add_sermon("Old model", [("Grace is a gift.", 0.0, 5.0)], model="some-other-model")

    assert retrieve_chunks("grace") == []


def test_sermon_without_a_valid_video_id_is_skipped(app: Flask):
    """A citation has to link to a video, so a chunk that cannot is not evidence."""
    add_sermon("No video", [("Grace is a gift.", 0.0, 5.0)], video_id=None)
    add_sermon("Bad video", [("Grace is a gift.", 0.0, 5.0)], video_id="BROKENLINKTEST")

    assert retrieve_chunks("grace") == []


@pytest.mark.parametrize("video_id", [None, "BROKENLINKTEST"])
def test_invalid_video_chunks_do_not_use_the_candidate_limit(app: Flask, video_id):
    add_sermon(
        "Unlinkable",
        [(f"Grace point {i}.", float(i), float(i + 1)) for i in range(8)],
        video_id=video_id,
    )
    eligible = add_sermon(
        "Linkable", [("Grace is a gift.", 90.0, 100.0)], video_id="valid123456"
    )

    hits = retrieve_chunks("grace")

    assert [hit.sermon_id for hit in hits] == [eligible.id]


def test_limit_counts_only_eligible_chunks_across_streamed_batches(app: Flask):
    first = add_sermon(
        "First", [("Grace comes first.", 0.0, 5.0)], video_id="first123456"
    )
    add_sermon(
        "Unlinkable",
        [(f"Grace point {i}.", float(i), float(i + 1)) for i in range(40)],
        video_id=None,
    )
    second = add_sermon(
        "Second",
        [("Grace comes second.", 60.0, 65.0), ("More grace.", 70.0, 75.0)],
        video_id="second12345",
    )

    hits = retrieve_chunks("grace", limit=2)

    assert [(hit.sermon_id, hit.start_sec) for hit in hits] == [
        (first.id, 0.0),
        (second.id, 60.0),
    ]


@pytest.mark.parametrize("limit", [0, -1])
def test_nonpositive_limit_returns_no_evidence_without_embedding(
    app: Flask, monkeypatch, limit
):
    def unexpected_embedding(*args, **kwargs):
        raise AssertionError("An empty retrieval must not call the embedding provider")

    monkeypatch.setattr("ollama.embed", unexpected_embedding)

    assert retrieve_chunks("grace", limit=limit) == []


def test_video_id_falls_back_to_the_link(app: Flask):
    sermon = add_sermon("Linked", [("Grace is a gift.", 0.0, 5.0)])
    sermon.youtube_video_id = None
    sermon.video_link = "https://www.youtube.com/watch?v=PxTdE09QjH0"

    [hit] = retrieve_chunks("grace")

    assert hit.youtube_video_id == "PxTdE09QjH0"


def test_selected_sermon_link_fallback_keeps_its_limit(app: Flask):
    add_sermon(
        "Other",
        [(f"Grace elsewhere {i}.", float(i), float(i + 1)) for i in range(8)],
    )
    selected = add_sermon(
        "Selected",
        [(f"Grace here {i}.", float(i), float(i + 1)) for i in range(3)],
        video_id=None,
    )
    selected.video_link = "https://www.youtube.com/watch?v=PxTdE09QjH0"

    hits = retrieve_chunks("grace", sermon_id=selected.id, limit=2)

    assert len(hits) == 2
    assert {hit.sermon_id for hit in hits} == {selected.id}
    assert {hit.youtube_video_id for hit in hits} == {"PxTdE09QjH0"}


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


def test_unbounded_retrieval_keeps_all_matches_beyond_the_chat_default(app: Flask):
    sermon = add_sermon(
        "Many", [(f"Grace point {i}.", float(i), float(i + 1)) for i in range(13)]
    )

    assert len(retrieve_chunks("grace")) == 8
    hits = retrieve_chunks("grace", limit=None)

    assert len(hits) == 13
    assert {hit.sermon_id for hit in hits} == {sermon.id}
    assert [hit.start_sec for hit in hits] == list(range(13))


def test_lexical_chunk_evidence_is_shared_with_search(app: Flask, monkeypatch):
    sermon = add_sermon(
        "Generosity", [("We discuss living generously together.", 12.5, 19.75)]
    )
    # The real vec0 distance is 1, beyond semantic admission; the exact phrase
    # remains valid chunk evidence rather than being lost to a vector-only cap.
    query_vector = [1.0] + [0.0] * (embeddings.EMBEDDING_DIM - 1)
    monkeypatch.setattr(
        "ollama.embed", lambda **kw: SimpleNamespace(embeddings=[query_vector])
    )

    [hit] = retrieve_chunks("living generously")

    assert hit.sermon_id == sermon.id
    assert hit.distance == pytest.approx(1.0)
    assert (hit.start_sec, hit.end_sec) == (12.5, 19.75)


def test_metadata_only_sermon_is_never_chat_evidence(app: Flask):
    add_sermon("The lantern prayer", [])

    assert retrieve_chunks("lantern prayer", limit=None) == []


@pytest.mark.parametrize("keep_vector", [True, False])
def test_missing_recorded_model_is_lexical_only_even_with_a_vector(
    app: Flask, keep_vector
):
    from tsh.models import SermonChunkEmbedding

    sermon = add_sermon("Message", [("Grace is freely given.", 0.0, 5.0)])
    chunk = db.session.scalars(
        db.select(SermonChunk).where(SermonChunk.sermon_id == sermon.id)
    ).one()
    chunk.embedding_model = None
    if not keep_vector:
        db.session.delete(db.session.get(SermonChunkEmbedding, chunk.id))
    db.session.commit()

    [hit] = retrieve_chunks("grace")

    assert hit.sermon_id == sermon.id
    assert hit.distance is None
    assert hit.score == pytest.approx(0.3)


def test_stale_chunks_are_not_chat_evidence(app: Flask):
    sermon = add_sermon("Message", [("Grace in an obsolete transcript.", 0.0, 5.0)])
    chunk = db.session.scalars(
        db.select(SermonChunk).where(SermonChunk.sermon_id == sermon.id)
    ).one()
    chunk.stale = True
    db.session.commit()

    assert retrieve_chunks("grace") == []


def test_speaker_and_dates_are_applied_before_a_retrieval_limit(app: Flask):
    for i in range(9):
        add_sermon(
            f"Other {i}", [("Grace is given.", 0.0, 5.0)], video_id=f"other{i:06d}"
        )
    selected = add_sermon(
        "Selected", [("Grace in this sermon.", 75.5, 89.25)], video_id="selected123"
    )
    selected.speaker = db.session.scalars(
        db.select(Speaker).where(Speaker.first_name == "Jon")
    ).one()
    selected.date = date(2025, 1, 2)
    db.session.commit()

    hits = retrieve_chunks(
        "grace",
        limit=1,
        speaker=str(selected.speaker.id),
        date_from=date(2025, 1, 2),
        date_to=date(2025, 1, 2),
    )

    assert [hit.sermon_id for hit in hits] == [selected.id]
    assert (
        retrieve_chunks(
            "grace", limit=None, speaker="Jon Laurenzo", date_from=date(2025, 1, 3)
        )
        == []
    )


@pytest.mark.parametrize(
    "text,start,end",
    [("Grace backwards.", 5.0, 4.0), ("Grace negative.", -1.0, 2.0), ("   ", 0.0, 2.0)],
)
def test_unusable_chunks_never_become_evidence(app: Flask, text, start, end):
    add_sermon("Message", [(text, start, end)])

    assert retrieve_chunks("grace") == []
