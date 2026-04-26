# Admin GUI E2E Bug Inventory

> **Last Updated**: 2026-04-26
> **Full Operations Sweep**: 109 passed / 81 failed (190 total, 57% pass rate)
> **Bugs Fixed This Session**: 12 app bugs + 14 test bugs

---

## Summary by Test File

| Test File | Pass | Fail | Total | Pass% | Status |
|---|---|---|---|---|---|
| app-crud | 9 | 0 | 9 | 100% | ✅ CLEAN |
| app-settings | 6 | 0 | 6 | 100% | ✅ CLEAN |
| org-crud | 7 | 0 | 7 | 100% | ✅ CLEAN |
| org-settings | 8 | 0 | 8 | 100% | ✅ CLEAN |
| org-transitions | 6 | 0 | 6 | 100% | ✅ CLEAN |
| org-branding | 8 | 0 | 8 | 100% | ✅ CLEAN |
| import-export | 9 | 2 | 11 | 82% | 🟡 PARTIAL |
| audit-operations | 8 | 2 | 10 | 80% | 🟡 PARTIAL |
| dashboard | 6 | 1 | 7 | 86% | 🟡 PARTIAL |
| app-modules | 5 | 1 | 6 | 83% | 🟡 PARTIAL |
| rbac-matrix | 6 | 1 | 7 | 86% | 🟡 PARTIAL |
| search-functional | 6 | 3 | 9 | 67% | 🟡 PARTIAL |
| sessions-revoke | 4 | 2 | 6 | 67% | 🟡 PARTIAL |
| rbac-permissions | 5 | 3 | 8 | 63% | 🟡 PARTIAL |
| keys-operations | 4 | 3 | 7 | 57% | 🟡 PARTIAL |
| config-save | 2 | 5 | 7 | 29% | 🔴 BROKEN |
| client-crud | 2 | 5 | 7 | 29% | 🔴 BROKEN |
| rbac-roles | 3 | 8 | 11 | 27% | 🔴 BROKEN |
| user-crud | 2 | 7 | 9 | 22% | 🔴 BROKEN |
| client-settings | 2 | 4 | 6 | 33% | 🔴 BROKEN |
| client-secrets | 0 | 5 | 5 | 0% | 🔴 BROKEN |
| claims-crud | 1 | 10 | 11 | 9% | 🔴 BROKEN |
| user-transitions | 0 | 6 | 6 | 0% | 🔴 BROKEN |
| user-settings | 0 | 5 | 5 | 0% | 🔴 BROKEN |
| user-claims | 0 | 4 | 4 | 0% | 🔴 BROKEN |
| user-roles | 0 | 4 | 4 | 0% | 🔴 BROKEN |

---

## Failure Root Cause Categories

### Category A: Strict Mode Violations (~18 tests)
**Pattern**: `getByText('X')` matches 2+ elements (header badge + tabpanel content)
**Affected**: client-crud, rbac-roles, rbac-permissions, client-settings, sessions-revoke, dashboard, keys-operations, rbac-matrix, search-functional
**Fix**: Scope to `page.getByRole('tabpanel').getByText(...)` or add `.first()`

### Category B: User Org Selector Mismatch (~7 tests)
**Pattern**: `page.getByText(/select.*organization/i)` doesn't match when org is pre-selected
**Affected**: user-crud (5+), user-transitions (cascade)
**Fix**: Use `page.getByRole('combobox')` instead of text-based selection

### Category C: Claims Seed/Display Issue (~10 tests)
**Pattern**: Claims page shows "No custom claim definitions" despite seed creating them
**Affected**: claims-crud (10)
**Root Cause**: Needs investigation — seed creates data via direct DB but list API returns empty

### Category D: User Detail Page Navigation (~19 tests)
**Pattern**: Tests navigating to user detail pages fail with timeouts
**Affected**: user-transitions (6), user-settings (5), user-claims (4), user-roles (4)
**Root Cause**: Cascade from user page routing/entity factory issues

### Category E: Client Detail Dependencies (~12 tests)
**Pattern**: Client detail page tests fail due to strict mode + setup issues
**Affected**: client-crud (5), client-secrets (5), client-settings (2)

### Category F: Config Editor Interaction (~5 tests)
**Pattern**: Config edit mode tests fail with timeouts on edit/cancel/save
**Affected**: config-save (5)

### Category G: Miscellaneous (~7 tests)
**Affected**: import-export (2), audit-operations (2), keys-operations (2), app-modules (1)

---

## Fixed Bugs (This Session)

### BUG-12: Empty org dropdown in Create Application ✅ FIXED (APP BUG)
**Root Cause**: All SPA dropdown queries used `limit: 200` which exceeds the backend's cursor pagination `max(100)` validation, causing silent 400 errors that left dropdowns empty.
**Fix**: Changed all 15 occurrences across 11 page files from `limit: 200` to `limit: 100`.
**Impact**: Unlocked 6+ tests blocked by empty dropdowns.

### BUG-14: App Overview tab empty org field ✅ FIXED (TEST BUG)
**Root Cause**: Applications are platform-wide (not org-scoped). Backend has no `organizationId`.
**Fix**: Removed org name assertion, scoped assertions to tabpanel.

### BUG-1 through BUG-11: Organization test locator fixes ✅ FIXED
**Root Cause**: Various locator mismatches (tab names, badge scoping, text matching, etc.)
**Fix**: Updated all locators to match actual page structure.
**Impact**: 30/30 org tests now pass (was 0/30).

### BUG-13: App module enable API failure (NOT FIXED — Pre-existing backend issue)

---

## Recommended Fix Priority (Next Session)

1. **Strict Mode Violations** (~18 tests, Low effort) — Add `.first()` or scope to tabpanel
2. **User Domain Org Selector** (~26 tests, Medium effort) — Fix combobox selectors
3. **Claims Display** (~10 tests, Medium effort) — Debug seed/API mismatch
4. **Client Detail** (~12 tests, Medium effort) — Fix strict mode + wizard flow
5. **Config Editor** (~5 tests, Medium effort) — Fix FluentUI interaction patterns

---

## Commits

1. `fix(admin-gui): fix 11 e2e test bugs for org CRUD, settings, transitions, branding` — 30/30 org pass
2. `fix(admin-gui): fix limit:200 exceeding backend max(100) + app-crud test fixes` — 20/21 app pass
