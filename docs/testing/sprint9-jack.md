# Sprint 9: Jack's acceptance and launch work

Last checked: **2026-11-08 UTC**. This records observed results and remaining
acceptance, not client approval or a production launch.

## November 8 operational completion

See the [dated operations evidence](sprint9-operations-20261108.md) for exact
release, model, backup, recovery and reboot results. The earlier November 7
audit below is retained as a dated baseline.

| Task | November 8 result |
| --- | --- |
| TFH-651 | Private CPU embedding provider installed; real 21-chunk/vector sample passed; `flask reembed` exited 0 and every saved chunk records the selected model. Full-library processing was not run. |
| TFH-657 | Off-droplet processed-data scratch restore passed: 450 sermons, 21 real chunks/vectors, all fingerprints matched, input unchanged, scratch removed. |
| TFH-673 | Scheduled restricted offsite pulls to Jack's workstation; actual scheduler run passed. Full host reboot and previous-release startup against a paired rollback copy passed. Workstation must be on, signed in and online. |
| TFH-640 / TFH-654 | Staging now runs `f9a2d83`; real three-account browser checks and the complete import/recovery/summary/chat flow remain pending. Anthropic setup needs Tim. |
| TFH-645 / TFH-672 / TFH-675 | Production DNS/HTTPS/Entra, admin handoff and actual client approval remain pending. |

PR #157 contains the acceptance/operations tools and evidence. PR #161 targets
PR #159's branch to fix interrupted backup publication and revalidate existing
vault copies. PR #160 records Samip's earlier rollout/caption failure rehearsal;
its no-provider result predates the embedding setup described here.
An [admin guide](../admin-guide.md) is prepared for Louson's review and client
delivery under TFH-674; delivery remains pending.

## Existing work and PR audit

The local work starts from `dev` at `9b98301`. PR #150 is merged into `dev`, and
PR #149 released that work to `main` (`a9bc1b3`). There is no remaining Sprint 8
release merge to repeat.

| Existing work | Status and overlap |
| --- | --- |
| [PR #120](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/120) | Merged: production factory, isolated staging services, backups, full-content scratch restore and the deployment runbook. Reuse these tools. |
| [PR #154](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/154) | Merged November 8: dependency-audit fixes and smoke-test Python pin. |
| [PR #155](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/155) | Open against `main`: player sizing and Delete placement (TFH-659/660). It does not complete Jack's live acceptance or launch work. |
| [PR #156](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/156) | Open: caption timer and token-renewal runbook (TFH-671/669), plus dependency/workflow changes. Reuse that work after review; do not add a second caption timer or renewal guide here. |
| PRs #151, #152 and #153 | Closed without merging at the time of this audit. Their reported automated tests are not live Entra or staging acceptance evidence. |

At the initial November 7 audit, no other reviewed PR implemented TFH-654,
TFH-657, TFH-672 or TFH-675. TFH-532 and its
pagination subtasks are explicitly scheduled for the post-launch backlog and
are outside this Sprint 9 acceptance change.

## Initial November 7 evidence and task status

The November 7 staging checks used the existing authorized SSH connection. No app release,
configuration, DNS record, Entra registration, service, queue or live database
was changed. The restore utility created and removed its isolated scratch copy.

| Task | Observed result | Remaining acceptance |
| --- | --- | --- |
| TFH-640: integrated staging acceptance | API, worker, Redis and NGINX are active. Staging still runs `/opt/tfh-staging/releases/3144d67-tfh540-20261021-2`, not the current Sprint 8 release. `AUTH_TEST_BYPASS=false`. | Deploy a reviewed release, complete TFH-639's provider setup, then collect real roles, import/search/chat, timestamp seeking and failure-recovery evidence. June owns TFH-655, Samip TFH-656 and Malakai TFH-658. |
| TFH-654: real Entra roles | Existing automated auth tests cover the role rules. No current three-account live result is available. | Use the API verification command below and the browser checklist with separate real Admin, InternalUser and unassigned accounts. |
| TFH-657: processed-data restore | The latest nightly backup, `sermonhub-20261107T032310207631Z-f309139c.sqlite3`, passed the existing full-content scratch restore: all 14 table fingerprints matched; input unchanged and scratch removed. It contains **450 sermons, 0 chunks and 0 vectors**. | A fresh backup containing real processed chunks/vectors must pass the new `--require-processed-data` check. The empty-vector rehearsal does not close this task. |
| TFH-645: production readiness | The existing nightly backup timer is enabled and its most recent service result is success. AI remains `LLM_PROVIDER=cloud-pending`, with an empty LLM model and `EMBEDDING_MODEL=cloud-pending`. | Satisfy TFH-640 and the launch checks below. Samip owns scheduled off-droplet copies/reboot/rollback (TFH-673); Louson owns the admin guide (TFH-674). |
| TFH-672: DNS, HTTPS and production Entra | `sermonhub.tfh.org` returned DNS name-not-found; HTTPS could not resolve the host. | Review and apply the [production launch procedure](../production-launch.md), then record DNS, certificate renewal and real production sign-in results. The prepared templates have not been installed. |
| TFH-675: client acceptance | No client acceptance meeting or recorded approval was found in the reviewed evidence. | Run the [client acceptance agenda](sprint9-client-acceptance.md) and record Tim's and Pastor Michael's actual decisions. |

The recovery proof's input and restored SHA-256 values both equal
`db4c486624246030de9fa61583f9aeec42c6291fe460c022c4f2dc5cea49a55f`.
Its SQLite/sqlite-vec versions are `3.46.1` / `v0.1.9`; its saved migration
revision is `958b50d14869`. These identify the old backup, not current-release
migration or processed-data acceptance. Keep complete proof JSON private.

## TFH-654: real-account role checks

After the intended release is deployed, each tester signs in using their own
assigned Microsoft account at the approved staging URL. Follow the existing
[SSH access instructions](../deploying.md#open-private-staging-now). Never enable
development authentication bypasses for this check.

Record the browser checks separately:

| Account category | Required browser result |
| --- | --- |
| Admin | Microsoft sign-in succeeds; library/deep-link reload works; Admin and edit/delete controls are visible. |
| InternalUser / Internal User | Microsoft sign-in and reading work; Admin/edit/delete controls are hidden; direct `/upload` navigation is denied. |
| Unassigned | Entra may deny app assignment, or the app displays the no-staff-role denial; saved sermon data is inaccessible. |
| Account switch / logout | Signing out protects a reloaded deep link; the next account cannot see the previous account's cached data. |

For repeatable API evidence, put each tester's **API access token** in a separate
private local file outside Git. Use the token for the API's configured audience
and delegated scope, not an ID token or Graph token. Do not put tokens in shell
arguments, screenshots, this document or Jira. Files should be readable only by
their owner; remove them after the check. Run locally, from the repository root:

```powershell
& Backend/.venv/Scripts/python.exe deploy/verify_roles.py `
  --base-url http://localhost:5173 `
  --admin-token-file C:/private/admin-access-token `
  --staff-token-file C:/private/staff-access-token `
  --unassigned-token-file C:/private/unassigned-access-token
```

The tool checks authenticated reads, anonymous denial and Admin-only create/edit
guards. Create probes send a JSON array, which the reviewed API rejects before
writing; edit probes use ID 0 with the same invalid payload. Expected Admin
responses are 422/404, while staff and unassigned responses must be **403**.
A 401, redirect, network error or unexpected status fails the relevant check.
The output contains status codes and categories, not tokens, account claims or
saved sermon content. It refuses credential-bearing URLs, redirects and public
plain-HTTP origins.

If Entra blocks an unassigned account before issuing an API token, record that
browser result directly. Do not fabricate a token to make the API tool run.
Successful API output alone does not establish browser sign-in or UI acceptance.

## TFH-657: require a representative processed backup

Coordinate one approved real-data processing flow with the feature owners after
their provider setup is complete. Verify the sample's transcript, configured
embedding model and published/search/chat behavior first. Select a new immutable
backup and paired manifest using the existing backup procedure.

With the reviewed updated utility and the release's Python environment:

```bash
python deploy/recovery_check.py \
  --backup /private/backups/<exact-backup-name>.sqlite3 \
  --scratch-parent /private/recovery-scratch \
  --require-processed-data
```

The additional gate requires nonempty chunks and vectors, links each vector to
its saved chunk/sermon, and requires recorded embedding models. The existing
full-content comparison still verifies every table, schema and rowid in a
scratch restore. It never replaces the running library or invokes a provider.
Record the source release, backup date, proof JSON and `processed_data_required:
true`. The flag proves data presence/integrity; the operator still identifies
which approved real provider/data produced the backup. Synthetic test fixtures
are not live provider evidence.

## Completion record

Publication verification on **2026-11-08**:

- The complete repository backend suite passed: **1,166 tests and 3 snapshots**.
  An existing ignored local launcher and its tests are outside the published
  checkout; that local-only test file was excluded to match CI's file set.
- Deployment utilities passed: **51 tests, 1 Windows symlink-permission skip,
  10 subtests**. This includes a real loopback HTTP redirect test confirming the
  verifier never follows a redirect with a bearer token.
- CI now discovers the whole `deploy` test directory, including the new role
  verifier tests.
- Both production NGINX templates parsed successfully with Ubuntu NGINX 1.28.3,
  disposable test ports and a generated test certificate. This is a syntax check,
  not production certificate issuance or server activation.
- Ruff, local documentation links, the renewal hook's Linux shell syntax, and
  whitespace checks passed.

The existing CI fixes from [PR #154](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/154)
are retained in their original commits as a prerequisite for publishing this
branch. Review/merge that dependency first. The acceptance verification and
launch preparation are a separate change; live task completion remains pending.

Local verification on 2026-11-07:

- `Backend/.venv/Scripts/python.exe -m pytest deploy -q`: **50 passed, 1 skipped,
  10 subtests passed**. The skip is the existing Windows symlink-permission case.
- From `Backend`, `.venv/Scripts/python.exe -m pytest tests/test_role_verifier.py
  tests/test_auth.py tests/test_production.py -q`: **57 passed**. The new API
  integration test verifies that the permission probes leave saved library
  records unchanged.
- Ruff passed for the new Python files; `git diff --check`, local Markdown file
  links and the renewal hook's Linux shell syntax check passed.

These tests use synthetic local fixtures and do not establish live Entra or
client acceptance. The NGINX configurations are prepared templates; server
`nginx -t`, certificate issuance and renewal remain part of the reviewed cutover.

For each live result, record the UTC date, deployed commit, account category or
approved sample ID, expected/actual outcome and evidence reference. File an
observed failure as a bug after review. Update a task to Done only when its own
live acceptance is satisfied. A green unit/browser suite, healthy services, a
template or an empty-vector restore does not establish client sign-off.
