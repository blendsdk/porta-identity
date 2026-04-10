# Security, Accessibility & Quality Tests: UI Testing Phase 2

> **Document**: 08-security-accessibility-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Tests for 2FA edge cases, multi-tenant UI isolation, page quality, OIDC discovery, and accessibility, covering Categories 9, 11, 12, 13, and 14 from the requirements. These are the "cross-cutting" tests that don't belong to a single flow but verify system-wide behaviors.

## Source Code Reference

### 2FA Routes
- `src/routes/two-factor.ts` — 2FA challenge and setup pages:
  - `GET /interaction/:uid/two-factor` → `showTwoFactorVerify`
  - `POST /interaction/:uid/two-factor` → `processTwoFactorVerify`
  - `GET /interaction/:uid/two-factor/setup` → `showTwoFactorSetup`
  - `POST /interaction/:uid/two-factor/setup` → `processTwoFactorSetup`

### Tenant Resolution
- `src/middleware/tenant-resolver.ts` — Org slug validation, status checks (404/403)

### Templates
- `templates/default/pages/two-factor-verify.hbs` — OTP/TOTP verification form
- `templates/default/pages/two-factor-setup.hbs` — TOTP setup with QR code
- `templates/default/pages/error.hbs` — Generic error

## Implementation Details

### Spec File 1: `tests/ui/flows/two-factor-edge-cases.spec.ts`

**Category 9: Two-Factor Edge Cases (8 tests)**

```typescript
describe('Two-Factor Edge Cases', () => {
  // Test 9.1: Invalid OTP code
  test('invalid OTP code shows error and allows retry', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user with email 2FA enabled
    // Start auth flow, login with credentials
    // Redirected to 2FA challenge page
    // Enter invalid OTP code (e.g., '000000')
    // Submit
    // Assert: error message about invalid code
    // Assert: still on 2FA challenge page (can retry)
    // Assert: input field cleared for retry
  });

  // Test 9.2: Expired OTP code
  test('expired OTP code shows error with resend option', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user with email 2FA enabled
    // Start auth flow, login → 2FA page
    // Wait for OTP to expire (or use DB to expire it)
    // Enter the expired code
    // Assert: error about expired/invalid code
    // Assert: resend option available
  });

  // Test 9.3: Invalid TOTP code
  test('invalid TOTP code shows error', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user with TOTP 2FA enabled
    // Start auth flow, login → 2FA page (TOTP variant)
    // Enter invalid TOTP code (e.g., '123456')
    // Submit
    // Assert: error message about invalid code
    // Assert: still on 2FA page
  });

  // Test 9.4: Invalid recovery code
  test('invalid recovery code shows error', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user with 2FA enabled (any method)
    // Start auth flow, login → 2FA page
    // Switch to recovery code input (if UI has tab/link)
    // Enter invalid recovery code
    // Submit
    // Assert: error message about invalid recovery code
  });

  // Test 9.5: 2FA setup page renders QR code
  test('TOTP setup page renders QR code image', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user with required_totp policy but no TOTP configured
    // Start auth flow, login → redirected to 2FA setup page
    // Assert: QR code image visible (img or canvas element)
    // Assert: manual entry key shown
    // Assert: confirmation code input visible
    // Assert: submit button visible
  });

  // Test 9.6: 2FA setup with invalid confirmation
  test('invalid TOTP setup confirmation code shows error', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user on TOTP setup page
    // Enter invalid confirmation code (e.g., '000000')
    // Submit
    // Assert: error message
    // Assert: still on setup page (QR code still visible)
  });

  // Test 9.7: 2FA method-appropriate UI
  test('2FA verify page shows method-appropriate UI', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // For email OTP user:
    //   Assert: "Enter the code sent to your email" message
    //   Assert: 6-digit input field
    // For TOTP user:
    //   Assert: "Enter code from your authenticator app" message
    //   Assert: 6-digit input field
  });

  // Test 9.8: Resend OTP
  test('resend OTP code button works', async ({ page, testData, startAuthFlow, dbHelpers }) => {
    // Setup: user with email 2FA on challenge page
    // Click resend button/link
    // Assert: success message (code resent)
    // Assert: new email sent (verify via mailCapture if needed)
  });
});
```

### Spec File 2: `tests/ui/security/tenant-isolation.spec.ts`

**Category 11: Multi-Tenant UI Isolation (4 tests)**

```typescript
describe('Multi-Tenant UI Isolation', () => {
  // Test 11.1: Org branding
  test('auth pages render with correct org branding/name', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/forgot-password
    // Assert: page contains org name or branding
    // Assert: page title includes org name (if applicable)
  });

  // Test 11.2: Non-existent org
  test('non-existent org slug returns 404', async ({ page, testData }) => {
    // Navigate to /this-org-does-not-exist/auth/forgot-password
    // Assert: 404 response or "not found" page
    // Assert: no login form rendered
  });

  // Test 11.3: Suspended org
  test('suspended org shows proper error not login page', async ({ page, testData }) => {
    // Navigate to /:suspendedOrgSlug/auth/forgot-password
    // Assert: 403 or "organization suspended" error
    // Assert: NOT the forgot-password form
  });

  // Test 11.4: Archived org
  test('archived org shows proper error not login page', async ({ page, testData }) => {
    // Navigate to /:archivedOrgSlug/auth/forgot-password
    // Assert: 404 or "not found" error
    // Assert: NOT the forgot-password form
  });
});
```

### Spec File 3: `tests/ui/security/page-quality.spec.ts`

**Category 12: Page Quality & Security Headers (7 tests)**

```typescript
describe('Page Quality & Security', () => {
  // Test 12.1-12.3: No console errors on key pages
  test('no JavaScript console errors on login page', async ({ page, testData, startAuthFlow }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    // Start auth flow (lands on login page)
    // Assert: consoleErrors.length === 0
  });

  test('no JavaScript console errors on consent page', async ({ page, testData, startAuthFlow }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    // Login and reach consent page
    // Assert: consoleErrors.length === 0
  });

  test('no JavaScript console errors on forgot-password page', async ({ page, testData }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    // Navigate to /:orgSlug/auth/forgot-password
    // Assert: consoleErrors.length === 0
  });

  // Test 12.4: No network errors
  test('no failed network requests on auth pages', async ({ page, testData, startAuthFlow }) => {
    const failedRequests: string[] = [];
    page.on('requestfailed', req => failedRequests.push(req.url()));
    // Navigate through login → consent flow
    // Assert: failedRequests.length === 0
  });

  // Test 12.5: Password field types
  test('password fields use type="password"', async ({ page, testData, startAuthFlow }) => {
    // Start auth flow (login page)
    // Assert: password input has type="password"
    // Navigate to forgot-password → create reset token → reset-password page
    // Assert: password and confirm inputs have type="password"
  });

  // Test 12.6: Autocomplete attributes
  test('forms have appropriate autocomplete attributes', async ({ page, testData, startAuthFlow }) => {
    // Login page:
    // Assert: email input has autocomplete="email" or "username"
    // Assert: password input has autocomplete="current-password"
    // Reset password page:
    // Assert: password inputs have autocomplete="new-password"
  });

  // Test 12.7: Security headers
  test('security headers present on HTML pages', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/forgot-password
    // Check response headers:
    // Assert: X-Content-Type-Options: nosniff
    // Assert: X-Frame-Options: DENY or SAMEORIGIN (if set)
    // Assert: Content-Type includes charset
  });
});
```

### Spec File 4: OIDC Discovery (within existing or new spec)

**Category 13: OIDC Discovery (4 tests)**

These can be added to the existing `smoke.spec.ts` or a new `tests/ui/flows/oidc-discovery.spec.ts`:

```typescript
describe('OIDC Discovery', () => {
  // Test 13.1: Discovery endpoint
  test('openid-configuration returns valid JSON', async ({ page, testData }) => {
    const response = await page.goto(`${testData.baseUrl}/${testData.orgSlug}/.well-known/openid-configuration`);
    // Assert: status 200
    // Assert: JSON body with issuer, authorization_endpoint, token_endpoint
    // Assert: issuer matches expected value
  });

  // Test 13.2: JWKS endpoint
  test('JWKS returns valid key set', async ({ page, testData }) => {
    // Get JWKS URI from discovery
    const response = await page.goto(`${testData.baseUrl}/${testData.orgSlug}/jwks`);
    // Assert: status 200
    // Assert: JSON with keys array
    // Assert: at least one key with kty, kid, alg
  });

  // Test 13.3: Authorization endpoint reachable
  test('authorization endpoint redirects to login', async ({ page, testData }) => {
    // Build authorize URL with valid client_id
    // Navigate to it
    // Assert: redirected to login page (interaction URL)
  });

  // Test 13.4: Token endpoint exists
  test('token endpoint path matches discovery', async ({ page, testData }) => {
    // Fetch discovery JSON
    // Assert: token_endpoint contains orgSlug
    // Assert: token_endpoint path ends with /token
  });
});
```

### Spec File 5: `tests/ui/accessibility/form-accessibility.spec.ts`

**Category 14: Accessibility (5 tests)**

```typescript
describe('Form Accessibility', () => {
  // Test 14.1: Login form labels
  test('login form fields have associated labels', async ({ page, testData, startAuthFlow }) => {
    // Start auth flow (login page)
    // Assert: email input has a <label> with for= matching input id
    // Assert: password input has a <label> with for= matching input id
    // OR: inputs wrapped in <label> elements
  });

  // Test 14.2: Error message association
  test('error messages are associated with form fields', async ({ page, testData, startAuthFlow }) => {
    // Login with wrong password
    // Assert: error message has role="alert" or aria-live
    // Assert: error is visible and descriptive
  });

  // Test 14.3: Focus on error
  test('focus moves to error area on validation failure', async ({ page, testData, startAuthFlow }) => {
    // Login with wrong password
    // Assert: focus is on error message, first input, or form area
    // (Exact behavior depends on template implementation)
  });

  // Test 14.4: Keyboard navigation
  test('all form elements are keyboard navigable', async ({ page, testData, startAuthFlow }) => {
    // Start auth flow (login page)
    // Tab through: email → password → submit → magic link link → forgot password link
    // Assert: each element receives focus in order
    // Assert: no focus traps
  });

  // Test 14.5: Consent scopes accessible
  test('consent page scopes are screen-reader accessible', async ({ page, testData, startAuthFlow }) => {
    // Login and reach consent page
    // Assert: scope list uses semantic HTML (ul/li or similar)
    // Assert: approve/deny buttons have descriptive text
    // Assert: buttons are keyboard-activatable
  });
});
```

## Integration Points

- **dbHelpers fixture**: 2FA tests need users with specific 2FA configurations
- **mailCapture fixture**: 2FA email OTP resend test
- **testData fixture**: Suspended/archived org slugs for tenant isolation
- **startAuthFlow fixture**: Most tests need OIDC interaction context

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| 2FA user not configured | Seed 2FA-enabled users in global-setup |
| TOTP QR code not detectable | Check for img src with data: URI or canvas element |
| Accessibility assertions too strict | Start with basic checks; expand as templates improve |
| Security headers vary by middleware | Test only headers that Porta explicitly sets |
| Console errors from third-party scripts | Filter out known third-party errors if any |
