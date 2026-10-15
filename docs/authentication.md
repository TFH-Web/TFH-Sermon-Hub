# Staff authentication and security (TFH-543)

The SPA signs in with Microsoft Entra; Flask authorizes a **delegated API access
token**, never the SPA ID token. Browser permissions come from `/api/whoami`
after Flask verifies the token, not from a demo user or an unverified role claim.

## Entra configuration required before staging verification

1. On the API app registration, expose a delegated scope named `access_as_user`
   under its Application ID URI (normally `api://<API_CLIENT_ID>`). Set the API
   manifest's `api.requestedAccessTokenVersion` to `2`.
2. On the SPA registration, add that delegated API permission and grant the
   required consent. Register the exact local/staging/production SPA redirect
   URIs. A shared SPA/API registration is supported, but separate registrations
   must use the API client ID for the backend audience, not the SPA ID.
3. Define/assign the API app roles `Admin` and `InternalUser` (the existing
   `Internal User` spelling is also accepted). Ensure those assignments appear
   on **API access tokens**. Do not authorize by email domain alone.
4. Configure matching non-secret values:

| Setting | Meaning |
| --- | --- |
| Backend `TENANT_ID` | The single authorized Entra tenant |
| Backend `ENTRA_API_AUDIENCE` | API client ID, the v2 token's `aud`; falls back to existing `CLIENT_ID` |
| Backend `ENTRA_API_SCOPE` | Required `scp` entry, default `access_as_user` |
| Frontend `VITE_CLIENT_ID` | SPA client ID |
| Frontend `VITE_TENANT_ID` | Same tenant as the backend |
| Frontend `VITE_API_SCOPE` | Full exposed scope, e.g. `api://<API_CLIENT_ID>/access_as_user` |
| Frontend `VITE_REDIRECT_URI` | Exact registered SPA redirect URI |
| Frontend `VITE_API_BASE_URL` | API origin, or `/` / unset behind same-origin NGINX |

Never put a client secret, refresh token, or other credential in `VITE_*` values:
Vite embeds them in public JavaScript. The SPA is a public client and needs no
client secret. Rebuild the frontend after changing its environment values.

## Access contract

Flask uses tenant-specific JWKS and RS256 only; it checks issuer, audience,
tenant, v2 token version, required expiration/issued-at/not-before claims, the
delegated API scope and an explicit role. ID tokens, Graph tokens and unsigned
or invalid tokens are rejected. Missing/invalid credentials return JSON 401;
valid credentials without scope/role return JSON 403. Both include `error` and
`message`, without credential or provider exception details.

| Operation | Internal User / InternalUser | Admin |
| --- | --- | --- |
| Read library, transcript, search, `/whoami` | Yes | Yes |
| Create/edit/delete sermon | No | Yes |
| Import, reprocess, regenerate summary | No | Yes |
| `/api/health`, `/api/` | Public | Public |

New mutation endpoints must retain the Admin boundary and extend this matrix's
tests. Tag CRUD is implemented separately in TFH-545; its current UI is disabled
for non-Admins. Client-side hiding/route checks are UX, not a security boundary.

MSAL silently acquires/renews an access token before each API request. Renewal
failure stops the request instead of sending it anonymously. Session rejection
clears role/query state and offers sign-in recovery. Account switching clears
the query cache and rechecks `/whoami`; responses from a prior account are
discarded. No API request automatically launches an interactive sign-in loop.
The login page offers a real account picker and a local-only return route.

## Test safety and verification

`TESTING=True` alone does **not** bypass authorization. Ordinary isolated API
tests also explicitly set `AUTH_TEST_BYPASS=True`; setting that flag without
testing mode fails app startup. No environment variable enables the flag.
Signed-token tests leave bypass off and replace only JWKS HTTP with a local RSA
public key, exercising the actual signature/claim/permission path.

The existing Playwright fixture identity is allowed only when both Vite `DEV`
and `VITE_E2E_TEST=true` are set. Production builds never honor that flag.
Never run a testing Flask app or Vite development server on a public server.

Run locally:

```sh
cd Backend
poetry install --no-interaction --no-root
poetry run pytest
poetry run pip-audit --format=json --output=pip-audit.json
cd ../Frontend
npm ci
npm test
npm run build
npm audit --audit-level=high --json
```

CI scans the installed Poetry-locked environment and npm lockfile including dev
dependencies. Audit execution failures fail CI. npm blocks high/critical; the
Python scanner blocks **all** known findings (a stricter policy because pip-audit
does not supply a reliable cross-advisory severity field). Both retain JSON
artifacts for 30 days. No findings are currently exempted. Do not add blanket
ignores: a proposed exception requires a specific advisory ID, risk rationale,
owner, review/expiry date and explicit team approval before changing the gate.

## Remaining live acceptance checks

Automated fakes cannot prove tenant app registration/consent or real SSO works.
Before completing TFH-543, verify staging with real assigned Admin, each staff
role spelling and an unassigned account. Check refresh, sign-out, account switch,
expired-session recovery, deep-link return, denied mutation and API audience/scope
alignment. Record results without copying raw tokens or secrets into Jira.

References: [Microsoft token acquisition](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token),
[access-token validation](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens),
[pip-audit](https://github.com/pypa/pip-audit),
[npm audit](https://docs.npmjs.com/cli/commands/npm-audit/).
