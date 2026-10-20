# Staff authentication and security (TFH-543)

The SPA signs in with Microsoft Entra; Flask authorizes a **delegated API access
token**, never the SPA ID token. Browser permissions come from `/api/whoami`
after Flask verifies the token, not from a demo user or an unverified role claim.

## Entra configuration required before staging verification

Sermon Hub uses one app registration for both the SPA and the API:

- Tenant ID: `bbd486c4-7835-4ba2-9df4-907a25b4b46c`
- Application (client) ID: `f8108595-ffa8-4c94-957f-b92b006da038`

Do these steps in the Entra admin center (Identity > Applications > App
registrations > Sermon Hub) with an account that can grant admin consent. Until
they are done, every API call returns 401 or 403, so finish them before this
change reaches `dev`.

1. **Expose an API.** Set the Application ID URI to
   `api://f8108595-ffa8-4c94-957f-b92b006da038`. Add a scope named
   `access_as_user`, with "Who can consent" set to "Admins and users" and the
   state set to Enabled.
2. **Manifest.** Set `api.requestedAccessTokenVersion` to `2` and save. Without
   this, Entra issues v1 access tokens and the backend rejects every one of them
   with 401.
3. **API permissions.** Add a permission > My APIs > Sermon Hub > Delegated >
   `access_as_user`. Then select "Grant admin consent" for the tenant, and check
   that the status column shows it as granted.
4. **App roles.** Make sure two roles exist, both allowed for "Users/Groups":
   `Admin` (can read, edit, delete, import and reprocess) and `InternalUser`
   (read only). The older `Internal User` value is also accepted.
5. **Assign roles.** In Enterprise applications > Sermon Hub > Users and groups,
   assign `Admin` to the staff who manage sermons and a role to every teammate
   who tests the app. An account with no role signs in but only sees the "no
   staff role" message. Do not authorize by email domain alone.
6. **Redirect URIs.** Under Authentication > Single-page application, register
   each site's root URL exactly, with the trailing slash:
   - `http://localhost:5173/` for local development
   - the staging site's root URL, once staging has a domain
   - `https://sermonhub.tfh.org/` for production

   Each deployment sets `VITE_REDIRECT_URI` to its own entry from this list.

Each teammate then adds the scope to their local env files. A fresh copy of the
`.env.example` files already has these lines:

- `Frontend/.env`: `VITE_API_SCOPE=api://f8108595-ffa8-4c94-957f-b92b006da038/access_as_user`
- `Backend/.env`: `ENTRA_API_AUDIENCE=f8108595-ffa8-4c94-957f-b92b006da038` and
  `ENTRA_API_SCOPE=access_as_user`. Both are optional, because the defaults
  (`CLIENT_ID` and `access_as_user`) already match.

All settings involved:

| Setting | Meaning |
| --- | --- |
| Backend `TENANT_ID` | The single authorized Entra tenant |
| Backend `ENTRA_API_AUDIENCE` | API client ID, the v2 token's `aud`; falls back to existing `CLIENT_ID` |
| Backend `ENTRA_API_SCOPE` | Required `scp` entry, default `access_as_user` |
| Frontend `VITE_CLIENT_ID` | SPA client ID (the same registration) |
| Frontend `VITE_TENANT_ID` | Same tenant as the backend |
| Frontend `VITE_API_SCOPE` | `api://f8108595-ffa8-4c94-957f-b92b006da038/access_as_user` |
| Frontend `VITE_REDIRECT_URI` | This site's registered redirect URI from step 6 |
| Frontend `VITE_API_BASE_URL` | API origin, or `/` / unset behind same-origin NGINX |

If the API is ever split into its own app registration, expose the scope there,
add the permission on the SPA registration, and set `ENTRA_API_AUDIENCE` to the
API's client ID, not the SPA's.

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
