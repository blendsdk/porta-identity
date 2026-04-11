# Execution Plan: Playground Application & Infrastructure

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-11 17:44
> **Progress**: 22/24 tasks (92%)

## Overview

Implements RD-14 (Playground Application) and RD-15 (Playground Infrastructure)
to deliver an interactive OIDC playground with 8 test scenarios, comprehensive
seed data, and one-command startup.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                    | Sessions | Est. Time |
| ----- | ------------------------ | -------- | --------- |
| 1     | Seed Script              | 2        | 90 min    |
| 2     | Startup Infrastructure   | 1        | 30 min    |
| 3     | Playground App Skeleton  | 2        | 60 min    |
| 4     | Playground App Features  | 2        | 60 min    |
| 5     | Polish & Verification    | 1        | 30 min    |

**Total: 8 sessions, ~4.5 hours**

---

## Phase 1: Seed Script (RD-15)

### Session 1.1: Seed Script — Orgs, App, Clients

**Reference**: [03-seed-script.md](03-seed-script.md)
**Objective**: Rewrite playground-seed.ts with 5 orgs, shared app, RBAC setup, and clients

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 1.1.1 | Define org/user data constants and interfaces           | `scripts/playground-seed.ts`     |
| 1.1.2 | Implement org creation with 2FA policy setting          | `scripts/playground-seed.ts`     |
| 1.1.3 | Implement app creation, RBAC roles/permissions, claims  | `scripts/playground-seed.ts`     |
| 1.1.4 | Implement client creation per org (public + confidential)| `scripts/playground-seed.ts`    |

**Deliverables**:
- [ ] 5 organizations with correct 2FA policies
- [ ] Shared "Playground" application with admin/viewer roles
- [ ] Custom claim definitions (department, employee_id)
- [ ] Public OIDC clients per org + 1 confidential client
- [ ] Idempotent find-or-create for all resources

**Verify**: `clear && sleep 3 && yarn tsx scripts/playground-seed.ts`

---

### Session 1.2: Seed Script — Users, 2FA, Config Output

**Reference**: [03-seed-script.md](03-seed-script.md)
**Objective**: Add user creation, 2FA enrollment, role/claim assignments, config output, summary

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 1.2.1 | Implement user creation with status management          | `scripts/playground-seed.ts`     |
| 1.2.2 | Implement 2FA enrollment (email OTP + TOTP + skip)      | `scripts/playground-seed.ts`     |
| 1.2.3 | Implement RBAC role assignments and custom claim values  | `scripts/playground-seed.ts`    |
| 1.2.4 | Implement config.generated.js output and summary table  | `scripts/playground-seed.ts`     |

**Deliverables**:
- [ ] 8+ users with correct statuses
- [ ] Email OTP and TOTP users enrolled, secrets/codes logged
- [ ] Role and claim assignments on demo users
- [ ] `playground/config.generated.js` written with all IDs
- [ ] Formatted summary table printed to console
- [ ] Seed runs twice without errors (idempotent)

**Verify**: `clear && sleep 3 && yarn tsx scripts/playground-seed.ts && yarn tsx scripts/playground-seed.ts`

---

## Phase 2: Startup Infrastructure (RD-15)

### Session 2.1: Startup, Teardown, and Reset Scripts

**Reference**: [04-startup-infra.md](04-startup-infra.md)
**Objective**: Create shell scripts for one-command startup, teardown, reset

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 2.1.1 | Create run-playground.sh (Docker, seed, Porta, sirv)    | `scripts/run-playground.sh`      |
| 2.1.2 | Create run-playground-stop.sh and run-playground-reset.sh| `scripts/run-playground-*.sh`   |
| 2.1.3 | Add playground scripts to package.json                  | `package.json`                   |
| 2.1.4 | Create playground/package.json with sirv-cli dependency | `playground/package.json`        |
| 2.1.5 | Update .gitignore for playground artifacts              | `.gitignore`                     |

**Deliverables**:
- [ ] `yarn playground` starts everything from scratch
- [ ] `yarn playground:stop` kills Porta + playground processes
- [ ] `yarn playground:reset` drops DB and re-seeds
- [ ] `playground/package.json` with sirv-cli
- [ ] `.gitignore` updated for config.generated.js and playground/node_modules

**Verify**: `clear && sleep 3 && bash scripts/run-playground.sh` (then Ctrl+C to test cleanup)

---

## Phase 3: Playground App Skeleton (RD-14)

### Session 3.1: HTML Pages, CSS, Vendor Setup

**Reference**: [05-playground-app.md](05-playground-app.md)
**Objective**: Create the static HTML skeleton, CSS theme system, vendor oidc-client-ts

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 3.1.1 | Create index.html with layout structure                 | `playground/index.html`          |
| 3.1.2 | Create callback.html for OIDC redirect                  | `playground/callback.html`       |
| 3.1.3 | Create style.css with dark/light theme variables        | `playground/css/style.css`       |
| 3.1.4 | Download and vendor oidc-client-ts browser bundle       | `playground/vendor/`             |

**Deliverables**:
- [ ] index.html with header, sidebar, dashboard, event log structure
- [ ] callback.html with processing message
- [ ] Complete CSS with dark/light themes, grid layout, token panels
- [ ] oidc-client-ts.min.js vendored (no CDN dependency)

**Verify**: Manually open `playground/index.html` in browser (layout renders)

---

### Session 3.2: Core JS Modules — Config, Auth, UI

**Reference**: [05-playground-app.md](05-playground-app.md)
**Objective**: Implement config loading, OIDC auth module, and UI helpers

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 3.2.1 | Create config.js with loadConfig, getOrgSettings, SCENARIOS | `playground/js/config.js`    |
| 3.2.2 | Create auth.js with UserManager, login/logout/callback  | `playground/js/auth.js`          |
| 3.2.3 | Create ui.js with status indicators, event log, theme   | `playground/js/ui.js`            |

**Deliverables**:
- [ ] Config module loads config.generated.js and provides org settings
- [ ] Auth module wraps oidc-client-ts with login/logout/callback/refresh
- [ ] UI module provides status dots, event log, theme toggle, view switching

**Verify**: Manually test with Porta running (config loads, status dots work)

---

## Phase 4: Playground App Features (RD-14)

### Session 4.1: Token Dashboard and UserInfo

**Reference**: [05-playground-app.md](05-playground-app.md)
**Objective**: Implement JWT decoding, token display, and UserInfo endpoint integration

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 4.1.1 | Create tokens.js with JWT decode and token panels       | `playground/js/tokens.js`        |
| 4.1.2 | Create userinfo.js with fetch and display               | `playground/js/userinfo.js`      |

**Deliverables**:
- [ ] JWT base64url decoding (no external library)
- [ ] ID token panel: decoded header + payload
- [ ] Access token panel: decoded or opaque display
- [ ] Refresh token panel: presence indicator
- [ ] UserInfo fetch via discovery endpoint + Bearer token

**Verify**: Complete a login flow; verify token display and UserInfo response

---

### Session 4.2: App.js — Scenario Selector and Integration

**Reference**: [05-playground-app.md](05-playground-app.md)
**Objective**: Wire everything together in the main app module

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 4.2.1 | Create app.js init, scenario rendering, org selector    | `playground/js/app.js`           |
| 4.2.2 | Implement all button handlers (login, logout, refresh, userinfo, relogin) | `playground/js/app.js` |
| 4.2.3 | Implement config panel (org change, config details display) | `playground/js/app.js`       |

**Deliverables**:
- [ ] 8 scenario buttons render with names, descriptions
- [ ] Clicking scenario selects org, shows credentials in event log
- [ ] Login button triggers OIDC flow for selected scenario
- [ ] Logout, refresh, userinfo, re-login buttons all functional
- [ ] Config panel shows OIDC URLs, updates on org change

**Verify**: Run playground, select each scenario, verify OIDC settings update

---

## Phase 5: Polish & Verification (RD-14 + RD-15)

### Session 5.1: README, Integration Testing, Bug Fixes

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write playground README, test all scenarios end-to-end, fix bugs

**Tasks**:

| #     | Task                                                    | File                             |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 5.1.1 | Write playground/README.md with setup and usage docs    | `playground/README.md`           |
| 5.1.2 | End-to-end test: Normal Login scenario                  | Manual verification              |
| 5.1.3 | End-to-end test: Email OTP + TOTP + Consent scenarios   | Manual verification              |
| 5.1.4 | Run `yarn verify` to confirm no regressions             | All project files                |

**Deliverables**:
- [ ] Playground README with quickstart, scenarios, architecture
- [ ] Normal Login scenario tested end-to-end
- [ ] At least 2 more scenarios tested (Email OTP, TOTP, or Consent)
- [ ] `yarn verify` passes (lint + build + tests)
- [ ] Any bugs found during testing fixed

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Seed Script
- [x] 1.1.1 Define org/user data constants and interfaces ✅ (completed: 2026-04-11 17:42)
- [x] 1.1.2 Implement org creation with 2FA policy setting ✅ (completed: 2026-04-11 17:42)
- [x] 1.1.3 Implement app creation, RBAC roles/permissions, claims ✅ (completed: 2026-04-11 17:42)
- [x] 1.1.4 Implement client creation per org (public + confidential) ✅ (completed: 2026-04-11 17:42)
- [x] 1.2.1 Implement user creation with status management ✅ (completed: 2026-04-11 17:42)
- [x] 1.2.2 Implement 2FA enrollment (email OTP + TOTP + skip) ✅ (completed: 2026-04-11 17:42)
- [x] 1.2.3 Implement RBAC role assignments and custom claim values ✅ (completed: 2026-04-11 17:42)
- [x] 1.2.4 Implement config.generated.js output and summary table ✅ (completed: 2026-04-11 17:42)

### Phase 2: Startup Infrastructure
- [x] 2.1.1 Create run-playground.sh (Docker, seed, Porta, sirv) ✅ (completed: 2026-04-11 17:47)
- [x] 2.1.2 Create run-playground-stop.sh and run-playground-reset.sh ✅ (completed: 2026-04-11 17:47)
- [x] 2.1.3 Add playground scripts to package.json ✅ (completed: 2026-04-11 17:47)
- [x] 2.1.4 Create playground/package.json with sirv-cli dependency ✅ (completed: 2026-04-11 17:47)
- [x] 2.1.5 Update .gitignore for playground artifacts ✅ (completed: 2026-04-11 17:47)

### Phase 3: Playground App Skeleton
- [x] 3.1.1 Create index.html with layout structure ✅ (completed: 2026-04-11 17:49)
- [x] 3.1.2 Create callback.html for OIDC redirect ✅ (completed: 2026-04-11 17:49)
- [x] 3.1.3 Create style.css with dark/light theme variables ✅ (completed: 2026-04-11 17:50)
- [x] 3.1.4 Download and vendor oidc-client-ts browser bundle ✅ (completed: 2026-04-11 17:51)

### Phase 3 (continued): Core JS Modules
- [x] 3.2.1 Create config.js with loadConfig, getOrgSettings, SCENARIOS ✅ (completed: 2026-04-11 17:52)
- [x] 3.2.2 Create auth.js with UserManager, login/logout/callback ✅ (completed: 2026-04-11 17:52)
- [x] 3.2.3 Create ui.js with status indicators, event log, theme ✅ (completed: 2026-04-11 17:52)

### Phase 4: Playground App Features
- [x] 4.1.1 Create tokens.js with JWT decode and token panels ✅ (completed: 2026-04-11 17:53)
- [x] 4.1.2 Create userinfo.js with fetch and display ✅ (completed: 2026-04-11 17:53)
- [x] 4.2.1 Create app.js init, scenario rendering, org selector ✅ (completed: 2026-04-11 17:53)
- [x] 4.2.2 Implement all button handlers ✅ (completed: 2026-04-11 17:53)
- [x] 4.2.3 Implement config panel ✅ (completed: 2026-04-11 17:53)

### Phase 5: Polish & Verification
- [x] 5.1.1 Write playground/README.md ✅ (completed: 2026-04-11 17:55)
- [ ] 5.1.2 End-to-end test: Normal Login scenario (manual: run `yarn playground`)
- [ ] 5.1.3 End-to-end test: Email OTP + TOTP + Consent scenarios (manual)
- [ ] 5.1.4 Run `yarn verify` to confirm no regressions

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/playground/99-execution-plan.md`"
2. Read the referenced technical spec document

### Ending a Session

1. Run `clear && sleep 3 && yarn verify` (if code changes affect Porta codebase)
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan playground` to continue

---

## Dependencies

```
Phase 1: Seed Script
    ↓
Phase 2: Startup Infrastructure
    ↓
Phase 3: Playground App Skeleton
    ↓
Phase 4: Playground App Features
    ↓
Phase 5: Polish & Verification
```

Phase 1 must complete before Phase 2 (startup script runs the seed).
Phase 2 must complete before Phase 3 (playground/package.json needed).
Phase 3 and 4 are the app itself — linear dependency.
Phase 5 verifies everything together.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `yarn verify` passes (lint + build + tests)
3. ✅ `yarn playground` starts everything from clean state
4. ✅ At least 3 scenarios tested end-to-end
5. ✅ Token dashboard displays decoded tokens correctly
6. ✅ Documentation (playground/README.md) written
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
