"""Real sqlite-vec search, with fixed embeddings and no provider/network calls."""

from datetime import date, timedelta
from itertools import count
from math import sqrt
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from unittest.mock import Mock

import pytest

from tests.chat_helpers import add_sermon, use_topic_embeddings
from tsh import embeddings
from tsh.database import db
from tsh.models import (
    Sermon,
    SermonChunk,
    SermonChunkEmbedding,
    Series,
    Speaker,
    UploadStatus,
)


@pytest.fixture(autouse=True)
def isolated_search_library(app, monkeypatch):
    # The normal application fixture contains metadata matches; keep this library
    # controlled without changing the fixture shared with the rest of the suite.
    for sermon in db.session.scalars(db.select(Sermon)).all():
        db.session.delete(sermon)
    db.session.commit()
    use_topic_embeddings(monkeypatch)


@pytest.fixture
def message():
    sequence = count(1)

    def create(title="Message", chunks=None, **kwargs):
        video_id = kwargs.pop("video_id", f"vid{next(sequence):08d}")
        return add_sermon(title, chunks or [], video_id=video_id, **kwargs)

    return create


def vector(first=1.0, second=0.0):
    return [first, second] + [0.0] * (embeddings.EMBEDDING_DIM - 2)


def replace_vector(sermon, values, index=0):
    chunks = db.session.scalars(
        db.select(SermonChunk)
        .where(SermonChunk.sermon_id == sermon.id)
        .order_by(SermonChunk.id)
    ).all()
    db.session.get(SermonChunkEmbedding, chunks[index].id).embedding = values
    db.session.commit()


def force_query_vector(monkeypatch, values):
    monkeypatch.setattr(
        "ollama.embed",
        lambda model, input, **kwargs: SimpleNamespace(
            embeddings=[values for _ in input]
        ),
    )


def results(client, **params):
    response = client.get("/api/search", query_string={"q": "grace", **params})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def assert_page(body, expected_ids, *, total, page, size):
    assert [row["id"] for row in body["items"]] == expected_ids
    assert body["results"] == body["items"]
    assert body["total"] == total
    assert body["page"] == page
    assert body["pageSize"] == body["page_size"] == size
    expected_pages = (total + size - 1) // size
    assert body["totalPages"] == body["total_pages"] == expected_pages


def test_query_uses_the_chunk_model_and_real_cosine_distance(
    client, message, monkeypatch
):
    closest = message("Near", [("A gift freely given.", 0.0, 5.0)])
    further = message("Far", [("A kindness freely given.", 20.0, 25.0)])
    replace_vector(closest, vector())
    replace_vector(further, vector(0.5, sqrt(0.75)))
    provider = Mock(
        side_effect=lambda model, input, **kw: SimpleNamespace(
            embeddings=[vector() for _ in input]
        )
    )
    monkeypatch.setattr("ollama.embed", provider)

    rows = results(client)

    assert [row["id"] for row in rows] == [closest.id, further.id]
    assert [row["score"] for row in rows] == pytest.approx([0.7, 0.35], abs=1e-6)
    assert provider.call_count == 1
    assert provider.call_args.kwargs["model"] == embeddings.EMBEDDING_MODEL
    assert provider.call_args.kwargs["input"] == ["grace"]


def test_keyword_boost_can_outweigh_a_small_vector_distance_difference(client, message):
    nearest = message("First", [("A gift freely given.", 0.0, 5.0)])
    boosted = message("Second", [("Grace changes us.", 70.5, 80.25)])
    replace_vector(nearest, vector())
    replace_vector(boosted, vector(0.9, sqrt(0.19)))

    rows = results(client)

    assert [row["id"] for row in rows] == [boosted.id, nearest.id]
    assert rows[0]["score"] == pytest.approx(0.93, abs=1e-6)
    assert rows[1]["score"] == pytest.approx(0.7, abs=1e-6)


def test_exact_phrase_is_found_even_when_its_vector_is_orthogonal(
    client, message, monkeypatch
):
    sermon = message(
        "Generosity", [("We discuss living generously together.", 12.5, 19.75)]
    )
    force_query_vector(monkeypatch, vector())

    [row] = results(client, q="living generously")

    assert row["id"] == sermon.id
    assert row["snippet"] == "We discuss living generously together."
    assert row["score"] == pytest.approx(0.3)
    assert (row["start_sec"], row["end_sec"]) == (12.5, 19.75)


@pytest.mark.parametrize("quote", ['"', "'"])
def test_outer_quoted_phrases_receive_the_exact_phrase_bonus(
    client, message, monkeypatch, quote
):
    sermon = message(
        "Generosity", [("We discuss living generously together.", 12.5, 19.75)]
    )
    force_query_vector(monkeypatch, vector())

    [row] = results(client, q=f"{quote}living generously{quote}")

    assert row["id"] == sermon.id
    assert row["score"] == pytest.approx(0.3)


def test_partial_keyword_coverage_and_stopwords_are_meaningful(
    client, message, monkeypatch
):
    sermon = message("Message", [("Forgiveness changes us.", 0.0, 5.0)])
    force_query_vector(monkeypatch, vector())

    [row] = results(client, q="the grace and forgiveness")

    assert row["id"] == sermon.id
    assert row["score"] == pytest.approx(0.3 * 0.65 * 0.5)
    assert results(client, q="grace hope forgiveness mercy") == []


def test_results_group_by_sermon_and_keep_its_best_chunk(client, message):
    sermon = message(
        "Message",
        [
            ("A freely given gift.", 0.0, 9.0),
            ("Grace is for everyone.", 75.5, 91.25),
            ("Grace is also here.", 100.0, 120.0),
        ],
    )
    replace_vector(sermon, vector())
    expected = db.session.scalars(
        db.select(SermonChunk)
        .where(SermonChunk.sermon_id == sermon.id)
        .order_by(SermonChunk.id)
    ).all()[1]

    [row] = results(client)

    assert row["id"] == row["sermonId"] == sermon.id
    assert row["chunk_id"] == expected.id
    assert row["snippet"] == row["summary"] == "Grace is for everyone."
    assert (row["start_sec"], row["end_sec"]) == (75.5, 91.25)


def test_zero_seconds_and_safe_source_contract_are_preserved(client, message):
    sermon = message("Grace", [("  Grace is freely given.  ", 0.0, 8.25)])
    sermon.series = db.session.scalars(db.select(Series).order_by(Series.id)).first()
    sermon.video_link = "javascript:alert('never-render-this')"
    db.session.commit()

    [row] = results(client)

    assert row["title"] == "Grace"
    assert row["type"] == "sermon"
    assert row["speaker"] == "Dave Patterson"
    assert row["date"] == "2026-09-06"
    assert row["series"] == sermon.series.title
    assert row["start_sec"] == 0.0
    assert row["end_sec"] == 8.25
    assert row["snippet"] == row["summary"] == "Grace is freely given."
    assert row["score"] == row["ai_score"]
    assert 0 <= row["score"] <= 1
    assert isinstance(row["chunk_id"], int)
    parsed = urlsplit(row["video_link"])
    assert (parsed.scheme, parsed.hostname, parsed.path) == (
        "https",
        "www.youtube.com",
        "/watch",
    )
    assert parse_qs(parsed.query)["v"] == [sermon.youtube_video_id]
    assert row["youtube_video_id"] == sermon.youtube_video_id


@pytest.mark.parametrize("field", ["title", "description", "summary"])
def test_metadata_matching_is_recalled_without_inventing_a_timestamp(
    client, message, field
):
    sermon = message()
    setattr(sermon, field, "The lantern prayer brings comfort.")
    db.session.commit()

    [row] = results(client, q="lantern prayer")

    assert row["id"] == sermon.id
    assert "lantern prayer" in row["snippet"].lower()
    assert row["chunk_id"] is row["start_sec"] is row["end_sec"] is None
    assert isinstance(row["series"], str)
    assert row["type"] == "sermon"


def test_metadata_cannot_replace_an_admitted_chunk_with_a_timeless_match(
    client, message
):
    sermon = message("Grace", [("A freely given gift.", 12.0, 18.0)])
    # A weak but admitted vector scores below an exact metadata phrase; the
    # usable chunk must still win so the result has a genuine video moment.
    replace_vector(sermon, vector(0.41, sqrt(1 - 0.41**2)))

    [row] = results(client)

    assert row["id"] == sermon.id
    assert row["chunk_id"] is not None
    assert (row["start_sec"], row["snippet"]) == (12.0, "A freely given gift.")


def test_unsafe_video_metadata_is_returned_without_an_unsafe_link(client, message):
    sermon = message("Lantern prayer", video_id=None)
    sermon.video_link = "javascript:alert(1)"
    db.session.commit()

    [row] = results(client, q="lantern prayer")

    assert row["id"] == sermon.id
    assert row["youtube_video_id"] is row["video_link"] is None
    assert row["chunk_id"] is row["start_sec"] is row["end_sec"] is None


def test_long_metadata_snippet_keeps_the_matching_words_visible(client, message):
    sermon = message()
    sermon.summary = "An introduction. " * 100 + "The lantern prayer brings comfort."
    db.session.commit()

    [row] = results(client, q="lantern prayer")

    assert row["id"] == sermon.id
    assert "lantern prayer" in row["snippet"]
    assert len(row["snippet"]) <= 500
    assert row["chunk_id"] is row["start_sec"] is row["end_sec"] is None


@pytest.mark.parametrize(
    "kind,total", [("all", 2), ("sermon", 2), ("transcript", 1), ("note", 0)]
)
def test_type_filter_is_applied_before_totals_and_paging(client, message, kind, total):
    chunked = message("One", [("Grace changes us.", 0.0, 5.0)])
    metadata = message("Grace without captions")

    body = results(client, type=kind, page=1, pageSize=1)

    assert body["total"] == total
    assert len(body["items"]) == min(1, total)
    if total:
        assert body["items"][0]["id"] == chunked.id
        assert body["items"][0]["type"] == (
            "transcript" if kind == "transcript" else "sermon"
        )
    if kind in {"all", "sermon"}:
        assert_page(
            results(client, type=kind, page=2, pageSize=1),
            [metadata.id],
            total=2,
            page=2,
            size=1,
        )


def test_unpublished_sermons_never_appear_even_as_metadata(client, message):
    published = message("Grace public", [("Grace is given.", 0.0, 5.0)])
    for status in (UploadStatus.DRAFT, UploadStatus.PROCESSING, UploadStatus.FAILED):
        message("Grace hidden", [("Grace is hidden.", 0.0, 5.0)], status=status)

    assert_page(results(client, page=1), [published.id], total=1, page=1, size=10)


def test_ties_are_stable_and_grouping_does_not_cap_search_at_eight_chunks(
    client, message
):
    sermons = [
        message(
            f"Message {i}",
            [
                ("Grace is given.", 0.0, 5.0),
                ("Grace is repeated.", 10.0, 15.0),
            ],
        )
        for i in range(13)
    ]
    ids = [sermon.id for sermon in sermons]

    assert [row["id"] for row in results(client)] == ids
    assert [row["id"] for row in results(client, pageSize=1)] == ids
    assert_page(results(client, page=1), ids[:10], total=13, page=1, size=10)
    assert_page(results(client, page=1, pageSize=5), ids[:5], total=13, page=1, size=5)
    assert_page(
        results(client, page=2, pageSize=5), ids[5:10], total=13, page=2, size=5
    )
    assert_page(results(client, page=3, pageSize=5), ids[10:], total=13, page=3, size=5)
    assert_page(results(client, page=4, pageSize=5), [], total=13, page=4, size=5)
    assert_page(results(client, page=2, pageSize=2), ids[2:4], total=13, page=2, size=2)


@pytest.mark.parametrize("size_key", ["pageSize", "page_size", "per_page"])
def test_page_size_aliases_and_cap(client, message, size_key):
    ids = [
        message(f"Message {i}", [("Grace is given.", 0.0, 5.0)]).id for i in range(3)
    ]
    assert_page(
        results(client, page=1, **{size_key: 2}), ids[:2], total=3, page=1, size=2
    )
    assert_page(
        results(client, page=1, **{size_key: 1000}), ids, total=3, page=1, size=100
    )


def test_empty_size_falls_back_to_alias(client, message):
    sermon = message("Grace", [("Grace is given.", 0.0, 5.0)])
    assert_page(
        results(client, page=1, pageSize="", per_page=2),
        [sermon.id],
        total=1,
        page=1,
        size=2,
    )


@pytest.mark.parametrize("alias", ["speaker_id", "speakerId", "speaker"])
@pytest.mark.parametrize("as_name", [False, True])
def test_speaker_aliases_accept_ids_and_full_names_before_paging(
    client, message, alias, as_name
):
    message("Other", [("Grace is given.", 0.0, 5.0)])
    chosen = message("Chosen", [("Grace is given.", 0.0, 5.0)])
    chosen.speaker = db.session.scalars(
        db.select(Speaker).where(Speaker.first_name == "Jon")
    ).one()
    db.session.commit()
    speaker = "jOn laURenzo" if as_name else chosen.speaker.id

    assert_page(
        results(client, page=1, pageSize=1, **{alias: speaker}),
        [chosen.id],
        total=1,
        page=1,
        size=1,
    )


def test_combined_filters_admit_a_sermon_beyond_unfiltered_candidates(client, message):
    for i in range(12):
        message(f"Other {i}", [("Grace is given.", 0.0, 5.0)])
    selected = message("Chosen", [("A freely given gift.", 61.25, 70.5)])
    replace_vector(selected, vector(0.5, sqrt(0.75)))
    selected.speaker = db.session.scalars(
        db.select(Speaker).where(Speaker.first_name == "Jon")
    ).one()
    selected.date = date(2025, 1, 2)
    db.session.commit()

    assert_page(
        results(
            client,
            page=1,
            pageSize=1,
            type="transcript",
            speaker_id=selected.speaker.id,
            date_from="2025-01-02",
            date_to="2025-01-02",
        ),
        [selected.id],
        total=1,
        page=1,
        size=1,
    )


@pytest.mark.parametrize(
    "date_params",
    [
        {"date": "2026"},
        {"date": "custom|2026-01-01|2026-12-31"},
        {"date_from": "2026-01-01", "date_to": "2026-12-31"},
    ],
)
def test_absolute_date_filters_are_inclusive_and_precede_counting(
    client, message, date_params
):
    matches = []
    for value in (
        date(2025, 12, 31),
        date(2026, 1, 1),
        date(2026, 12, 31),
        date(2027, 1, 1),
    ):
        sermon = message("Message", [("Grace is given.", 0.0, 5.0)])
        sermon.date = value
        if value.year == 2026:
            matches.append(sermon.id)
    db.session.commit()

    assert_page(
        results(client, page=1, pageSize=1, **date_params),
        matches[:1],
        total=2,
        page=1,
        size=1,
    )
    assert_page(
        results(client, page=2, pageSize=1, **date_params),
        matches[1:],
        total=2,
        page=2,
        size=1,
    )


@pytest.mark.parametrize(
    "period,days", [("24h", 1), ("7d", 7), ("14d", 14), ("28d", 28), ("1y", 365)]
)
def test_relative_date_presets_include_boundaries_and_exclude_older_sermons(
    client, message, monkeypatch, period, days
):
    today = date(2026, 10, 25)
    monkeypatch.setattr("tsh.search._today", lambda: today)
    ids = []
    for age in (0, days, days + 1):
        sermon = message("Message", [("Grace is given.", 0.0, 5.0)])
        sermon.date = today - timedelta(days=age)
        ids.append(sermon.id)
    db.session.commit()

    assert_page(results(client, date=period, page=1), ids[:2], total=2, page=1, size=10)


@pytest.mark.parametrize(
    "params,indexes",
    [
        (
            {"date": "2026", "date_from": "2025-01-01", "date_to": "2027-12-31"},
            [1, 2, 3],
        ),
        (
            {
                "date": "custom|2026-09-05|2026-09-07",
                "date_from": "2026-09-06",
                "date_to": "2026-09-06",
            },
            [2],
        ),
        ({"date": "2026", "dateFrom": "2026-09-06", "dateTo": "2026-09-06"}, [2]),
        ({"dateFrom": "2026-09-06"}, [2, 3, 4]),
        ({"dateTo": "2026-09-06"}, [0, 1, 2]),
    ],
)
def test_explicit_date_bounds_intersect_presets_and_accept_camel_aliases(
    client, message, params, indexes
):
    ids = []
    for value in (
        date(2025, 12, 31),
        date(2026, 9, 5),
        date(2026, 9, 6),
        date(2026, 9, 7),
        date(2027, 1, 1),
    ):
        sermon = message("Message", [("Grace is given.", 0.0, 5.0)])
        sermon.date = value
        ids.append(sermon.id)
    db.session.commit()

    assert_page(
        results(client, page=1, **params),
        [ids[index] for index in indexes],
        total=len(indexes),
        page=1,
        size=10,
    )


@pytest.mark.parametrize(
    "params",
    [
        {"page": ""},
        {"page": 0},
        {"page": -1},
        {"page": "one"},
        {"page": "1.5"},
        {"page": 1, "pageSize": 0},
        {"page": 1, "pageSize": -1},
        {"page": 1, "pageSize": "many"},
        {"page": 1, "page_size": "1.5"},
        {"page": 1, "per_page": "invalid"},
        {"type": "unknown"},
        {"date": "202x"},
        {"date": "yesterday"},
        {"date_from": "2026-02-30"},
        {"date_to": "2026-9-6"},
        {"date_from": "2026-09-06T00:00:00Z"},
        {"date_from": "2026-10-01", "date_to": "2026-09-01"},
        {"date": "custom|2026-02-30|2026-09-06"},
        {"date": "custom|2026-10-01|2026-09-01"},
        {"q": "x" * 1001},
    ],
)
def test_invalid_parameters_are_json_400_before_embedding(client, monkeypatch, params):
    provider = Mock(side_effect=AssertionError("Validation must precede embedding"))
    monkeypatch.setattr("ollama.embed", provider)

    response = client.get("/api/search", query_string={"q": "grace", **params})

    assert response.status_code == 400
    body = response.get_json()
    assert body["error"] and body["message"]
    provider.assert_not_called()


@pytest.mark.parametrize("query", ["", "   "])
def test_blank_query_returns_empty_without_embedding(client, monkeypatch, query):
    provider = Mock(side_effect=AssertionError("Blank questions need no vector"))
    monkeypatch.setattr("ollama.embed", provider)

    assert results(client, q=query) == []
    assert_page(
        results(client, q=query, page=5, pageSize=2), [], total=0, page=5, size=2
    )
    provider.assert_not_called()


def test_note_filter_and_omitted_query_do_not_call_the_embedding_provider(
    client, monkeypatch
):
    provider = Mock(side_effect=AssertionError("No supported evidence is requested"))
    monkeypatch.setattr("ollama.embed", provider)

    assert results(client, type="note") == []
    assert_page(results(client, type="note", page=1), [], total=0, page=1, size=10)
    response = client.get("/api/search")
    assert response.status_code == 200
    assert response.get_json() == []
    provider.assert_not_called()


def test_maximum_query_length_is_accepted(client, message):
    sermon = message("Message", [("Grace is given.", 0.0, 5.0)])
    assert [row["id"] for row in results(client, q="x" * 995 + "grace")] == [sermon.id]


def test_unrelated_query_has_no_results_and_zero_pages(client, message):
    message("Grace", [("Grace changes us.", 0.0, 5.0)])
    assert results(client, q="quasar nebula astrophysics") == []
    assert_page(
        results(client, q="quasar nebula astrophysics", page=1),
        [],
        total=0,
        page=1,
        size=10,
    )


@pytest.mark.parametrize("role", ["Admin", "Internal User", "InternalUser"])
def test_staff_roles_can_search(client, message, role):
    sermon = message("Grace", [("Grace changes us.", 0.0, 5.0)])
    response = client.get("/api/search?q=grace", headers={"X-Test-Roles": role})
    assert response.status_code == 200
    assert [row["id"] for row in response.get_json()] == [sermon.id]


@pytest.mark.parametrize("role,status", [("none", 401), ("External", 403)])
def test_search_rejects_missing_or_nonstaff_identity_before_embedding(
    client, monkeypatch, role, status
):
    provider = Mock(side_effect=AssertionError("Unauthorized searches must not embed"))
    monkeypatch.setattr("ollama.embed", provider)
    response = client.get("/api/search?q=grace", headers={"X-Test-Roles": role})
    assert response.status_code == status
    assert response.get_json()["error"] and response.get_json()["message"]
    provider.assert_not_called()


def test_production_auth_does_not_trust_test_role_headers(app, client, monkeypatch):
    app.config["AUTH_TEST_BYPASS"] = False
    provider = Mock()
    monkeypatch.setattr("ollama.embed", provider)
    response = client.get("/api/search?q=grace", headers={"X-Test-Roles": "Admin"})
    assert response.status_code == 401
    provider.assert_not_called()


def test_provider_failure_is_a_safe_json_503(client, monkeypatch, caplog):
    secret = "private-provider-token-must-not-leak"
    monkeypatch.setattr("ollama.embed", Mock(side_effect=ConnectionError(secret)))

    response = client.get("/api/search?q=grace")

    assert response.status_code == 503
    assert response.get_json()["error"] and response.get_json()["message"]
    assert secret not in response.get_data(as_text=True)
    assert secret not in caplog.text


@pytest.mark.parametrize("mismatch", ["query", "schema"])
def test_embedding_and_vec0_size_mismatches_are_json_503(client, monkeypatch, mismatch):
    if mismatch == "query":
        force_query_vector(monkeypatch, [0.1] * 384)
    else:
        monkeypatch.setattr(embeddings, "EMBEDDING_DIM", 384)

    response = client.get("/api/search?q=grace")

    assert response.status_code == 503
    assert response.get_json()["error"] and response.get_json()["message"]


@pytest.mark.parametrize(
    "kind,diagnostic", [("zero", "nonzero"), ("nan", "finite"), ("infinite", "finite")]
)
def test_invalid_query_vectors_return_actionable_json_503(
    client, monkeypatch, kind, diagnostic
):
    values = [0.0] * embeddings.EMBEDDING_DIM
    if kind != "zero":
        values[0] = float("nan" if kind == "nan" else "inf")
    force_query_vector(monkeypatch, values)

    response = client.get("/api/search?q=grace")

    assert response.status_code == 503
    body = response.get_json()
    assert body["error"] == "embedding_incompatible"
    assert diagnostic in body["message"].lower()


@pytest.mark.parametrize("stale,model", [(True, None), (False, "obsolete-model")])
def test_stale_or_incompatible_chunks_are_not_search_matches(
    client, message, stale, model
):
    sermon = message("Message", [("Grace changes us.", 0.0, 5.0)], model=model)
    chunk = db.session.scalars(
        db.select(SermonChunk).where(SermonChunk.sermon_id == sermon.id)
    ).one()
    chunk.stale = stale
    db.session.commit()

    assert results(client) == []
