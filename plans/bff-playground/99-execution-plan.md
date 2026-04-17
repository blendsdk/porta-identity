# Execution Plan: BFF + M2M Playground

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-12 12:37
> **Progress**: 21/24 tasks (87%)

## Overview

Build a BFF (Backend-for-Frontend) playground application using Koa + `openid-client` v6 that demonstrates confidential client Authorization Code + PKCE flow with server-side token management, plus an M2M (Machine-to-Machine) demo using `client_credentials` grant.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
| --- | --- | --- | --- |
| 1 | Seed & Infrastructure | 1 | 45 min |
| 2 | BFF Project Scaffold | 1 | 30 min |
| 3 | OIDC Client + Auth Routes | 1 | 60 min |
| 4 | Dashboard + Templates | 1 | 60 min |
| 5 | API Routes (UserInfo, Refresh, Introspect) | 1 | 45 min |
| 6 | M2M Demo | 1 | 45 min |
| 7 | Polish + Smoke Test | 1 | 30 min |

**Total: 7 sessions, ~5-6 hours**

---

## Phase 1: Seed & Infrastructure

### Session 1.1: Update Seed Script + Infrastructure

**Reference**: [Seed & Infrastructure](03-seed-infrastructure.md)
**Objective**: Create BFF + M2M clients in seed script, generate BFF config, update startup/stop scripts

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 1.1.1 | Add BFF confidential client creation (one per org) to seed script Phase D | `scripts/playground-seed.ts` |
| 1.1.2 | Add M2M service client creation (client_credentials grant) to seed script Phase D | `scripts/playground-seed.ts` |
| 1.1.3 | Add BFF config.generated.json generation to seed script Phase H | `scripts/playground-seed.ts` |
| 1.1.4 | Update seed summary output (Phase I) with BFF + M2M info | `scripts/playground-seed.ts` |
| 1.1.5 | Update `run-playground.sh` to start BFF server on port 4001 | `scripts/run-playground.sh` |
| 1.1.6 | Update `run-playground-stop.sh` to kill BFF process | `scripts/run-playground-stop.sh` |
| 1.1.7 | Add `playground-bff/config.generated.json` and `playground-bff/node_modules/` to `.gitignore` | `.gitignore` |

**Deliverables**:
- [x] Seed script creates BFF clients + M2M client
- [x] `playground-bff/config.generated.json` is generated with correct data
- [x] Startup scripts manage BFF process lifecycle
- [x] Gitignore updated

**Verify**: Run seed script manually, check generated config file has correct client IDs/secrets.
**Status**: ✅ Complete (2026-04-12)

---

## Phase 2: BFF Project Scaffold

### Session 2.1: Create BFF Project Structure

**Reference**: [BFF Server](04-bff-server.md)
**Objective**: Set up the BFF project with package.json, tsconfig, config loader, session, and basic server skeleton

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 2.1.1 | Create `package.json` with dependencies (openid-client, koa, koa-session, ioredis, handlebars) | `playground-bff/package.json` |
| 2.1.2 | Create `tsconfig.json` (ES2022, NodeNext) | `playground-bff/tsconfig.json` |
| 2.1.3 | Implement config loader (`loadConfig()`, types) | `playground-bff/src/config.ts` |
| 2.1.4 | Implement Redis session configuration | `playground-bff/src/session.ts` |
| 2.1.5 | Implement Koa server skeleton with middleware (session, bodyParser, static, health route) | `playground-bff/src/server.ts`, `playground-bff/src/routes/health.ts` |

**Deliverables**:
- [x] `yarn install` succeeds in playground-bff/
- [x] Server starts on port 4001
- [x] `GET /health` returns JSON status
- [x] Session middleware configured with Redis store

**Verify**: Start server with `npx tsx src/server.ts`, verify health endpoint responds.
**Status**: ✅ Complete (2026-04-12)

---

## Phase 3: OIDC Client + Auth Routes

### Session 3.1: Implement openid-client Integration + Auth Flow

**Reference**: [BFF Server](04-bff-server.md)
**Objective**: Wire up openid-client v6 for discovery, authorization URL building, code exchange, refresh, and logout

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 3.1.1 | Implement openid-client wrapper (discovery, buildAuthorizationUrl, exchangeCode, refreshTokens, fetchUserInfo, introspectToken, getEndSessionUrl, clientCredentialsGrant) | `playground-bff/src/oidc.ts` |
| 3.1.2 | Implement JWT decode helper | `playground-bff/src/helpers/jwt.ts` |
| 3.1.3 | Implement auth routes (GET /auth/login, GET /auth/callback, POST /auth/logout) | `playground-bff/src/routes/auth.ts` |
| 3.1.4 | Wire auth routes into server | `playground-bff/src/server.ts` |

**Deliverables**:
- [x] `GET /auth/login?org=no2fa` redirects to Porta authorization endpoint
- [x] Callback exchanges code for tokens and stores in session
- [x] Logout destroys session and redirects to end_session
- [x] PKCE is used on all auth flows

**Verify**: Start BFF + Porta, navigate to `/auth/login?org=no2fa`, complete login, verify redirect back to BFF with tokens in session.
**Status**: ✅ Complete (2026-04-12)

---

## Phase 4: Dashboard + Templates

### Session 4.1: Implement Handlebars Templates + Dashboard

**Reference**: [BFF UI & Scenarios](05-bff-ui-scenarios.md)
**Objective**: Create the template engine, layout, dashboard, sidebar, and CSS

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 4.1.1 | Implement Handlebars template helper (compile, render, register helpers + partials) | `playground-bff/src/helpers/template.ts` |
| 4.1.2 | Create layout template (HTML head, nav, sidebar slot, main slot, scripts) | `playground-bff/views/layout.hbs` |
| 4.1.3 | Create sidebar partial (scenarios, org selector, tools links, status indicators) | `playground-bff/views/partials/sidebar.hbs`, `playground-bff/views/partials/nav.hbs` |
| 4.1.4 | Create token-panel + event-log partials | `playground-bff/views/partials/token-panel.hbs`, `playground-bff/views/partials/event-log.hbs` |
| 4.1.5 | Create dashboard template (auth status, action bar, token panels, userinfo/introspect panels) | `playground-bff/views/dashboard.hbs` |
| 4.1.6 | Implement dashboard route (reads session, decodes tokens, renders template) | `playground-bff/src/routes/dashboard.ts` |
| 4.1.7 | Create CSS stylesheet (dark/light themes, grid layout, panels, buttons) | `playground-bff/public/css/style.css` |

**Deliverables**:
- [x] Dashboard renders with sidebar and scenario buttons
- [x] Unauthenticated state shows welcome message
- [x] Authenticated state shows decoded tokens in panels
- [x] Dark/light theme via CSS custom properties
- [x] Status indicators visible

**Verify**: Start BFF, navigate to `/`, verify page renders correctly in both authenticated and unauthenticated states.
**Status**: ✅ Complete (2026-04-12)

---

## Phase 5: API Routes (UserInfo, Refresh, Introspect)

### Session 5.1: Implement Server-Side API Endpoints + Client JS

**Reference**: [BFF UI & Scenarios](05-bff-ui-scenarios.md)
**Objective**: Create the AJAX API routes and client-side JavaScript for token operations

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 5.1.1 | Implement API routes (POST /api/me, POST /api/refresh, POST /api/introspect, POST /api/tokens) | `playground-bff/src/routes/api.ts` |
| 5.1.2 | Wire API routes into server | `playground-bff/src/server.ts` |
| 5.1.3 | Create client-side JavaScript (theme toggle, AJAX calls for UserInfo/Refresh/Introspect, status check, event log) | `playground-bff/public/js/app.js` |

**Deliverables**:
- [x] UserInfo button fetches claims from Porta and displays in panel
- [x] Refresh button updates tokens in session
- [x] Introspect button shows token metadata
- [x] Event log records all operations
- [x] Theme toggle persists

**Verify**: Login via BFF, click each button, verify responses are correct.
**Status**: ✅ Complete (2026-04-12)

---

## Phase 6: M2M Demo

### Session 6.1: Implement Client Credentials Demo Page

**Reference**: [M2M Demo](06-m2m-demo.md)
**Objective**: Create the M2M demo page with token request, introspection, and revocation

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 6.1.1 | Create M2M template (config display, action buttons, token panel, how-it-works info) | `playground-bff/views/m2m.hbs` |
| 6.1.2 | Implement M2M routes (GET /m2m, POST /m2m/token, POST /m2m/introspect, POST /m2m/revoke) | `playground-bff/src/routes/m2m.ts` |
| 6.1.3 | Wire M2M routes into server + add M2M client-side JS to app.js | `playground-bff/src/server.ts`, `playground-bff/public/js/app.js` |

**Deliverables**:
- [x] M2M page renders with config info
- [x] "Get Token" obtains client_credentials token
- [x] "Introspect" shows token is active
- [x] "Revoke" invalidates token
- [x] Results displayed in panels

**Verify**: Navigate to `/m2m`, click "Get Token", verify token is returned. Introspect, verify active. Revoke, verify revoked.
**Status**: ✅ Complete (2026-04-12)

---

## Phase 7: Polish + Smoke Test

### Session 7.1: README, Smoke Test, Final Verification

**Reference**: [Testing Strategy](07-testing-strategy.md)
**Objective**: Add README, smoke test script, and do a full manual walkthrough

**Tasks**:

| # | Task | File |
| --- | --- | --- |
| 7.1.1 | Create BFF playground README (quickstart, architecture, scenarios) | `playground-bff/README.md` |
| 7.1.2 | Create smoke test script | `scripts/playground-bff-smoke.sh` |
| 7.1.3 | Full manual walkthrough of all scenarios + M2M (fix any issues found) | — |

**Deliverables**:
- [ ] README documents how to start and use the BFF playground
- [ ] Smoke test passes (health, dashboard, m2m page, login redirect)
- [ ] All 8 scenarios verified working
- [ ] M2M flow verified working

**Verify**: `clear && sleep 3 && bash scripts/playground-bff-smoke.sh`

---

## Task Checklist (All Phases)

### Phase 1: Seed & Infrastructure ✅
- [x] 1.1.1 Add BFF confidential client creation to seed script
- [x] 1.1.2 Add M2M service client creation to seed script
- [x] 1.1.3 Add BFF config.generated.json generation to seed script
- [x] 1.1.4 Update seed summary output with BFF + M2M info
- [x] 1.1.5 Update run-playground.sh to start BFF server
- [x] 1.1.6 Update run-playground-stop.sh to kill BFF process
- [x] 1.1.7 Add playground-bff entries to .gitignore

### Phase 2: BFF Project Scaffold ✅
- [x] 2.1.1 Create package.json
- [x] 2.1.2 Create tsconfig.json
- [x] 2.1.3 Implement config loader
- [x] 2.1.4 Implement Redis session configuration
- [x] 2.1.5 Implement Koa server skeleton with health route

### Phase 3: OIDC Client + Auth Routes ✅
- [x] 3.1.1 Implement openid-client wrapper
- [x] 3.1.2 Implement JWT decode helper
- [x] 3.1.3 Implement auth routes (login, callback, logout)
- [x] 3.1.4 Wire auth routes into server

### Phase 4: Dashboard + Templates ✅
- [x] 4.1.1 Implement Handlebars template helper
- [x] 4.1.2 Create layout template
- [x] 4.1.3 Create sidebar + nav partials
- [x] 4.1.4 Create token-panel + event-log partials
- [x] 4.1.5 Create dashboard template
- [x] 4.1.6 Implement dashboard route
- [x] 4.1.7 Create CSS stylesheet

### Phase 5: API Routes ✅
- [x] 5.1.1 Implement API routes (me, refresh, introspect, tokens)
- [x] 5.1.2 Wire API routes into server
- [x] 5.1.3 Create client-side JavaScript

### Phase 6: M2M Demo ✅
- [x] 6.1.1 Create M2M template
- [x] 6.1.2 Implement M2M routes
- [x] 6.1.3 Wire M2M routes + client JS

### Phase 7: Polish + Smoke Test
- [ ] 7.1.1 Create README
- [ ] 7.1.2 Create smoke test script
- [ ] 7.1.3 Full manual walkthrough + fixes

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/bff-playground/99-execution-plan.md`"
2. Read the relevant technical spec document

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan bff-playground` to continue

---

## Dependencies

```
Phase 1 (Seed & Infrastructure)
    ↓
Phase 2 (BFF Project Scaffold)
    ↓
Phase 3 (OIDC Client + Auth Routes)
    ↓
Phase 4 (Dashboard + Templates)
    ↓
Phase 5 (API Routes)
    ↓
Phase 6 (M2M Demo)
    ↓
Phase 7 (Polish + Smoke Test)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ BFF starts on port 4001 and serves dashboard
3. ✅ All 8 auth scenarios work through BFF
4. ✅ M2M client_credentials flow works
5. ✅ Tokens stored server-side, session cookie is HttpOnly
6. ✅ UserInfo, Refresh, Introspect all work server-side
7. ✅ Smoke test script passes
8. ✅ Startup scripts manage both SPA and BFF
9. ✅ README documents usage
10. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
