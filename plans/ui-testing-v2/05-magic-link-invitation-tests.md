# Magic Link & Invitation Tests: UI Testing Phase 2

> **Document**: 05-magic-link-invitation-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Tests for magic link token verification and invitation acceptance browser flows, covering Categories 3, 4, and 5 from the requirements. The existing Phase 1 magic link test only covers *requesting* a link; these tests cover *clicking* the link (token verification). The invitation flow is entirely untested in browser.

## Source Code Reference

### Routes
- `src/routes/magic-link.ts` — 251 lines, 1 route handler:
  - `GET /:orgSlug/auth/magic-link/:token` → `verifyMagicLink`
- `src/routes/invitation.ts` — 323 lines, 2 route handlers:
  - `GET /:orgSlug/auth/accept-invite/:token` → `showAcceptInvite`
  - `POST /:orgSlug/auth/accept-invite/:token` → `processAcceptInvite`

### Templates
- `templates/default/pages/error.hbs` — Magic link error (expired/invalid/used)
- `templates/default/pages/accept-invite.hbs` — Invitation form (email shown + password fields)
- `templates/default/pages/invite-success.hbs` — Invitation accepted confirmation
- `templates/default/pages/invite-expired.hbs` — Expired/invalid invitation token

### Key Behaviors
- **Magic link verification**: Hashes token → validates in DB → marks used → marks email verified → records login → resumes OIDC interaction (or redirects to forgot-password with flash)
- **Invitation acceptance**: Validates token → shows form → validates CSRF + password → sets password → marks email verified → marks token used → shows success

## Implementation Details

### Spec File 1: `tests/ui/flows/magic-link-verify.spec.ts`

**Category 3: Magic Link Verification (6 tests)**

```typescript
describe('Magic Link Verification', () => {
  // Test 3.1: Valid token with active interaction
  test('valid token during active interaction auto-logins and redirects', async ({ page, testData, dbHelpers, startAuthFlow }) => {
    // Start an OIDC auth flow (gets interaction UID from login page URL)
    // Request a magic link via the login page form (POST /interaction/:uid/magic-link)
    // Capture the magic link token from DB (or via MailHog)
    // Navigate to /:orgSlug/auth/magic-link/:token
    // Assert: redirected to callback URL (or consent page)
    // Assert: OIDC interaction was completed
  });

  // Test 3.2: Valid token without active interaction
  test('valid token without interaction redirects to forgot-password with flash', async ({ page, testData, dbHelpers }) => {
    // Create a magic link token directly via DB (no interaction UID)
    // Navigate to /:orgSlug/auth/magic-link/:token
    // Assert: redirected to /:orgSlug/auth/forgot-password
    // Assert: flash=magic_link_success query param present
    // Assert: success flash message visible on page
  });

  // Test 3.3: Expired token
  test('expired token shows error page', async ({ page, testData, dbHelpers }) => {
    // Create expired magic link token via dbHelpers (expired: true)
    // Navigate to /:orgSlug/auth/magic-link/:token
    // Assert: error page renders
    // Assert: "expired" message visible
  });

  // Test 3.4: Invalid/garbage token
  test('invalid token shows error page', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/magic-link/invalidgarbage123abc
    // Assert: error page renders
    // Assert: appropriate error message visible
  });

  // Test 3.5: Already-used token
  test('already-used token shows error page', async ({ page, testData, dbHelpers }) => {
    // Create valid magic link token via dbHelpers
    // Mark it as used via dbHelpers.markTokenUsed()
    // Navigate to /:orgSlug/auth/magic-link/:token
    // Assert: error page renders (token already consumed)
  });

  // Test 3.6: Email verified after use
  test('email_verified flag set after successful magic link', async ({ page, testData, dbHelpers, startAuthFlow }) => {
    // Ensure user's email_verified is false
    // Start auth flow, request magic link, get token
    // Navigate to magic link URL
    // Assert: user's email_verified is now true (query DB)
  });
});
```

### Spec File 2: `tests/ui/security/magic-link-abuse.spec.ts`

**Category 4: Magic Link Abuse (4 tests)**

```typescript
describe('Magic Link Abuse', () => {
  // Test 4.1: Request rate limiting
  test('rapid magic link requests trigger rate limit', async ({ page, testData, dbHelpers, startAuthFlow }) => {
    // Reset rate limits
    // Start auth flow to get to login page
    // Submit magic link request form rapidly (6+ times)
    // Assert: rate limit error message appears
    // Cleanup: reset rate limits
  });

  // Test 4.2: Non-existent email (enumeration-safe)
  test('non-existent email shows same success message', async ({ page, testData, startAuthFlow }) => {
    // Start auth flow to get to login page
    // Fill email with 'nonexistent-user@test.example.com'
    // Submit magic link request
    // Assert: same "magic link sent" success page
    // (No way to distinguish from valid email — enumeration-safe)
  });

  // Test 4.3: Suspended user email
  test('suspended user email shows same success message', async ({ page, testData, startAuthFlow }) => {
    // Start auth flow
    // Fill email with suspendedUserEmail
    // Submit magic link request
    // Assert: same success message (no differentiation)
  });

  // Test 4.4: Brute-force token guessing
  test('random tokens all fail with error pages', async ({ page, testData }) => {
    // Try 5 random base64url strings as tokens
    // Navigate to /:orgSlug/auth/magic-link/<random>
    // Assert: all show error page
    // Assert: no information leakage in error messages
  });
});
```

### Spec File 3: `tests/ui/flows/invitation.spec.ts`

**Category 5: Invitation Flow (9 tests)**

```typescript
describe('Invitation Acceptance Flow', () => {
  // Test 5.1: Valid token shows form
  test('valid invitation token renders form with email and password fields', async ({ page, testData, dbHelpers }) => {
    // Create invitation token for invitedUserEmail
    // Navigate to /:orgSlug/auth/accept-invite/:token
    // Assert: user's email displayed (read-only)
    // Assert: password input visible
    // Assert: confirm password input visible
    // Assert: CSRF hidden field present
    // Assert: submit button visible
  });

  // Test 5.2: Happy path acceptance
  test('submitting strong passwords shows success page', async ({ page, testData, dbHelpers }) => {
    // Create invitation token
    // Navigate to accept-invite page
    // Fill password: 'InvitePassword123!'
    // Fill confirm: 'InvitePassword123!'
    // Submit form
    // Assert: invite-success page renders
    // Assert: success message visible
  });

  // Test 5.3: Login after acceptance
  test('can login with set password after accepting invite', async ({ page, testData, dbHelpers, startAuthFlow }) => {
    // Create invitation token
    // Accept invite with 'InvitePassword123!'
    // Start a new OIDC auth flow
    // Login with invitedUserEmail + 'InvitePassword123!'
    // Assert: login succeeds
  });

  // Test 5.4: Expired token
  test('expired invitation token shows invite-expired page', async ({ page, testData, dbHelpers }) => {
    // Create expired invitation token (expired: true)
    // Navigate to /:orgSlug/auth/accept-invite/:token
    // Assert: invite-expired page renders (not error.hbs, but invite-expired.hbs)
  });

  // Test 5.5: Invalid token
  test('invalid/garbage token shows invite-expired page', async ({ page, testData }) => {
    // Navigate to /:orgSlug/auth/accept-invite/invalidgarbage
    // Assert: invite-expired page renders
  });

  // Test 5.6: Weak password
  test('weak password shows validation error', async ({ page, testData, dbHelpers }) => {
    // Create valid invitation token
    // Navigate to accept-invite page
    // Fill password: '123'
    // Fill confirm: '123'
    // Submit form
    // Assert: password strength validation error visible
    // Assert: still on accept-invite form
  });

  // Test 5.7: Mismatched passwords
  test('mismatched passwords show error', async ({ page, testData, dbHelpers }) => {
    // Create valid invitation token
    // Navigate to accept-invite page
    // Fill password: 'StrongPassword123!'
    // Fill confirm: 'DifferentPassword456!'
    // Submit form
    // Assert: passwords don't match error visible
    // Assert: still on accept-invite form
  });

  // Test 5.8: CSRF validation
  test('POST without CSRF token is rejected', async ({ page, testData, dbHelpers }) => {
    // Create valid invitation token
    // Navigate to accept-invite page
    // Remove CSRF hidden field via page.evaluate
    // Submit form
    // Assert: CSRF error
  });

  // Test 5.9: Token replay
  test('accepted invitation cannot be reused', async ({ page, testData, dbHelpers }) => {
    // Create valid invitation token
    // Accept invite with valid passwords → success
    // Navigate to same accept-invite URL again
    // Assert: invite-expired page (token already consumed)
  });
});
```

## Integration Points

- **mail-capture fixture**: Test 3.1 uses MailHog to capture the magic link email and extract the token URL
- **db-helpers fixture**: All token-related tests use `createMagicLinkToken()`, `createInvitationToken()`, `markTokenUsed()`
- **startAuthFlow fixture**: Tests 3.1, 3.6, 4.1-4.3, 5.3 need active OIDC interactions
- **testData fixture**: Uses `invitedUserEmail`, `suspendedUserEmail`, `orgSlug`

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| Magic link email not arriving | Use dbHelpers to create token directly (bypass email) |
| Invitation user already has password | Reset user state in test setup |
| OIDC interaction expired during test | Use generous timeouts; create fresh interactions |
| Rate limit state from previous test | Reset rate limits in test setup/teardown |
