# Requirements: Playground Application & Infrastructure

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-14](../../requirements/RD-14-playground-application.md), [RD-15](../../requirements/RD-15-playground-infrastructure.md)

## Feature Overview

A self-contained developer playground that exercises every Porta authentication flow
through an interactive vanilla HTML/JS SPA, backed by a comprehensive seed dataset
with 5 organizations, 8+ test users, RBAC, custom claims, and varied 2FA policies.

## Functional Requirements

### Must Have (RD-14 — Playground Application)

- [ ] Vanilla HTML/JS SPA served by sirv-cli on port 4000 (zero build step)
- [ ] OIDC Authorization Code + PKCE via vendored oidc-client-ts
- [ ] Configuration panel: org selector, client type, OIDC URLs, scopes
- [ ] Scenario selector with 8 pre-configured test scenarios
- [ ] Token dashboard: decoded ID token, access token, refresh token, metadata
- [ ] UserInfo panel: standard claims, RBAC roles, custom claims, raw JSON
- [ ] Logout button (RP-initiated) and re-login button
- [ ] MailHog link (opens http://localhost:8025 in new tab)
- [ ] Status indicators: Porta reachable, MailHog reachable, auth state, active org

### Must Have (RD-15 — Playground Infrastructure)

- [ ] Enhanced seed script creating 5 orgs with different 2FA policies
- [ ] 8+ test users with varied statuses and 2FA enrollment states
- [ ] OIDC clients (public per org + 1 confidential) with localhost:4000 redirect URIs
- [ ] RBAC roles/permissions and custom claims for the playground application
- [ ] Config output file: `playground/config.generated.js` with all resource IDs
- [ ] One-command startup: `yarn playground` (Docker → migrations → seed → Porta → playground)
- [ ] Teardown: `yarn playground:stop`
- [ ] Idempotent seed (safe to re-run)

### Should Have

- [ ] Token refresh demo button
- [ ] Session timeline / event log
- [ ] Responsive layout (desktop + tablet)
- [ ] Dark/light theme toggle
- [ ] `yarn playground:reset` (drop DB → re-migrate → re-seed)
- [ ] Seed summary table printed after seeding
- [ ] Health check before seed (verify Docker services)

### Won't Have (Out of Scope)

- Server-side rendering or backend for the playground app
- Admin panel for managing Porta resources (use the CLI)
- Production deployment of the playground
- Framework-specific examples (React, Vue, Angular)
- Automated testing of the playground app itself
- Performance testing seed data

## Technical Requirements

### Performance

- Seed script completes in <30 seconds
- Playground app loads in <2 seconds (all assets local)
- Discovery endpoint health checks respond within 5 seconds

### Compatibility

- Works in Chrome, Firefox, Edge (modern browsers, ES modules)
- Requires Node.js >=22, Docker, yarn

### Security

- All test data is local/development only
- Client secrets logged to console only (not stored in committed files)
- `config.generated.js` is gitignored
- TOTP secrets logged for manual authenticator app setup

## Acceptance Criteria

### RD-14

1. [ ] `cd playground && yarn start` serves the app on port 4000
2. [ ] All 8 test scenarios trigger correct OIDC flows
3. [ ] ID token decoded and displayed with all claims
4. [ ] UserInfo button calls `/userinfo` and shows response
5. [ ] Logout clears session and returns to home
6. [ ] Status indicators show Porta and MailHog reachability
7. [ ] Configuration panel switches between orgs and clients

### RD-15

1. [ ] `yarn playground` starts everything from scratch
2. [ ] `yarn playground:stop` cleanly stops all services
3. [ ] Seed is idempotent (re-run produces no errors)
4. [ ] 5 organizations with correct 2FA policies
5. [ ] 8+ users with correct statuses and 2FA enrollment
6. [ ] OIDC clients with redirect URIs to localhost:4000
7. [ ] `playground/config.generated.js` written with all IDs
8. [ ] TOTP secrets and recovery codes logged
