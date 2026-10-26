# Real sermon search (TFH-462)

`GET /api/search` searches saved PUBLISHED sermons using the same hybrid chunk
retrieval as [AI chat](ai-chat.md). It replaces hardcoded search results. Search
returns one result per sermon, with its best matching chunk and source time when
available; it does not generate an answer.

Allowed roles are `Admin`, `Internal User` and `InternalUser`. Missing/invalid
credentials return 401; a valid identity without an allowed role returns 403.
An unpublished sermon cannot appear through either chunk or metadata matching.

For local testing, Ollama needs the configured embedding model in addition to
the chat model. With the default settings, install it once using
`ollama pull nomic-embed-text`. Changing the embedding model requires compatible
768-dimensional output and re-embedding chunks before comparing their vectors;
do not silently compare an old model's vectors with a new query model.

## Request and filters

```text
GET /api/search?q=grace&type=all&speaker=any&date=any&page=1&pageSize=6
```

| Parameter | Behavior |
| --- | --- |
| `q` | At most 1000 characters after trimming. Missing or blank text returns no results without embedding. Overlong text returns 400. |
| `type` | Defaults to `all`. `all` and `sermon` include eligible chunk and metadata matches; `transcript` includes chunk matches only. `note` returns no results because notes are not indexed, without embedding. An unknown type returns 400. |
| `speaker_id` | Speaker ID or an exact, case-insensitive full name, at most 200 characters. Aliases: `speakerId`, `speaker`. Omit for no restriction; `any`, `all` and `all speakers` also mean no restriction. |
| `date` | `any`/`all`, a four-digit year, a relative preset below, or `custom\|YYYY-MM-DD\|YYYY-MM-DD`. |
| `date_from`, `date_to` | Optional inclusive bounds in strict `YYYY-MM-DD` form. Aliases: `dateFrom`, `dateTo`. These intersect with `date`; they do not override it. |
| `page` | Opts into the [shared pagination shape](pagination-contract.md#search). Positive integer; invalid values return 400. |
| `pageSize` | With `page`, defaults to 10 and is capped at 100. Aliases: `page_size`, `per_page`. A supplied nonempty invalid size returns 400 when pagination is enabled. A size alone does not enable pagination. |

Speaker, date and content-type restrictions combine with AND. They apply before
results are counted or paged. Invalid dates or combined bounds whose start is
after their end return 400, not an unfiltered search. `type=all` does not mean all
publication statuses.

The UI's relative presets use the current calendar date in `YOUTUBE_TIMEZONE`
(default `America/Los_Angeles`):

| Preset | Inclusive date bounds |
| --- | --- |
| `24h` | Today minus 1 day through today |
| `7d`, `14d`, `28d` | Today minus 7, 14 or 28 days through today |
| `1y` | Today minus 365 days through today |

These are **date-only** windows, not precise rolling timestamps: sermon dates
have no time of day. For example, `7d` includes both its lower-bound date and
today. A year filter includes January 1 through December 31. Custom ranges also
include both endpoints; an empty custom endpoint is unbounded. Encode the `|`
separators as `%7C` when building a URL.

## Response

Without `page`, return the complete ranked matching array. With `page`, return
the envelope below. The HTTP result set is not limited to chat's eight chunks.

```json
{
  "items": [
    {
      "id": 12,
      "sermonId": 12,
      "title": "Under Grace",
      "type": "sermon",
      "speaker": "Dave Patterson",
      "date": "2026-10-20",
      "series": "Grace Series",
      "snippet": "Grace is a gift that cannot be earned.",
      "summary": "Grace is a gift that cannot be earned.",
      "score": 0.685,
      "ai_score": 0.685,
      "chunk_id": 481,
      "start_sec": 75.5,
      "end_sec": 90.0,
      "youtube_video_id": "JQSUGFQO5FU",
      "video_link": "https://www.youtube.com/watch?v=JQSUGFQO5FU"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 6,
  "totalPages": 1
}
```

- `id` and `sermonId` identify the sermon, not an individual chunk. Multiple
  matching chunks do not duplicate a sermon or inflate `total`.
- `type` is `sermon` for `all`/`sermon` requests, or `transcript` for transcript
  requests. `series` is a title or an empty string when the sermon has no series.
- `snippet` is the full trimmed text of the best chunk, so `start_sec` describes
  where that text begins rather than a later sentence. `summary` is a
  compatibility alias for this snippet, not a newly generated sermon summary.
- `chunk_id`, `start_sec` and `end_sec` are null for metadata-only matches.
  Their snippet is a metadata excerpt capped at 500 characters. Do not invent a
  zero-second evidence location or treat metadata as transcript evidence.
- `youtube_video_id` is a validated 11-character ID or null. `video_link` is
  rebuilt as a canonical YouTube URL from that ID, or null; an arbitrary stored
  URL is never returned as a trusted playback link. Source times are seconds.
- `score` and its compatibility alias `ai_score` are the same value in `[0, 1]`.
  They are ranking weights, **not probabilities or confidence percentages**.
  `thumbnailUrl` is not required by this backend contract.

The paginated response also includes `results` as an identical alias for `items`,
plus `page_size` and `total_pages`. No matches and out-of-range pages return 200
with empty items and accurate totals; an empty result has `totalPages: 0`.
Pagination validation follows the [shared contract](pagination-contract.md#search).

## Retrieval, scoring and grouping

### Eligible chunks and vector compatibility

Queries use `embeddings.embed_query`, which shares `EMBEDDING_MODEL` and the
single `EMBEDDING_DIM = 768` constant with chunk embedding. The vector table's
`FLOAT[768]` schema and query output are checked before comparison. Query values
must be finite and the vector nonzero for cosine distance. A wrong dimension or
malformed embedding is an error, not a truncated/padded query.

Chunks must belong to PUBLISHED sermons, be current rather than stale, contain
nonblank text, have finite source times with `start_sec >= 0` and
`end_sec >= start_sec`, and have a valid YouTube source. Chunks recorded with a
different embedding model are excluded entirely. A chunk with no recorded
model may contribute a lexical match only; its vector is not compared.

sqlite-vec computes cosine distances using
[`vec_distance_cosine`](https://alexgarcia.xyz/sqlite-vec/api-reference.html#vec_distance_cosine).
This implementation performs an exact scan of eligible vectors, not a global
KNN query followed by post-filtering. A semantic match is admitted at cosine
distance `<= 0.6`; a lexical match can admit a chunk outside that cutoff.

### Ranking

Text matching normalizes Unicode case and whitespace while preserving literal
punctuation. One matching pair of outer quotation marks is removed for lexical
scoring, so `"living generously"` retains the exact-phrase bonus; embedding input
is unchanged. A whole normalized query phrase scores `1`. Otherwise, meaningful
distinct query terms are compared with the text, ignoring stopwords. Partial
matches require at least 50% term coverage and receive `0.65 * coverage`;
stopword-only queries have no lexical score.

```text
vector_score = clamp(1 - cosine_distance, 0, 1)  # 0 when no comparable vector
hybrid_score = clamp(0.7 * vector_score + 0.3 * lexical_score, 0, 1)
```

For example, distance `0.45` and an exact phrase yield
`0.7 * 0.55 + 0.3 * 1 = 0.685`. An exact lexical-only match scores `0.3`.
The weights and cutoff live in `Backend/tsh/search_ranking.py`. The distance
cutoff, lexical coverage gate and weights are relevance heuristics, not calibrated
certainty. Tune them against representative TFH questions and expected snippets,
retaining fixed-vector regression tests.

HTTP search can also admit lexical matches against title, description, saved
summary, series, speaker and tags. These metadata-only candidates have no chunk
or source time. Transcript-only search and chat never use metadata-only
candidates as evidence.

For each sermon, always prefer its best admitted chunk; metadata is a fallback
only when that sermon has no admitted chunk. A stronger metadata phrase match
must not displace an available spoken source. Chunk ties use the lower chunk
ID; ranked sermon ties use the lower sermon ID. Apply all filters, group, count
distinct sermons, then take the requested page. No eight-result candidate cap
may truncate the HTTP total.

### Cost and future indexing

An exact vector scan plus lexical scoring favors correct filtering and complete
counts over approximate search speed. Work grows with the eligible archive, and
the unpaginated compatibility response can be large. Callers should use paging.
If scale requires indexed KNN/FTS or bounded candidate selection, preserve
pre-limit filters, keyword recall, grouping, stable order and complete totals;
blindly increasing a global top-k does not establish that contract.

## Shared chat and frontend boundaries

`retrieval.retrieve_chunks` is the shared chunk-search service for both HTTP
search and `POST /api/chat`. Chat retains its eight-chunk/context budget and
per-sermon restriction, while HTTP search obtains the complete eligible chunk
set before sermon grouping and pagination. Chat never substitutes a metadata
match for spoken evidence. Its request/response and citation format are unchanged.

The existing search hook accepts server pagination and the `summary`,
`ai_score` and `sermonId` aliases. Frontend work remains in TFH-533/TFH-538:
consume source times for seeking, handle nullable sources safely, and update
UI/test fixtures as needed. The current mapper opens `/sermons/:id` and does not
yet pass the returned source time; backend availability is not proof that
click-to-moment works. Scores must not be presented as a measured probability.

## Errors and verification

Errors are JSON with `error` and `message`:

| Status | Meaning |
| --- | --- |
| 400 | Invalid query length, filter or enabled pagination parameter. |
| 401 / 403 | Missing/invalid credentials or insufficient role. |
| 503 | Embedding/vector-schema incompatibility, provider outage or retrieval failure. Compatibility errors explain the model/dimension issue; other failures use a generic message, without provider credentials or raw exceptions. |

Fixed-embedding tests should cover semantic/keyword weighting and phrase recall,
model/dimension compatibility, invalid/stale sources, PUBLISHED-only retrieval,
best-chunk grouping/ties, speaker/date/type filters before counting, more than
eight matching sermons, all paging edges, no results, blank/note queries without
embedding, provider failures and 401/403. Chat regressions should retain grounded
citations, unsupported answers and provider errors using fake embeddings/LLMs.

From `Backend`, run the focused retrieval and chat regressions, then the full
suite. These are commands, not a claim that tests have already passed:

```sh
poetry run pytest -q tests/test_search.py tests/test_retrieval.py
poetry run pytest -q tests/test_chat_request.py tests/test_chat_answers.py tests/test_chat_grounding.py tests/test_chat_citations.py tests/test_chat_budgets.py
poetry run pytest -q
```

No real embedding/LLM provider, YouTube request, staging mutation or deployment
is required for these automated tests.

### Local provider smoke check — October 25, 2026

A separate in-memory fixture check used the real local `nomic-embed-text` model
for both stored chunks and queries, with the actual migrated sqlite-vec table.
The model returned 768 values; HTTP search returned 200 with the published
fixture's original 75.5–91.25-second source range and excluded an identical Draft
fixture. A paraphrased question with zero lexical score retrieved the same chunk
at cosine distance approximately 0.3171.

This verifies local provider/retrieval wiring using synthetic text and video IDs,
not real TFH-video relevance or production-role acceptance. It used the isolated
test-only identity mechanism and did not bind a server port or modify the saved
sermon library, Entra configuration or droplet. The embedding model was installed
locally; no cloud-provider setup is implied.
