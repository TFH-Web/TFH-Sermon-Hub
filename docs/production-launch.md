# Production launch: hub.tfh.org (TFH-672)

The church chose **hub.tfh.org** as the production address. This procedure was
followed on 2026-11-11; the [go-live record](#production-go-live-record-2026-11-11)
below has the results.
Jack coordinates the church DNS owner and Entra administrator. Preserve the
existing public-IP website and SSH-only staging server block.

## Release and church prerequisites

1. Select a reviewed release and complete [integrated acceptance](testing/sprint9-jack.md).
   Confirm the provider setup, real role checks, processed-data recovery and
   required regression fixes. A merge into `dev` does not redeploy the droplet.
2. Agree with the church DNS owner on the cutover window and the current droplet
   address. The audited droplet is `167.71.149.116`; reconfirm it before the DNS
   owner creates the `hub.tfh.org` A record. Reconcile any existing AAAA
   record with the server's actual IPv6 routing.
3. In the intended Entra **SPA** registration, register the exact production
   redirect URI, `https://hub.tfh.org/`. Retain the separate localhost
   staging URI until the team has moved. Verify the exposed API scope, audience
   and assigned Admin/InternalUser roles in the intended tenant.
4. Build the reviewed frontend with the intended nonsecret `VITE_CLIENT_ID`,
   `VITE_TENANT_ID`, `VITE_API_SCOPE` and
   `VITE_REDIRECT_URI=https://hub.tfh.org/`. Follow the existing immutable
   [release/backup procedure](deploying.md#redeploy-a-reviewed-change-maintainers).
   No client secret belongs in the frontend bundle. The API still uses the
   production factory and private server environment.
5. Record the previous release and fresh backup/manifest for the maintenance
   window. Coordinate off-droplet backups and reboot/rollback evidence with
   Samip (TFH-673), and the delivered admin guide with Louson (TFH-674).

The redirect must match the registration, including its path/case; see
[Microsoft's redirect URI requirements](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

## Bootstrap the certificate without exposing the app over HTTP

Run the following only after the cutover/configuration review. These are Linux
server commands, not local PowerShell commands. Use the operating system's
supported Certbot installation. Capture the original NGINX configuration before
adding the new host; leave other sites enabled.

```bash
sudo install -d -m 0755 /var/lib/letsencrypt/.well-known/acme-challenge
sudo install -m 0644 deploy/nginx-production-http.conf /etc/nginx/sites-available/tfh-production
sudo ln -s /etc/nginx/sites-available/tfh-production /etc/nginx/sites-enabled/tfh-production
sudo nginx -t
sudo systemctl reload nginx
```

The bootstrap host serves the ACME challenge path and responds 503 for application
paths. The existing public-IP site and localhost:8081 staging site continue to
use their own server blocks. The DNS owner must have pointed the hostname to the
intended server, and its challenge listener must be reachable, before issuance:

```bash
sudo certbot certonly --webroot -w /var/lib/letsencrypt -d hub.tfh.org
```

See [Certbot's webroot instructions](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

## Enable TLS and automatic renewal

After certificate issuance and the reviewed release are ready:

```bash
sudo install -m 0644 deploy/nginx-production.conf /etc/nginx/sites-available/tfh-production
sudo nginx -t
sudo systemctl reload nginx
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo install -m 0750 deploy/renew-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/tfh-nginx
```

The host serves the reviewed app from the existing immutable-release `current`
link, proxies `/api/` to the existing loopback API, redirects other HTTP paths
to the fixed HTTPS hostname, and retains the ACME webroot for renewals. The
certificate and key paths follow Certbot's `live/hub.tfh.org` layout.
See [NGINX's HTTPS configuration](https://nginx.org/en/docs/http/configuring_https_servers.html).

For an OS package using `certbot.timer`, verify and exercise renewal:

```bash
sudo systemctl enable --now certbot.timer
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --cert-name hub.tfh.org --dry-run --run-deploy-hooks
```

If Certbot was installed by another supported method, use that installation's
documented renewal scheduler instead of adding a second one. The deploy hook
checks NGINX configuration before reloading it so it reads the renewed
certificate. Record the dry-run exit status and scheduler's next run. See
[Certbot's renewal documentation](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

## Record actual production verification

| Check | Required result |
| --- | --- |
| DNS A/AAAA | Hostname reaches the intended server from an external resolver; no stale alternate address. |
| HTTPS | Trusted certificate covers `hub.tfh.org`; expiry is recorded. |
| HTTP | A request redirects to the fixed HTTPS hostname; the ACME path remains usable. |
| App and API | Root, assets and a saved-sermon deep-link reload work; `/api/health` succeeds; unauthenticated library access is denied. |
| Real Entra login | Approved production URL redirects back correctly; real Admin/InternalUser/unassigned checks have the expected outcomes. |
| Renewal | Dry run and deploy hook succeed; the renewal scheduler has a next run. |
| Existing sites | The old public-IP website and private SSH staging listener remain available as intended. |
| Recovery and client approval | TFH-657 and TFH-673 evidence is attached; Tim and Pastor Michael complete the client acceptance record. |

Use [the acceptance record](testing/sprint9-client-acceptance.md) for the date,
deployed revision and observed results. The prepared configuration is not proof
that DNS, HTTPS or Microsoft sign-in has been configured or verified.

## Production go-live record (2026-11-11)

Done with Tim (TFH Technology Director) present, who approved the hostname and
manages the tfh.org DNS in Cloudflare.

| Check | Result |
| --- | --- |
| DNS | Cloudflare A record `hub.tfh.org` to `167.71.149.116`, DNS only (not proxied). The droplet has no IPv6, so there is no AAAA record. The church's internal network DNS needs its own record for on-site users. |
| Release | `main` at `e80b541`, release `/opt/tfh-staging/releases/e80b541-tfh540-20261111T214927Z`, frontend built with Node 24 and `VITE_REDIRECT_URI=https://hub.tfh.org/`. Fresh verified backup first; migration `e602c47a1025` to `f1a7c2d94b38`, one head; 450 sermons before and after. Rollback target `f9a2d83-tfh540-20261108T224455Z`. |
| HTTPS | Let's Encrypt certificate for `hub.tfh.org`, expires 2027-02-09, issued with the webroot bootstrap. |
| HTTP | Redirects (308) to `https://hub.tfh.org/`; the ACME path stays available. |
| App and API | Root 200, deep-link reload 200, `/api/health` 200, `/api/whoami` without a token returns a JSON 401. |
| Renewal | `certbot.timer` enabled; `certbot renew --dry-run --run-deploy-hooks` succeeded with the nginx deploy hook installed. |
| Existing sites | The old public-IP site and the loopback staging site on 8081 still return 200. |
| Entra | The SPA redirect `https://hub.tfh.org/` is registered. Tim's account was changed from Default Access to Admin, and the `#TFH-Staff` group from Default Access to Internal User, so staff get read-only access. Test accounts: `test-hub-admin` (Admin), `test-hub-user` (Internal User), plus an unassigned account for the denied check. |
| AI provider | `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-sonnet-5`, with the church's Anthropic key in the server env only (checked by name and length). A test call to the model succeeded and the chat service answers and declines through it. |
| Real sign-in | An Admin signed in on a phone and loaded the library (`/api/whoami` 200). An account with no real role got the expected 403 before its role was fixed. |

Follow-up (2026-11-13): the team tested the Admin, Internal User and unassigned
test accounts on hub.tfh.org (TFH-654), and Tim accepted the release; see the
[acceptance record](testing/sprint9-client-acceptance.md) (TFH-675).
