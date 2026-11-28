# AI chat

`POST /api/chat` lets staff talk with an AI about published TFH sermons. With the
production provider (Anthropic) the model reads the full timed transcript of the
sermon being discussed, so it can summarize, explain and answer follow-ups, and it
cites the moments it uses as timestamped YouTube links. It is not streamed: one
request gets one JSON response.

Allowed roles: Internal User, InternalUser and Admin. Every error body contains
`error` and `message` with the same text.

## Request

```json
{
  "message": "Can you summarize it?",
  "sermonId": null,
  "history": [
    {"role": "user", "content": "What is grace?"},
    {"role": "assistant", "content": "Grace is a gift that cannot be earned [1:15]."}
  ],
  "contextSermonIds": [12]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `message` | string | Required. 1 to 1000 characters, not only spaces. |
| `sermonId` | integer or null | Optional. A positive integer limits the chat to that sermon ("Ask about this sermon"). Strings, decimals and booleans are rejected. |
| `history` | array | Optional, default `[]`. At most 10 turns, oldest first. |
| `history[].role` | string | `"user"` or `"assistant"`. |
| `history[].content` | string | 1 to 4000 characters, not only spaces. |
| `contextSermonIds` | array of integers | Optional, default `[]`. At most 3 positive integers: the sermons the conversation is about, taken from the latest answer that had sources. Repeats are ignored. |

Unknown keys are rejected. The whole body may be at most 64 KiB.

Send the earlier answers as plain text; their `sources` are not needed. The
frontend (`Frontend/src/lib/chat.ts`) cuts each turn to the limit and sends the
sermon ids of the latest sourced answer (or the scoped `sermonId`) as
`contextSermonIds`.

## How answers are built

The provider decides the mode (`LLM_PROVIDER`).

### Anthropic (production): full transcripts

- **Sermon chat** (`sermonId` set): the model gets that sermon's whole transcript
  as lines like `[12:34] text`, built from the stored timed segments, or the plain
  transcript when a sermon has no timed segments. A sermon that is missing, not
  published, untranscribed or without a valid YouTube video is never sent; the
  fixed "not supported" answer comes back and the model is not called.
- **General chat** (no `sermonId`): the message is searched with the shared hybrid
  retrieval, and the model gets the full transcripts of the best match and the
  next best one. On a follow-up, the sermons in `contextSermonIds` are reused, so
  "tell me more" or "what was the main point?" stays on them. The chat switches
  to a fresh search only when the message's best match is a different sermon with
  a hybrid score of at least `chat.SWITCH_SCORE` (0.6) that also holds at least
  `chat.SWITCH_MIN_HITS` (2) of the top `chat.SWITCH_WINDOW` (5) hits. On the
  production library, vague follow-ups scored up to 0.61 but scattered across
  unrelated sermons, while real new topics clustered in one sermon. With no relevant sermon
  the model still answers, so a greeting gets a natural reply.
- Transcripts are added in priority order until `chat.TRANSCRIPT_CHAR_BUDGET`
  (120,000 characters, about 30,000 tokens). The sermon that crosses the budget is
  cut at a whole line, so the lowest-priority sermon loses text first. A typical
  sermon is about 40,000 characters, so the best match always fits whole.
- When more than one transcript is sent they are labeled `S1`, `S2`, and the model
  cites `[S2 12:34]`; the answer shows `[12:34]` and the source card names the sermon.

### Ollama (local development): retrieved chunks

Ollama's context window is small, so it keeps the original behavior: up to
`retrieval.CANDIDATE_LIMIT` (8) chunks for the message alone, at most
`chat.CONTEXT_CHAR_BUDGET` (6000) characters, numbered `[1]`, `[2]`, and only the
last 6 history turns cut to 1000 characters each. An answer with no citation or any
invented citation gets the fixed "not supported" answer. `contextSermonIds` is
ignored.

## Response

### 200: answered

```json
{
  "answer": "The sermon says grace is a gift that cannot be earned [1:15]. It changes who you are [5:00].",
  "ai_generated": true,
  "supported": true,
  "sources": [
    {
      "source_id": 1,
      "chunk_id": 0,
      "sermon_id": 12,
      "title": "Under Grace",
      "youtube_video_id": "JQSUGFQO5FU",
      "start_sec": 75.5,
      "end_sec": 90.0,
      "url": "https://www.youtube.com/watch?v=JQSUGFQO5FU&t=75s"
    },
    {
      "source_id": 2,
      "chunk_id": 0,
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

- With Anthropic, `answer` cites moments as `[m:ss]` or `[h:mm:ss]`. A cited time
  counts when it falls inside a transcript line the model was given; any other
  time is removed from the answer and never becomes a source. `chunk_id` is `0`
  because the moment comes from the transcript, not a retrieval chunk.
- With Ollama, `answer` cites `[n]`, where `n` is a `source_id`, and `chunk_id`
  is the retrieved chunk.
- `sources` lists only cited moments, in the order first cited. Greetings and
  replies such as "you're welcome" have no sources.
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

Sent when the selected sermon is missing, not published or has no transcript,
when the model says the transcripts do not answer a sermon question, and when the
message is unrelated to TFH sermons (weather, news, coding and so on). With
Ollama it is also sent when no chunk is relevant (without calling the model) and
when the answer has no citations or any invented citation. The answer text is
fixed, so it never contains model claims.

`ai_generated` is `true` on every chat response, so every chat answer is
labeled as AI generated.

### Errors

| Status | When |
| --- | --- |
| 400 | The body is not a JSON object or breaks a rule above. Also carries `errors` with messages per field, for example `{"message": ["Must not be blank."]}`. |
| 401 | No valid token. |
| 403 | Signed in without an allowed role. |
| 413 | The body is larger than 64 KiB. |
| 502 | The AI model failed or timed out. `"The AI model could not answer right now. Please try again later."` |
| 503 | The message could not be embedded or sermons could not be searched. `"Sermon search is unavailable right now. Please try again later."` |

## Limits

Each limit is a named constant, so it can be tuned in one place.

| Limit | Value | Constant |
| --- | --- | --- |
| Request body | 64 KiB | `chat.MAX_REQUEST_BYTES` |
| Message length | 1000 characters | `chat.MAX_MESSAGE_CHARS` |
| History turns | 10 | `chat.MAX_HISTORY_TURNS` |
| Each history turn | 4000 characters (fits a full answer) | `chat.MAX_HISTORY_CHARS` |
| Context sermons from a follow-up | 3 | `chat.MAX_CONTEXT_SERMONS` |
| Sermons from a fresh search | 2 | `chat.SEARCH_SERMONS` |
| Transcript text sent to Anthropic | 120,000 characters | `chat.TRANSCRIPT_CHAR_BUDGET` |
| Switch to another sermon on a follow-up | best match score 0.6 and 2 of the top 5 hits from that sermon | `chat.SWITCH_SCORE`, `chat.SWITCH_MIN_HITS`, `chat.SWITCH_WINDOW` |
| Answer length | 1000 tokens | `chat.MAX_OUTPUT_TOKENS` |
| One Anthropic call | 45 s timeout, 1 retry | `chat.LLM_TIMEOUT_SECONDS` |
| Candidate chunks (Ollama, and general search) | 8 | `retrieval.CANDIDATE_LIMIT` |
| Evidence text sent to Ollama | 6000 characters | `chat.CONTEXT_CHAR_BUDGET` |
| History sent to Ollama | 6 turns, 1000 characters each | `chat.OLLAMA_HISTORY_TURNS`, `chat.OLLAMA_HISTORY_CHARS` |

The frontend keeps the history and context limits in `Frontend/src/lib/chat.ts`,
and its tests fail if they drift from these.

The output cap is sent to both providers: `max_tokens` for Anthropic and
`num_predict` for Ollama. gunicorn (`--timeout 120`) and nginx
(`proxy_read_timeout 120s`) give up on a request after 120 seconds, so a chat call
to Anthropic is capped at 45 seconds with one retry (worst case about 91 seconds).
A timeout becomes the 502 above instead of a proxy error. Background jobs such as
summaries keep the SDK defaults.

## Cost

Every Anthropic turn sends the full transcript context again (up to about 30,000
input tokens). The transcript block is sent as its own first content block with
`cache_control: {"type": "ephemeral"}` (`Backend/tsh/llm.py`), after the fixed
system prompt, so later turns about the same sermon within the cache lifetime
(about 5 minutes) read it from Anthropic's prompt cache at a fraction of the
input price instead of paying for it in full. The history and new message come
after the cached block, so they never break the cache. Switching to another
sermon writes a new cache entry.

## Grounding

- Only PUBLISHED sermons are ever sent to the model, in either mode.
- The model must stay inside the transcripts (or chunks): no invented quotes and
  no outside Bible or general knowledge. With Anthropic it may talk naturally,
  summarize and answer follow-ups, and it must cite times for what a sermon says.
  Off-topic messages are declined with the fixed answer.
- History and transcripts are passed as quoted material that cannot change the
  rules, with angle brackets escaped so they cannot open or close a section.
- Source links are always built on the server from stored data. Cited times not
  in a transcript are dropped (Anthropic); any invented citation declines the
  whole answer (Ollama).
- The shared [TFH-462 hybrid retrieval service](search.md#retrieval-scoring-and-grouping)
  ranks PUBLISHED sermon chunks using sqlite-vec cosine distance plus keyword
  matching. Metadata-only search matches (title, summary, description, speaker,
  series or tags) never choose a chat sermon.

## Code

- `Backend/tsh/chat.py`: request validation, sermon choice, transcript context,
  prompts and citations
- `Backend/tsh/llm.py`: providers, the cached context block and call timeouts
- `Backend/tsh/retrieval.py`: shared
  `retrieve_chunks(query, sermon_id=None, limit=...)`, used to find sermons in
  general chat and evidence for Ollama
- `Frontend/src/lib/chat.ts`: history building and `contextSermonIds`
