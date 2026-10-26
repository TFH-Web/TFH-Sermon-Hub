# Core-flow smoke test and coverage

TFH-542 keeps two browser suites. `npm run e2e` retains the existing mocked
feature tests. `npm run e2e:integration` runs one Chromium journey against real
Flask and SQLite: import a YouTube link, process captions into a Published
sermon, search its stored chunks, and ask a question with a timestamped citation.

## Run the isolated core flow

Install the locked dependencies first:

```sh
cd Backend
poetry install --no-interaction --no-root
cd ../Frontend
npm ci
npx playwright install chromium
```

On macOS/Linux:

```sh
export TFH_E2E_PYTHON="$(cd ../Backend && poetry env info --executable)"
npm run e2e:integration
```

On PowerShell:

```powershell
$env:TFH_E2E_PYTHON = (Resolve-Path ../Backend/.venv/Scripts/python.exe).Path
npm run e2e:integration
```

The suite owns frontend port **5360** and backend port **6200**, binds to
`127.0.0.1`, and refuses to reuse another server. Close a process using either
port before running it; the suite does not stop other processes.

`Backend/e2e/server.py` refuses to run without `TFH_E2E=1` and refuses production
or staging environments. The Playwright configuration supplies that opt-in. The
server creates a new database inside its own temporary directory and runs the
real Alembic migrations, including sqlite-vec. It never reads `testing.cfg`,
loads a developer `.env`, resets an existing database, or uses the shared unit
seed data. The existing-file guard fails before the app is imported.

Only external provider boundaries are fake: YouTube video metadata, caption
downloads, text generation and the 768-dimensional embedding provider. Import,
processing, chunking, storage, vector search, citation verification and API
serialization remain real. The fake chat provider requires the saved caption
text in its evidence prompt. The test checks the source sermon ID, `start_sec`
and timestamped URL, plus stored chunk/vector counts and provider call counts.
Browser API requests pass through the Vite proxy without fulfilled mock
responses. Outbound connections from the fixture process are blocked, and the
browser blocks external embeds, icon and identity requests.

The fixture uses the existing **test-only** role bypass with `TESTING=True` and
`AUTH_TEST_BYPASS=True`; it does not exercise real Entra login or production
authorization. Signed-token and role-matrix tests remain in pytest. This is an
inline processing smoke test (`REDIS_URL=''`); Redis worker/recovery behavior
remains covered by the queue tests. The core flow depends on the real search
and chat stories being present in the tested release candidate.

## Coverage and CI evidence

From `Backend`:

```sh
poetry run pytest --cov=tsh --cov-branch --cov-report=term-missing --cov-report=json:coverage.json --cov-report=xml:coverage.xml --cov-report=html:htmlcov
```

`--cov=tsh` includes application modules that no test imports. JSON and XML
support tooling; `htmlcov/index.html` provides file-level detail. Combined
coverage includes both line and branch opportunities; record line and branch
percentages separately when comparing baselines.

From `Frontend`, `npm run test` includes all `src/**/*.{ts,tsx}`, excluding tests
and type declarations, and produces terminal, HTML, `coverage-summary.json`
and LCOV reports. Files without unit tests remain in the denominator.

Both workflows check out the repository and set up their own runtime and
locked dependencies. The backend and Vitest jobs write coverage summaries and
retain `pytest-coverage` and `vitest-coverage` artifacts for 30 days, including
on test failure when reports exist. The empty separate coverage job is removed.
The normal feature browser job and the separate real-API browser job retain
reports, traces, screenshots and videos from failures for 14 days.

No coverage threshold has been agreed by the team, so these jobs enforce test
success and report coverage without inventing a minimum. Record the measured
release-candidate baseline before proposing floors. A reasonable first proposal
is a line/branch floor just below each measured total, then an increase as
untested application areas get meaningful tests. Approval of the exact floors
is a team decision; no value in this document is an approved gate.
