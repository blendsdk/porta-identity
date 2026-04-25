# Execution Plan: Admin GUI Entity Pages

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-25 (All phases complete)
> **Progress**: 62/62 tasks (100%) ✅
> **Prerequisite**: Sub-plan 1 (admin-gui-core-layout) must be complete
> **CodeOps Version**: 1.8.2
> **Amendment**: 2026-04-25 — Integrated Playwright E2E tests into each entity phase (see [Testing Strategy](06-testing-strategy.md))

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Shared Entity Components | 1 | 2-3 hours |
| 2 | Organization Pages + E2E | 3 | 5-7 hours |
| 3 | Application Pages + E2E | 2 | 4-5 hours |
| 4 | Client Pages (incl. wizard) + E2E | 3 | 5-7 hours |
| 5 | User Pages (incl. invite wizard) + E2E | 4 | 7-10 hours |
| 6 | RBAC Pages + E2E | 2 | 4-6 hours |
| 7 | Custom Claims Pages + E2E | 1 | 2-3 hours |
| 8 | Test Consolidation (Unit + Cross-entity E2E) | 2 | 3-4 hours |
| 9 | Documentation Review & Update | 1 | 1-2 hours |

**Total: 19 sessions, ~33-47 hours**

---

## Phase 1: Shared Entity Components

### Session 1.1: Entity Detail & Branding Components

**Objective**: Build shared components used across multiple entity pages

| # | Task | File |
|---|------|------|
| 1.1.1 | Implement EntityDetailTabs (reusable tabbed layout with title, status badge, actions) | `components/EntityDetailTabs.tsx` |
| 1.1.2 | Implement BrandingEditor (logo/favicon upload, ColorPicker, CSS editor, live preview) | `components/BrandingEditor.tsx` |
| 1.1.3 | Implement SecretDisplay (one-time secret view with copy + warning) | `components/SecretDisplay.tsx` |
| 1.1.4 | Implement LoginMethodSelector (override/inherit radio + method checkboxes) | `components/LoginMethodSelector.tsx` |
| 1.1.5 | Implement ColorPicker component (hex input + visual picker) | `components/ColorPicker.tsx` |

**Verify**: `cd admin-gui && yarn typecheck`

---

## Phase 2: Organization Pages

### Session 2.1: Org List & Create

| # | Task | File |
|---|------|------|
| 2.1.1 | Implement OrganizationList (DataGrid, search, status filter, bulk actions, row click → detail) | `pages/organizations/OrganizationList.tsx` |
| 2.1.2 | Implement CreateOrganization (dialog form: name, slug, locale, login methods, Zod validation) | `pages/organizations/CreateOrganization.tsx` |
| 2.1.3 | Wire routes: /organizations, /organizations/new | `router.tsx` |

### Session 2.2: Org Detail

| # | Task | File |
|---|------|------|
| 2.2.1 | Implement OrgDetail Overview tab (info, status badge, actions: suspend/activate/archive) | `pages/organizations/OrganizationDetail.tsx` |
| 2.2.2 | Implement OrgDetail Branding tab (BrandingEditor integration) | `pages/organizations/OrganizationDetail.tsx` |
| 2.2.3 | Implement OrgDetail Settings tab (locale, login methods, 2FA policy) | `pages/organizations/OrganizationDetail.tsx` |
| 2.2.4 | Implement OrgDetail Apps, Users, History tabs | `pages/organizations/OrganizationDetail.tsx` |
| 2.2.5 | Wire route: /organizations/:id | `router.tsx` |

### Session 2.3: Organization E2E Tests

**Reference**: [Testing Strategy](06-testing-strategy.md) — Phase 2 E2E specs
**Objective**: Verify organization CRUD flows end-to-end through real BFF → Porta → DB

| # | Task | File |
|---|------|------|
| 2.3.1 | Write org list E2E tests (renders seeded orgs, search, status filter) | `tests/e2e/pages/organizations.spec.ts` |
| 2.3.2 | Write org create E2E tests (form submit, validation, new org in list) | `tests/e2e/pages/organizations.spec.ts` |
| 2.3.3 | Write org detail E2E tests (tabs load, info displayed, direct URL) | `tests/e2e/pages/organizations.spec.ts` |
| 2.3.4 | Write org status transition E2E tests (suspend, activate, archive with type-to-confirm) | `tests/e2e/pages/organizations.spec.ts` |

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/organizations.spec.ts`

---

## Phase 3: Application Pages

### Session 3.1: App List & Create

| # | Task | File |
|---|------|------|
| 3.1.1 | Implement ApplicationList (DataGrid, search, org + status filter, row click) | `pages/applications/ApplicationList.tsx` |
| 3.1.2 | Implement CreateApplication (form: name, slug, org, description) | `pages/applications/CreateApplication.tsx` |

### Session 3.2: App Detail + E2E Tests

| # | Task | File |
|---|------|------|
| 3.2.1 | Implement AppDetail Overview tab (info, status actions) | `pages/applications/ApplicationDetail.tsx` |
| 3.2.2 | Implement AppDetail Modules tab (toggle switches per module) | `pages/applications/ApplicationDetail.tsx` |
| 3.2.3 | Implement AppDetail Clients, Roles, Permissions, Claims, History tabs | `pages/applications/ApplicationDetail.tsx` |
| 3.2.4 | Expand seed data: add test application linked to `acme-corp` | `tests/e2e/fixtures/seed-data.ts` |
| 3.2.5 | Write app E2E tests (list, create, detail tabs, modules, status transitions) | `tests/e2e/pages/applications.spec.ts` |

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/applications.spec.ts`

---

## Phase 4: Client Pages

### Session 4.1: Client List & Wizard (Steps 1-2)

| # | Task | File |
|---|------|------|
| 4.1.1 | Implement ClientList (DataGrid, search, app/type/status filter) | `pages/clients/ClientList.tsx` |
| 4.1.2 | Implement CreateClient wizard step 1: Basic info (name, app, type) | `pages/clients/CreateClient.tsx` |
| 4.1.3 | Implement CreateClient wizard step 2: OAuth config (redirect URIs, grant types, scopes) | `pages/clients/CreateClient.tsx` |

### Session 4.2: Client Wizard (Steps 3-4) & Detail

| # | Task | File |
|---|------|------|
| 4.2.1 | Implement CreateClient wizard step 3: Security (PKCE, token TTLs, login methods) | `pages/clients/CreateClient.tsx` |
| 4.2.2 | Implement CreateClient wizard step 4: Review & create (shows generated client_id + secret) | `pages/clients/CreateClient.tsx` |
| 4.2.3 | Implement ClientDetail (Overview, OAuth Config, Login Methods, Secrets, History tabs) | `pages/clients/ClientDetail.tsx` |
| 4.2.4 | Implement client secret management (generate, list, revoke with SecretDisplay) | `pages/clients/ClientDetail.tsx` |

### Session 4.3: Client E2E Tests

**Reference**: [Testing Strategy](06-testing-strategy.md) — Phase 4 E2E specs

| # | Task | File |
|---|------|------|
| 4.3.1 | Expand seed data: add test client linked to test app | `tests/e2e/fixtures/seed-data.ts` |
| 4.3.2 | Write client list E2E tests (renders, filter by app/type) | `tests/e2e/pages/clients.spec.ts` |
| 4.3.3 | Write client wizard E2E tests (4 steps end-to-end, secret display) | `tests/e2e/pages/clients.spec.ts` |
| 4.3.4 | Write client detail + secret management E2E tests | `tests/e2e/pages/clients.spec.ts` |

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/clients.spec.ts`

---

## Phase 5: User Pages

### Session 5.1: User List & Create

| # | Task | File |
|---|------|------|
| 5.1.1 | Implement UserList (DataGrid, search, org/status filter, bulk actions, virtual scroll) | `pages/users/UserList.tsx` |
| 5.1.2 | Implement CreateUser (form: email, name, org, password/magic-link toggle) | `pages/users/CreateUser.tsx` |

### Session 5.2: User Invite Wizard

| # | Task | File |
|---|------|------|
| 5.2.1 | Implement InviteUser step 1: Email + name + personal message | `pages/users/InviteUser.tsx` |
| 5.2.2 | Implement InviteUser step 2: App & role assignment | `pages/users/InviteUser.tsx` |
| 5.2.3 | Implement InviteUser step 3: Custom claim values | `pages/users/InviteUser.tsx` |
| 5.2.4 | Implement InviteUser step 4: Preview email (invitation preview API) | `pages/users/InviteUser.tsx` |
| 5.2.5 | Implement InviteUser step 5: Send + success confirmation | `pages/users/InviteUser.tsx` |

### Session 5.3: User Detail

| # | Task | File |
|---|------|------|
| 5.3.1 | Implement UserDetail Overview + Profile tabs | `pages/users/UserDetail.tsx` |
| 5.3.2 | Implement UserDetail Status tab (state machine, transitions with confirm) | `pages/users/UserDetail.tsx` |
| 5.3.3 | Implement UserDetail Roles tab (per-app assignment) | `pages/users/UserDetail.tsx` |
| 5.3.4 | Implement UserDetail Claims, Security (2FA, password reset), Sessions, History tabs | `pages/users/UserDetail.tsx` |

### Session 5.4: User E2E Tests

**Reference**: [Testing Strategy](06-testing-strategy.md) — Phase 5 E2E specs

| # | Task | File |
|---|------|------|
| 5.4.1 | Expand seed data: add test users in `acme-corp` (various statuses) | `tests/e2e/fixtures/seed-data.ts` |
| 5.4.2 | Write user list + create E2E tests | `tests/e2e/pages/users.spec.ts` |
| 5.4.3 | Write invite wizard E2E tests (5 steps end-to-end) | `tests/e2e/pages/users.spec.ts` |
| 5.4.4 | Write user detail + status transition E2E tests | `tests/e2e/pages/users.spec.ts` |
| 5.4.5 | Write user role assignment E2E test | `tests/e2e/pages/users.spec.ts` |

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/users.spec.ts`

---

## Phase 6: RBAC Pages

### Session 6.1: Roles & Permissions Lists

| # | Task | File |
|---|------|------|
| 6.1.1 | Implement RoleList (DataGrid, app filter, permission count, user count) | `pages/rbac/RoleList.tsx` |
| 6.1.2 | Implement RoleDetail (info, permission checkbox grid, users list) | `pages/rbac/RoleDetail.tsx` |
| 6.1.3 | Implement PermissionList (DataGrid, app filter) | `pages/rbac/PermissionList.tsx` |
| 6.1.4 | Implement PermissionDetail (info, roles that include it) | `pages/rbac/PermissionDetail.tsx` |

### Session 6.2: Permission Matrix + E2E Tests

| # | Task | File |
|---|------|------|
| 6.2.1 | Implement PermissionMatrix (visual grid: roles × permissions per app, click to toggle) | `pages/rbac/PermissionMatrix.tsx` |
| 6.2.2 | Wire all RBAC routes | `router.tsx` |
| 6.2.3 | Expand seed data: add test roles + permissions for test app | `tests/e2e/fixtures/seed-data.ts` |
| 6.2.4 | Write RBAC E2E tests (role/permission lists, create, detail, matrix toggle) | `tests/e2e/pages/rbac.spec.ts` |

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/rbac.spec.ts`

---

## Phase 7: Custom Claims Pages

### Session 7.1: Claims + E2E Tests

| # | Task | File |
|---|------|------|
| 7.1.1 | Implement ClaimDefinitionList (DataGrid, app + type filter) | `pages/claims/ClaimDefinitionList.tsx` |
| 7.1.2 | Implement CreateClaimDefinition (name, slug, type, validation rules) | `pages/claims/CreateClaimDefinition.tsx` |
| 7.1.3 | Implement ClaimDefinitionDetail (view/edit, user values summary) | `pages/claims/ClaimDefinitionDetail.tsx` |
| 7.1.4 | Expand seed data: add test claim definitions for test app | `tests/e2e/fixtures/seed-data.ts` |
| 7.1.5 | Write claims E2E tests (list, create, detail) | `tests/e2e/pages/claims.spec.ts` |

**Verify**: `cd admin-gui && npx playwright test tests/e2e/pages/claims.spec.ts`

---

## Phase 8: Test Consolidation

### Session 8.1: Vitest Unit Tests + Cross-entity E2E

**Objective**: Component-level unit tests (mocked API) + cross-entity Playwright workflow

| # | Task | File |
|---|------|------|
| 8.1.1 | Write org pages unit tests (list renders, create validates, detail tabs) | `tests/client/pages/organizations.test.tsx` |
| 8.1.2 | Write app pages unit tests | `tests/client/pages/applications.test.tsx` |
| 8.1.3 | Write client pages unit tests (wizard steps, secret display) | `tests/client/pages/clients.test.tsx` |
| 8.1.4 | Write user pages unit tests (list, invite wizard, status transitions) | `tests/client/pages/users.test.tsx` |

### Session 8.2: RBAC, Claims, Shared + Cross-entity Workflow

| # | Task | File |
|---|------|------|
| 8.2.1 | Write RBAC unit tests (permission matrix, role-permission toggle) | `tests/client/pages/rbac.test.tsx` |
| 8.2.2 | Write claims unit tests | `tests/client/pages/claims.test.tsx` |
| 8.2.3 | Write shared component unit tests (BrandingEditor, SecretDisplay, LoginMethodSelector) | `tests/client/components/entity-components.test.tsx` |
| 8.2.4 | Write cross-entity E2E workflow (create org → app → client → user → assign role) | `tests/e2e/workflows/cross-entity.spec.ts` |
| 8.2.5 | Run full verify: `cd admin-gui && yarn verify` | — |

---

## Phase 9: Documentation Review & Update

### Session 9.1: Documentation

| # | Task | File |
|---|------|------|
| 9.1.1 | Update admin-gui docs with entity page reference | `docs/guide/admin-gui.md` |
| 9.1.2 | Update .clinerules/project.md if needed | `.clinerules/project.md` |

---

## Task Checklist (All Phases)

### Phase 1: Shared Components
- [x] 1.1.1 Implement EntityDetailTabs ✅ (completed: 2026-04-25 10:29)
- [x] 1.1.2 Implement BrandingEditor ✅ (completed: 2026-04-25 10:31)
- [x] 1.1.3 Implement SecretDisplay ✅ (completed: 2026-04-25 10:30)
- [x] 1.1.4 Implement LoginMethodSelector ✅ (completed: 2026-04-25 10:30)
- [x] 1.1.5 Implement ColorPicker ✅ (completed: 2026-04-25 10:29)

### Phase 2: Organization Pages
- [x] 2.1.1 Implement OrganizationList ✅ (completed: 2026-04-25 10:34)
- [x] 2.1.2 Implement CreateOrganization ✅ (completed: 2026-04-25 10:34)
- [x] 2.1.3 Wire org routes ✅ (completed: 2026-04-25 10:35)
- [x] 2.2.1 Implement OrgDetail Overview tab ✅ (completed: 2026-04-25 13:55)
- [x] 2.2.2 Implement OrgDetail Branding tab ✅ (completed: 2026-04-25 13:55)
- [x] 2.2.3 Implement OrgDetail Settings tab ✅ (completed: 2026-04-25 13:55)
- [x] 2.2.4 Implement OrgDetail Apps, Users, History tabs ✅ (completed: 2026-04-25 13:55)
- [x] 2.2.5 Wire org detail route ✅ (completed: 2026-04-25 13:55)
- [x] 2.3.1 Write org list E2E tests ✅ (completed: 2026-04-25 13:58)
- [x] 2.3.2 Write org create E2E tests ✅ (completed: 2026-04-25 13:58)
- [x] 2.3.3 Write org detail E2E tests ✅ (completed: 2026-04-25 13:58)
- [x] 2.3.4 Write org status transition E2E tests ✅ (completed: 2026-04-25 13:58)

### Phase 3: Application Pages
- [x] 3.1.1 Implement ApplicationList ✅ (completed: 2026-04-25 14:00)
- [x] 3.1.2 Implement CreateApplication ✅ (completed: 2026-04-25 14:00)
- [x] 3.2.1 Implement AppDetail Overview tab ✅ (completed: 2026-04-25 14:00)
- [x] 3.2.2 Implement AppDetail Modules tab ✅ (completed: 2026-04-25 14:00)
- [x] 3.2.3 Implement AppDetail Clients, Roles, Permissions, Claims, History tabs ✅ (completed: 2026-04-25 14:00)
- [x] 3.2.4 Expand seed data: add test application ✅ (completed: 2026-04-25 14:00)
- [x] 3.2.5 Write app E2E tests ✅ (completed: 2026-04-25 14:00)

### Phase 4: Client Pages
- [x] 4.1.1 Implement ClientList ✅ (completed: 2026-04-25 15:15)
- [x] 4.1.2 Implement CreateClient wizard step 1 ✅ (completed: 2026-04-25 15:17)
- [x] 4.1.3 Implement CreateClient wizard step 2 ✅ (completed: 2026-04-25 15:17)
- [x] 4.2.1 Implement CreateClient wizard step 3 ✅ (completed: 2026-04-25 15:17)
- [x] 4.2.2 Implement CreateClient wizard step 4 ✅ (completed: 2026-04-25 15:17)
- [x] 4.2.3 Implement ClientDetail ✅ (completed: 2026-04-25 15:52)
- [x] 4.2.4 Implement client secret management ✅ (completed: 2026-04-25 15:52)
- [x] 4.3.1 Expand seed data: add test client ✅ (completed: 2026-04-25 15:52)
- [x] 4.3.2 Write client list E2E tests ✅ (completed: 2026-04-25 15:53)
- [x] 4.3.3 Write client wizard E2E tests ✅ (completed: 2026-04-25 15:53)
- [x] 4.3.4 Write client detail + secret management E2E tests ✅ (completed: 2026-04-25 15:53)

### Phase 5: User Pages
- [x] 5.1.1 Implement UserList ✅ (completed: 2026-04-25 16:15)
- [x] 5.1.2 Implement CreateUser ✅ (completed: 2026-04-25 16:15)
- [x] 5.2.1 Implement InviteUser step 1 ✅ (completed: 2026-04-25 16:31)
- [x] 5.2.2 Implement InviteUser step 2 ✅ (completed: 2026-04-25 16:31)
- [x] 5.2.3 Implement InviteUser step 3 ✅ (completed: 2026-04-25 16:31)
- [x] 5.2.4 Implement InviteUser step 4 ✅ (completed: 2026-04-25 16:31)
- [x] 5.2.5 Implement InviteUser step 5 ✅ (completed: 2026-04-25 16:31)
- [x] 5.3.1 Implement UserDetail Overview + Profile tabs ✅ (completed: 2026-04-25 17:00)
- [x] 5.3.2 Implement UserDetail Status tab ✅ (completed: 2026-04-25 17:00)
- [x] 5.3.3 Implement UserDetail Roles tab ✅ (completed: 2026-04-25 17:00)
- [x] 5.3.4 Implement UserDetail Claims, Security, Sessions, History tabs ✅ (completed: 2026-04-25 17:00)
- [x] 5.4.1 Expand seed data: add test users ✅ (completed: 2026-04-25 17:15)
- [x] 5.4.2 Write user list + create E2E tests ✅ (completed: 2026-04-25 17:15)
- [x] 5.4.3 Write invite wizard E2E tests ✅ (completed: 2026-04-25 17:15)
- [x] 5.4.4 Write user detail + status transition E2E tests ✅ (completed: 2026-04-25 17:15)
- [x] 5.4.5 Write user role assignment E2E test ✅ (completed: 2026-04-25 17:15)

### Phase 6: RBAC Pages
- [x] 6.1.1 Implement RoleList ✅ (completed: 2026-04-25 17:30)
- [x] 6.1.2 Implement RoleDetail ✅ (completed: 2026-04-25 17:30)
- [x] 6.1.3 Implement PermissionList ✅ (completed: 2026-04-25 17:30)
- [x] 6.1.4 Implement PermissionDetail ✅ (completed: 2026-04-25 17:30)
- [x] 6.2.1 Implement PermissionMatrix ✅ (completed: 2026-04-25 17:45)
- [x] 6.2.2 Wire all RBAC routes ✅ (completed: 2026-04-25 17:45)
- [x] 6.2.3 Expand seed data: add test roles + permissions ✅ (completed: 2026-04-25 17:45)
- [x] 6.2.4 Write RBAC E2E tests ✅ (completed: 2026-04-25 17:45)

### Phase 7: Custom Claims Pages
- [x] 7.1.1 Implement ClaimDefinitionList ✅ (completed: 2026-04-25 18:00)
- [x] 7.1.2 Implement CreateClaimDefinition ✅ (completed: 2026-04-25 18:00)
- [x] 7.1.3 Implement ClaimDefinitionDetail ✅ (completed: 2026-04-25 18:00)
- [x] 7.1.4 Expand seed data: add test claim definitions ✅ (completed: 2026-04-25 18:00)
- [x] 7.1.5 Write claims E2E tests ✅ (completed: 2026-04-25 18:00)

### Phase 8: Test Consolidation
- [x] 8.1.1 Write org pages unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.1.2 Write app pages unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.1.3 Write client pages unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.1.4 Write user pages unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.2.1 Write RBAC unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.2.2 Write claims unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.2.3 Write shared component unit tests ✅ (completed: 2026-04-25 18:10)
- [x] 8.2.4 Write cross-entity E2E workflow ✅ (completed: 2026-04-25 18:10)
- [x] 8.2.5 Run full verify ✅ (completed: 2026-04-25 18:15)

### Phase 9: Documentation
- [x] 9.1.1 Update admin-gui docs ✅ (completed: 2026-04-25 18:20)
- [x] 9.1.2 Update .clinerules/project.md ✅ (completed: 2026-04-25 18:20)

---

## Dependencies

```
Phase 1 (Shared Components)
    ↓
Phase 2 (Orgs + E2E) + Phase 3 (Apps + E2E) ←── parallel
    ↓
Phase 4 (Clients + E2E) + Phase 5 (Users + E2E) ←── parallel
    ↓
Phase 6 (RBAC + E2E) + Phase 7 (Claims + E2E) ←── parallel
    ↓
Phase 8 (Test Consolidation: Unit tests + Cross-entity E2E)
    ↓
Phase 9 (Docs)
```

## Session Protocol

### Starting a Session

1. Start agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh start`
2. Reference this plan: "Implement Phase X, Session X.X per `plans/admin-gui-entity-pages/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command (from `.clinerules/project.md`)
2. Handle commit per the active **commit mode** (see "Commit Behavior During Plan Execution" in `make_plan.md`)
3. End agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh finished`
4. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan admin-gui-entity-pages` to continue

---

## Success Criteria

**Sub-plan 2 is complete when:**

1. ✅ All phases completed
2. ✅ `cd admin-gui && yarn verify` passes
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, classes, or modules (per `code.md` rule 4)
5. ✅ Security hardened — input validation, injection prevention, auth, rate limiting, data protection (per `code.md` rules 32-34)
6. ✅ All entity pages render and perform CRUD
7. ✅ Client wizard and user invite wizard work end-to-end
8. ✅ Permission matrix renders and toggles work
9. ✅ All forms validate with Zod
10. ✅ Playwright E2E tests pass for all entity domains (~50+ tests across 7 spec files)
11. ✅ Vitest unit tests pass (~35+ tests)
12. ✅ Cross-entity E2E workflow passes
13. ✅ Documentation updated
14. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
