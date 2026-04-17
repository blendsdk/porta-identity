# Requirements: BFF + M2M Playground

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Build a server-side OIDC playground application that demonstrates the BFF (Backend-for-Frontend) pattern — a Koa web server acting as an OIDC Relying Party using `openid-client` v6. This complements the existing browser-side SPA playground by exercising confidential client flows where tokens are managed server-side. Additionally, include an M2M (Machine-to-Machine) demo using the `client_credentials` grant.

## Functional Requirements

### Must Have

- [ ] Koa server on port 4001 with server-rendered HTML pages
- [ ] Authorization Code + PKCE flow via `openid-client` v6 with confidential client (`client_secret_post`)
- [ ] Server-side token storage in Redis-backed sessions (browser gets session cookie only)
- [ ] Login flow: browser → BFF → Porta authorization → BFF callback → session → dashboard
- [ ] Logout flow: session destroy + RP-initiated logout at Porta
- [ ] Server-side token refresh via `openid-client`
- [ ] Server-side UserInfo fetch via `openid-client`
- [ ] Server-side token introspection via `openid-client`
- [ ] Dashboard showing: auth status, decoded tokens (from session), UserInfo, event log
- [ ] Scenario picker (sidebar) supporting all 8 test scenarios from the SPA playground
- [ ] M2M demo page: client_credentials token request, decode, introspect
- [ ] Seed script creates BFF confidential client (redirect to `http://localhost:4001/auth/callback`)
- [ ] Seed script creates M2M service client (grant_types: `['client_credentials']` only)
- [ ] Seed script generates `playground-bff/config.generated.json` with client IDs + secrets
- [ ] Startup scripts updated to launch/stop BFF alongside SPA playground

### Should Have

- [ ] Dark/light theme toggle (matching SPA playground aesthetic)
- [ ] Service status indicators (Porta health, Redis, MailHog)
- [ ] Event log showing OIDC flow steps (redirects, token exchanges, errors)
- [ ] Token expiry display with countdown
- [ ] Multi-org scenario switching (different org slugs → different Porta issuers)

### Won't Have (Out of Scope)

- No changes to Porta's OIDC provider or any `src/` files
- No changes to the existing SPA playground (`playground/`)
- No automated test suite for the BFF (it IS the test/debug tool)
- No back-channel logout (Porta doesn't support it)
- No production deployment configuration
- No Docker image for the BFF

## Technical Requirements

### Performance

- Server startup under 3 seconds
- Session lookup under 10ms (Redis)
- Page render under 100ms

### Compatibility

- Node.js >=22 (same as Porta)
- ESM modules (`"type": "module"`)
- TypeScript with tsx for dev server

### Security

- Session cookie: HttpOnly, SameSite=Lax, Secure=false (localhost dev)
- Client secret stored server-side only (never sent to browser)
- CSRF protection on state-changing routes (POST /m2m/token, POST /auth/logout)
- PKCE on all authorization code flows (Porta requires it)

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
| --- | --- | --- | --- |
| OIDC library | openid-client, custom HTTP | openid-client v6 | Same author as oidc-provider, certified, handles discovery/PKCE/refresh |
| Server framework | Express, Koa, Fastify | Koa | Matches Porta's stack, team familiarity |
| Session store | In-memory, Redis, SQLite | Redis | Already running via Docker, production-realistic |
| Template engine | EJS, Handlebars, Pug | Handlebars | Already used by Porta for auth templates |
| M2M placement | Separate app, section in BFF | Section in BFF | Simpler infrastructure, shared session for demo |
| Config format | .js (ESM), .json, .env | .json | Server-side app, JSON is simplest for Node |
| PKCE | Optional, Required | Required | Porta enforces PKCE for all auth code flows |

## Acceptance Criteria

1. [ ] BFF server starts on port 4001 and renders dashboard
2. [ ] Login redirects to Porta, authenticates user, callback stores tokens in session
3. [ ] Dashboard displays decoded ID token, access token, refresh token from session
4. [ ] UserInfo button fetches from Porta server-side and displays result
5. [ ] Refresh button performs server-side token refresh
6. [ ] Introspect button calls Porta's introspection endpoint server-side
7. [ ] Logout destroys session and redirects to Porta's end_session endpoint
8. [ ] All 8 SPA scenarios work (normal login, magic link, email OTP, TOTP, recovery, third-party, password reset, TOTP setup)
9. [ ] M2M page: button fetches client_credentials token, displays decoded result + introspection
10. [ ] `yarn playground` starts both SPA (4000) and BFF (4001)
11. [ ] Seed script creates BFF + M2M clients and generates config
