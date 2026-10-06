# YouTube captions

The required transcript step downloads the channel's captions, saves clean text
and source cue times, and reports failures through the existing reprocess flow.
TFH-459 covers this step; TFH-460 supplies chunking and embeddings.

## Configuration

Use the OAuth Desktop client credentials already authorized as the TFH YouTube
channel. Put these values in the ignored Backend/.env or the worker's environment:

- YOUTUBE_OAUTH_CLIENT_ID
- YOUTUBE_OAUTH_CLIENT_SECRET
- YOUTUBE_OAUTH_REFRESH_TOKEN

The scope is https://www.googleapis.com/auth/youtube.force-ssl. Access tokens
refresh in memory through google-auth and are sent in the Authorization header.
Never commit credentials or log token responses. The public metadata API key
is separate.

From Backend, run:

    poetry install
    poetry run python up.py

Reprocess an existing sermon through the Admin action or
POST /api/sermons/<id>/reprocess. With REDIS_URL set, run the existing worker;
otherwise processing runs inline. The endpoint returns 202; inspect the sermon's
status and processingError for the result.

## Verified caption access

The TFH-490 spike verified video F_OiCiZ3Y3Y on October 6, 2026:

- Access: OAuth Desktop client, signed in as the TFH brand account, as reported by
  the teammate who authorized it. The API identified the authorized channel as
  The Father's House, UCua-IeYiJ1LiNQ6ydGZbIaw.
- Requested scope: https://www.googleapis.com/auth/youtube.force-ssl.
- The refresh grant succeeded.
- captions.list returned HTTP 200 with one serving English ASR track and no manual track.
- captions.download with tfmt=vtt returned HTTP 200 and 349,872 bytes of actual
  WEBVTT, including 2,027 timed cues, per-word markup and rolling display repeats.
- The downloaded sample parses into 1,014 clean segments and 36,743 characters.
  Source cue times span 0.240 to 2306.079 seconds.
- A fresh run through the implemented pipeline also returned 200 for both calls,
  saved the text and segments in a disposable database, reloaded them in a new
  session, and passed those stored segments to the embedding step.

An API-key-only download returned 401. The teammate's personal-account attempt
returned 403. Channel authorization is required for the verified download route.

## Caption and chunking contract

tsh.captions.get_transcript(video_id) returns clean segments:

    [{"start": 0.24, "end": 3.429, "text": "Good morning. Good morning."}]

Times are seconds from the video start. Select a serving caption track in
YOUTUBE_CAPTION_LANGUAGE (default en), allowing regional variants. Prefer manual
captions, then ASR. Skip drafts, pending or failed tracks, forced tracks, and other
languages. No machine translation is requested.

The parser strips markup, decodes entities and normalizes whitespace. ASR cues
discard carried display lines and short hold cues. Repeated words within speech
and new lines with fresh word timestamps are retained. Manual cues are not
deduplicated. Segments keep the original cue start and end times.

fetch_transcript saves Sermon.transcript and the JSON Sermon.transcript_segments
together. The embedding step receives that sermon after the commit and must chunk
its stored segments to preserve citation times. Persisting the segments keeps the
times available across worker restarts and retries. The website reads text and
times from GET /api/sermons/<id>/transcript; library responses do not include the
cue list. Readers have the same access requirements as the sermon itself.

The sermon's Transcript panel shows full text or source timestamp links, copies
the saved text, and offers Admins a Refresh captions action. Refresh uses the
existing reprocess endpoint. Queued runs update the panel when processing finishes,
and failures show the saved processing error while retaining the previous text.

A failed download or parse preserves the previous transcript and segments, marks
the sermon Failed, and prevents chunking. The existing reprocess endpoint retries
after an admin fixes the cause.

## Quota and renewal

Google's [list method](https://developers.google.com/youtube/v3/docs/captions/list)
costs 50 quota units; its
[download method](https://developers.google.com/youtube/v3/docs/captions/download)
costs 200. At the current project's 10,000 daily units, that permits about 40
sermons per day before other YouTube requests. The 444-sermon backfill needs a
quota increase or at least 12 daily quota windows. Quota failures require reprocess
after quota becomes available; this implementation does not schedule the backfill.

The current refresh token is expected to expire around October 13, 2026 while
the OAuth app remains in Testing. An invalid_grant processing error means the
channel maintainer needs to supply a new refresh token. Replace it in the
environment, restart the worker, and reprocess the failed sermon.

## Validation

Tests use fake credentials and mocked HTTP. They cover google-auth refresh and
Bearer authorization, bounded 401 retries, track selection, VTT cleanup, safe
errors, JSON migration persistence, and failure/reprocess recovery in inline and
fakeredis queued modes.

Chunking and summary are still placeholders on this branch; successful caption
validation does not establish search or summary quality.
