# Sprint 9 staging operations: 2026-11-08 UTC

These are observed staging and recovery results. Production launch, real-account
browser acceptance and client sign-off remain pending.

## Release and embedding decision

The active release is `f9a2d83-tfh540-20261108T224455Z` from merged PR #158,
with one migration head, `e602c47a1025`. The persistent library has 450 sermons.
The previous release, `3144d67-tfh540-20261021-2`, remains installed.

Jack's November 8 instruction to finish the outstanding operations resolves the
earlier local-only restriction for **staging embeddings**. Answer generation
remains cloud-pending. The droplet has 4 vCPUs, about 8 GB RAM and over 140 GiB
free disk. No new infrastructure subscription was created.

Installed the official Ollama **0.40.15** Linux release into
`/opt/tfh-embedding/ollama-v0.40.15`. Its archive SHA-256 matched the official
release asset metadata:
`628c018404a4206493efd38e46251c154ede5141b8b8dc85c659b3b027c47379`.
The dedicated `tfh-embedding.service` uses an unprivileged user, CPU execution,
`127.0.0.1:11434`, a two-core CPU quota, a 2 GiB memory ceiling and one concurrent
request. Its only installed model is `nomic-embed-text:v1.5`, digest
`0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`.
See the [service definition](../../deploy/tfh-embedding.service).

The private app environment now sets `OLLAMA_HOST=http://127.0.0.1:11434` and
`EMBEDDING_MODEL=nomic-embed-text:v1.5`. The Python SDK uses `OLLAMA_HOST`;
the legacy `OLLAMA_URL` remains closed and `LLM_PROVIDER=cloud-pending` remains
in place. The previous environment file was saved root-only before the edit.
Only staging API/worker processes were restarted for the configuration change.

## Real processed-data check: TFH-651 and TFH-657

First rehearsed `embed_chunks` against a private SQLite online-backup copy. Then
applied that existing step to **sermon 7**, using its 1,014 saved real timed
caption segments. Both runs produced 21 chunks and 21 valid 768-dimensional
vectors. All 450 existing sermon rows, including status, transcript and summary,
were unchanged. The sample was already Published; this is not evidence that a
new import or a failed pipeline now reaches Published.

The actual semantic retrieval and transcript-search functions returned the
sample with saved timestamps and a video ID. `flask reembed` then exited 0,
reporting zero replacements because every saved vector already used the chosen
model. Every saved chunk records `nomic-embed-text:v1.5`; no chunk lacks a vector.
This is a bounded sample, **not a full-library indexing run**.

Fresh immutable backup:
`sermonhub-20261108T233256778757Z-18bb526d.sqlite3`, SHA-256
`0ccb1909068f3870e98c17f2c0a25368ae0e78684224be6b6ec56fdf8cbf4205`.
Its manifest records 450 sermons, 21 chunks, 21 vectors and revision
`e602c47a1025`. An off-droplet restore with `--require-processed-data` passed:
21 linked vectors, every table/schema/rowid fingerprint matched, manifest and
input unchanged, integrity/foreign keys passed, scratch removed. The Windows
runtime uses SQLite 3.50.4 and sqlite-vec v0.1.9. Complete proof JSON stays in
Jack's private backup vault; no database or transcript is checked into Git.

## Scheduled off-droplet protection: TFH-673

Destination: Jack's Windows workstation, ACL-protected
`C:/Users/Jack/TFH-Backups/`, outside the repository. Eighteen backup pairs were
copied, verified and retained. Retention is 30 days and at least 30 copies as
the vault fills; eighteen copies exist today. An independent private Python
environment runs the verifier, so it does not depend on the checkout's venv.

The source account is `tfh-backup-pull`, with a dedicated key and the forced
command `rrsync -ro /var/backups/tfh-staging`. Arbitrary SSH commands were
rejected. It has no app-group membership and cannot read `/etc/tfh-staging/.env`.
The backup directory is app-owned, group `tfh-backups-read`, mode 0750; only
verified generated DB/manifest pairs receive group read, mode 0640. Unrelated
snapshots and rehearsal folders remain private. A successful nightly backup
triggers `tfh-backup-read-access.service`; the permission helper validates every
candidate before granting access. A fresh post-embedding backup exercised this
hook successfully. See [the helper](../../deploy/backup_read_access.py) and
[service](../../deploy/tfh-backup-read-access.service).

Windows Task Scheduler task **TFH Staging Offsite Backup** runs at **04:00 UTC**
(8 PM PST / 9 PM PDT) and on Jack's sign-in. It starts missed runs when available,
retries failures three times at ten-minute intervals, verifies copies and
rehearses the newest processed-data restore. Manual execution and an actual
scheduler execution both succeeded; the scheduler returned `LastTaskResult=0`.
Its private `last-run.json`, timestamped logs and restore proofs record results.
The droplet's nightly backup remains at 03:15 UTC plus up to 15 minutes jitter.

**Availability limit:** this destination needs Jack's PC powered on, signed in
and online. Runs catch up when available. A permanent always-on church/offsite
host would improve that coverage; no such host or subscription was provisioned.
There is no email/SMS alert integration; task failure codes and private logs
must be monitored by the operator.

Review of PR #159 found that interruption after publishing a manifest prevented
a retry, and already-present DBs were skipped without revalidation. The separate
[PR #161](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/161) allows safe retries, rejects conflicting files,
rechecks existing pairs and suppresses retention after a failure. The installed
workstation tool includes that fix. Its tests passed on Linux: 20/20; Windows:
19 passed and one symlink privilege skip. Permission-helper tests: 5/5 on both.

## Reboot and paired rollback rehearsal: TFH-673

At **23:35 UTC (3:35 PM PST)**, checked the queue was empty, backup jobs were
idle, required units were enabled, SSH/NGINX configuration passed and the
processed-data recovery copy was verified offsite. Stopped staging API/worker
to prevent new work, then performed a full host reboot before the backup window.

The boot ID changed. Staging API/worker, embeddings, Redis, NGINX, backup timer,
SSH and the older public backend all returned active with no failed units.
API and proxied health returned 200, the deep link returned 200, anonymous
sermon access returned 401, and the older public site returned 200. Post-reboot
model-backed retrieval passed with 450 sermons, 21 chunks/vectors and an idle
queue. The backup timer remained active, next run 2026-11-09 03:17:03 UTC when
checked. Loaded embedding service memory was about 637 MiB, below its ceiling.

Separately started the previous release's production factory against a private
restore of its paired pre-migration backup,
`sermonhub-20261108T223654169250Z-57cf9ebc.sqlite3`. Revision `958b50d14869`, 450
sermons, integrity and foreign keys passed; health returned 200 and anonymous
sermon access 401 with testing/auth bypass disabled. Restored bytes were
unchanged and scratch was removed. This rehearses rollback startup with the
paired snapshot; it does not claim a live database rollback or traffic cutover.

## Still required for acceptance

- Tim's Anthropic API key provisioned privately, selected model and approved
  spending limit. Then verify summaries/chat and a real pipeline/recovery flow
  all the way to Published. Existing YouTube configuration was left in place.
- Real Admin, InternalUser and unassigned Microsoft browser/API checks, including
  logout/account switching and timestamp seeking in the actual browser.
- Church DNS/Entra owners for `sermonhub.tfh.org`, HTTPS issuance/renewal and the
  production redirect. The production templates remain prepared, not activated.
- Tim's decision on publishing the Google OAuth app versus a church-owned
  production project, so weekly testing-mode token expiry is resolved.
- Required PR reviews/integration, the admin guide and Tim/Pastor Michael's
  recorded client decision. Infrastructure tests do not provide that approval.
