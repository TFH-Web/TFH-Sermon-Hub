# Renewing the YouTube sign-in

The sermon hub downloads captions from YouTube using one shared OAuth sign-in for the TFH
channel. That sign-in can stop working for two different reasons, and this doc covers both:
why it expires, how to issue a fresh one, and how to roll a new one out everywhere it is
configured.

## Why the sign-in expires

For an External OAuth app in Testing, refresh tokens with the YouTube caption scope expire
seven days after they are created, even if they are being used. This is not an inactivity
timeout. The exception for basic identity-only scopes does not apply to YouTube captions.
Publishing removes this specific seven-day limit, but does not guarantee a permanent token:
revocation, inactivity, token limits and account policies can still invalidate it. See
[Google's refresh-token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

Whether to publish the TFH Cloud project, versus staying in Testing and accepting the 7 day
expiry, is a decision for Tim to make (tracked in TFH-668), since it affects how the Google
Cloud project is verified and who it is registered under. Until that is decided, assume
Testing mode and its 7 day expiry, and follow the proactive rotation guidance below.

## Issuing a refresh token

1. Sign in to a Google account that manages the TFH YouTube channel.
2. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
3. In the gear icon settings, check "Use your own OAuth credentials" and enter the project's
   `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`. The OAuth client must allow
   `https://developers.google.com/oauthplayground` as a redirect URI for this flow.
4. In Step 1, enter the scope `https://www.googleapis.com/auth/youtube.force-ssl`, then
   authorize and approve as the channel manager account.
5. In Step 2, exchange the authorization code for tokens. Copy the refresh token shown there,
   this is the long-lived value, not the short-lived access token above it.

The authorization request needs `access_type=offline`; use `prompt=consent` when requesting
a new grant. Check the Playground settings rather than assuming that entering your own
client credentials changes these options. If no refresh token is returned, check those
settings and authorize again. Follow Google's
[offline-access instructions](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

## Rotating in each environment

A new refresh token has to be set in every place the app reads `YOUTUBE_OAUTH_REFRESH_TOKEN`
from, and the API and worker both need to restart after it changes:

- Local development: set it in the ignored `Backend/.env` file. Stop the Flask API, then
  start it again from `Backend` with `./run.sh`. If `REDIS_URL` is configured, restart the
  worker as well using the existing `poetry run python worker.py` command. Without Redis,
  processing runs in the API and there is no separate worker to restart.
- Staging droplet: pause scheduled caption batches and let active queue jobs finish before
  rotating the value in `/etc/tfh-staging/.env`. Restart only `tfh-staging-api.service` and
  `tfh-staging-worker.service`, then check their status and logs. Follow the queue and
  service procedures in [deploying.md](deploying.md). Resume the caption timer only after
  the authorized connection and processing providers are ready.

`up.py` applies database migrations; it does not start or restart the Flask API. Token
rotation does not require a migration. Preserve existing transcripts while recovering.

`YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET` do not usually need to change when
only the refresh token expires; only update them if the OAuth client itself was recreated or
rotated in Google Cloud.

Preview the affected batch before retrying it. For local development, from `Backend`:

```sh
poetry run flask --app "tsh:create_app('testing.cfg')" backfill-captions --failed-only --limit 1 --dry-run
```

After the cause is fixed, run the same reviewed command without `--dry-run` to retry one
sermon. Staging commands must use the production factory and `tfh_run` wrapper from
[deploying.md](deploying.md), not `testing.cfg`. A retry consumes API/provider resources;
do not start a full-library run just to test a new token.

## Diagnosing a failure

A caption failure starting with `YouTube sign-in expired, refresh the token` includes a label
in parentheses that says which of these it is:

- `(invalid_grant)`: the refresh token itself expired or was revoked. Issue a new one with the
  steps above and roll it out to every environment that needs it.
- `(token refresh failed)`: Google rejected the renewal for another reason, most often a
  `YOUTUBE_OAUTH_CLIENT_ID` or `YOUTUBE_OAUTH_CLIENT_SECRET` that no longer matches the OAuth
  client in Google Cloud. Check those values before issuing a new refresh token.
- `permission denied` (a separate message, not this one): the sign-in itself still works, but
  that account cannot manage captions on this channel. A new token will not fix this; check
  the account's channel access instead.

The message never includes the token itself, so it is safe to copy into a ticket. Do not paste
a token into a ticket or chat message.

## Rotating proactively

Waiting for a caption job to fail is not a good way to find out a token expired, since by
then the backfill may have stalled for days. While the project stays in Testing mode, plan to
reissue the refresh token on a schedule shorter than 7 days, and update it in every
environment from the list above each time, rather than waiting for the failure message to
show up.
