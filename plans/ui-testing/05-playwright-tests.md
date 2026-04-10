# Playwright Tests: Browser-Based Flow & Security Tests

> **Document**: 05-playwright-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Detailed specifications for each Playwright test file. These tests drive a real Chromium browser through Porta's authentication UI, verifying that forms, cookies, redirects, and JavaScript all work correctly.

## Flow Tests

### Password Login (`flows/password-login.spec.ts`)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Successful login → auto-consent → callback | Navigate to auth URL → fill email/password → submit → auto-consent (first-party) → verify redirect to callback with `code` param | Redirect to callback URL with authorization code |
| 2 | Login page renders correctly | Navigate to auth URL | Page has email field, password field, submit button, magic link button |
| 3 | CSRF token present in form | Inspect login page HTML | Hidden input `_csrf` exists with non-empty value |
| 4 | Invalid credentials show error | Submit wrong password | Error message displayed, stays on login page, email pre-filled |
| 5 | Empty form shows validation | Submit empty form | Browser validation prevents submission (required fields) |
| 6 | Login page has correct form actions | Inspect form action attributes | Actions point to `/interaction/{uid}/login` and `/interaction/{uid}/magic-link` |

### Magic Link (`flows/magic-link.spec.ts`)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Request magic link → check-your-email page | Fill email → click magic link button | "Check your email" page shown |
| 2 | Magic link email received in MailHog | Request magic link, query MailHog API | Email received with valid magic link URL |
| 3 | Click magic link → authenticated | Navigate to magic link URL from email | Redirected through auth flow to callback with code |
| 4 | Non-existent email shows same page | Submit with unknown email | Same "check your email" page (no enumeration) |

### Consent (`flows/consent.spec.ts`)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | First-party client auto-consents | Login with first-party client | No consent page shown, direct redirect to callback |
| 2 | Third-party client shows consent | Login with third-party client | Consent page with scopes and approve/deny buttons |
| 3 | Approve consent → callback with code | Click approve on consent page | Redirect to callback URL with authorization code |
| 4 | Deny consent → callback with error | Click deny on consent page | Redirect to callback URL with `error=access_denied` |

### Two-Factor (`flows/two-factor.spec.ts`)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Email OTP challenge page renders | Login as user with 2FA → arrives at 2FA page | Code input field, verify button, resend link visible |
| 2 | Valid OTP code → authenticated | Enter correct OTP from MailHog | Redirect through consent to callback |
| 3 | Invalid OTP shows error | Enter wrong code | Error message, stays on 2FA page |
| 4 | Resend OTP works | Click resend → check MailHog for new email | New OTP email received |

## Security Tests

### CSRF Protection (`security/csrf-protection.spec.ts`)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Normal form submit works (CSRF valid) | Load login page → submit form normally | Form processes correctly (no CSRF error) |
| 2 | `_csrf` cookie set on login page | Load login page → inspect cookies | `_csrf` cookie present with HttpOnly flag |
| 3 | POST without CSRF token rejected | Use `page.route()` to intercept and remove `_csrf` field → submit | 403 or error message containing "csrf" |
| 4 | POST with wrong CSRF token rejected | Use `page.evaluate()` to change hidden field value → submit | 403 or CSRF error message |
| 5 | CSRF cookie has correct flags | Load login page → inspect `_csrf` cookie via CDP | HttpOnly=true, SameSite=Lax |
| 6 | New CSRF token on each page load | Load login page twice → compare tokens | Different `_csrf` values |

### Cookie Flags (`security/cookie-flags.spec.ts`)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | CSRF cookie is HttpOnly | Load any form page → check cookie flags | HttpOnly=true |
| 2 | CSRF cookie is SameSite=Lax | Load any form page → check cookie flags | SameSite=Lax |
| 3 | OIDC interaction cookies present | Navigate through auth flow → check cookies | `_interaction` and `_interaction_resume` cookies set |
| 4 | No sensitive data in non-HttpOnly cookies | Check all cookies | Only non-sensitive cookies are non-HttpOnly |

## Code Examples

### Typical Flow Test

```typescript
import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Password Login Flow', () => {
  test('should login successfully and receive auth code', async ({ page, testData, startAuthFlow }) => {
    // 1. Start OIDC authorization flow — redirects to login page
    const loginUrl = await startAuthFlow(page);
    await page.waitForURL('**/interaction/*/');

    // 2. Fill in credentials
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);

    // 3. Submit login form
    await page.click('button[type="submit"]');

    // 4. Should auto-consent (first-party client) and redirect to callback
    await page.waitForURL(`${testData.redirectUri}*`);

    // 5. Verify authorization code in URL
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  test('should show error for invalid credentials', async ({ page, testData, startAuthFlow }) => {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/*/');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', 'wrong-password');
    await page.click('button[type="submit"]');

    // Should stay on login page with error
    await expect(page.locator('.flash-error, .error')).toBeVisible();
    // Email should be pre-filled
    await expect(page.locator('#email')).toHaveValue(testData.userEmail);
  });
});
```

### Typical Security Test

```typescript
import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('CSRF Protection', () => {
  test('should have _csrf cookie set on login page', async ({ page, startAuthFlow }) => {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/*/');

    // Get cookies via CDP
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find(c => c.name === '_csrf');

    expect(csrfCookie).toBeDefined();
    expect(csrfCookie!.httpOnly).toBe(true);
    expect(csrfCookie!.sameSite).toBe('Lax');
  });

  test('should reject POST with tampered CSRF token', async ({ page, testData, startAuthFlow }) => {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/*/');

    // Tamper with the CSRF hidden field
    await page.evaluate(() => {
      const csrfInput = document.querySelector('input[name="_csrf"]') as HTMLInputElement;
      if (csrfInput) csrfInput.value = 'tampered-value';
    });

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // Should show CSRF error (not proceed with login)
    const content = await page.textContent('body');
    expect(content).toContain('csrf');
  });
});
```

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| Auth flow redirect fails | `waitForURL` with 30s timeout, descriptive error |
| MailHog email not received | Poll with 10s timeout, fail with "email not received" |
| Page element not found | Playwright auto-wait (15s action timeout) |
| Consent page not shown (auto-consent) | Test expects redirect; consent tests use a third-party client |
| Browser console errors | Capture and report in test output (optional enhancement) |
