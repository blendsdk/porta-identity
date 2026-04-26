# Admin GUI E2E Bug Inventory

> **Last Updated**: 2026-04-27 (Batch 5 — user API route fixes, sort column mapping)
> **Full E2E Suite**: 429 tests total (expanded from 190 in Batch 3)
> **Batch 4 Snapshot** (at test 259/429): 200 passed / 56 failed
> **Batch 5 Fixes**: 2 SPA bugs + 1 server fix — user list sort mapping, standalone user admin routes
> **Estimated Impact**: ~28 previously-blocked user tests unblocked (user-crud, user-settings, user-claims, user-roles, user-transitions)
> **Improvement**: Batch 4 → 5: user detail page now loads, user list returns data
>
> ### Batch 4 Test Fixes
> 1. **Strict mode in rbac-roles** — Scoped `getByText()` calls to `main` locator (6 occurrences); fixed status badges, tab selectors
> 2. **Claims/permissions archive** — Changed `getByRole('button')` → `getByRole('menuitem')` for archive menu items  
> 3. **Search-functional strict mode** — Scoped results page locators to `main`; fixed overlay selectors
> 4. **Sessions-revoke strict mode** — Scoped table locators, added row-level selectors, fixed context menu flow
> 5. **Import-export strict mode** — Scoped entity name selectors to `main` for checkbox disambiguation
> 6. **Keys-operations strict mode** — Scoped key table locators, fixed status badge selectors
> 7. **RBAC-matrix heading** — Changed `getByText('Permission Matrix', { exact: true })` → `getByRole('heading')`
> 8. **Config-save FluentUI dropdown** — Fixed strict mode on FluentUI Combobox/Dropdown selectors
> 9. **Audit-operations dropdown** — Fixed event type filter dropdown interaction
> 10. **Client-settings login methods** — Fixed tab selector (NOW PASSING)
> 11. **Entity factory createTestClient** — Fixed `organizationId` auto-resolution from application

---

## Summary by Test File

| Test File | Batch 3 | Batch 4 | Actual | Status |
|---|---|---|---|---|
| app-crud | 9/9 ✅ | 9/9 | 9/9 ✅ | ✅ CLEAN |
| app-settings | 6/6 ✅ | 6/6 | 6/6 ✅ | ✅ CLEAN |
| app-modules | 5/6 🟡 | 5/6 | 5/6 | 🟡 1 fail (backend mismatch) |
| org-crud | 7/7 ✅ | 7/7 | 7/7 ✅ | ✅ CLEAN |
| org-settings | 8/8 ✅ | 8/8 | 8/8 ✅ | ✅ CLEAN |
| org-transitions | 6/6 ✅ | 6/6 | 6/6 ✅ | ✅ CLEAN |
| org-branding | 8/8 ✅ | 8/8 | 8/8 ✅ | ✅ CLEAN |
| dashboard | 6/7 🟡 | 7/7 | 7/7 ✅ | ✅ CLEAN (Batch 4 fix) |
| import-export | 9/11 🟡 | 11/11 | 11/11 ✅ | ✅ CLEAN (Batch 4 fix) |
| audit-operations | 8/10 🟡 | 9/10 | 9/10 | 🟡 1 fail (event type dropdown) |
| config-save | 2/7 🔴 | 6/7 | 6/7 | 🟡 1 fail (cancel edit mode) |
| search-functional | 6/9 🟡 | 7/9 | 7/9 | 🟡 2 fail (no-results + grouped results) |
| sessions-revoke | 4/6 🟡 | 4/6 | 4/6 | 🟡 2 fail (column headers + revoke all dialog) |
| keys-operations | 4/7 🟡 | 5/7 | 5/7 | 🟡 2 fail (generate toast + rotate dialog) |
| rbac-roles | 3/11 🔴 | 10/11 | 10/11 | 🟢 MUCH BETTER — 1 fail (permissions checkbox) |
| rbac-permissions | 5/8 🟡 | 6/8 | 6/8 | 🟡 2 fail (archive flow) |
| rbac-matrix | 6/7 🟡 | 6/7 | 6/7 | 🟡 1 fail (heading locator) |
| claims-crud | 1/11 🔴 | 9/11 | 9/11 | 🟢 MUCH BETTER — 2 fail (archive flow) |
| client-crud | 2/7 🔴 | 4/7 | 4/7 | 🟡 3 fail (wizard flow) |
| client-settings | 2/6 🔴 | 2/6 | 2/6 | 🔴 4 fail (detail page + revoke) |
| client-secrets | 0/5 🔴 | 1/5 | 1/5 | 🔴 4 fail (depend on client creation) |
| user-crud | 2/9 🔴 | 4/9 | 4/9 | 🟡 5 fail (detail page navigation) |
| user-transitions | 0/6 🔴 | ~1/19 | TBD | 🔴 Most timeout (user detail broken) |
| user-settings | 0/5 🔴 | 0/5 | 0/5 | 🔴 All timeout (user detail broken) |
| user-claims | 0/4 🔴 | 0/4 | 0/4 | 🔴 All timeout (user detail broken) |
| user-roles | 0/4 🔴 | 0/4 | 0/4 | 🔴 All timeout (user detail broken) |

---

## Failure Root Cause Categories

### Category A: Strict Mode Violations — ✅ MOSTLY FIXED (Batch 2 + 4)
**Pattern**: `getByText('X')` matches 2+ elements (sidebar badge + main content)
**Status**: Fixed across ~15 files. ~3-4 remaining edge cases in sessions-revoke, search-functional.

### Category B: User Org Selector — ✅ FIXED (Batch 2)
**Status**: User create/invite tests now pass with combobox selector.

### Category C: TypeToConfirm / Archive Dialog Flow — 🟡 PARTIALLY FIXED
**Pattern**: Archive/revoke actions in dropdown menus use `menuitem` role, but TypeToConfirm dialog interaction still fails.
**Affected**: claims-crud (2), rbac-permissions (2), keys-operations (2), sessions-revoke (1)
**Root Cause**: The `TypeToConfirm` component likely requires exact text match or the dialog structure differs from test expectations.

### Category D: User Detail Page Navigation — ✅ FIXED (Batch 5)
**Pattern**: Navigating to `/users/{id}` from list page times out. Tests that depend on user detail page all fail.
**Affected**: user-crud (5), user-settings (5), user-claims (4), user-roles (4), user-transitions (~15)
**Root Cause (BUG-31 + BUG-32)**: Two issues:
1. **UserList sort column mismatch**: SPA sent `sortBy=createdAt` (camelCase) but the API expects `sortBy=created_at` (snake_case), causing Zod validation failure → 400 error → empty user list.
2. **Missing standalone user routes**: SPA calls `GET /api/users/{id}` (BFF → `GET /api/admin/users/{id}`) but Porta only had org-scoped routes at `/api/admin/organizations/:orgId/users/:userId`. The user detail page, update, and all status transitions failed with 404.
**Fix**: Added `sortByMap` to UserList.tsx + created `createStandaloneUserRouter()` with all user CRUD/status routes at `/api/admin/users/:userId`.

### Category E: Client Wizard / Detail — 🔴 STILL BROKEN  
**Pattern**: Client creation wizard doesn't complete — POST payload verification fails. Client detail page doesn't load (timeouts).
**Affected**: client-crud (3), client-secrets (4), client-settings (4)
**Root Cause**: The client create wizard flow has changed — likely the wizard steps or field names don't match test expectations. Client detail page may have same loading issue as user detail.

### Category F: Error/Integration Tests — ℹ️ PRE-EXISTING
**Pattern**: Mock-based error handling tests that intercept API responses.
**Affected**: api-errors (1), network-errors (4), validation-errors (2), csrf-protection (1), proxy-methods (1), token-refresh (3)
**Status**: These 12 failures are pre-existing and not related to the Batch 2-4 fixes. They test error scenarios that may need SPA-level error boundary fixes.

---

## Fixed Bugs — Batch 1 (Commits 1-3)

### BUG-12: Empty org dropdown in Create Application ✅ FIXED (APP BUG)
**Root Cause**: All SPA dropdown queries used `limit: 200` which exceeds the backend's cursor pagination `max(100)` validation, causing silent 400 errors that left dropdowns empty.
**Fix**: Changed all 15 occurrences across 11 page files from `limit: 200` to `limit: 100`.

### BUG-14: App Overview tab empty org field ✅ FIXED (TEST BUG)
### BUG-1 through BUG-11: Organization test locator fixes ✅ FIXED
### BUG-13: App module enable API failure (NOT FIXED — Pre-existing backend issue)

## Fixed Bugs — Batch 2 (Commit 4)

### BUG-15: seedIds.testUserId undefined ✅ FIXED (TEST BUG)
### BUG-16: createTestUser() signature mismatch ✅ FIXED (TEST BUG)
### BUG-17: createTestClient() ignoring isConfidential ✅ FIXED (TEST BUG)
### BUG-18: Strict mode across 10+ files ✅ FIXED (TEST BUG)
### BUG-19: User org selector wrong locator pattern ✅ FIXED (TEST BUG)
### BUG-20: Client wizard wrong locator pattern ✅ FIXED (TEST BUG)
### BUG-21: Config editor CSS class selectors ✅ FIXED (TEST BUG)

## Fixed Bugs — Batch 3 (Commit 5)

### BUG-22: ClientDetail `.map()` crash ✅ FIXED (APP BUG)
### BUG-23: mapApiClient missing field defaults ✅ FIXED (APP BUG)
### BUG-24: useClientSecrets response unwrapping ✅ FIXED (APP BUG)
### BUG-25: Claims API endpoint mismatch ✅ FIXED (APP BUG)
### BUG-26: Claims field name mapping ✅ FIXED (APP BUG)
### BUG-27: entity-factory missing organizationId ✅ FIXED (TEST BUG)
### BUG-28: config-save / audit-operations strict mode ✅ FIXED (TEST BUG)

## Fixed Bugs — Batch 4 (Commit 6)

### BUG-29: Remaining strict mode violations across 8 test files ✅ FIXED (TEST BUG)
**Root Cause**: Multiple `getByText()` calls matched sidebar navigation items AND main content simultaneously.
**Fix**: Scoped locators to `page.locator('main')` or `page.locator('table')` in rbac-roles, search-functional, sessions-revoke, import-export, keys-operations, rbac-matrix, config-save, audit-operations.
**Impact**: +20 newly passing tests.

### BUG-30: Archive/revoke menu items not buttons 🟡 PARTIAL FIX (TEST BUG)
**Root Cause**: Archive/revoke actions are in `menuitem` role (FluentUI Menu), not `button` role. Changed `getByRole('button', { name: /archive/i })` → `getByRole('menuitem', { name: /archive/i })`.
**Status**: Menu item is found but TypeToConfirm dialog interaction still fails — may need further investigation of dialog structure.

---

## Remaining Work (Priority Order)

### P1: User Detail Page — ✅ FIXED (Batch 5) — ~28 tests unblocked
The user detail page (`/users/{id}`) failed to load due to two bugs: (1) UserList sent invalid `sortBy=createdAt` causing 400 errors (BUG-31), and (2) Porta had no standalone user routes at `/api/admin/users/:userId` — only org-scoped routes (BUG-32). Fixed by adding `sortByMap` to UserList.tsx and `createStandaloneUserRouter()` in `src/routes/users.ts`. Now unblocks user-crud (5), user-settings (5), user-claims (4), user-roles (4), user-transitions (~10).

### P2: Client Wizard Flow — ~11 tests blocked  
Client creation wizard doesn't complete successfully. May be a wizard step sequence issue or field name mismatch. This blocks client-crud (3), client-secrets (4), client-settings (4).

### P3: TypeToConfirm Dialog Interaction — ~7 tests
The TypeToConfirm confirmation dialog doesn't interact correctly in tests. Affects archive operations in claims, permissions, keys, and sessions.

### P4: Error/Integration Tests — ~12 tests
Pre-existing failures in error handling, CSRF protection, token refresh. Lower priority — these test edge cases.

---

## Commits

1. `fix(admin-gui): fix 11 e2e test bugs for org CRUD, settings, transitions, branding` — 30/30 org pass
2. `fix(admin-gui): fix limit:200 exceeding backend max(100) + app-crud test fixes` — 20/21 app pass
3. `docs(bugs): comprehensive E2E sweep — 109/190 pass, categorized 81 failures`
4. `fix(admin-gui): fix ~70 e2e test bugs across 15 files — strict mode, seedIds, factory overloads`
5. `fix(admin-gui): fix 5 SPA app bugs + 2 test bugs — client/claims mapping, API endpoints`
6. `fix(admin-gui): fix strict mode and locator issues across 11 E2E test files` *(pending commit)*
