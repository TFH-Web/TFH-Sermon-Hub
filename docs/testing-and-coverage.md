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
(`**/*.test.{ts,tsx}`) and type declarations (`**/*.d.ts`), and produces
terminal, HTML, `coverage-summary.json` and LCOV reports. CSS and other assets
are not measured. Files without unit tests remain in the denominator.

Both workflows check out the repository and set up their own runtime and
locked dependencies. The backend and Vitest jobs write coverage summaries and
retain `pytest-coverage` and `vitest-coverage` artifacts for 30 days, including
on test failure when reports exist. The empty separate coverage job is removed.
The normal feature browser job and the separate real-API browser job retain
reports, traces, screenshots and videos from failures for 14 days.
The feature browser job downloads the build job's small `dist` artifact for
the production sidebar CSS regression; dependencies are installed separately.

No coverage threshold has been agreed by the team, so these jobs enforce test
success and report coverage without inventing a minimum. Record the measured
release-candidate baseline before proposing floors. A reasonable first proposal
is a line/branch floor just below each measured total, then an increase as
untested application areas get meaningful tests. Approval of the exact floors
is a team decision; no value in this document is an approved gate.

## First measured combined baseline

Measured on 2026-10-25 against local verification commit
`f8cb499` (`review/tfh-542-combined-20261025`): frozen release candidate
`1653e0c`, this TFH-542 repair and the separately preserved TFH-533 search UI.
This measurement predates the final all-PR release integration. Rerun the same
commands on that final candidate before adopting a floor; do not interpret this
table as evidence for untested commits or for a deployed server.

The local environment was Windows, CPython 3.14.0 and Node 24.14.0. Backend
dependencies came from a new Poetry environment using the committed lockfile;
frontend verification used the existing compatible shared development
dependencies, rather than an independent replay of this branch's lockfile.
CI installs locked dependencies on Ubuntu with Python 3.13 and Node 24 and
publishes its own measurements.

| Suite | Result | Lines | Branches | Other measurements |
| --- | --- | --- | --- | --- |
| pytest, all `tsh` | 767 passed; 3 snapshots passed | 92.61% (2257/2437) | 83.65% (609/728) | Combined line/branch coverage 90.55% |
| Vitest, all `src` | 367 passed (32 files) | 62.33% (1013/1625) | 61.05% (787/1289) | Statements 61.45% (1076/1751); functions 53.00% (291/549) |
| Chromium real-API core flow | 1 passed | — | — | Real import, pipeline, vector search and grounded source citation |

The Vitest row was re-measured on `dev` commit `bcd7e3e` (details in
[Vitest baseline on dev](#vitest-baseline-on-dev)). The pytest and Chromium
rows, and the commit and environment described above, apply to those two rows
only.

Production build and the full frontend Biome check also passed. The backend
run emitted existing SQLite connection `ResourceWarning`s on Python 3.14;
these were not turned into coverage exclusions or disabled tests.

For discussion after the final candidate is measured, initial **proposals** are
backend lines 90% / branches 80%, and frontend lines 55% / branches 55%.
These provide a little room below the measured baselines while including untested
files. They are not team-approved and are not enforced in CI. Record the team
decision and the final-candidate measurements before enabling thresholds.

## Vitest baseline on dev

Measured on 2026-10-25 against `dev` commit `bcd7e3e` with no local changes.
The environment was Windows 11, Node 24.13.1, Vitest 4.1.12 and
`@vitest/coverage-v8` 4.1.12, using the dependencies already installed locally
(CI installs the locked set on Ubuntu with Node 24 and publishes its own
numbers). Command, from `Frontend`: `npm run test`. All 32 test files and 367
tests passed.

| Metric | Coverage | Covered/total |
| --- | --- | --- |
| Lines | 62.33% | 1013/1625 |
| Branches | 61.05% | 787/1289 |
| Functions | 53.00% | 291/549 |
| Statements | 61.45% | 1076/1751 |

102 production files are measured. The passing-test count includes the
placeholder `tests/example.test.ts` (`1 + 1`), which covers no source. The first
baseline above counted 279 tests and 50.19% of lines; it was measured on a
different commit, so the difference is not attributed to a single change.

### Exclusions

| Pattern | Reason |
| --- | --- |
| `**/*.test.{ts,tsx}` | Test files are not application code. |
| `**/*.d.ts` | Type declarations contain no executable code. |

Vitest's default coverage exclusion list is empty, so shared test helpers would
count as application code. The `src/test/` helpers from the TFH-629 tests are
not on `dev` yet. Until a `src/test/**` exclusion is added, they will count as
application code once they merge.

### Reviewed and not excluded

- `src/main.tsx` is the application bootstrap. Only the Playwright suites run
  it, so it shows 0% here (8 lines).
- `src/data/aiSearch.ts`, `series.ts`, `speakers.ts` and `users.ts` are one line
  each, and no other file under `src`, `e2e`, `e2e-integration` or `tests`
  imports them on `dev`. (`tags.ts` is imported by `PopularTags.tsx`.) Removing
  them is a separate cleanup.
- `src/lib/polymorphic.ts` and `src/types/aiSearch.ts` hold only types and have
  no executable lines, so they add nothing to the totals.

Together `main.tsx` and the four unused data files are 12 of the 1625 lines.
Excluding them would move the line total by about half a point, so they stay in
the denominator.

### Files with no covered lines

29 files have executable lines and 0% line coverage (line counts in
parentheses). This list is a snapshot of `bcd7e3e`; the HTML report in
`Frontend/coverage/index.html` and the `vitest-coverage` CI artifact are the
live view.

- `src`: `Sermons.tsx` (63), `Series.tsx` (32), `TagsAndMetadata.tsx` (29),
  `Speakers.tsx` (20), `AISearchResults.tsx` (15), `main.tsx` (8),
  `AISearch.tsx` (7), `Notifications.tsx` (3), `authConfig.ts` (3)
- `src/components`: `SearchDateDropdown.tsx` (60), `AISearchPreviewCard.tsx`
  (25), `SermonImportItem.tsx` (20), `SearchFilters.tsx` (6), `SermonCard.tsx`
  (6), `SearchResultCard.tsx` (4), `PopularTags.tsx` (2), `SearchBar.tsx` (2),
  `FilterDropdown.tsx` (1), `SpeakerCard.tsx` (1)
- `src/data`: `aiSearch.ts`, `series.ts`, `speakers.ts`, `tags.ts`, `users.ts`
  (1 each)
- `src/hooks`: `useAISearch.ts` (20), `useAISearchRequest.ts` (6)
- `src/modals`: `NewSeriesModal.tsx` (24), `AddTagModal.tsx` (21),
  `AddSermon.tsx` (6)

`SermonCard.tsx` and `SermonImportItem.tsx` should leave this list when the
TFH-629 component tests merge.

### Frontend floor proposal

The frontend proposal is lines 55% / branches 55%: at least three points below
the measured totals (62.33% and 61.05%), rounded down to a multiple of 5. The
same rule applied to the first baseline gives the earlier 45% / 45%. This is a
proposal for team agreement and is not enforced in CI. Totals will move as
other pull requests merge, so re-measure before the team agrees a floor.

## Browser CI setup time

In [run 40263397199](https://github.com/TFH-Web/TFH-Sermon-Hub/actions/runs/40263397199),
the Playwright job started at 03:18:51 and the test run began at 03:44:09:
**25 minutes 18 seconds elapsed before tests started**. That is setup time,
not evidence that the browser tests themselves needed 25 minutes.

Both browser jobs now use `mcr.microsoft.com/playwright:v1.60.0-noble`, matching
the locked Playwright 1.60.0 package. Microsoft's registry returned HTTP 200
for this tag's manifest when checked on 2026-10-25. The image includes browser
binaries and operating-system libraries, so CI no longer downloads/installs
them with `playwright install --with-deps`. This follows the official
[container CI example](https://playwright.dev/docs/ci#via-containers) and
[Docker guidance](https://playwright.dev/docs/docker), including `--ipc=host`.
The integration job still installs Python 3.13, Poetry and the locked backend
dependencies inside the Ubuntu Noble container.

The mocked suite retains Chromium, Firefox and WebKit, with two CI workers
and one retry. Its tests own separate browser contexts and route-local data;
they do not share the real-API fixture database. The real-API suite retains
one worker and its isolated database. Both jobs have a 15-minute limit and
a 10-minute Playwright run limit to leave time for reports. Failures still
fail CI. Superseded runs are cancelled per workflow and pull request/ref.

Removing repeated browser/OS installation should reduce setup time; image
pulls and dependency installation still take time. A fresh container CI run
must confirm the actual improvement and runtime compatibility. No measured
speedup is claimed yet, and no feature tests or browser projects are skipped.
