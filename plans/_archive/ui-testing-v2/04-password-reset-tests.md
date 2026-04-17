# Password Reset Tests: UI Testing Phase 2

> **Document**: 04-password-reset-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Tests for the complete forgot-password and reset-password browser flows, covering Categories 1, 2, and 10 from the requirements. These tests exercise the `/:orgSlug/auth/forgot-password` and `/:orgSlug/auth/reset-password/:token` routes, validating form rendering, submission, validation errors, flash messages, token states, and abuse scenarios.

## Source Code Reference

### Routes
- `src/routes/password-reset.ts` — 543 lines, 4 route handlers:
  - `GET /:orgSlug/auth/forgot-password` → `showForgotPassword`
  - `POST /:orgSlug/auth/forgot-password` → `processForgotPassword`
  - `GET /:orgSlug/auth/reset-password/:token` → `showResetPassword`
  - `POST /:orgSlug/auth/reset-password/:token` → `processResetPassword`

### Templates
- `templates/default/pages/forgot-password.hbs` — Email input form
- `templates/default/pages/forgot-password-sent.hbs` — "Check your email" confirmation
- `templates/default/pages/reset-password.hbs` — New password + confirm form
- `templates/default/pages/reset-password-success.hbs` — Password changed confirmation
- `templates/default/pages/error.hbs` — Generic error (expired/invalid token)

### Security
- CSRF: Cookie-based (`_csrf` cookie + hidden field)
- Rate limiting: `buildPasswordResetRateLimitKey` (Redis sliding window)
- Token hashing: SHA-256 hash stored in DB, raw token in URL
- Password validation: NIST SP 800-63B (min 8 chars, not common)

## Implementation Details

### Spec File 1: `tests/ui/flows/forgot-password.spec.ts`

**Category 1: Forgot Password Flow (8 tests)**

```typescript
// Test structure
describe('Forgot Password Flow', () => {
  // Test 1.1: Page renders correctly
  test('shows forgot password form with email field and CSRF', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/forgot-password
    // Assert: email input visible, submit button visible
    // Assert: hidden _csrf field present
    // Assert: _csrf cookie set
  });

  // Test 1.2: Happy path submission
  test('submitting valid email shows check-email confirmation', async ({ page, testData, mailCapture, dbHelpers }) => {
    // Navigate to forgot-password page
    // Fill email field with resettableUserEmail
    // Submit form
    // Assert: "check your email" page renders (forgot-password-sent template)
    // Assert: no error messages
  });

  // Test 1.3: Enumeration-safe (non-existent email)
  test('non-existent email shows same confirmation page', async ({ page, testData }) => {
    // Navigate to forgot-password page
    // Fill email with 'nonexistent@test.example.com'
    // Submit form
    // Assert: same "check your email" page (identical to 1.2)
    // This verifies user enumeration protection
  });

  // Test 1.4: Empty/invalid email
  test('empty email shows validation error', async ({ page, testData }) => {
    // Navigate to forgot-password page
    // Submit form without filling email (or with invalid format)
    // Assert: error flash message visible
    // Assert: still on forgot-password page
  });

  // Test 1.5: Rate limiting
  test('rate limiting shows error after repeated submissions', async ({ page, testData, dbHelpers }) => {
    // Reset rate limits first
    // Navigate to forgot-password page
    // Submit form rapidly multiple times (loop 6+ times)
    // Assert: rate limit error message visible on last attempt
    // Cleanup: reset rate limits
  });

  // Test 1.6: CSRF validation
  test('POST without CSRF token is rejected', async ({ page, testData }) => {
    // Navigate to forgot-password page
    // Remove/tamper with CSRF hidden field via page.evaluate
    // Submit form
    // Assert: CSRF error (403 or error message)
  });

  // Test 1.7: Back to login link
  test('back to login link navigates correctly', async ({ page, testData }) => {
    // Navigate to forgot-password page
    // Click "back to login" or similar link
    // Assert: navigates to login page (or OIDC authorize endpoint)
  });

  // Test 1.8: Flash message from magic link redirect
  test('flash message renders when redirected from magic link', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/forgot-password?flash=magic_link_success
    // Assert: success flash message visible
  });
});
```

### Spec File 2: `tests/ui/flows/reset-password.spec.ts`

**Category 2: Reset Password Flow (10 tests)**

```typescript
describe('Reset Password Flow', () => {
  // Test 2.1: Valid token shows form
  test('valid token renders reset form with password fields and CSRF', async ({ page, testData, dbHelpers }) => {
    // Create a valid reset token via dbHelpers
    // Navigate to /:orgSlug/auth/reset-password/:token
    // Assert: password input visible
    // Assert: confirm password input visible
    // Assert: CSRF hidden field present
    // Assert: submit button visible
  });

  // Test 2.2: Happy path reset
  test('submitting matching strong passwords shows success page', async ({ page, testData, dbHelpers }) => {
    // Create valid reset token via dbHelpers
    // Navigate to reset-password page
    // Fill password: 'NewSecurePassword456!'
    // Fill confirm: 'NewSecurePassword456!'
    // Submit form
    // Assert: success page renders (reset-password-success template)
  });

  // Test 2.3: Expired token
  test('expired token shows error page', async ({ page, testData, dbHelpers }) => {
    // Create expired reset token via dbHelpers (expired: true)
    // Navigate to /:orgSlug/auth/reset-password/:token
    // Assert: error page renders
    // Assert: "expired" or "invalid" message visible
  });

  // Test 2.4: Invalid token
  test('invalid/garbage token shows error page', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/reset-password/invalidgarbage123
    // Assert: error page renders
    // Assert: appropriate error message
  });

  // Test 2.5: Weak password
  test('weak password shows validation error', async ({ page, testData, dbHelpers }) => {
    // Create valid reset token
    // Navigate to reset-password page
    // Fill password: '123' (too short/weak)
    // Fill confirm: '123'
    // Submit form
    // Assert: validation error about password strength
    // Assert: still on reset-password form
  });

  // Test 2.6: Mismatched passwords
  test('mismatched passwords show error', async ({ page, testData, dbHelpers }) => {
    // Create valid reset token
    // Navigate to reset-password page
    // Fill password: 'NewSecurePassword456!'
    // Fill confirm: 'DifferentPassword789!'
    // Submit form
    // Assert: error message about passwords not matching
    // Assert: still on reset-password form
  });

  // Test 2.7: CSRF validation
  test('POST without CSRF token is rejected', async ({ page, testData, dbHelpers }) => {
    // Create valid reset token
    // Navigate to reset-password page
    // Remove CSRF hidden field via page.evaluate
    // Submit form with valid passwords
    // Assert: CSRF error
  });

  // Test 2.8: Token replay
  test('used token cannot be reused', async ({ page, testData, dbHelpers }) => {
    // Create valid reset token
    // Navigate to reset-password page, submit valid passwords → success
    // Navigate to same reset-password URL again (same token)
    // Assert: error page (token already used/expired)
  });

  // Test 2.9: Login with new password
  test('can login with new password after reset', async ({ page, testData, dbHelpers, startAuthFlow }) => {
    // Create valid reset token
    // Complete password reset with 'ResetPassword789!'
    // Start a new auth flow
    // Login with resettableUserEmail + 'ResetPassword789!'
    // Assert: login succeeds (redirected to consent or callback)
    // Cleanup: restore original password
  });

  // Test 2.10: Old password fails
  test('old password fails after reset', async ({ page, testData, dbHelpers, startAuthFlow }) => {
    // Create valid reset token
    // Complete password reset with 'ResetPassword789!'
    // Start a new auth flow
    // Attempt login with resettableUserEmail + OldPassword123!
    // Assert: login fails (error message)
    // Cleanup: restore original password
  });
});
```

### Spec File 3: `tests/ui/security/reset-password-abuse.spec.ts`

**Category 10: Reset Password Abuse (4 tests)**

```typescript
describe('Reset Password Abuse', () => {
  // Test 10.1: Brute-force token guessing
  test('random tokens all result in error pages', async ({ page, testData }) => {
    // Try 5 random tokens
    // Navigate to /:orgSlug/auth/reset-password/<random>
    // Assert: all show error page
  });

  // Test 10.2: Token single-use enforcement
  test('token marked as used in DB after successful reset', async ({ page, testData, dbHelpers }) => {
    // Create valid reset token
    // Complete password reset
    // Query DB to verify token is marked used
    // Try to use same token again
    // Assert: error page on second attempt
  });

  // Test 10.3: Expired token rejected on GET
  test('expired token rejected when loading reset form', async ({ page, testData, dbHelpers }) => {
    // Create expired token (expired: true)
    // Navigate to reset-password URL
    // Assert: error page shown (not the form)
  });

  // Test 10.4: Forgot-password rate limiting
  test('forgot-password rate limiting enforced in browser', async ({ page, testData, dbHelpers }) => {
    // Reset rate limits
    // Rapidly submit forgot-password form multiple times
    // Assert: rate limit error message appears
    // Cleanup: reset rate limits
  });
});
```

## Integration Points

- **mail-capture fixture**: Tests 1.2 can optionally verify email was sent (not required for UI test, but useful)
- **db-helpers fixture**: Tests 2.1–2.10 require token creation via `createPasswordResetToken()`
- **testData fixture**: Uses `resettableUserEmail`, `resettableUserPassword`, `orgSlug`
- **startAuthFlow fixture**: Tests 2.9, 2.10 need to start an OIDC flow after reset

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| Token creation fails | Test fails with clear error from dbHelpers |
| Rate limit interferes between tests | Each rate-limit test resets limits in setup and teardown |
| Password restore after test | Use `test.afterEach` to restore original password hash |
