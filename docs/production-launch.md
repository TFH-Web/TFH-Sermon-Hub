# Production launch: sermonhub.tfh.org (TFH-672)

This is a prepared installation procedure for review. As checked on 2026-11-07,
the domain has no DNS record and these templates have not been installed.
Jack coordinates the church DNS owner and Entra administrator. Preserve the
existing public-IP website and SSH-only staging server block.

## Release and church prerequisites

1. Select a reviewed release and complete [integrated acceptance](testing/sprint9-jack.md).
   Confirm the provider setup, real role checks, processed-data recovery and
   required regression fixes. A merge into `dev` does not redeploy the droplet.
2. Agree with the church DNS owner on the cutover window and the current droplet
   address. The audited droplet is `167.71.149.116`; reconfirm it before the DNS
   owner creates the `sermonhub.tfh.org` A record. Reconcile any existing AAAA
   record with the server's actual IPv6 routing.
3. In the intended Entra **SPA** registration, register the exact production
   redirect URI, `https://sermonhub.tfh.org/`. Retain the separate localhost
   staging URI until the team has moved. Verify the exposed API scope, audience
   and assigned Admin/InternalUser roles in the intended tenant.
4. Build the reviewed frontend with the intended nonsecret `VITE_CLIENT_ID`,
   `VITE_TENANT_ID`, `VITE_API_SCOPE` and
   `VITE_REDIRECT_URI=https://sermonhub.tfh.org/`. Follow the existing immutable
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
sudo certbot certonly --webroot -w /var/lib/letsencrypt -d sermonhub.tfh.org
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
certificate and key paths follow Certbot's `live/sermonhub.tfh.org` layout.
See [NGINX's HTTPS configuration](https://nginx.org/en/docs/http/configuring_https_servers.html).

For an OS package using `certbot.timer`, verify and exercise renewal:

```bash
sudo systemctl enable --now certbot.timer
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --cert-name sermonhub.tfh.org --dry-run --run-deploy-hooks
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
| HTTPS | Trusted certificate covers `sermonhub.tfh.org`; expiry is recorded. |
| HTTP | A request redirects to the fixed HTTPS hostname; the ACME path remains usable. |
| App and API | Root, assets and a saved-sermon deep-link reload work; `/api/health` succeeds; unauthenticated library access is denied. |
| Real Entra login | Approved production URL redirects back correctly; real Admin/InternalUser/unassigned checks have the expected outcomes. |
| Renewal | Dry run and deploy hook succeed; the renewal scheduler has a next run. |
| Existing sites | The old public-IP website and private SSH staging listener remain available as intended. |
| Recovery and client approval | TFH-657 and TFH-673 evidence is attached; Tim and Pastor Michael complete the client acceptance record. |

Use [the acceptance record](testing/sprint9-client-acceptance.md) for the date,
deployed revision and observed results. The prepared configuration is not proof
that DNS, HTTPS or Microsoft sign-in has been configured or verified.
