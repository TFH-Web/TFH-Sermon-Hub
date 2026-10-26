# AI chat

`POST /api/chat` answers a staff question using only published TFH sermons, and
returns the sermon moments it used as timestamped YouTube links. It is not
streamed: one request gets one JSON response.

Allowed roles: Internal User, InternalUser and Admin. Every error body contains
`error` and `message` with the same text.

## Request

```json
{
  "message": "What does grace change about us?",
  "sermonId": 12,
  "history": [
    {"role": "user", "content": "What is grace?"},
    {"role": "assistant", "content": "Grace is a gift that cannot be earned [1]."}
  ]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `message` | string | Required. 1 to 1000 characters, not only spaces. |
| `sermonId` | integer or null | Optional. A positive integer limits evidence to that sermon. Strings, decimals and booleans are rejected. |
| `history` | array | Optional, default `[]`. At most 6 turns, oldest first. |
| `history[].role` | string | `"user"` or `"assistant"`. |
| `history[].content` | string | 1 to 1000 characters, not only spaces. |

Unknown keys are rejected. The whole body may be at most 32 KiB.

History gives the model context for follow-up questions, but evidence is
searched for `message` alone. Send the earlier answers as plain text; their
`sources` are not needed.

## Response

### 200: answered

```json
{
  "answer": "Grace is a gift that cannot be earned [1]. It changes who you are [2].",
  "ai_generated": true,
  "supported": true,
  "sources": [
    {
      "source_id": 1,
      "chunk_id": 481,
      "sermon_id": 12,
      "title": "Under Grace",
      "youtube_video_id": "JQSUGFQO5FU",
      "start_sec": 75.5,
      "end_sec": 90.0,
      "url": "https://www.youtube.com/watch?v=JQSUGFQO5FU&t=75s"
    },
    {
      "source_id": 2,
      "chunk_id": 483,
      "sermon_id": 12,
      "title": "Under Grace",
      "youtube_video_id": "JQSUGFQO5FU",
      "start_sec": 300.0,
      "end_sec": 320.0,
      "url": "https://www.youtube.com/watch?v=JQSUGFQO5FU&t=300s"
    }
  ]
}
```

- `answer` cites sources as `[n]`, where `n` is a `source_id` in `sources`.
  Every `[n]` left in the answer has a matching source.
- `sources` lists only cited evidence, in the order first cited.
- `url` is built by the server from the stored video id and `start_sec`, never
  from model output. `youtube_video_id` is always an 11 character YouTube id.
- `start_sec` and `end_sec` are seconds from the start of the video.

### 200: not supported by the sermons

```json
{
  "answer": "I couldn't find anything in the published TFH sermons that answers that question.",
  "ai_generated": true,
  "supported": false,
  "sources": []
}
```

Sent when no published sermon chunk is relevant, when the selected sermon is
missing or not published, when the model says the evidence does not answer,
or when its answer has no citations or contains any invented or malformed source
reference, even alongside a valid citation. The answer text is fixed, so it
never contains model claims. When nothing relevant is found, the model is not
called.

`ai_generated` is `true` on every chat response, so every chat answer is
labeled as AI generated.

### Errors

| Status | When |
| --- | --- |
| 400 | The body is not a JSON object or breaks a rule above. Also carries `errors` with messages per field, for example `{"message": ["Must not be blank."]}`. |
| 401 | No valid token. |
| 403 | Signed in without an allowed role. |
| 413 | The body is larger than 32 KiB. |
| 502 | The AI model failed. `"The AI model could not answer right now. Please try again later."` |
| 503 | The question could not be embedded or sermons could not be searched. `"Sermon search is unavailable right now. Please try again later."` |

## Limits

Each limit is a named constant, so it can be tuned in one place.

| Limit | Value | Constant |
| --- | --- | --- |
| Request body | 32 KiB | `chat.MAX_REQUEST_BYTES` |
| Message length | 1000 characters | `chat.MAX_MESSAGE_CHARS` |
| History turns | 6 | `chat.MAX_HISTORY_TURNS` |
| Each history turn | 1000 characters | `chat.MAX_HISTORY_CHARS` |
| Candidate chunks | 8 (chat only, not the HTTP search total) | `retrieval.CANDIDATE_LIMIT` |
| Semantic admission cutoff | cosine distance 0.6; lexical matches can also qualify | `search_ranking.MAX_DISTANCE` |
| Evidence text sent to the model | 6000 characters | `chat.CONTEXT_CHAR_BUDGET` |
| Answer length | 600 tokens | `chat.MAX_OUTPUT_TOKENS` |

Evidence is added in hybrid relevance order until the next chunk would pass the
context budget. If the first chunk alone is larger, it is cut to fit. The output
cap is sent to both providers: `max_tokens` for Anthropic and `num_predict` for Ollama.

## Grounding

- The shared [TFH-462 hybrid retrieval service](search.md#retrieval-scoring-and-grouping)
  ranks actual PUBLISHED sermon chunks using sqlite-vec cosine distance plus
  keyword matching. The query uses the same configured embedding model and
  768-dimensional vector size as compatible stored chunk vectors.
- Chunks recorded with a different model are excluded. Chunks without a recorded
  model can qualify lexically, without comparing their vectors. Stale/blank
  chunks, invalid times and invalid YouTube sources cannot become evidence.
  `sermonId` is applied before chat's candidate limit.
- Metadata-only search matches (title, summary, description, speaker, series or
  tags) are never chat evidence. An HTTP search hit without a source time does
  not establish support for an answer.
- The model gets numbered evidence blocks and must answer only from them, with
  no outside Bible or general knowledge.
- History and evidence are passed as quoted material that cannot change the
  rules, with angle brackets escaped so they cannot open or close a section.
- Any invented or malformed citation declines the entire answer, so an unsupported
  claim cannot remain after its citation is removed. Valid citation groups such as
  `[1, 2]` are normalized to `[1][2]`.

## Code

- `Backend/tsh/chat.py`: request validation, prompt, citations
- `Backend/tsh/retrieval.py`: shared
  `retrieve_chunks(query, sermon_id=None, limit=...)`. Chat keeps its bounded
  evidence list; HTTP search uses the complete eligible set before grouping and
  pagination. Relevance order is shared, but metadata candidates belong only to
  HTTP search. Chat's request/response and citation format are unchanged.
