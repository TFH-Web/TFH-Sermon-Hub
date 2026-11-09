# Sprint 9 staging operations: 2026-11-08 UTC

These are observed staging and recovery results. Production launch, real-account
browser acceptance and client sign-off remain pending.

**Current backup status:** the personal-workstation schedule has been removed,
its server key revoked and its pull account disabled. Server backup permissions
are private again and the automatic read-access hook is disabled. Server nightly
backups continue. An approved destination for recurring offsite copies is still
required; TFH-673 is In Progress. The copy/restore trial below is historical evidence.

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
The updated preparation helper accepts only this approved loopback endpoint
and model (or the original disabled endpoint), preserving existing private
settings on a redeploy. Its validation passed against the actual server file
without changing it. Reviewed utilities are also installed separately under
`/opt/tfh-staging/tools/acceptance-6c4a65a/deploy/` until a new app release includes
them; the active `f9a2d83` source was not edited.

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

## Off-droplet copy trial and withdrawal: TFH-673

The trial copied and verified eighteen DB/manifest pairs into an ACL-protected
folder outside the repository. Its populated restore passed. A manual run and
one actual scheduler execution succeeded, but that schedule is now removed.
Existing recovery copies and proof files remain private pending a cleanup decision.

The Windows task **TFH Staging Offsite Backup** was stopped, disabled and removed.
The dedicated pull key was revoked; `tfh-backup-pull` now has a nologin shell.
The successful-backup read-access hook was disabled, the helper service stopped,
and all 36 generated DB/manifest files returned to app-private mode 0600 with
the original app group. The backup directory is app-owned and mode 0700 again.
There are no continuing downloads to the workstation.

The droplet's nightly backup remains active at 03:15 UTC plus up to 15 minutes
jitter. Recurring offsite protection remains pending an explicitly approved
project destination and operator. Do not recreate the personal-workstation task.
The [read-access helper](../../deploy/backup_read_access.py) and
[service template](../../deploy/tfh-backup-read-access.service) are optional tools
for a future approved destination; they are not an active backup arrangement.

Review of PR #159 found interrupted-publication and existing-copy validation
issues. [PR #161](https://github.com/TFH-Web/TFH-Sermon-Hub/pull/161) fixes them;
Linux tests passed 20/20 and Windows 19 with one symlink privilege skip.
Permission-helper tests passed 5/5 on both platforms. These results do not
establish an approved ongoing offsite service.

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
  The [guide](../admin-guide.md) is prepared for Louson's review and delivery.
- An approved project destination and schedule for recurring offsite backups.
  The personal-workstation schedule has been removed.
