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
./run.sh
```

`up.py` updates the database schema; `./run.sh` starts Flask. Restart the API and
any configured Redis worker after changing credentials or processing settings.

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

## Scheduling the backfill

The command above runs once and schedules nothing else, so clearing a large
backlog (for example, importing years of archived sermons) means someone
running it by hand every day. On the staging droplet, that's instead a
systemd timer: `deploy/tfh-staging-caption-backfill.timer` fires
`deploy/tfh-staging-caption-backfill.service` daily, shortly after the
midnight-Pacific quota reset, at `--limit 40` (the command's own per-run
cap). It runs at 00:10 in `America/Los_Angeles`, plus up to 15 minutes of
jitter, including daylight-saving changes. The 40-attempt bound is not a
separate daily allowance: imports and other requests share the same quota,
and the existing quota breaker can stop a batch earlier.

The unit files are deployment templates, not evidence that the timer is
installed or that any captions have been downloaded. Before enabling them,
confirm the authorized OAuth connection, caption switch, embedding model and
answer provider are ready. Coordinate the daily batch with the staging owner;
avoid other manual backfill runs against the same library. Install the units
from the reviewed release, following
[deploying.md](deploying.md#5-install-separate-services-and-private-nginx-site):

```bash
install -o root -g root -m 0644 "$release/deploy/tfh-staging-caption-backfill.service" /etc/systemd/system/
install -o root -g root -m 0644 "$release/deploy/tfh-staging-caption-backfill.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tfh-staging-caption-backfill.timer
```

To track progress: each run's `attempted/succeeded/failed/remaining` line
lands in the journal:

```bash
journalctl -u tfh-staging-caption-backfill.service --since -7d
```

`remaining` counts eligible sermons not reached by that batch; it does not
count every sermon missing captions. Other failed records and invalid video
links can be excluded, so `remaining: 0` alone does not prove the whole library
is complete. Read each `failed` result and resolve or assign those records.
After repair, preview a small `--failed-only --dry-run` batch before retrying.

Check the real library counts without changing the database:

```bash
sudo -u tfh-staging sqlite3 -readonly /var/lib/tfh-staging/sermonhub.sqlite3 \
  "SELECT COUNT(*) AS total, SUM(CASE WHEN NULLIF(TRIM(transcript), '') IS NOT NULL THEN 1 ELSE 0 END) AS with_transcript, SUM(CASE WHEN NULLIF(TRIM(transcript), '') IS NULL THEN 1 ELSE 0 END) AS missing_transcript FROM sermon;"
systemctl list-timers --all tfh-staging-caption-backfill.timer
systemctl show tfh-staging-caption-backfill.service -p Result -p ExecMainStatus
```

The backlog's 444 imported sermons is a planning snapshot; record the actual
total at activation and after each daily run. Record the release, date, next
timer time, attempted/succeeded/failed counts and remaining missing transcripts
in the TFH-671 handoff. A saved transcript is separate from completed AI
processing and publication.

A failed unit can mean missing configuration, captions disabled, an OAuth or
permission failure, an unexpected error or a service timeout; inspect the journal
instead of treating every failure as an expired token. Quota pauses return 0
and should be recorded as paused, not as a successful completed batch.
To pause future runs, use `systemctl disable --now tfh-staging-caption-backfill.timer`.
This stops scheduling, not an already-running service; let its active work finish
and coordinate any interruption with the operator.

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

See [youtube-token-renewal.md](youtube-token-renewal.md) for how to tell `(invalid_grant)` apart
from `(token refresh failed)`, issue a new refresh token, and roll it out everywhere it's
configured.

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
