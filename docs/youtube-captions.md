# YouTube captions

Caption processing saves clean transcript text and source timestamps for the
sermon page. Download or parsing failures preserve previous captions and appear
in the existing processing error and reprocess flow.

## Setup

Configure these values privately in the ignored `Backend/.env` or the worker's
environment:

- `YOUTUBE_OAUTH_CLIENT_ID`
- `YOUTUBE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REFRESH_TOKEN`

Use credentials authorized to manage the source YouTube channel with the
`https://www.googleapis.com/auth/youtube.force-ssl` scope. A public metadata API
key alone cannot download captions. Never commit credentials or database files.

From `Backend`, install dependencies and start the API:

```sh
poetry install
poetry run python up.py
```

Use the shared frontend setup in the main README. On a sermon page, an Admin can
fetch or refresh captions. Saved text, timestamp links, copying, and tag keyword
highlighting are available in the Transcript panel. With `REDIS_URL` configured,
start the existing worker to process queued requests; otherwise they run inline.

## Backfill and retries

Import the library without starting caption jobs for every new sermon:

```sh
poetry run flask --app "tsh:create_app('testing.cfg')" import-youtube --skip-processing
```

Preview and run a limited batch against the configured database:

```sh
poetry run flask --app "tsh:create_app('testing.cfg')" backfill-captions --limit 10 --dry-run
poetry run flask --app "tsh:create_app('testing.cfg')" backfill-captions --limit 10
```

The default limit is 35 attempts, with a maximum of 40 per run. This is a batch
limit, not a daily quota allowance: other YouTube requests share the project's
quota. Processing stops when quota is exhausted or channel authorization needs
attention. After the cause is resolved, rerun to continue; already saved captions
are skipped. To retry other failed sermons, add `--failed-only`.

The command runs synchronously even when Redis is configured so it can inspect
each result before starting another. It does not schedule future batches: nothing
runs again until an admin runs it.

The last line of a run is `attempted: N; succeeded: S; failed: F; remaining: R`.
`remaining` is how many eligible sermons this run did not reach, so a run that ends
at the limit (or at a quota or sign-in stop) says how much is left, and a limit stop
prints `Limit reached` as a reminder to run it again. If the quota breaker (below) is
open when the command starts, it prints `Paused:` with the resume time, exits 0 and
changes no sermon. `--dry-run` shows the same warning as a `Note:`.

## Daily quota breaker

YouTube resets the project's daily quota at midnight Pacific time. When YouTube
refuses a caption request because that quota is used up (`quotaExceeded`,
`dailyLimitExceeded`), the app saves a block in the `caption_quota` table until the
next midnight in `America/Los_Angeles`, daylight saving included.

While the block lasts, every caption download fails immediately without calling
YouTube. This covers API imports, reprocessing, `backfill-captions` and RQ workers,
and it survives restarts because it is stored in the database. The sermon is saved
as Failed with a message such as `YouTube quota exceeded; no caption requests are
sent until 2026-10-20 00:00 PDT, then reprocess`. Nothing saved is lost. Reprocess
the sermon after that time; `backfill-captions` picks quota failures up again on its
own.

Short rate limits (HTTP 429, `rateLimitExceeded`), permission errors and missing
captions do not open the breaker. To clear a block early, for example after Google
approves a quota increase, set `blocked_until` to `NULL` in the configured database:

```sh
sqlite3 instance/testing.db "UPDATE caption_quota SET blocked_until = NULL"
```

## Renewing the YouTube sign-in

A caption failure that starts with `YouTube sign-in expired, refresh the token` means
Google no longer accepts the saved sign-in. The label in parentheses says why:

- `(invalid_grant)`: the refresh token expired or was revoked. A common cause is a
  Google Cloud consent screen left in Testing, where refresh tokens expire after 7 days.
- `(token refresh failed)`: Google rejected the renewal for another reason, often a
  wrong or changed OAuth client ID or secret.

To fix it:

1. For `(token refresh failed)`, check that `YOUTUBE_OAUTH_CLIENT_ID` and
   `YOUTUBE_OAUTH_CLIENT_SECRET` match the OAuth client in the Google Cloud project.
2. Signed in as a user who manages the TFH channel, create a new refresh token for
   that client with the `https://www.googleapis.com/auth/youtube.force-ssl` scope.
3. Set `YOUTUBE_OAUTH_REFRESH_TOKEN` in `Backend/.env` and in the worker's
   environment, then restart the API and the worker.
4. Retry the failed sermons:

```sh
poetry run flask --app "tsh:create_app('testing.cfg')" backfill-captions --failed-only
```

`backfill-captions` stops at the first sign-in failure instead of trying every
sermon. The message never includes the token, so it is safe to copy into a ticket.
Do not paste a token itself into tickets or chat.

If the message says `permission denied` instead, the sign-in works but the account
cannot manage captions on this channel. A new token will not fix that; check the
account's channel access.

## Turning captions off

Set `CAPTIONS_ENABLED=false` in `Backend/.env` and in the worker's environment, then
restart the API and the worker, to stop all caption downloads. This is useful while the
daily quota is used up or the sign-in is being renewed. Leave it unset, blank or `true`
for normal operation. Accepted values are `true`/`false`, `yes`/`no`, `on`/`off` and
`1`/`0`, in any case. Any other value stops the app from starting.

While captions are off:

- Importing from YouTube (the Import page, single video links and `import-youtube`)
  still works, and nothing calls the captions API.
- A sermon that already has a transcript keeps it and still processes and publishes.
- A sermon with no transcript is saved as Draft with the message
  `fetch_transcript: captions are turned off (CAPTIONS_ENABLED is false); ...`. It is
  never published without a transcript.
- `backfill-captions` refuses to run. `--dry-run` still works.

To turn captions back on, set the value to `true` (or remove it), restart, then
reprocess the draft sermons or run `backfill-captions`.

## Review

Run `poetry run pytest` from `Backend`. Caption and backfill tests use fake
credentials and mocked downloads, so no live YouTube access is needed.

For a live check, use a video the configured account can manage. Fetch captions
from its sermon page, verify full text and timestamp links, then reload the page
to confirm persistence. Sermon list responses omit captions; the detail page
loads them from `/api/sermons/<id>/transcript`.

Chunking, embeddings, and summary generation remain separate follow-up work.
