# Current State: BFF + M2M Playground

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

#### SPA Playground (`playground/`)

A static single-page application served by `sirv-cli` on port 4000 that acts as an OIDC Relying Party using `oidc-client-ts` in the browser. It demonstrates 8 authentication scenarios across 5 organizations with different 2FA policies.

**Key files:**
- `playground/index.html` — Main page with sidebar + dashboard
- `playground/callback.html` — OIDC callback handler
- `playground/js/auth.js` — `oidc-client-ts` UserManager wrapper
- `playground/js/config.js` — Loads `config.generated.js`
- `playground/js/tokens.js` — JWT decode + display
- `playground/js/userinfo.js` — Fetches OIDC UserInfo
- `playground/js/ui.js` — DOM utilities, event log, theme
- `playground/css/style.css` — 455-line stylesheet with dark/light themes

**All flows are browser-side** — public client, PKCE, tokens in browser memory.

#### Seed Script (`scripts/playground-seed.ts`)

Seeds Porta with test data in 9 phases:

| Phase | Data |
| --- | --- |
| A | Run migrations |
| B | 5 organizations (no2fa, email2fa, totp2fa, optional2fa, thirdparty) |
| C | 1 application + 3 permissions + 2 roles + 2 custom claims |
| D | 5 public SPA clients + 1 confidential client (for E2E tests) |
| E | 10 users across orgs with passwords |
| F | TOTP setup for totp2fa users |
| G | Role/claim assignments |
| H | Generate `playground/config.generated.js` |
| I | Print summary |

**Existing confidential client** (Phase D):
- Name: "Playground Confidential"
- Org: no2fa
- Grant types: `['authorization_code', 'refresh_token']` (NO `client_credentials`)
- Redirect: `http://localhost:3000/playground-no2fa/auth/cb` (Porta path, not BFF)
- Auth method: `client_secret_basic`
- Purpose: E2E Playwright tests, not the SPA playground

**No M2M client exists.**

#### Infrastructure Scripts

| Script | Purpose |
| --- | --- |
| `scripts/run-playground.sh` | Starts Docker, waits for services, seeds, starts Porta (port 3000), starts SPA (port 4000) |
| `scripts/run-playground-stop.sh` | Kills SPA + Porta processes, stops Docker |
| `scripts/run-playground-reset.sh` | Stops, cleans volumes, restarts fresh |

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `scripts/playground-seed.ts` | Seeds test data | Add BFF client, M2M client, generate BFF config |
| `scripts/run-playground.sh` | Starts playground | Add BFF server startup |
| `scripts/run-playground-stop.sh` | Stops playground | Add BFF server shutdown |
| `scripts/run-playground-reset.sh` | Reset playground | No changes (calls stop + start) |
| `playground/js/config.js` | SPA config loader | No changes |
| `.gitignore` | Git exclusions | Add `playground-bff/config.generated.json` |

## Porta OIDC Configuration (relevant)

### Enabled Grant Types
- `authorization_code` ✅
- `client_credentials` ✅
- `refresh_token` ✅

### PKCE
- **Required for ALL authorization code flows** (`required: () => true`)
- BFF must use PKCE even though it's a confidential client

### Token Formats
- Access tokens: `opaque` (default), `jwt` for resource-indicated
- ID tokens: JWT (ES256)
- Client credentials tokens: `opaque`

### Features
- Introspection: enabled
- Revocation: enabled
- Resource Indicators: enabled (conditional — only audience-restricts when explicitly requested)

### Client Authentication
- `client_secret_post`: supported ✅
- `client_secret_basic`: supported ✅
- SHA-256 pre-hashing middleware on OIDC routes handles secret verification

### Scopes
`openid`, `profile`, `email`, `address`, `phone`, `offline_access`

### Client Service (`src/clients/service.ts`)

`findForOidc()` maps internal clients to oidc-provider format:
- Public clients: no `client_secret`, `token_endpoint_auth_method: 'none'`
- Confidential clients: SHA-256 hash as `client_secret`, `token_endpoint_auth_method` from DB

## Gaps Identified

### Gap 1: No BFF-style OIDC Client

**Current Behavior:** Only SPA (browser-side) and E2E test (Playwright) act as OIDC clients.
**Required Behavior:** A server-side Koa app acting as a confidential OIDC client.
**Fix Required:** Create `playground-bff/` with Koa + openid-client.

### Gap 2: No M2M Client

**Current Behavior:** No client with `client_credentials` grant exists in the seed.
**Required Behavior:** A service client that can obtain tokens without user interaction.
**Fix Required:** Add M2M client to seed script.

### Gap 3: No BFF Client in Seed

**Current Behavior:** The existing confidential client redirects to Porta's own path, not a BFF.
**Required Behavior:** A confidential client redirecting to `http://localhost:4001/auth/callback`.
**Fix Required:** Add BFF client to seed script (separate from the existing E2E confidential client).

### Gap 4: Startup Scripts Don't Know About BFF

**Current Behavior:** `run-playground.sh` starts SPA on port 4000 only.
**Required Behavior:** Also starts BFF on port 4001.
**Fix Required:** Update startup/stop scripts.

## Dependencies

### Internal Dependencies

- Porta running on port 3000 (OIDC provider)
- Redis running (session store for BFF, shared with Porta)
- Seed script must create BFF + M2M clients before BFF starts

### External Dependencies

- `openid-client` v6 (npm package)
- `koa` + `@koa/router` (npm packages)
- `koa-session` (npm package)
- `ioredis` (npm package — same as Porta)
- `handlebars` (npm package — same as Porta)

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| openid-client v6 API different from v5 | Medium | Medium | Consult v6 docs/examples; panva maintains both provider and client |
| PKCE required for confidential client | Low | Low | openid-client handles PKCE automatically |
| Session cookie conflicts with Porta cookies | Low | Medium | Use different cookie name (`bff_session` vs Porta's cookies) |
| Port conflict | Low | Low | Use 4001, document clearly |
| Body parser conflict (like Porta had) | Low | Medium | BFF doesn't share middleware with Porta — independent app |
