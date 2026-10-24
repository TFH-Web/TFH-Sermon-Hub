# YouTube imports

Imports bring sermons in from the TFH YouTube channel, either one video at a
time from a link or many at once with a sync. Each import saves the sermon's
details and then starts processing, which fetches its captions. See
[YouTube captions](youtube-captions.md) for that step.

## Setup

Put these values privately in the ignored `Backend/.env`:

- `YOUTUBE_API_KEY`
- `YOUTUBE_OAUTH_CLIENT_ID`
- `YOUTUBE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REFRESH_TOKEN`

The API key reads the channel's public data and is what creates sermons. The
three OAuth values let processing download captions; without them a sermon is
still imported, but ends up Failed with the reason. The OAuth values are provided
in the team's Discord chat. Never commit any of these values or paste them into
an issue or PR.

The README's "Importing from YouTube" section explains how to create the API key
and lists the other settings, such as the channel, the playlists to ignore and
the 60-minute limit. They default to the TFH channel, so nothing else has to be
set.

Every import action is Admin only. From `Backend`, install dependencies and bring
the database up to date, then start the API with `run.bat` or `./run.sh`:

```sh
poetry install
poetry run python up.py
```

Use the shared frontend setup in the main README. With `REDIS_URL` configured,
start the existing worker so imports are processed in the background; otherwise
they run inside the request.

## Import one sermon from a link

Open the Upload Sermon modal from the Upload button in the header, the + button
on the Sermons page, or the upload area on the Import / Upload page. Paste a link
and press Import & Process.

Three kinds of link are accepted, with or without `https://`:

- `youtube.com/watch?v=...`
- `youtu.be/...`
- `youtube.com/shorts/...`

Anything else is rejected under the field before a request is sent. After the
import, the modal fills in Sermon Title, Speaker, Series, Date and Description
from the video. Those fields are read-only for now: there is no endpoint to
update a sermon, so edits could not be saved.

The import is refused, with the reason shown under the link, when the video is
private, deleted or missing, is still streaming, or is longer than
`YOUTUBE_MAX_MINUTES`. Importing a video a second time changes nothing and says
it was already imported.

A single link is not matched to its playlists, so its series comes only from the
title. The next sync links it to its playlist.

## Sync the channel

On the Import / Upload page, open Bulk Import, leave Import Source on YouTube
Channel, and press Sync from YouTube. Each playlist becomes a series and each
video a sermon. The other two sources are not implemented and show Unavailable.

Date Range is optional. With it, only videos dated inside the range are imported,
both ends included. Either date can be left empty. The date is the video's
publish date in `YOUTUBE_TIMEZONE`, the same date the sermon is saved with.

Leaving both dates empty syncs the whole channel, which is about 444 sermons and
a caption request for each. That can use up the day's caption quota, so prefer a
short range, especially when testing.

While a sync is queued or running it shows first in Active Imports as a YouTube
Library Import, and the sync form is locked, even when another admin started it.
The page checks every 5 seconds for up to 10 minutes, then shows a Check status
button.

When the sync ends, a pop-up reports the range and the result: how many series
and sermons were created, updated or left unchanged, and a list of anything
skipped or needing attention, such as private videos, videos over the length
limit, and titles with no recognisable speaker. A failed sync shows why instead.
Every sync is saved, so after a reload or after leaving the page it is listed in
Sync History on the Import History tab, and clicking its title opens the same report.

Syncing again is safe. Videos already imported are matched by their YouTube id,
and only their length, date and link are updated. Titles, descriptions, speakers,
tags, transcripts and summaries edited by an admin are left alone.

## Following imports

The Import / Upload page lists sermons by status:

- Active Imports: still processing, led by any sync that is queued or running
- Import History: finished, next to Sync History, the finished syncs
- Failed Imports: processing hit an error

The lists refresh every few seconds while anything is processing. A failed row
shows the error that was saved and, for Admins, a Retry button that runs
processing again. Use it after the cause is fixed, for example once caption
credentials are set or the daily quota has reset.

## API and command line

The site uses these endpoints, all Admin only:

- `POST /api/import/youtube/video` with `{"url": "..."}` imports one video.
- `POST /api/import/youtube` syncs the channel. An optional body,
  `{"from": "2026-09-01", "to": "2026-09-30"}`, limits it to a date range.
- `GET /api/import/youtube/runs` lists recent syncs, and
  `GET /api/import/youtube/runs/<id>` returns one with its report.
- `POST /api/sermons/<id>/reprocess` runs processing on a sermon again.

Each sync is saved as a run with its state and report. See
[YouTube sync runs](youtube-sync-runs.md) for the responses, the run states and
how the frontend should follow a queued sync.

The whole channel can also be imported from `Backend`. This has no date range:

```sh
poetry run flask --app "tsh:create_app('testing.cfg')" import-youtube
poetry run flask --app "tsh:create_app('testing.cfg')" import-youtube --skip-processing
```

`--skip-processing` saves the sermons as drafts without starting caption jobs.
Drafts do not appear on the Import / Upload page; process them in limited batches
with `backfill-captions`, described in the captions guide.

## Limits

The Import / Upload page reads every sync from its saved run (see
[YouTube sync runs](youtube-sync-runs.md)), which leaves these gaps:

- A sync shows its state, Queued or Running, but no progress bar. The server
  reports counts only when the sync ends, and caption processing is followed per
  sermon, not per sync.
- Checking stops after 10 minutes with a sync still going. Check status starts it
  again. The server gives up on a lost worker itself, after 20 minutes running or
  24 hours queued, and marks the sync failed.
- Reloading the page during a sync that runs inside the request (no Redis) drops
  the request. The sync still finishes on the server and is listed in Sync
  History once it has ended.

Without Redis a sync runs inside the request, about 40 seconds for the full
channel before captions, so use Redis in production to avoid server timeouts.

## Review

Run `poetry run pytest` from `Backend`, and `npm test` and `npm run e2e` from
`Frontend`. Import tests use a fake channel and mocked requests, so no live
YouTube access or API key is needed. Stop a running `npm run dev` before the
Playwright tests, which need to start the frontend in test mode themselves.

For a live check, import a link, confirm the sermon's details and its row on the
Import / Upload page, then sync a one-month range and compare the pop-up's counts
with the sermons that appear.
