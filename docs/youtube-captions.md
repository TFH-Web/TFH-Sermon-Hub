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
each result before starting another. It does not schedule future batches.

## Review

Run `poetry run pytest` from `Backend`. Caption and backfill tests use fake
credentials and mocked downloads, so no live YouTube access is needed.

For a live check, use a video the configured account can manage. Fetch captions
from its sermon page, verify full text and timestamp links, then reload the page
to confirm persistence. Sermon list responses omit captions; the detail page
loads them from `/api/sermons/<id>/transcript`.

Chunking, embeddings, and summary generation remain separate follow-up work.
