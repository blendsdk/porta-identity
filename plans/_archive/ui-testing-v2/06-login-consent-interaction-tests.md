# Login, Consent & Interaction Tests: UI Testing Phase 2

> **Document**: 06-login-consent-interaction-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Tests for login error states, consent edge cases, and interaction lifecycle, covering Categories 6, 7, and 8 from the requirements. These extend the existing Phase 1 tests (which cover happy paths) with error states, edge cases, and browser-specific behaviors.

## Source Code Reference

### Routes
- `src/routes/interactions.ts` — 959 lines:
  - `GET /interaction/:uid` → `showLogin` or redirect to consent
  - `POST /interaction/:uid/login` → `processLogin` (validates user status, handles lockout)
  - `GET /interaction/:uid/consent` → `showConsent` (auto-consent for first-party)
  - `POST /interaction/:uid/confirm` → `processConsent` (approve/deny)
  - `GET /interaction/:uid/abort` → `abortInteraction`
- `src/middleware/tenant-resolver.ts` — 86 lines:
  - Validates org slug → resolves org → checks status (archived→404, suspended→403)

### Key Error Flows in interactions.ts
- **Suspended user**: Login returns error flash "account suspended" (`getStatusErrorMessage`)
- **Archived user**: Login returns error flash "account not found" (treated as non-existent)
- **Locked user**: Login returns error flash "account locked"
- **Deactivated user**: Login returns error flash about account status
- **Rate limiting**: Tracks failed attempts; after threshold → lockout message
- **Expired interaction**: Renders error page "interaction expired"
- **Auto-consent**: First-party clients (same org) skip consent page

### Templates
- `templates/default/pages/login.hbs` — Login form with email + password + magic link option
- `templates/default/pages/consent.hbs` — Scope approval/denial form
- `templates/default/pages/error.hbs` — Generic error page

## Implementation Details

### Spec File 1: `tests/ui/flows/login-error-states.spec.ts`

**Category 6: Login Error States (9 tests)**

```typescript
describe('Login Error States', () => {
  // Test 6.1: Suspended user
  test('suspended user sees account suspended error', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow (lands on login page)
    // Fill email: suspendedUserEmail
    // Fill password: TestPassword123!
    // Submit login form
    // Assert: error flash message contains "suspended" or similar
    // Assert: still on login page (not redirected)
  });

  // Test 6.2: Archived user
  test('archived user sees account not found error', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow
    // Fill email: archivedUserEmail
    // Fill password: TestPassword123!
    // Submit login form
    // Assert: error message (generic "invalid credentials" — doesn't reveal archived status)
    // Assert: still on login page
  });

  // Test 6.3: Locked user
  test('locked user sees account locked error', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Set lockableUser status to 'locked' via dbHelpers
    // Start OIDC auth flow
    // Fill email: lockableUserEmail
    // Fill password: TestPassword123!
    // Submit login form
    // Assert: error message about account locked
    // Assert: still on login page
    // Cleanup: restore lockableUser to 'active'
  });

  // Test 6.4: Deactivated user
  test('deactivated user sees appropriate error', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow
    // Fill email: deactivatedUserEmail
    // Fill password: TestPassword123!
    // Submit login form
    // Assert: error message (generic or deactivation-specific)
    // Assert: still on login page
  });

  // Test 6.5: Suspended organization
  test('suspended org shows 403 error page', async ({ page, testData }) => {
    // Build OIDC authorize URL with suspended org's client (if available)
    // OR: Navigate directly to a page under /:suspendedOrgSlug/
    // Assert: 403 status or error page displayed
    // Assert: NOT the login page
  });

  // Test 6.6: Archived organization
  test('archived org shows 404 error page', async ({ page, testData }) => {
    // Navigate to /:archivedOrgSlug/auth/forgot-password (or any auth page)
    // Assert: 404 or "not found" error page
    // Assert: NOT the login page
  });

  // Test 6.7: Non-existent org slug
  test('non-existent org slug shows 404', async ({ page, testData }) => {
    // Navigate to /nonexistent-org-slug-12345/auth/forgot-password
    // Assert: 404 or "not found" error
  });

  // Test 6.8: Email preserved on error
  test('login form preserves email input after failed attempt', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow
    // Fill email: testData.userEmail
    // Fill password: 'wrong-password'
    // Submit login form
    // Assert: error message visible
    // Assert: email field still contains testData.userEmail (not cleared)
  });

  // Test 6.9: Account lockout after failures
  test('account locks after N consecutive failed attempts', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Reset rate limits for lockableUser
    // Start OIDC auth flow
    // Submit wrong password for lockableUserEmail multiple times (system threshold, likely 5-10)
    // Assert: eventually see lockout message
    // Assert: correct password also fails after lockout
    // Cleanup: reset rate limits, restore user status
  });
});
```

### Spec File 2: `tests/ui/flows/consent-edge-cases.spec.ts`

**Category 7: Consent Edge Cases (5 tests)**

```typescript
describe('Consent Edge Cases', () => {
  // Test 7.1: First-party auto-consent
  test('first-party client auto-consents (skips consent page)', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow with the first-party public client
    // Login with valid credentials
    // Assert: redirected directly to callback (skipped consent page)
    // Assert: auth code in callback URL
    // Note: This may depend on the client's firstParty flag in DB
  });

  // Test 7.2: Third-party client shows scopes
  test('third-party client consent page shows scope descriptions', async ({ page, testData }) => {
    // Start OIDC auth flow with third-party client (if available)
    // Login with valid credentials
    // Assert: consent page renders
    // Assert: requested scopes listed (openid, profile, email, etc.)
    // Assert: scope descriptions visible
  });

  // Test 7.3: Deny consent
  test('deny consent redirects with access_denied error', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow
    // Login with valid credentials
    // On consent page, click deny/reject button
    // Assert: redirected to callback URL
    // Assert: error=access_denied in URL params
  });

  // Test 7.4: CSRF on consent
  test('consent POST requires valid CSRF token', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow
    // Login with valid credentials
    // On consent page, remove CSRF hidden field
    // Click approve
    // Assert: CSRF error (form rejected)
  });

  // Test 7.5: Consent page content
  test('consent page shows client name and requested scopes', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow with scopes: openid profile email
    // Login with valid credentials
    // On consent page:
    // Assert: client name/application name visible
    // Assert: scopes listed (openid, profile, email)
  });
});
```

### Spec File 3: `tests/ui/flows/interaction-lifecycle.spec.ts`

**Category 8: Interaction Lifecycle (6 tests)**

```typescript
describe('Interaction Lifecycle', () => {
  // Test 8.1: Abort interaction
  test('abort interaction redirects with access_denied', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow (lands on login page)
    // Navigate to /interaction/:uid/abort
    // Assert: redirected to callback URL
    // Assert: error=access_denied in redirect URL
  });

  // Test 8.2: Expired interaction UID
  test('expired interaction UID shows error page', async ({ page, testData }) => {
    // Use a stale/expired interaction UID (e.g., from a previous session)
    // Navigate to /interaction/expired-uid-12345
    // Assert: error page renders
    // Assert: "session expired" or "interaction expired" message
  });

  // Test 8.3: Invalid interaction UID
  test('invalid/garbage interaction UID shows error page', async ({ page, testData }) => {
    // Navigate to /interaction/not-a-valid-uid!!!
    // Assert: error page renders
  });

  // Test 8.4: Direct access without auth flow
  test('direct access to interaction URL without starting auth flow shows error', async ({ page, testData }) => {
    // Navigate directly to /interaction/some-random-uid without starting an OIDC flow
    // Assert: error page (no valid interaction session)
  });

  // Test 8.5: Back button after login
  test('browser back button after login handled gracefully', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow
    // Login with valid credentials
    // After reaching consent/callback, press browser back
    // Assert: no error crash; either shows expired interaction or redirects appropriately
  });

  // Test 8.6: Page refresh during interaction
  test('refreshing interaction page handled gracefully', async ({ page, testData, startAuthFlow }) => {
    // Start OIDC auth flow (lands on login page)
    // Reload the page (page.reload())
    // Assert: login page still shows OR interaction expired message
    // Assert: no crash, no 500 error
  });
});
```

## Integration Points

- **testData fixture**: Uses `suspendedUserEmail`, `archivedUserEmail`, `deactivatedUserEmail`, `lockableUserEmail`, `suspendedOrgSlug`, `archivedOrgSlug`
- **dbHelpers fixture**: Used for user status changes, rate limit resets
- **startAuthFlow fixture**: Most tests need to initiate OIDC authorization flow

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| First-party flag not set on test client | Verify or set in global-setup seed data |
| Lockout threshold unknown | Check system_config table for lockout settings; test with enough attempts |
| Third-party client not available | May need to seed a third-party client in global-setup |
| Interaction timing issues | Use generous timeouts; create fresh flows per test |
