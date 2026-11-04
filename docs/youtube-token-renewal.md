# Renewing the YouTube sign-in

The sermon hub downloads captions from YouTube using one shared OAuth sign-in for the TFH
channel. That sign-in can stop working for two different reasons, and this doc covers both:
why it expires, how to issue a fresh one, and how to roll a new one out everywhere it is
configured.

## Why the sign-in expires

Google treats OAuth consent screens differently depending on whether a project is in Testing
or Published status. A project left in Testing mode only issues refresh tokens that expire
after 7 days of inactivity, no matter how the token is used otherwise. A Published project's
refresh tokens do not expire on a schedule like that; they only stop working if they are
revoked, unused for 6 months, or the user's account access changes.

Whether to publish the TFH Cloud project, versus staying in Testing and accepting the 7 day
expiry, is a decision for Tim to make (tracked in TFH-668), since it affects how the Google
Cloud project is verified and who it is registered under. Until that is decided, assume
Testing mode and its 7 day expiry, and follow the proactive rotation guidance below.

## Issuing a refresh token

1. Sign in to a Google account that manages the TFH YouTube channel.
2. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
3. In the gear icon settings, check "Use your own OAuth credentials" and enter the project's
   `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`.
4. In Step 1, enter the scope `https://www.googleapis.com/auth/youtube.force-ssl`, then
   authorize and approve as the channel manager account.
5. In Step 2, exchange the authorization code for tokens. Copy the refresh token shown there,
   this is the long-lived value, not the short-lived access token above it.

The Playground flow above requests `access_type=offline` and `prompt=consent` automatically
when you check "Use your own OAuth credentials" and re-authorize, which is what actually
causes Google to issue a refresh token at all. Re-running Step 1 without re-consenting will
reuse an existing grant and may not return a new refresh token.

## Rotating in each environment

A new refresh token has to be set in every place the app reads `YOUTUBE_OAUTH_REFRESH_TOKEN`
from, and the API and worker both need to restart after it changes:

- Local development: set it in the ignored `Backend/.env` file, then restart `up.py` and any
  running worker.
- Staging droplet: set it in `/etc/tfh-staging/.env`, then restart the API and worker
  services so they pick up the new value.

`YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET` do not usually need to change when
only the refresh token expires; only update them if the OAuth client itself was recreated or
rotated in Google Cloud.

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