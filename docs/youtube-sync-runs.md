# YouTube sync runs

Every channel sync is saved as a sync run, so its state and report can be read
after the request that started it has ended, including when the sync ran on the
Redis worker. Earlier runs are kept: each submission adds a new run with its own
id, and runs are never deleted or overwritten. See
[YouTube imports](youtube-imports.md) for what a sync imports.

All three endpoints are Admin only. Every endpoint sends 401 without a valid
token and 403 for a signed-in user who is not an Admin. Error bodies always
contain `error` and `message`, with the same text.

## States

| State | Meaning |
| --- | --- |
| `queued` | Saved and handed to the queue. Not started yet. |
| `running` | The import is fetching from YouTube and saving sermons. |
| `succeeded` | Finished. `report` and the counts are filled in. |
| `failed` | Finished without a report. `error` says why. |

A run only moves forward: `queued`, then `running`, then `succeeded` or
`failed`. A run can also go straight from `queued` to `failed` when it cannot be
queued, or when it is given up on as lost (see Stale runs).

`succeeded` means the sermons were saved and their caption jobs were started. It
does not mean their captions are done; follow those on the Import / Upload page.
A sermon whose caption job could not be queued is listed in the report's
`queue_failures`, and the run still succeeds.

## Run fields

Run fields are camelCase. Dates are ISO `YYYY-MM-DD`; timestamps are ISO in UTC
without a time zone suffix, the same as a sermon's `processedAt`.

| Field | Meaning |
| --- | --- |
| `id` | The run id. Stable; use it to poll the run. |
| `dateFrom`, `dateTo` | The requested date range, or `null` for an open end. |
| `state` | One of the states above. |
| `createdAt` | When the run was submitted. |
| `startedAt` | When the import began, or `null` if it never started. |
| `finishedAt` | When it succeeded or failed, or `null` while active. |
| `seriesCreated`, `sermonsCreated`, `sermonsUpdated`, `sermonsUnchanged` | The report's counts, or `null` unless the run succeeded. |
| `report` | The full import report, or `null` unless the run succeeded. Only on the detail endpoint. |
| `error` | Why the run failed, or `null`. |

The `report` object keeps its snake_case keys, the same shape a sync has always
returned: `series_created`, `sermons_created`, `sermons_updated`,
`sermons_unchanged`, `skipped_playlists`, `skipped_private`,
`skipped_not_ready`, `skipped_too_long`, `multiple_series`, `unknown_speakers`,
`multiple_speakers` and `queue_failures`. So `sermonsCreated` on the run and
`report.sermons_created` hold the same number.

### Error text

| Starts with | Meaning |
| --- | --- |
| `queue: ` | The job could not be queued, for example `queue: Connection refused` when Redis is down. The run never started. |
| `worker: ` | The run was given up on as lost, for example `worker: no result within 20 minutes`. See Stale runs. |
| anything else | The import itself failed, with its own message, for example `videos: HTTP 500: backendError` or `YOUTUBE_API_KEY is not set`. |

## Start a sync

```text
POST /api/import/youtube
```

The body is optional. `{"from": "2026-09-01", "to": "2026-09-30"}` limits the
sync to videos dated in that range, both ends included. Either date can be
left out or empty.

Every response that saved a run carries its `runId`, and all but 409 carry its
`state`. `queued`, `jobId` and `report` keep the shape they had before runs
were recorded.

### 202: queued on the worker

With `REDIS_URL` set, the sync is sent to the worker and the response returns at
once. The run is `queued`; nothing has been imported yet.

```json
{
  "queued": true,
  "jobId": "1c6a0f0e-6f3b-4d0e-9b53-0e2f3c1a7d21",
  "runId": 4,
  "state": "queued"
}
```

### 200: finished inline

Without `REDIS_URL`, the sync runs inside the request and the response comes
when it has finished.

```json
{
  "queued": false,
  "runId": 1,
  "state": "succeeded",
  "report": {
    "series_created": 0,
    "sermons_created": 2,
    "sermons_updated": 0,
    "sermons_unchanged": 9,
    "skipped_playlists": [],
    "skipped_private": [],
    "skipped_not_ready": [],
    "skipped_too_long": [],
    "multiple_series": [],
    "unknown_speakers": [],
    "multiple_speakers": [],
    "queue_failures": []
  }
}
```

### 400: bad date

No run is saved.

```json
{
  "error": "\"from\" must be a date like 2026-09-01",
  "message": "\"from\" must be a date like 2026-09-01"
}
```

`"from" must be on or before "to"` is sent when the range is backwards.

### 409: a sync is already active

Only one sync runs at a time. If a run is `queued` or `running`, no new run is
saved and the response names the active one, so the page can follow it instead.

```json
{
  "error": "A YouTube sync is already running. Wait for run 4 to finish.",
  "message": "A YouTube sync is already running. Wait for run 4 to finish.",
  "runId": 4
}
```

### 502: the inline sync failed

Only without `REDIS_URL`. The run is saved as `failed` with the reason in its
`error`.

```json
{
  "error": "YouTube import failed: videos: HTTP 500: backendError",
  "message": "YouTube import failed: videos: HTTP 500: backendError",
  "runId": 2,
  "state": "failed"
}
```

### 503: the job queue is unavailable

Redis could not be reached. The run is saved as `failed` with
`error` set to `queue: <reason>`. Try again once Redis is back.

```json
{
  "error": "The job queue is unavailable. Please try again later.",
  "message": "The job queue is unavailable. Please try again later.",
  "runId": 3,
  "state": "failed"
}
```

## Read one run

```text
GET /api/import/youtube/runs/<id>
```

### 200

Returns the run with its full report.

```json
{
  "id": 1,
  "dateFrom": "2026-09-01",
  "dateTo": null,
  "state": "succeeded",
  "createdAt": "2026-10-20T06:49:24.744828",
  "startedAt": "2026-10-20T06:49:24.746437",
  "finishedAt": "2026-10-20T06:49:24.746941",
  "seriesCreated": 0,
  "sermonsCreated": 2,
  "sermonsUpdated": 0,
  "sermonsUnchanged": 9,
  "report": {
    "series_created": 0,
    "sermons_created": 2,
    "sermons_updated": 0,
    "sermons_unchanged": 9,
    "skipped_playlists": [],
    "skipped_private": [],
    "skipped_not_ready": [],
    "skipped_too_long": [],
    "multiple_series": [],
    "unknown_speakers": [],
    "multiple_speakers": [],
    "queue_failures": []
  },
  "error": null
}
```

A failed run has `"report": null`, `null` counts and its `error`:

```json
{
  "id": 2,
  "dateFrom": null,
  "dateTo": null,
  "state": "failed",
  "createdAt": "2026-10-20T06:49:24.747843",
  "startedAt": "2026-10-20T06:49:24.748145",
  "finishedAt": "2026-10-20T06:49:24.748793",
  "seriesCreated": null,
  "sermonsCreated": null,
  "sermonsUpdated": null,
  "sermonsUnchanged": null,
  "report": null,
  "error": "videos: HTTP 500: backendError"
}
```

### 404

```json
{
  "error": "Sync run with id 99 not found",
  "message": "Sync run with id 99 not found"
}
```

## List recent runs

```text
GET /api/import/youtube/runs
```

Runs come newest first, with their counts but without `report`, which can list
hundreds of skipped videos. Open a run by id for its report.

### 200 without `page`

Returns a plain array of the 20 most recent runs.

```json
[
  {
    "id": 4,
    "dateFrom": null,
    "dateTo": null,
    "state": "queued",
    "createdAt": "2026-10-20T06:49:24.750747",
    "startedAt": null,
    "finishedAt": null,
    "seriesCreated": null,
    "sermonsCreated": null,
    "sermonsUpdated": null,
    "sermonsUnchanged": null,
    "error": null
  },
  {
    "id": 3,
    "dateFrom": null,
    "dateTo": null,
    "state": "failed",
    "createdAt": "2026-10-20T06:49:24.749693",
    "startedAt": null,
    "finishedAt": "2026-10-20T06:49:24.749939",
    "seriesCreated": null,
    "sermonsCreated": null,
    "sermonsUpdated": null,
    "sermonsUnchanged": null,
    "error": "queue: Connection refused"
  }
]
```

### 200 with `page`

`page` and `pageSize` follow the [pagination contract](pagination-contract.md).
`pageSize` defaults to 20 here and is capped at 100. `runs` is the alias for
`items`.

```text
GET /api/import/youtube/runs?page=1&pageSize=1
```

```json
{
  "items": [{ "id": 4, "state": "queued", "...": "same fields as above" }],
  "runs": [{ "id": 4, "state": "queued", "...": "same fields as above" }],
  "total": 4,
  "page": 1,
  "pageSize": 1,
  "page_size": 1,
  "totalPages": 4,
  "total_pages": 4
}
```

### 400

A bad `page` or `pageSize` gets the pagination contract's JSON 400, for example
`{"error": "Invalid page parameter", "message": "Invalid page parameter"}`.

## Stale runs

A worker can die, or RQ can kill a job that passes its 15 minute timeout, and
then nothing comes back to finish the run. Without a rule, that run would block
every later sync with 409. So each submission first checks the active run:

- A run `running` for more than 20 minutes since `startedAt` (the job timeout
  plus a 5 minute margin) is set `failed` with
  `worker: no result within 20 minutes`.
- A run `queued` for more than 24 hours since `createdAt` is set `failed` with
  `worker: no result within 1440 minutes`. Queued runs get much longer because
  a sync shares the queue with sermon caption jobs and can wait behind many of
  them after a big import.

After that the new sync is accepted as usual. If the old job does turn up
later, it sees its run is no longer `queued` and does nothing, so two imports
never overlap.

## Frontend guide

This is the contract the Import / Upload page (TFH-535) builds on.

### Accepted is not finished

Check the status code first, then `state`:

| Response | What it means | What to show |
| --- | --- | --- |
| 202, `queued: true`, `state: "queued"` | Accepted. The import has not run yet. | "Sync queued", then poll the run. Do not show counts. |
| 200, `queued: false`, `state: "succeeded"` | Finished inline. `report` is final. | The result pop-up, as today. |
| 409 | Another sync is active. | Say a sync is already in progress, then poll `runId`. |
| 502 | Finished inline and failed. | The `message`. The run is already `failed`. |
| 503 | Could not be queued. The run is already `failed`. | The `message`, and let the admin try again. |

A sync is finished only when its state is `succeeded` or `failed`. Both
`queued` and `running` mean it is still going.

### Polling a queued sync

After a 202 or 409, poll `GET /api/import/youtube/runs/<runId>` every few
seconds until `state` is `succeeded` or `failed`:

- `succeeded`: show the result from `report`, which has the same snake_case
  shape as the inline 200 report, so the existing result pop-up can render it.
- `failed`: show `error`. A `queue:` error means Redis was down; a `worker:`
  error means the worker was lost; anything else came from the import.

Stop polling on 404, which means the run id is wrong. Because the run id is
stable, the page can keep it (for example in the URL or local storage) and
resume polling after a reload. `GET /api/import/youtube/runs` gives the latest
runs, so on load the page can also check whether the newest run is still
`queued` or `running` and pick it up.

### Keys

Run fields are camelCase (`runId`, `sermonsCreated`, `finishedAt`). Report keys
are snake_case (`sermons_created`, `skipped_private`), the same as the inline
report. Do not convert one into the other.

## Review

Tests are in `Backend/tests/test_sync_runs.py` and use a fake import and
fakeredis, so no YouTube access or Redis server is needed. Run them with
`poetry run pytest tests/test_sync_runs.py` from `Backend`.
