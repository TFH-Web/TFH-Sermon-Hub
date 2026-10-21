# DigitalOcean deployment and access (TFH-540)

**Start here:** this release is running on the droplet as **private staging**,
not a public launch. `http://localhost:5173/` reaches the server through an SSH
tunnel; the app and database are not running on your laptop. Neither
`sermonhub.tfh.org` nor the proposed temporary sslip.io address is configured
for this release yet.

Last verified **2026-10-21 UTC**: deployed source `cf783d2` (application baseline
`3144d67`), 450 sermons, healthy API/worker/Redis and an active nightly backup
timer. Check these again before a later handoff; this is a dated record, not a
live status page.

Testers only need the access steps below. Maintainers can jump to the
[redeployment checklist](#redeploy-a-reviewed-change-maintainers) or
[remaining TFH-540 work](#what-is-left-before-tfh-540-is-done).
Detailed commands and collapsible audit evidence follow.

## Open private staging now

You need an SSH key authorized on the droplet and a Microsoft account with the
intended app role. Ask Jack/Samip to arrange access; never share private keys or
passwords. This is the current operator access method, not a shared team URL.

1. Stop your local development app if it uses **port 5173**. Do not run
   `dev.bat` at the same time as this tunnel.
2. In PowerShell (Windows) or Terminal (macOS/Linux), run:

   ```sh
   ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:5173:127.0.0.1:8081 root@167.71.149.116
   ```

   Keep this terminal open. No prompt/output is normal while forwarding. On
   first connection, verify the host fingerprint with Jack/Samip before
   accepting it; do not disable host-key checks.
3. Open **http://localhost:5173/**. Use `localhost` exactly so Microsoft sign-in
   matches the registered redirect, not the public IP or `127.0.0.1`.
4. Sign in with your assigned Microsoft account. If styling looks stale, use
   **Ctrl+F5** on Windows or your browser's reload-without-cache command. The
   library is real saved data. AI/import processing is still pending; do not
   start batch imports/reprocessing merely to test access.
5. When finished, press **Ctrl+C** in the SSH terminal. This closes your tunnel,
   **not** the server. Reopen the tunnel the next time you test.

Troubleshooting:

- **Port already in use:** close local development or reuse your existing
  tunnel. Do not kill an unfamiliar process or change browser ports without
  matching the frontend and Entra configuration.
- **Permission denied (publickey):** ask Jack/Samip to authorize your own key.
- **Browser cannot connect:** check the SSH terminal is still running; then ask
  a maintainer to run the [health checks](#6-verify-private-access-without-changing-the-public-site).
- **Microsoft redirect error / 403:** confirm the exact URL and assigned role;
  never enable auth-test bypasses on the server.

The older site at `http://167.71.149.116/` is separate and unchanged. It is
**not** this staging release.

## What is left before TFH-540 is Done

This maps to the [current Jira acceptance criteria](https://csus-team-nekos.atlassian.net/browse/TFH-540).
Hosting, persistent SQLite, server migrations/extension loading, private secrets,
restartable services, nightly on-droplet backups and one-off off-droplet copies
are already verified. Remaining work:

| Work | Owner | Completion evidence |
| --- | --- | --- |
| HTTPS/team access and production domain | Jack | AC 3-4: exact Entra redirect/logout URLs; DNS owner recorded; HTTPS and certificate renewal verified for `sermonhub.tfh.org` once pointed. A temporary hostname does not finish production-domain acceptance. |
| Cloud runtime/provider checks | Samip | AC 2, 8: selected supported providers/models, runtime SDKs/private credentials and connectivity/resources verified under the service user. Any missing adapter implementation is a feature dependency, not extra TFH-540 scope. |
| Final recovery rehearsal | Jack + Samip | AC 5-6, 8: restore/application rollback using representative sermon/chunk/vector data. Process crash recovery passed; a full host reboot has not been rehearsed and needs a coordinated window. Record ongoing off-droplet custody/schedule. |
| Portable Python/macOS and Ollama setup | Samip | AC 7: verified macOS guidance and optional acceleration. `Backend/devenv.nix` still forces `ollama-rocm`; this is not fixed. Server extension loading already passed. |
| Integrated staging acceptance | Jack + Samip | AC 8: staff-only/unassigned roles, import/queue completion and failure recovery, transcript seeking, real search and grounded chat as owning feature stories land. Admin sign-in was reported successful. |
| Publish the reviewed handoff | Jack | AC 7 / delivery: review/merge the TFH-540 code/docs; share access, deployed commit, health evidence, limitations and owners. Changes are currently on the local TFH-540 branch, not `dev`. |

The copied library has no chunks/embeddings yet, so integrity checks with empty
vector tables are not final processed-data recovery evidence. Scheduled
off-droplet automation is a recommended operational follow-up: the verified
one-off external recovery copy already exists, but is not automated protection.
The initial safe staging handoff is separate from final closeout; teammates do
**not** wait for every AC 8 smoke test before starting their feature stories.

## Redeploy a reviewed change (maintainers)

This is the reading order for the detailed commands, not a standalone script.
Build examples use **Bash on a controlled build machine**; server commands run
in **Linux Bash over SSH**, not unchanged in local PowerShell.

1. Select reviewed commits and a new release label; [build/test and archive](#2-build-a-reviewed-immutable-release).
   Use the intended browser URL's public Entra settings, never local secret files.
2. [Record the current release/schema/counts and take a verified backup](#1-preserve-the-old-server-before-any-change).
   Stop if verification fails; leave the old public site untouched.
3. [Prepare a new release](#3-extract-the-release-then-run-the-guarded-preparation-helper).
   Preserve the existing private config and persistent database.
4. Drain the staging queue, stop its API/worker, then [migrate and preflight](#4-back-up-the-prepared-database-then-migrate-safely).
   Never seed, overwrite the library or re-embed during deployment.
5. [Switch `current`, start services and validate NGINX](#5-install-separate-services-and-private-nginx-site).
   Stopped staging processes must start against the new release. Do not interrupt
   shared Redis or an active worker job.
6. [Verify health, sign-in/roles and the changed feature](#6-verify-private-access-without-changing-the-public-site).
   Confirm the intended DB/release and backup timer; retain the compatible
   previous release/backup for [rollback](#7-nightly-backups-restore-and-rollback).
7. Record results/limitations, update the server runbook and tell testers which
   access method and commit they are using. Health alone is not feature acceptance.

Other shortcuts: [backup/restore](#7-nightly-backups-restore-and-rollback),
[Python capability check](#python-sqlite-extension-capability-check),
[caption-token renewal and ownership](#ownership-and-credential-renewal).

## Detailed operator reference

This runbook deploys a **separate, SSH-only staging instance**. It does not replace
the existing public-IP site or announce a public launch. Do not copy a developer's
database by default. An explicitly approved library bootstrap must use the
verified snapshot and reversible procedure in section 6.1. Never copy fixture
data, a local `.env`, `testing.cfg`, `node_modules`, or a Windows virtualenv to
the server.

## Current scope and outstanding gates

The existing public site uses NGINX port 80 and `tfh-backend.service` on port 5000.
Leave those files, processes and database unchanged. Staging has its own app user,
release tree, database, ports and services:

| Item | Private staging |
| --- | --- |
| User/group | `tfh-staging` |
| Release | `/opt/tfh-staging/releases/<app-sha>-<deploy-label>` |
| Active release | `/opt/tfh-staging/current` (root-owned symlink) |
| Persistent database | `/var/lib/tfh-staging/sermonhub.sqlite3` |
| Private server environment | `/etc/tfh-staging/.env` (`root:tfh-staging`, `0640`) |
| API | `tfh-staging-api.service`, `127.0.0.1:5001` |
| Worker | `tfh-staging-worker.service`, Redis `sermons` queue in DB 1 |
| Browser entry | NGINX `127.0.0.1:8081`, reached through SSH |
| Nightly backups | `/var/backups/tfh-staging`, `0700`, app-owned |

Cloud AI is **not yet configured or verified**. The server must use a cloud
provider; Ollama is for local development only. Do not install Ollama or download
models on the droplet. `LLM_PROVIDER=cloud-pending` deliberately avoids silently
using the local-development provider. The current embedding implementation is
Ollama-specific, so a selected cloud embedding provider/adapter and compatible
768-dimensional model are prerequisites to enabling search/chat/import processing.
Any new adapter implementation belongs to the relevant feature dependency;
TFH-540 owns runtime configuration/dependencies and connectivity verification
once a supported implementation is available.
Do not change the embedding model or dimension against existing vectors without
the compatibility checks, migration if required, and deliberate re-embedding.

Infrastructure startup, SQLite checks and authentication can be verified without
making AI/YouTube requests. Successful infrastructure checks do **not** mean
AI works, the team can be handed off, or TFH-540 is Done. Remaining gates include
cloud provider/models, actual role-based staging acceptance, worker/model-backed
feature checks and documented off-server recovery ownership. Automated off-server
backup scheduling remains a recommended operational follow-up, not an added
acceptance criterion.

<details>
<summary>Recorded deployment history, checksums and rehearsal evidence (expand for audit/recovery)</summary>

### Recorded first deployment (run begun 2026-10-20 UTC)

These are observed results, not merely planned checks. The application baseline
is `3144d675a42d047a821a05390929e1695569f8c0`; the installed runtime/deployment
commit is `ca778105ac01c4a733050f496784dfdbdb6a5756`.

| Check | Recorded result |
| --- | --- |
| Isolated release/current link | `/opt/tfh-staging/releases/3144d67-tfh540-20261020-1`, selected by `/opt/tfh-staging/current` |
| API and worker | Enabled/active as `tfh-staging`; gunicorn 26.2.0 has two workers on loopback 5001; RQ uses Redis DB 1 |
| Network | NGINX 8081, API 5001 and Redis 6379 are loopback-only; Redis `PING` returned `PONG` |
| HTTP | `/`, `/login` and `/sermons/123` returned the SPA; proxied and direct `/api/health` returned 200 |
| Auth without credentials | `/api/whoami` and `/api/sermons` returned 401, including attempts with `X-Test-Roles: Admin`; production `TESTING=False` and `AUTH_TEST_BYPASS=False` verified |
| Initial database | Cloned the verified empty old-server snapshot, took a pre-upgrade backup, then used the guarded legacy-baseline migration path; no local library or fixtures copied |
| Database/runtime | Alembic `958b50d14869`; Python 3.13.5 / SQLite 3.46.1; sqlite-vec `v0.1.9`; vector schema `FLOAT[768]`; sermons remained zero |
| Backup/restore | First post-migration backup succeeded; its hash, separate restored database, row/vector counts, integrity and foreign keys verified; nightly timer enabled; next scheduled run recorded as 2026-10-21 03:16:48 UTC |
| Fresh-schema rehearsal | Separate empty server database migrated successfully to `958b50d14869` |
| Real worker execution | The actual RQ worker completed harmless `math.sqrt(81) == 9`; no model, YouTube or sermon-processing request made |
| Automated checks | 667 backend tests plus three snapshots, 23 deployment tests (17 provision + six backup), 148 frontend tests and production frontend build passed; all 48 locked production dependencies audited with no known vulnerabilities |
| Existing public application | Original `tfh-backend.service` PID 738 and public-IP site unchanged; staging did not switch public traffic |
| Staging restart recovery | Controlled `SIGKILL` of the new API, worker and Redis each recovered automatically (API PID 757219 → 757466; worker 757220 → 757494; Redis 756625 → 757508); all remained enabled/active; complete HTTP/queue/SQLite/restore/fresh-migration smoke repeated successfully afterward; no full server reboot performed |

Deployment artifact checksums were recorded and verified:

| Artifact | SHA-256 |
| --- | --- |
| Installed source archive | `464fd98bf5c5d216cba7ae04537abd53e757ec471ee2e3f2308efb64a736671c` |
| Production frontend archive (Vite 8.3.4, built locally with Node 24) | `02375ea20af7ff1c1ccfa0e0cf032902ba9a7b26688327467bdbd7ae8bc0d915` |
| Post-migration DB backup | `50cbee06f709a76853c5cc677f454f2b1559aede3ca4508d3d8e285ce3caf268` |

The post-migration backup is
`/var/backups/tfh-staging/sermonhub-20261020T235816226296Z-6644af52.sqlite3`.
That database and its JSON manifest also have a checksum-verified, ACL-protected
off-server copy at
`.local-dev/tfh-540-server/backups/20261020T234424Z/migrated-staging/`.
Together with the initial database copy below, these are **one-off** verified
off-server backups, not scheduled off-site automation. The server's full original
archive is still not claimed to have been copied off-site. Detailed operational
evidence is kept privately with those manifests; no credentials or full secret
configuration are part of this document.
The server release's `deployment.json` records the application/deployment commits,
artifact hashes, successful checks and outstanding gates without secret values.

Jack subsequently reported successful real Admin sign-in through the private
tunnel. The read-only/unassigned role matrix has **not** been verified against
this staging instance. DNS/HTTPS/public Entra redirects,
nightly off-site automation and cloud AI are not complete. There is no server
Ollama daemon/listener. Anthropic is a tentative answer-provider preference, not
a configured SDK/key/model or an embedding-provider decision. Anthropic does not
provide its own embedding model; see its
[embedding-provider guidance](https://platform.claude.com/docs/en/build-with-claude/embeddings).
The current cloud
adapter/model compatibility gap remains open. Keep these limitations in any
handoff; do not mark TFH-540 complete from the infrastructure smoke checks alone.

### Current private release and production-sidebar fix (2026-10-21 UTC)

The active release is now
`/opt/tfh-staging/releases/3144d67-tfh540-20261021-2`, built from
`cf783d264dec83af4f06ce39d7c58be95118d44b` on the same `3144d67` application
baseline. The previous release is retained for code rollback. Both use the
external persistent database, now containing the explicitly approved local
library described in section 6.1; switching code must never reinitialize it.

The white sidebar was a **production CSS lowering regression**, not a different
application branch: inherited `light-dark()` theme tokens were resolved at the
root before reaching the sidebar. Sidebar-local dark surface/foreground/outline
tokens restore the intended dark appearance without redesigning the layout.
Locally scoped focus styling preserves text contrast of at least 4.5:1 and
visible keyboard-focus outlines. No authentication logic changed.

| Artifact/check | Verified result |
| --- | --- |
| Source archive SHA-256 | `07a1fd1f3a1919f51fa070d4125f44a09b62714a0a7c2ca6ed281c46384d0fcd` |
| Frontend archive SHA-256 | `3ff971dfd8197d0469345e0fc87bfee43da2bd724cf98f21ee23c71507fc0ef7` |
| Current frontend assets | `/assets/index-ZkgWRXxz.js` and `/assets/index-B6MM5Yah.css` |
| Served CSS SHA-256 | `616cef9bf720b79c485c1d7a6e4030b9cbe0a7f789d1746ae8f1b0f2074aca22`; raw bytes retrieved through the actual SSH tunnel matched the tested build |
| Frontend verification | 148 Vitest tests, TypeScript/production build, two compiled-CSS Playwright tests for light/dark OS preferences; dependency audit clean |
| Auth configuration | Rebuilt with the approved public Entra IDs/scope and `http://localhost:5173/` redirect; `VITE_E2E_TEST=false`; no local secret files copied |
| Pre-release backup | `/var/backups/tfh-staging/sermonhub-20261021T004402250043Z-7d3c5067.sqlite3` (450 sermons) |
| Runtime/deploy | New release venv installed from the same locked 48 production dependencies; guarded preparation preserved existing env/DB; `up.py` confirmed schema already at head; live ORM/HTTP/auth/vec checks passed afterward |
| Isolation and recovery | Previous code retained; API/worker healthy; backup service succeeded and timer resumed; old public service PID 738/health 200 unchanged |

The new `deployment.json` records the release, library adoption, artifact hashes,
checks and remaining gates. A browser already open on the old assets needs a
hard refresh (`Ctrl+F5`) through the still-open SSH tunnel. Production-CSS tests
deliberately render only an isolated sidebar fixture with the **compiled** CSS;
they do not fake production sign-in or claim to validate real-user permissions.

</details>

## 1. Preserve the old server before any change

The first inventory snapshot was recorded at:

```text
/var/backups/tfh-sermon-hub/20261020T234424Z/
  database.sqlite3
  (full server/config/code/environment snapshot and manifest)
```

The verified database is 40,960 bytes, with SHA-256
`f50ae58a90fb251fe016b7195c12f401723668b5856bf7e60866955b37f0afe5`.
It contains the old server's five empty application tables, not the developer's
local library. The old application revision was
`c888e11407bdcecbc48998015aa1298e2a529094`. That snapshot has no Alembic revision
table. The full archive was checked on the server; only the verified database and
manifest have a protected local/off-server copy under
`.local-dev/tfh-540-server/backups/20261020T234424Z`. Do **not** describe the full
archive or nightly backups as off-site until their transfer has been verified.
The full archive contains secrets and must remain private.

Before each later deployment, record the current symlink target, source/deploy
commits, service state, migration revision, database counts and a fresh verified
backup. Never overwrite the initial snapshot or remove previous release directories.

## 2. Build a reviewed, immutable release

Use Linux CI or a controlled build machine with Node.js 24 and the committed npm
lockfile. The droplet's inventoried Node.js 20 installation is not the frontend
build environment. Its Python 3.13.5/SQLite 3.46.1 must pass extension loading on
the server; Windows Python's success is not sufficient.

The following are Bash examples, not commands to run in PowerShell unchanged.
Set the two full commit IDs after review: `APP_SHA` identifies the application
baseline and `DEPLOY_REV` the reviewed deployment change based on that baseline.
`RELEASE_ID` is a unique operator-selected label; record both full commits in the
release manifest even if the directory uses a short SHA. The source archive comes
from `DEPLOY_REV`, not a dirty working directory. The first reserved release path
is `/opt/tfh-staging/releases/3144d67-tfh540-20261020-1`; do not reuse it for an upgrade.

```bash
APP_SHA=<full-reviewed-application-sha>
DEPLOY_REV=<full-reviewed-deployment-sha>
[[ "$APP_SHA" =~ ^[0-9a-f]{40}$ && "$DEPLOY_REV" =~ ^[0-9a-f]{40}$ ]] || exit 1
git merge-base --is-ancestor "$APP_SHA" "$DEPLOY_REV" || exit 1
test "$(git rev-parse HEAD)" = "$DEPLOY_REV" || exit 1
git diff --quiet && git diff --cached --quiet || exit 1
RELEASE_ID="${APP_SHA:0:7}-tfh540-$(date -u +%Y%m%dT%H%M%SZ)"

cd Frontend
npm ci
npm test
npm audit --audit-level=high
# Supply the NONSECRET client/tenant IDs from the approved Entra registration.
VITE_CLIENT_ID=<application-client-id> VITE_TENANT_ID=<tenant-id> \
VITE_API_SCOPE=api://<api-application-client-id>/access_as_user \
VITE_REDIRECT_URI=http://localhost:5173/ VITE_API_BASE_URL=/ VITE_E2E_TEST=false \
npm run build
npx playwright test --config=playwright.production.config.ts
cd ..
git archive --format=tar --output="source-${RELEASE_ID}.tar" "$DEPLOY_REV"
tar -C Frontend -czf "frontend-${RELEASE_ID}.tar.gz" dist
sha256sum "source-${RELEASE_ID}.tar" "frontend-${RELEASE_ID}.tar.gz" > "checksums-${RELEASE_ID}.txt"
```

Replace every angle-bracket placeholder before running commands. The frontend
contains public identity configuration, never server/API secrets. A production
build ignores the E2E identity even if that flag is accidentally set; never serve
Vite's development server publicly. Environment changes require a new frontend
build. Keep the three reviewed artifacts and checksum manifest together and copy
them to a new root-owned server staging directory. Do not build from the live
`current` tree or overlay files into an existing release.

The production-sidebar regression requires a preceding `npm run build` and a
Playwright Chromium installation (`npx playwright install chromium` on a new
build machine). Its standalone configuration starts no dev server and makes no
API requests. It is also discovered by the normal E2E configuration; CI already
builds and downloads `dist` before that job. Do not run the normal dev-server E2E
suite against an operator's live staging tunnel on port 5173.

## 3. Extract the release, then run the guarded preparation helper

On Debian, install the reviewed Python/venv, Poetry and Redis packages as needed;
do not upgrade or restart the existing public application as a side effect.
Redis is a system service bound to loopback. Staging uses DB 1; do not flush Redis
or reuse another application's queue database. Redis persistence and restart
behavior must be checked before processing real jobs.

Extract the source and frontend into a **new** release. Validate `RELEASE_ID`
before constructing paths. Do not run a recursive remove/move to clean old code.
Only the root-owned code directories are prepared manually; the helper below
creates/validates the service account, private directories, environment and DB.

```bash
[[ "$RELEASE_ID" =~ ^[0-9a-f]{7,40}-tfh540-[A-Za-z0-9][A-Za-z0-9-]*$ ]] || exit 1
install -d -o root -g root -m 0755 /opt/tfh-staging /opt/tfh-staging/releases
release="/opt/tfh-staging/releases/$RELEASE_ID"
test ! -e "$release" || exit 1
install -d -o root -g root -m 0755 "$release"
# From the directory containing the copied, reviewed artifacts:
sha256sum -c "checksums-${RELEASE_ID}.txt" || exit 1
tar -xf "source-${RELEASE_ID}.tar" -C "$release"
tar -xzf "frontend-${RELEASE_ID}.tar.gz" -C "$release/Frontend"
test ! -e "$release/Backend/.env" || exit 1
test ! -e "$release/Backend/tsh/testing.cfg" || exit 1
cd "$release/Backend"
POETRY_VIRTUALENVS_IN_PROJECT=true poetry install --only main --no-root --no-interaction
cd "$release"
# Code is root-owned and not writable by the service. Static files must be readable
# by NGINX; secrets live exclusively outside this release.
chown -R root:root "$release"
chmod -R a+rX,go-w "$release"
```

Build Linux dependencies in the release; do not copy a local Windows `.venv`.
The API/worker execute the venv's binaries directly, not Poetry at runtime.

Create or review `/opt/tfh-staging/public-config.json` with a private editor,
substituting the approved Entra registration's UUIDs. It accepts only the three
UUID fields below and optional `ENTRA_API_SCOPE=access_as_user`. These are public
identity settings, **not** a way to pass credentials, secrets, filesystem paths
or arbitrary environment variables to a root process. Do not add extra keys.

```json
{
  "TENANT_ID": "REPLACE_WITH_TENANT_UUID",
  "CLIENT_ID": "REPLACE_WITH_APPLICATION_CLIENT_UUID",
  "ENTRA_API_AUDIENCE": "REPLACE_WITH_API_APPLICATION_CLIENT_UUID",
  "ENTRA_API_SCOPE": "access_as_user"
}
```

Verify the fixed old-server bootstrap snapshot before first initialization, then
run the same tested helper used for the recorded deployment:

```bash
test -f /opt/tfh-staging/public-config.json || exit 1
chown root:root /opt/tfh-staging/public-config.json
chmod 0600 /opt/tfh-staging/public-config.json
printf '%s  %s\n' \
  f50ae58a90fb251fe016b7195c12f401723668b5856bf7e60866955b37f0afe5 \
  /var/backups/tfh-sermon-hub/20261020T234424Z/database.sqlite3 | sha256sum -c - || exit 1
"$release/Backend/.venv/bin/python" "$release/deploy/provision_staging.py" \
  --release-dir "$release" \
  --public-config /opt/tfh-staging/public-config.json --prepare-only
```

`deploy/provision_staging.py` must run as root on Linux. It rejects symlinked or
out-of-scope release paths, secret/unexpected JSON fields, mismatched existing
identity/runtime settings and any enabled auth bypass. It creates the isolated
`tfh-staging` account, root-controlled code directories, `/etc/tfh-staging` as
`0750 root:tfh-staging`, `/var/lib/tfh-staging` and `/var/backups/tfh-staging` as
`0700 tfh-staging:tfh-staging`. On first run it generates the random JWT secret
directly into `/etc/tfh-staging/.env` (`0640 root:tfh-staging`) and takes an online
SQLite clone of the **fixed verified server snapshot** into the persistent DB
(`0600 tfh-staging:tfh-staging`). It never substitutes a local database or seeds
fixtures. Existing valid configuration/DB are preserved, not overwritten or
reinitialized. A mismatch stops preparation for operator review; do not delete
the existing `.env` to force the check to pass.

Preparation does **not** run migrations, install/activate units, switch `current`,
start/stop services or change the public site. Do not run additional manual
environment-generation or database-copy commands after the helper, except the
separately approved and verified library bootstrap in section 6.1. The template
`deploy/staging.env.example` documents the contract; it must not overwrite the
auto-generated file. For later approved cloud/import credentials, edit the
existing private server file without displaying it in logs/chat/Jira/git, retaining
the generated JWT secret and ownership/modes. NGINX must not join the app group.

The EnvironmentFile is not a shell script: no `export`, expansion or command
substitution. The production factory does not load a development `.env` or
`testing.cfg`. Flask CLI commands additionally set `FLASK_SKIP_DOTENV=1`.
The helper pins legacy Ollama endpoints to a closed loopback port and sets
`cloud-pending`; it neither installs Ollama nor makes model/provider calls.

## 4. Back up the prepared database, then migrate safely

The helper has already initialized the first staging DB from the verified empty
server snapshot. On later deployments it has preserved the existing staging DB.
Never clone the baseline again over an existing library.

For upgrades, drain/check the staging queue and stop **only** staging API/worker
before migrations. Do not stop the old public service, NGINX or shared Redis.
Keep them stopped until migration and rollback checks finish. First deployment
has no running staging services to stop.

```bash
"$release/Backend/.venv/bin/python" -m unittest discover -s "$release/deploy" -p test_backup.py
runuser -u tfh-staging -- "$release/Backend/.venv/bin/python" "$release/deploy/backup.py"
```

The backup command uses SQLite's online backup API, not `cp` on a live DB. It
loads sqlite-vec in both connections, verifies integrity and foreign keys, records
counts/revision/hash, and writes a standalone DB plus JSON manifest. A failed
backup/verification must stop deployment and cannot prune old backups.

Run production commands with systemd loading the private EnvironmentFile instead
of sourcing secrets into shell history:

```bash
tfh_run() {
  systemd-run --quiet --wait --pipe --collect \
    -p User=tfh-staging -p Group=tfh-staging \
    -p "WorkingDirectory=$release/Backend" \
    -p EnvironmentFile=/etc/tfh-staging/.env \
    -p ProtectSystem=strict -p ReadWritePaths=/var/lib/tfh-staging \
    --setenv=TFH_ENV=production --setenv=FLASK_SKIP_DOTENV=1 \
    --setenv=PYTHONDONTWRITEBYTECODE=1 "$@"
}
tfh_run "$release/Backend/.venv/bin/python" -m flask \
  --app 'tsh.production:create_production_app()' db current
tfh_run "$release/Backend/.venv/bin/python" up.py
tfh_run "$release/Backend/.venv/bin/python" -m flask \
  --app 'tsh.production:create_production_app()' db current
```

`up.py` performs the fresh/existing-schema migration path; do not run a blind
`stamp head` on an unknown legacy DB. It must recognize the old baseline or fail
clearly. Do not seed/populate or call import/reembed during deployment.

Preflight without provider calls:

```bash
tfh_run "$release/Backend/.venv/bin/python" -c \
 'from sqlalchemy import text; from tsh.production import create_production_app; from tsh.database import db; from tsh.embeddings import check_schema_dimension; app=create_production_app(); ctx=app.app_context(); ctx.push(); assert not app.testing and not app.config["AUTH_TEST_BYPASS"]; check_schema_dimension(); print("sqlite-vec", db.session.execute(text("SELECT vec_version()")).scalar()); print("database/schema/auth preflight OK"); ctx.pop()'
```

No model is loaded by that check. Migration/extension success is not proof that
the selected cloud embedding model works.

## 5. Install separate services and private NGINX site

```bash
install -o root -g root -m 0644 "$release/deploy/tfh-staging-api.service" /etc/systemd/system/
install -o root -g root -m 0644 "$release/deploy/tfh-staging-worker.service" /etc/systemd/system/
install -o root -g root -m 0644 "$release/deploy/tfh-staging-backup.service" /etc/systemd/system/
install -o root -g root -m 0644 "$release/deploy/tfh-staging-backup.timer" /etc/systemd/system/
install -o root -g root -m 0644 "$release/deploy/nginx-staging.conf" /etc/nginx/sites-available/tfh-staging
test -L /etc/nginx/sites-enabled/tfh-staging || \
  ln -s /etc/nginx/sites-available/tfh-staging /etc/nginx/sites-enabled/tfh-staging
nginx -t || exit 1
```

Record the old `current` target first (if any). The parent `/opt/tfh-staging` and
the link must be root-controlled. The replacement below is an atomic symlink
switch; it does not move or delete a release directory.

```bash
readlink -f /opt/tfh-staging/current || true
test ! -e /opt/tfh-staging/current.next && test ! -L /opt/tfh-staging/current.next || exit 1
ln -s "$release" /opt/tfh-staging/current.next
mv -Tf /opt/tfh-staging/current.next /opt/tfh-staging/current
# ExecStart points through current; the first deployment must establish it before verification.
systemd-analyze verify /etc/systemd/system/tfh-staging-*.service /etc/systemd/system/tfh-staging-backup.timer || exit 1
systemctl daemon-reload
systemctl enable --now redis-server
systemctl enable --now tfh-staging-api tfh-staging-worker tfh-staging-backup.timer
# For upgrades, services stopped before migration are now started against current.
systemctl reload nginx
systemctl status --no-pager tfh-staging-api tfh-staging-worker redis-server
systemctl start tfh-staging-backup.service
systemctl list-timers --all tfh-staging-backup.timer
```

Only the new loopback listener is added. Do not replace `/etc/nginx/nginx.conf`,
the old public server block, or `tfh-backend.service`. On upgrades after changing
unit templates, `daemon-reload` is required. Do not restart a worker mid-job or
delete queued work to force a green deployment.

## 6. Verify private access, without changing the public site

On the server, check health, SPA refresh and unauthenticated authorization:

```bash
curl --fail http://127.0.0.1:5001/api/health
curl --fail http://127.0.0.1:8081/api/health
curl --fail --output /dev/null http://127.0.0.1:8081/sermons/1
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/api/whoami
ss -lntp
journalctl -u tfh-staging-api -u tfh-staging-worker --since '-10 min' --no-pager
```

Expect `/whoami` without credentials to return 401, not demo data. Confirm 8081
and 5001 are loopback-only and Redis is not exposed publicly. Do not print raw
tokens or environment files in logs/evidence. Compare old public health and its
service PID against the pre-deploy record to confirm it was not restarted.

Stop the local development app occupying port 5173, then open a tunnel on your
own machine. Keep the tunnel terminal open:

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:5173:127.0.0.1:8081 root@167.71.149.116
```

Browse `http://localhost:5173/`. The bundle must have been built for that exact
already-registered SPA redirect. Sign in as a real assigned Admin, read-only staff
(both supported role spellings), and an unassigned/denied account. Verify deep-link
refresh/return, sign-out, account switching, token/session recovery and denied
mutations. Record results without copying credentials. Do not mutate/import real
data merely to test an authorization boundary; use a reviewed non-mutating/invalid
request where appropriate. Confirm API and worker recovery using an authorized,
scheduled staging-only restart when no jobs are active.

This is private operator verification, **not a generally usable team staging URL**.
NGINX HTTP on the public IP cannot replace HTTPS/Entra setup. Before broader
handoff, select a trusted HTTPS staging hostname, configure its exact Entra SPA
redirect/logout URI, rebuild the bundle for it and verify the access policy. Public
`sermonhub.tfh.org` DNS/HTTPS/production redirects remain a separate launch step.
Microsoft requires HTTPS redirects except for localhost testing:
[redirect URI restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

### 6.1 Explicitly approved local-library bootstrap (2026-10-21 UTC)

After seeing the empty staging library, Jack explicitly approved copying his
local library into **only the new private staging database**. This is a one-time
data adoption, not a normal deployment step or permission to overwrite later
staging edits. The original public site/database and local source DB were not
changed. Do not repeat this operation over a populated staging library without
a new explicit data-replacement decision.

Recorded checks and rollback material:

| Item | Verified result |
| --- | --- |
| Source | Consistent SQLite online backup of the local `Backend/instance/testing.db`; no live-file copy |
| Snapshot SHA-256 | `7575d8199b69b00d3338a4eef2e815f30a972c615a65be8e300b3e0a98511f87` |
| Server compatibility | Full integrity/FK checks passed using server SQLite 3.46.1 and sqlite-vec `v0.1.9`; exact schema matched empty staging; Alembic `958b50d14869` and `FLOAT[768]` unchanged |
| Copied data | 450 sermons, 37 speakers, 71 series, five tags and 12 sermon/tag associations |
| Preserved statuses | 257 DRAFT, 190 PUBLISHED, two FAILED and one PROCESSING; no automatic retries or status rewriting |
| Preserved transcript data | 189 nonempty transcripts and 188 nonempty caption arrays; no AI/YouTube calls |
| Retrieval limitation | No sermon chunks or embeddings existed in the source; this copy does **not** make cloud search/chat ready |
| Queue guard | Redis DB 1 queue empty, worker idle, no active/scheduled/deferred jobs before replacement |
| Fresh pre-replacement backup | `/var/backups/tfh-staging/sermonhub-20261021T004010053824Z-a0c4e1ee.sqlite3` |
| Reversible original DB | `/var/lib/tfh-staging/recovery-library-octK4ypK/sermonhub.sqlite3`; private recovery directory retained |
| Post-copy backup | `/var/backups/tfh-staging/sermonhub-20261021T004049422299Z-0b2e0d68.sqlite3`; SHA-256 `db4c486624246030de9fa61583f9aeec42c6291fe460c022c4f2dc5cea49a55f` |
| Off-server recovery copy | DB and manifest checksum/integrity/FK/counts verified under ACL-protected `.local-dev/tfh-540-server/backups/20261020T234424Z/copied-staging-library-20261021/`; still one-off, not scheduled off-site automation |
| Live verification | Production ORM saw 450 sermons/37 speakers/71 series, exact original statuses, schema and vec checks; HTTP health/SPA passed; unauthenticated and test-role-header requests remained 401 |
| Services | New API/worker restarted; nightly backup service succeeded and timer resumed; old public service PID 738 and health 200 unchanged |

For an approved bootstrap, first use `deploy/backup.py` on the local machine to
create a verified standalone snapshot plus manifest in a private backup folder.
Transfer that pair over SSH to a root-only incoming directory, not a web-served
path. Compare SHA-256 and all counts/revision/vector schema on the server using
its release Python and sqlite-vec **before** changing the active DB. A newer local
SQLite version is not itself proof of server compatibility. Compare the schemas;
do not blindly migrate or re-embed this snapshot.

Stage a verified, app-owned `0600` copy on the persistent filesystem. Take a fresh
backup of staging, drain/check its queue, then use section 7's exact pause-timer,
stop-backup/API/worker and confirm-inactive sequence. Recheck that staging is
still empty for this bootstrap. Keep its DB and any WAL/SHM siblings in a new
private recovery directory, then atomically rename the prepared standalone
snapshot to `/var/lib/tfh-staging/sermonhub.sqlite3`. Verify it again before
starting services. Repeat production schema/auth/health/count checks, create and
verify a new backup, then resume the timer and verify an off-server copy.
Preserve statuses and vectors exactly; copying data never authorizes retrying
imports, provider calls, re-embedding or flushing Redis.

## 7. Nightly backups, restore and rollback

The timer runs nightly at 03:15 UTC plus up to 15 minutes of jitter; missed runs
are caught up after downtime. It retains all generated backups from the last 14
days and at least the 14 newest copies overall. Only exact timestamp/UUID names
created in `/var/backups/tfh-staging` and their paired manifests are eligible for
pruning; the original server snapshot, manual copies and partial files are not.
Pruning happens only after a new verified copy is published. Read backup output
and failures in `journalctl -u tfh-staging-backup.service`; do not equate an enabled
timer with a successful backup. Monitor free disk space and backup age/failure.

Verify a selected copy before restoring or transferring it:

```bash
current_python=/opt/tfh-staging/current/Backend/.venv/bin/python
"$current_python" /opt/tfh-staging/current/deploy/backup.py --verify /var/backups/tfh-staging/<exact-backup-name>.sqlite3
sha256sum /var/backups/tfh-staging/<exact-backup-name>.sqlite3
# Compare the hash, row counts and Alembic revision with the paired JSON manifest.
```

For an actual restore, first drain the staging queue, pause the backup timer,
then stop any **already running backup service** as well as API/worker. Stopping
a timer does not stop its active oneshot service. Confirm all four units are
inactive before moving the database or WAL/SHM files. Capture a fresh backup
before this stop if possible. Select the backup and matching
release explicitly; do not run a schema downgrade to guess compatibility. Keep
the current DB and any WAL/SHM siblings in a newly created **private recovery
directory** so recovery itself is reversible. Only after services have stopped,
move the three explicitly named files when present (no wildcard/recursive delete),
then install the verified standalone backup at the persistent path with owner
`tfh-staging:tfh-staging`, mode `0600`. Never overwrite the old public site's DB.

Example restore preparation, after setting `RESTORE_FILE` to the verified exact
file and `ROLLBACK_RELEASE` to its compatible existing release:

```bash
[[ "$RESTORE_FILE" =~ ^/var/backups/tfh-staging/sermonhub-[0-9]{8}T[0-9]{12}Z-[0-9a-f]{8}\.sqlite3$ ]] || exit 1
test -f "$RESTORE_FILE" && test ! -L "$RESTORE_FILE" || exit 1
[[ "$ROLLBACK_RELEASE" =~ ^/opt/tfh-staging/releases/[0-9a-f]{7,40}-tfh540-[A-Za-z0-9][A-Za-z0-9-]*$ ]] || exit 1
test -d "$ROLLBACK_RELEASE/Backend" || exit 1
systemctl stop tfh-staging-backup.timer
systemctl stop tfh-staging-backup.service tfh-staging-worker tfh-staging-api
for unit in tfh-staging-backup.timer tfh-staging-backup.service tfh-staging-worker tfh-staging-api; do
  test "$(systemctl show --property=ActiveState --value "$unit")" = inactive || {
    echo "Refusing database replacement: $unit is not inactive" >&2
    exit 1
  }
done
"$current_python" /opt/tfh-staging/current/deploy/backup.py --verify "$RESTORE_FILE" || exit 1
recovery_dir="$(mktemp -d /var/lib/tfh-staging/recovery-XXXXXXXX)"
chmod 0700 "$recovery_dir"
for db_file in sermonhub.sqlite3 sermonhub.sqlite3-wal sermonhub.sqlite3-shm; do
  if test -f "/var/lib/tfh-staging/$db_file"; then
    mv -- "/var/lib/tfh-staging/$db_file" "$recovery_dir/$db_file"
  fi
done
install -o tfh-staging -g tfh-staging -m 0600 "$RESTORE_FILE" /var/lib/tfh-staging/sermonhub.sqlite3
test ! -e /opt/tfh-staging/current.next && test ! -L /opt/tfh-staging/current.next || exit 1
ln -s "$ROLLBACK_RELEASE" /opt/tfh-staging/current.next
mv -Tf /opt/tfh-staging/current.next /opt/tfh-staging/current
# Verify the restored DB with the selected release's Python/extension before startup.
"$ROLLBACK_RELEASE/Backend/.venv/bin/python" "$ROLLBACK_RELEASE/deploy/backup.py" \
  --verify /var/lib/tfh-staging/sermonhub.sqlite3 || exit 1
release="$ROLLBACK_RELEASE"
tfh_run "$release/Backend/.venv/bin/python" -m flask \
  --app 'tsh.production:create_production_app()' db current || exit 1
# Compare the revision to the backup manifest and this release's expected schema.
# Repeat the schema/auth preflight from step 4; do not start incompatible code.
tfh_run "$release/Backend/.venv/bin/python" -c \
 'from tsh.production import create_production_app; from tsh.embeddings import check_schema_dimension; app=create_production_app(); ctx=app.app_context(); ctx.push(); assert not app.testing and not app.config["AUTH_TEST_BYPASS"]; check_schema_dimension(); ctx.pop()' || exit 1
systemctl start tfh-staging-api tfh-staging-worker
curl --fail http://127.0.0.1:8081/api/health || exit 1
systemctl start tfh-staging-backup.service
systemctl start tfh-staging-backup.timer
```

The same pause/stop/inactive rule applies to any rollback that replaces a SQLite
database, not just a full restore. A backup service must never be reading files
while those files and sidecars are moved. Re-run schema/auth/health/row-count
checks before reopening access; re-enable scheduled backups only after the
restored release has passed verification. Do not blindly
restore Redis or flush queues: queued jobs must be reconciled with the restored
database first. A code-only rollback is safe only when its schema compatibility
has been checked. Otherwise restore the paired pre-upgrade DB and compatible
release together; retain all newer files for investigation.

Nightly **off-server automation is pending**. A backup on the droplet does not
survive droplet loss. Assign an owner and protected destination, then transfer
verified DB+manifest pairs through an authenticated channel, compare checksums
at the destination, document retention/access and perform an isolated restore
drill there. Credentials belong in server/backup infrastructure, never this
repository. The existing protected local baseline copy is not proof of scheduled
off-site recovery. AC 6 requires a recovery copy outside the droplet; the verified
one-off copies meet that portion, but must not be presented as a scheduled
off-droplet recovery service. Automation/custody and a representative populated
restore rehearsal remain explicit operational follow-ups.

## Operational references

### Python SQLite-extension capability check

Run this with the intended Python environment and its locked `sqlite-vec`
dependency installed. It creates only an in-memory database: no app configuration,
credentials, model requests or real library changes are involved.

```sh
python -c "import sqlite3, sqlite_vec; c = sqlite3.connect(':memory:'); c.enable_load_extension(True); sqlite_vec.load(c); c.enable_load_extension(False); print('SQLite', sqlite3.sqlite_version, 'sqlite-vec', c.execute('SELECT vec_version()').fetchone()[0]); c.close()"
```

Use `Backend/.venv/Scripts/python.exe` on this Windows checkout or
`/opt/tfh-staging/current/Backend/.venv/bin/python` on the droplet if the venv
is not activated. Record both versions and whether extension loading succeeds.
Missing `enable_load_extension`, a load error or a missing module is a failed
prerequisite, not something to bypass. Verified runtimes are recorded in the
deployment evidence above. Verified macOS installation guidance and portable
Ollama/optional-acceleration configuration are still AC 7 follow-up work; do not
claim they were validated on a Mac from a Windows/Linux check.

### Ownership and credential renewal

Per TFH-540, Jack coordinates Entra, DNS/HTTPS, backup/restore and integrated
verification; Samip coordinates services, runtime/provider configuration and
migrations. Record the approved off-server backup destination and its operator
before describing disaster recovery as complete. Review service health, free
disk space, backup age and failed backup runs; an enabled timer alone is not proof
of a recoverable backup.

Caption downloads require the channel-authorized OAuth configuration described
in [YouTube captions](youtube-captions.md), not just a public metadata API key.
If authorization expires or is revoked, have the authorized channel administrator
reauthorize the OAuth application and replace the refresh token privately in
`/etc/tfh-staging/.env`. Never include tokens in this runbook, git, Jira or chat.
Drain the queue before restarting **only** the staging API/worker to load updated
credentials. Preserve saved captions and retry a reviewed small batch only after
the cloud embedding/provider path is available; infrastructure checks above do
not authorize a channel-wide import or consume YouTube/AI quota.

Use the production factory and `tfh_run` wrapper from this runbook for server
CLI operations, rather than copying the local `testing.cfg` commands verbatim.
For example, a non-downloading preview after credentials have been configured is:

```bash
tfh_run "$release/Backend/.venv/bin/python" -m flask \
  --app 'tsh.production:create_production_app()' backfill-captions --limit 10 --dry-run
```

### Primary documentation

- [Gunicorn deployment guidance](https://gunicorn.org/deploy/)
- [RQ worker lifecycle and graceful shutdown](https://python-rq.org/docs/workers/)
- [Anthropic embedding-provider guidance](https://platform.claude.com/docs/en/build-with-claude/embeddings)
