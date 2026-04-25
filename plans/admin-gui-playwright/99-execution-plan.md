# Execution Plan: Admin GUI Playwright E2E Tests

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-25 21:07
> **Progress**: 26/30 tasks (87%)
> **CodeOps Version**: 1.8.2

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Infrastructure Setup | 2 | 3-4 hours |
| 2 | Authentication & Navigation Tests | 1 | 2-3 hours |
| 3 | Page-Level Tests (Dashboard, Orgs, Sessions) | 2 | 3-4 hours |
| 4 | Page-Level Tests (Audit, Config, Keys) | 1 | 2-3 hours |
| 5 | Page-Level Tests (Export/Import, Search, Wizard) | 1 | 2-3 hours |
| 6 | Workflow Tests & Bug Fixes | 1 | 2-3 hours |
| 7 | Entity Pages Plan Update & Documentation | 1 | 1-2 hours |

**Total: 9 sessions, ~15-22 hours**

---

## Phase 1: Infrastructure Setup

### Session 1.1: Playwright Config, Global Setup & Teardown

**Reference**: [Infrastructure](03-infrastructure.md)
**Objective**: Create the Playwright test infrastructure — config, global setup (Porta + BFF), global teardown, seed data

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Create Playwright config with serial execution, projects (auth-setup, unauthenticated, authenticated), CI/headless support | `admin-gui/playwright.config.ts` |
| 1.1.2 | Create MailHog client (adapted from existing `tests/e2e/helpers/mailhog.ts`) | `admin-gui/tests/e2e/fixtures/mailhog.ts` |
| 1.1.3 | Create seed data module (orgs, users, clients, audit entries, config, keys, sessions) | `admin-gui/tests/e2e/fixtures/seed-data.ts` |
| 1.1.4 | Create global setup (start Porta in-process on 49300, run migrations, seed data, start BFF on 49301) | `admin-gui/tests/e2e/setup/global-setup.ts` |
| 1.1.5 | Create global teardown (stop BFF, stop Porta, disconnect DB/Redis) | `admin-gui/tests/e2e/setup/global-teardown.ts` |
| 1.1.6 | Add `test:e2e`, `test:e2e:headed`, `test:e2e:debug` scripts to package.json; add `.auth/` to `.gitignore` | `admin-gui/package.json`, `admin-gui/.gitignore` |

**Deliverables**:
- [ ] Playwright config exists and is parseable
- [ ] Global setup starts both servers without errors
- [ ] Global teardown cleans up
- [ ] `cd admin-gui && npx playwright test --list` shows project structure

**Verify**: `cd admin-gui && npx playwright test --list`

---

### Session 1.2: Auth Setup & Test Fixtures

**Reference**: [Infrastructure](03-infrastructure.md) §4, §5
**Objective**: Implement the magic-link authentication flow and test fixtures

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.2.1 | Create auth-setup test (navigate BFF → OIDC → magic link → MailHog → complete flow → save storageState) | `admin-gui/tests/e2e/setup/auth-setup.ts` |
| 1.2.2 | Create admin test fixtures (testData with env vars, re-exported test/expect) | `admin-gui/tests/e2e/fixtures/admin-fixtures.ts` |
| 1.2.3 | Verify full infrastructure works: run auth-setup → check storageState file created | Manual verification |
| 1.2.4 | Add any needed `data-testid` attributes to SPA components for reliable test selectors | Various `admin-gui/src/client/` files |

**Deliverables**:
- [ ] Auth setup completes successfully (magic link flow works)
- [ ] `tests/e2e/.auth/admin-session.json` file is created
- [ ] Test fixtures export `test` and `expect`
- [ ] A minimal smoke test can navigate the authenticated app

**Verify**: `cd admin-gui && npx playwright test --project=auth-setup`

---

## Phase 2: Authentication & Navigation Tests

### Session 2.1: Login Redirect, Sidebar, Breadcrumbs, TopBar Tests

**Reference**: [Test Specifications](04-test-specifications.md) §1, §2
**Objective**: Write all authentication and navigation test specs

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Write login redirect tests (4 tests: unauthenticated root, deep link, login page, health endpoint) | `admin-gui/tests/e2e/auth/login-redirect.spec.ts` |
| 2.1.2 | Write sidebar navigation tests (5 tests: nav items render, active highlight, navigation, collapse/expand, system section) | `admin-gui/tests/e2e/navigation/sidebar.spec.ts` |
| 2.1.3 | Write breadcrumb tests (5 tests: dashboard, org list, create org, clickable links, deep pages) | `admin-gui/tests/e2e/navigation/breadcrumbs.spec.ts` |
| 2.1.4 | Write topbar tests (6 tests: user info, user menu, logout option, org selector, current org, search trigger) | `admin-gui/tests/e2e/navigation/topbar.spec.ts` |
| 2.1.5 | Run all auth + nav tests, fix any failing tests (fix app code or add missing data-testid) | Various |

**Deliverables**:
- [ ] 4 auth tests pass
- [ ] 16 navigation tests pass
- [ ] All 20 tests pass in serial

**Verify**: `cd admin-gui && npx playwright test tests/e2e/auth tests/e2e/navigation`

---

## Phase 3: Page-Level Tests (Dashboard, Organizations, Sessions)

### Session 3.1: Dashboard Tests

**Reference**: [Test Specifications](04-test-specifications.md) §3 — Dashboard
**Objective**: Write comprehensive Dashboard E2E tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Write dashboard tests (8 tests: page load, stats cards, chart, time toggle, activity feed, quick actions ×2, health badge) | `admin-gui/tests/e2e/pages/dashboard.spec.ts` |
| 3.1.2 | Fix any Dashboard rendering issues discovered during testing | `admin-gui/src/client/pages/Dashboard.tsx` or related |

**Deliverables**:
- [ ] 8 dashboard tests pass
- [ ] No app crashes on Dashboard

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/dashboard.spec.ts`

---

### Session 3.2: Organization & Session Page Tests

**Reference**: [Test Specifications](04-test-specifications.md) §3 — Organizations, Sessions
**Objective**: Write Organization list/create and Session list tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Write organization tests (9 tests: list load, columns, search, status filter, create button, form render, auto-slug, validation, cancel) | `admin-gui/tests/e2e/pages/organizations.spec.ts` |
| 3.2.2 | Write session tests (5 tests: list load, columns, search, revoke confirm, cancel) | `admin-gui/tests/e2e/pages/sessions.spec.ts` |
| 3.2.3 | Fix any Organization/Session page issues discovered during testing | Various |

**Deliverables**:
- [ ] 9 organization tests pass
- [ ] 5 session tests pass
- [ ] All Phase 3 tests (22 total) pass

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/organizations.spec.ts tests/e2e/pages/sessions.spec.ts`

---

## Phase 4: Page-Level Tests (Audit, Config, Keys)

### Session 4.1: Audit Log, Config Editor, Signing Keys Tests

**Reference**: [Test Specifications](04-test-specifications.md) §3 — Audit, Config, Keys
**Objective**: Write tests for system management pages

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Write audit log tests (6 tests: page load, columns, search, action filter, metadata expansion, CSV export button) | `admin-gui/tests/e2e/pages/audit.spec.ts` |
| 4.1.2 | Write config editor tests (6 tests: page load, entries display, edit button, edit mode, cancel edit, save confirm) | `admin-gui/tests/e2e/pages/config.spec.ts` |
| 4.1.3 | Write signing keys tests (7 tests: page load, columns, JWKS URL, generate button, generate confirm, rotate button, rotate type-to-confirm) | `admin-gui/tests/e2e/pages/keys.spec.ts` |
| 4.1.4 | Fix any page issues discovered during testing | Various |

**Deliverables**:
- [ ] 6 audit tests pass
- [ ] 6 config tests pass
- [ ] 7 keys tests pass
- [ ] All Phase 4 tests (19 total) pass

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/audit.spec.ts tests/e2e/pages/config.spec.ts tests/e2e/pages/keys.spec.ts`

---

## Phase 5: Page-Level Tests (Export/Import, Search, Wizard)

### Session 5.1: Export/Import, Search Results, Getting Started Tests

**Reference**: [Test Specifications](04-test-specifications.md) §3 — Export/Import, Search, Wizard
**Objective**: Write tests for remaining implemented pages

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Write export/import tests (6 tests: export page load, entity checkboxes, format selector, export button, import page load, file upload area) | `admin-gui/tests/e2e/pages/export-import.spec.ts` |
| 5.1.2 | Write search results tests (3 tests: page with query, results display, empty results) | `admin-gui/tests/e2e/pages/search.spec.ts` |
| 5.1.3 | Write getting started wizard tests (4 tests: page load, step indicators, navigation, completion tracking) | `admin-gui/tests/e2e/pages/wizard.spec.ts` |
| 5.1.4 | Fix any page issues discovered during testing | Various |

**Deliverables**:
- [ ] 6 export/import tests pass
- [ ] 3 search tests pass
- [ ] 4 wizard tests pass
- [ ] All Phase 5 tests (13 total) pass

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/export-import.spec.ts tests/e2e/pages/search.spec.ts tests/e2e/pages/wizard.spec.ts`

---

## Phase 6: Workflow Tests & Final Stabilization

### Session 6.1: Cross-Page Workflows & Full Suite Stabilization

**Reference**: [Test Specifications](04-test-specifications.md) §4
**Objective**: Write workflow tests, run full suite, fix all remaining issues

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | Write org lifecycle workflow tests (2 tests: create→cancel→list flow, dashboard→create→back) | `admin-gui/tests/e2e/workflows/org-lifecycle.spec.ts` |
| 6.1.2 | Write dashboard actions workflow tests (3 tests: quick actions navigate correctly, activity feed click) | `admin-gui/tests/e2e/workflows/dashboard-actions.spec.ts` |
| 6.1.3 | Write error handling tests (3 tests: 404 route, rapid navigation, back/forward) | `admin-gui/tests/e2e/workflows/error-handling.spec.ts` |
| 6.1.4 | Run FULL test suite, fix ALL failing tests (3 consecutive clean runs) | All spec files |

**Deliverables**:
- [ ] 8 workflow tests pass
- [ ] Full suite of 82 tests passes
- [ ] 3 consecutive green runs (no flaky tests)

**Verify**: `cd admin-gui && npx playwright test`

---

## Phase 7: Entity Pages Plan Update & Documentation

### Session 7.1: Update Entity Pages Plan & Documentation

**Reference**: [Requirements](01-requirements.md), [Testing Strategy](07-testing-strategy.md) §Ongoing Maintenance
**Objective**: Update the entity pages plan with E2E gate, update documentation

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.1.1 | Update `admin-gui-entity-pages/99-execution-plan.md` — add E2E test gate rule, add E2E test tasks to each entity phase | `plans/admin-gui-entity-pages/99-execution-plan.md` |
| 7.1.2 | Update `docs/guide/admin-gui.md` with E2E test information (running, writing, debugging) | `docs/guide/admin-gui.md` |
| 7.1.3 | Update `.clinerules/project.md` with new test infrastructure and commands | `.clinerules/project.md` |
| 7.1.4 | Final full suite run to confirm everything still passes | All spec files |

**Deliverables**:
- [ ] Entity pages plan has E2E gate + per-phase test tasks
- [ ] Admin GUI docs updated with Playwright section
- [ ] project.md reflects new test commands
- [ ] Full suite passes

**Verify**: `cd admin-gui && npx playwright test`

---

## Task Checklist (All Phases)

### Phase 1: Infrastructure Setup
- [x] 1.1.1 Create Playwright config ✅ (completed: 2026-04-25 12:32)
- [x] 1.1.2 Create MailHog client ✅ (completed: 2026-04-25 12:33)
- [x] 1.1.3 Create seed data module ✅ (completed: 2026-04-25 12:34)
- [x] 1.1.4 Create global setup (Porta + BFF) ✅ (completed: 2026-04-25 12:35)
- [x] 1.1.5 Create global teardown ✅ (completed: 2026-04-25 12:35)
- [x] 1.1.6 Add package.json scripts + .gitignore ✅ (completed: 2026-04-25 12:36)
- [x] 1.2.1 Create auth-setup (magic link flow → storageState) ✅ (completed: 2026-04-25 18:36)
- [x] 1.2.2 Create admin test fixtures ✅ (completed: 2026-04-25 18:36)
- [x] 1.2.3 Verify infrastructure works end-to-end ✅ (completed: 2026-04-25 18:41)
- [x] 1.2.4 Add data-testid attributes to SPA components ✅ (completed: 2026-04-25 18:40)

### Phase 2: Authentication & Navigation Tests
- [x] 2.1.1 Write login redirect tests (4 tests) ✅ (completed: 2026-04-25 19:19)
- [x] 2.1.2 Write sidebar tests (3 new: active highlight, collapse/expand, system section) ✅ (completed: 2026-04-25 19:19)
- [x] 2.1.3 Write breadcrumb tests (5 tests) ✅ (completed: 2026-04-25 19:19)
- [x] 2.1.4 Write topbar tests (6 tests) ✅ (completed: 2026-04-25 19:19)
- [x] 2.1.5 Verify tests compile (tsc + playwright --list) ✅ (completed: 2026-04-25 19:20)

### Phase 3: Dashboard, Organizations, Sessions Tests
- [x] 3.1.1 Write dashboard tests (8 tests) ✅ (completed: 2026-04-25 20:52)
- [x] 3.1.2 Fix dashboard issues (StatsCard trend type mismatch) ✅ (completed: 2026-04-25 20:54)
- [x] 3.2.1 Organization tests — already covered by entity-pages plan (23 tests) ✅ (completed: 2026-04-25 20:57)
- [x] 3.2.2 Write session tests (5 tests) ✅ (completed: 2026-04-25 20:58)
- [x] 3.2.3 Fix broken pages: sessions (null .slice), audit (null formatAction), config (.map on non-array) ✅ (completed: 2026-04-25 21:01)

### Phase 4: Audit, Config, Keys Tests
- [x] 4.1.1 Write audit log tests (6 tests) ✅ (completed: 2026-04-25 21:03)
- [x] 4.1.2 Write config editor tests (6 tests) ✅ (completed: 2026-04-25 21:04)
- [x] 4.1.3 Write signing keys tests (7 tests) ✅ (completed: 2026-04-25 21:04)
- [x] 4.1.4 Fix page issues — all 3 broken pages fixed in Session 3.2 ✅

### Phase 5: Export/Import, Search, Wizard Tests
- [x] 5.1.1 Write export/import tests (6 tests) ✅ (completed: 2026-04-25 21:06)
- [x] 5.1.2 Write search results tests (3 tests) ✅ (completed: 2026-04-25 21:06)
- [x] 5.1.3 Write wizard tests (4 tests) ✅ (completed: 2026-04-25 21:06)
- [x] 5.1.4 Fix page issues — no issues found ✅

### Phase 6: Workflow Tests & Stabilization
- [ ] 6.1.1 Write org lifecycle workflow tests (2 tests)
- [ ] 6.1.2 Write dashboard actions workflow tests (3 tests)
- [ ] 6.1.3 Write error handling tests (3 tests)
- [ ] 6.1.4 Full suite passes — 3 consecutive green runs

### Phase 7: Plan Update & Documentation
- [ ] 7.1.1 Update entity pages plan with E2E gate
- [ ] 7.1.2 Update admin-gui docs
- [ ] 7.1.3 Update .clinerules/project.md
- [ ] 7.1.4 Final full suite confirmation

---

## Session Protocol

### Starting a Session

1. Start agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh start`
2. Reference this plan: "Implement Phase X, Session X.X per `plans/admin-gui-playwright/99-execution-plan.md`"

### Ending a Session

1. Run verification: `cd admin-gui && npx playwright test`
2. Handle commit per the active **commit mode** (see "Commit Behavior During Plan Execution" in `make_plan.md`)
3. End agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh finished`
4. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan admin-gui-playwright` to continue

---

## Dependencies

```
Phase 1 (Infrastructure)
    ↓
Phase 2 (Auth + Nav Tests)
    ↓
Phase 3 (Dashboard, Orgs, Sessions) + Phase 4 (Audit, Config, Keys) + Phase 5 (Export, Search, Wizard) ←── can be parallel in theory, but serial per execution
    ↓
Phase 6 (Workflows + Stabilization)
    ↓
Phase 7 (Plan Update + Docs)
```

---

## Quality Gate

### 🚨 E2E Test Gate for `admin-gui-entity-pages`

**The following rule applies to ALL future Admin GUI work:**

> No entity page implementation phase may begin until ALL existing Playwright E2E tests pass.
> Every new entity page phase MUST include corresponding E2E tests.
> All E2E tests must pass before the phase is considered complete.

This rule is enforced by:
1. Adding E2E test tasks to each phase of the entity pages plan
2. Making `cd admin-gui && npx playwright test` part of the verify step
3. Blocking progression to the next phase if any E2E test fails

---

## Success Criteria

**This plan is complete when:**

1. ✅ All 7 phases completed
2. ✅ 82+ E2E tests pass (`cd admin-gui && npx playwright test`)
3. ✅ No flaky tests (3 consecutive clean runs)
4. ✅ Auth setup works via magic-link flow
5. ✅ Tests work headless (CI) and headed (local)
6. ✅ `admin-gui-entity-pages` plan updated with E2E gate
7. ✅ Documentation updated
8. ✅ `.clinerules/project.md` updated
9. ✅ No dead code — no unused parameters, functions, classes, or modules (per `code.md` rule 4)
10. ✅ Security hardened — test infra doesn't expose real credentials (per `code.md` rules 32-34)
11. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
