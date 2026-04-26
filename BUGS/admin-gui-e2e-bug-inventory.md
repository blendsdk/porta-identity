# Admin GUI E2E Bug Inventory

> **Last Updated:** 2026-04-26
> **Phase:** 3 (Core Entity E2E Testing)

## Summary

| Status | Count |
|--------|-------|
| Fixed (app bugs) | 3 |
| Fixed (test fixes) | 8 |
| Total discovered | 11 |

## Fixed Bugs

### BUG-1: ESM `__dirname` in org-branding.spec.ts
- **File:** `admin-gui/tests/e2e/operations/org-branding.spec.ts`
- **Root cause:** Used `__dirname` in ES module (not available in ESM)
- **Fix:** Added `fileURLToPath(import.meta.url)` + `path.dirname()` polyfill

### BUG-2: Branding "Preview" strict mode violation
- **File:** `admin-gui/tests/e2e/operations/org-branding.spec.ts:59`
- **Root cause:** `getByText('Preview')` matched 2 elements (section title + preview description)
- **Fix:** Changed to `getByText('Preview', { exact: true })`

### BUG-3: Entity factory missing CSRF tokens
- **File:** `admin-gui/tests/e2e/helpers/entity-factory.ts`
- **Root cause:** All `request.post()` calls lacked `X-CSRF-Token` header
- **Fix:** Added `getCsrfToken()` helper that fetches from `/auth/me`, cached per session. All factory POST functions now include the header.
- **Impact:** Fixed 3+ transition test failures and enables all entity creation tests

### BUG-4: Transition tests missing CSRF on direct API calls
- **File:** `admin-gui/tests/e2e/operations/org-transitions.spec.ts`
- **Root cause:** `request.post(…/suspend)` in "activate" test lacked CSRF token
- **Fix:** Added local `csrfToken()` helper, included header on direct API calls

### BUG-5: Org detail page name matches 2 elements (strict mode)
- **File:** `admin-gui/tests/e2e/operations/org-crud.spec.ts`
- **Root cause:** Org name appears in both page header and overview tab card — `getByText(orgName)` matches both
- **Fix:** Added `.first()` to org name assertions on detail page

### BUG-6: Overview tab stat labels match sidebar/tabs (strict mode)
- **File:** `admin-gui/tests/e2e/operations/org-crud.spec.ts:173`
- **Root cause:** "Applications", "Users" text exists in sidebar nav, tab bar, AND overview stat cards — `getByText(/^applications$/i)` matches 4 elements
- **Fix:** Scoped assertions to `page.getByRole('tabpanel')` to isolate overview content

### BUG-7: Settings tests — locale/login methods save now works
- **File:** `admin-gui/tests/e2e/operations/org-settings.spec.ts`
- **Root cause:** Settings save was using PATCH instead of PUT (fixed in app code, rebuilt SPA)
- **Fix:** SPA rebuild included the PATCH→PUT fix from BUG-5 (main app bug)

### BUG-8: Duplicate slug error test — wrong text patterns
- **File:** `admin-gui/tests/e2e/operations/org-crud.spec.ts:113`
- **Type:** Test fix (test wasn't matching actual error message)
- **Root cause:** Backend returns "Slug already in use" but test checked for "already exists|duplicate|conflict"
- **Fix:** Added `/slug already in use/i` pattern to error text checks

### BUG-9: 2FA policy test selecting same value as current
- **File:** `admin-gui/tests/e2e/operations/org-settings.spec.ts:114,211`
- **Type:** Test fix (test wasn't actually changing the value)
- **Root cause:** Test clicked "Optional" which was already the current DB default — no change detected
- **Fix:** Changed test to click "Required" instead, removed fragile restore step

### BUG-10: API client crashes on 204 No Content responses
- **File:** `admin-gui/src/client/api/client.ts:73`
- **Type:** App bug (critical — blocked all status transitions)
- **Root cause:** `apiRequest()` calls `response.json()` on ALL successful responses, but 204 responses have no body, causing a JSON parse error. Suspend/activate/archive endpoints return 204.
- **Fix:** Added `if (response.status === 204) return undefined as T` before `response.json()`
- **Impact:** Fixed ALL org status transitions (suspend, activate, archive) + user transitions

### BUG-11: Status badge strict mode violations in transition tests
- **File:** `admin-gui/tests/e2e/operations/org-transitions.spec.ts`
- **Type:** Test fix (same pattern as BUG-5/6)
- **Root cause:** Status text ("Active", "Suspended", "Archived") appears in both page header badge and overview tab badge
- **Fix:** Added `.first()` to all status badge assertions

## Untested Domains (Pending)

- Applications (operations/app-*)
- Clients (operations/client-*)
- Users (operations/user-*)
- RBAC (operations/rbac-*)
- Custom Claims (operations/claims-*)
- System pages (system/*)
- Error handling (errors/*)
- Integration tests (integration/*)
