# System test artifacts: run for record, November 2026

Evidence for the TFH Sermon Hub System Test Report (Team NekOS). Every case was
tested on revision `cbb113604c4699cb27f2bc5e40a8489f0ff241c2` (`cbb1136` on `dev`),
whose application code is identical to the production release `bcbfc66`.

Test scripts are in the repository at that revision:
<https://github.com/TFH-Web/TFH-Sermon-Hub/tree/cbb113604c4699cb27f2bc5e40a8489f0ff241c2>

| Scripts | Path |
| --- | --- |
| Backend (pytest) | `Backend/tests/` |
| Frontend unit and component (Vitest) | `Frontend/src/**/*.test.ts(x)`, `Frontend/tests/` |
| Browser (Playwright, mocked API) | `Frontend/e2e/` |
| Real Flask smoke (Playwright) | `Frontend/e2e-integration/` |

## Layout

One folder per test case, `ST01` to `ST13`.

- `STxx/from-report/`: the screenshots and logs each case's tester recorded, as they
  appear in the report's figures (file names follow the figure captions).
- `STxx/STxx-log.txt` and `STxx-log.png`: terminal log of a command-line run, with the
  revision, tester, date, time and exit code in its header.
- `STxx/STxx-report.png` and `STxx/playwright-report/index.html`: Playwright HTML
  report for that run. Open `index.html` in a browser for the full per-test results.

## Contents by case

| Case | Tester | In this folder |
| --- | --- | --- |
| ST01 Sign in by role | Givin Yang | Report screenshots; Playwright log and report (Nov 22, 2026, 9:48 PM PST, 3/3, exit 0) |
| ST02 YouTube link import | Givin Yang | Report screenshots; Playwright log and report (Nov 22, 2026, 9:48 PM PST, 14/14, exit 0) |
| ST03 Transcript and timestamps | Givin Yang | Report screenshot; Playwright log and report (Nov 22, 2026, 9:48 PM PST, 27/27, exit 0) |
| ST04 Search, filters and paging | Givin Yang | Report screenshot; Playwright log and report (Nov 22, 2026, 9:49 PM PST, 18/18, exit 0) |
| ST05 Chat with citations | Louson Duong | Report screenshots and pytest log |
| ST06 Metadata and summary editing | June Paulino | Report screenshots and pytest log |
| ST07 Safe sermon deletion | June Paulino | Report screenshots and pytest log |
| ST08 Dashboard data and refresh | Nicole Espinoza | Report screenshots (manual test) |
| ST09 Series creation and validation | Malakai Saechao | Report screenshots (manual test) |
| ST10 Tags and associations | Malakai Saechao | Report screenshots. `ST10-log.*` is a retest of `Backend/tests/test_tag_names.py` run by Givin Yang (Nov 22, 2026, 9:49 PM PST, 30/30, exit 0), not Malakai's original run |
| ST11 Speakers and library navigation | Jack Caycedo | Report screenshots |
| ST12 AI labels and calendar dates | Samip Gurung | Report screenshots, Playwright, Vitest and pytest logs |
| ST13 Administrative feature boundaries | Griffin Johnson (fix retest: Samip Gurung) | Report screenshots and Playwright and Vitest results |
