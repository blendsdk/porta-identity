# Admin GUI E2E Test — Bug Inventory

> **Created**: 2026-04-26
> **Source**: Comprehensive E2E test suite (Phases 2–8)
> **Total New Tests**: 224 across 32 spec files
> **Bugs Found**: 1 confirmed, additional candidates pending live E2E execution

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| High     | 1     | Documented |
| Medium   | 0     | — |
| Low      | 0     | — |
| **Total** | **1** | — |

> **Note**: This inventory reflects bugs discovered during test authoring.
> Running the full E2E suite against a live environment may reveal additional
> failures. Tests are designed to surface bugs as failing assertions rather
> than silently passing — run `npx playwright test` with Docker services
> and both Porta + BFF running to discover more issues.

---

## Confirmed Bugs

### BUG-5: Organization Settings Save Uses PATCH Instead of PUT

| Field | Value |
|-------|-------|
| **ID** | BUG-5 |
| **Severity** | High |
| **Category** | http-method |
| **File** | `admin-gui/tests/e2e/operations/org-settings.spec.ts` |
| **Line** | 211 |
| **Status** | `test.fixme` — test written but skipped |

**Description**: The Organization Detail Settings tab uses `api.patch()` to save
organization settings (locale, default login methods, 2FA policy). The Porta
backend admin API expects `PUT /api/admin/organizations/:id` for full updates.
Using PATCH may cause settings to not persist correctly because the backend
route handler expects a full replacement payload.

**Impact**: Organization settings changes (locale, login methods, 2FA) may silently
fail to save, or partially save with missing fields reverting to defaults.

**Expected**: Settings save should use `api.put()` with the complete organization
update payload.

**Actual**: Settings save uses `api.patch()` which may not match the backend route.

**Location in Code**: `admin-gui/src/client/pages/organizations/OrganizationDetail.tsx` —
the `handleSave` function in the Settings tab.

---

## Potential Issues (Pending Live E2E Validation)

These are areas where the test suite is designed to catch bugs but requires
live execution to confirm. They are listed here as high-risk areas to watch
when running the full E2E suite.

### 1. Form Dirty State Tracking
- **Risk**: Settings forms may not correctly track dirty state, allowing
  navigation without save warnings
- **Tests**: `org-settings.spec.ts`, `app-settings.spec.ts`, `client-settings.spec.ts`
- **Watch for**: `test.fixme` failures on dirty state / unsaved changes tests

### 2. Status Transition Error Handling
- **Risk**: Status transitions (suspend, archive, etc.) may not show proper
  error messages when the backend rejects a transition
- **Tests**: `org-transitions.spec.ts`, `user-transitions.spec.ts`
- **Watch for**: Missing error toasts after failed transitions

### 3. CSRF Token Lifecycle
- **Risk**: CSRF token may not be refreshed correctly after session refresh,
  causing 403 errors on subsequent mutations
- **Tests**: `csrf-protection.spec.ts`
- **Watch for**: 403 errors on POST/PUT/DELETE after extended idle time

### 4. ETag Concurrent Modification
- **Risk**: Optimistic concurrency (ETag/If-Match) may not be implemented
  on all save operations
- **Tests**: `api-errors.spec.ts` (412 test)
- **Watch for**: Missing conflict warnings when two admins edit simultaneously

### 5. Token Auto-Refresh
- **Risk**: BFF proactive token refresh (30s before expiry) may not work
  correctly, causing brief 401 windows
- **Tests**: `token-refresh.spec.ts`
- **Watch for**: Intermittent 401 errors during long admin sessions

---

## Test Coverage Matrix

| Domain | Spec Files | Tests | Coverage Areas |
|--------|-----------|-------|----------------|
| Organizations | 4 | 29 | CRUD, settings, transitions, branding |
| Applications | 3 | 20 | CRUD, settings, modules |
| Clients | 3 | 18 | CRUD, settings, secrets |
| Users | 6 | 28 | CRUD, settings, transitions, roles, claims |
| RBAC | 3 | 28 | Roles, permissions, matrix |
| Custom Claims | 1 | 11 | Definitions CRUD |
| Dashboard | 1 | 7 | Stats, chart, activity, quick actions |
| Audit Log | 1 | 9 | Filters, expand, export, pagination |
| Config | 1 | 7 | List, edit, save, cancel |
| Signing Keys | 1 | 7 | List, generate, rotate, JWKS |
| Sessions | 1 | 6 | List, revoke, bulk revoke |
| Import/Export | 1 | 11 | Export selection, import upload/preview |
| Search | 1 | 9 | Overlay, results, empty states |
| BFF Proxy | 1 | 8 | HTTP methods, Bearer token, sequential |
| Token Refresh | 1 | 5 | Valid, 401 retry, login redirect |
| CSRF | 1 | 5 | Cookie, header, match, attributes |
| Validation | 1 | 8 | Required fields, formats, server errors |
| API Errors | 1 | 6 | 403, 404, 500, 412, toast, no leakage |
| Network Errors | 1 | 4 | Timeout, disconnect, slow, recovery |
| **Total** | **32** | **226** | |

---

## Running the Tests

```bash
# Run all new E2E tests (requires Docker services + Porta + BFF running)
cd admin-gui && npx playwright test operations/ integration/ errors/

# Run by domain
npx playwright test operations/org-       # Organizations
npx playwright test operations/app-       # Applications
npx playwright test operations/client-    # Clients
npx playwright test operations/user-      # Users
npx playwright test operations/rbac-      # RBAC
npx playwright test operations/claims-    # Custom Claims
npx playwright test operations/dashboard  # Dashboard
npx playwright test operations/audit-     # Audit Log
npx playwright test operations/config-    # Config Editor
npx playwright test operations/keys-      # Signing Keys
npx playwright test operations/sessions-  # Sessions
npx playwright test operations/import-    # Import/Export
npx playwright test operations/search-    # Search
npx playwright test integration/          # BFF Integration
npx playwright test errors/               # Error Handling

# Run full suite (all 54 spec files — existing + new)
npx playwright test
```

---

## Next Steps

1. **Run full E2E suite** against live environment to discover additional failures
2. **Fix BUG-5** (PATCH → PUT in organization settings save)
3. **Address any new `test.fixme` failures** discovered during live execution
4. **Convert passing tests** from `test.fixme` to `test` as bugs are fixed
