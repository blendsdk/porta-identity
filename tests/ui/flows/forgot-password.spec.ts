/**
 * Forgot Password Flow — Playwright browser tests.
 *
 * Drives a real Chromium browser through Porta's forgot-password UI,
 * verifying form rendering, submission, enumeration-safe behavior,
 * validation errors, rate limiting, CSRF protection, and navigation links.
 *
 * Routes under test:
 *   GET  /:orgSlug/auth/forgot-password  → shows forgot password form
 *   POST /:orgSlug/auth/forgot-password  → processes reset request
 *
 * @see plans/ui-testing-v2/04-password-reset-tests.md — Category 1
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Forgot Password Flow', () => {
  /**
   * Navigate to the forgot-password page for the primary test org.
   * Helper reused by most tests in this describe block.
   */
  const forgotPasswordUrl = (baseUrl: string, orgSlug: string) =>
    `${baseUrl}/${orgSlug}/auth/forgot-password`;

  // ── Test 1.1: Page renders correctly ──────────────────────────────

  test('shows forgot password form with email field, submit button, and CSRF', async ({
    page,
    testData,
  }) => {
    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // Email input visible
    await expect(page.locator('#email')).toBeVisible();
    // Submit button visible
    await expect(page.locator('button.btn-primary')).toBeVisible();
    // Hidden _csrf field present with a non-empty value
    const csrfInput = page.locator('input[name="_csrf"]');
    await expect(csrfInput).toBeAttached();
    const csrfValue = await csrfInput.getAttribute('value');
    expect(csrfValue).toBeTruthy();
    expect(csrfValue!.length).toBeGreaterThan(10);
  });

  // ── Test 1.2: Happy path submission ───────────────────────────────

  test('submitting valid email shows check-email confirmation', async ({
    page,
    testData,
    mailCapture,
    dbHelpers,
  }) => {
    // Clean up rate limits and emails
    await dbHelpers.resetAllRateLimits();
    await mailCapture.deleteAll();

    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // Fill email with a known user
    await page.fill('#email', testData.resettableUserEmail);
    // Submit the form
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show a success flash message (check your email)
    await expect(page.locator('.flash-success')).toBeVisible();
    // Should NOT show an error
    expect(await page.locator('.flash-error').count()).toBe(0);
  });

  // ── Test 1.3: Enumeration-safe (non-existent email) ──────────────

  test('non-existent email shows same confirmation page (enumeration protection)', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    await dbHelpers.resetAllRateLimits();
    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // Submit with an email that doesn't exist
    await page.fill('#email', 'nonexistent-user-xyz@test.example.com');
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Must show the SAME success flash — no indication the user doesn't exist
    await expect(page.locator('.flash-success')).toBeVisible();
    expect(await page.locator('.flash-error').count()).toBe(0);
  });

  // ── Test 1.4: Empty/invalid email ─────────────────────────────────

  test('empty email is blocked by browser validation (required attribute)', async ({
    page,
    testData,
  }) => {
    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // The email input has `required` attribute — browser blocks submission
    const emailRequired = await page.locator('#email').getAttribute('required');
    expect(emailRequired).not.toBeNull();

    // Capture URL before clicking submit
    const urlBefore = page.url();
    await page.click('button.btn-primary');
    // Brief wait for any potential navigation
    await page.waitForTimeout(500);

    // URL should not have changed — browser validation blocked submission
    expect(page.url()).toBe(urlBefore);
  });

  // ── Test 1.5: Rate limiting ───────────────────────────────────────

  test('rate limiting shows error after repeated submissions', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // Clean state
    await dbHelpers.resetAllRateLimits();

    const url = forgotPasswordUrl(testData.baseUrl, testData.orgSlug);
    let rateLimited = false;

    // Submit form rapidly multiple times (rate limit window is typically ~5 requests)
    for (let i = 0; i < 8; i++) {
      await page.goto(url);
      await page.fill('#email', testData.resettableUserEmail);
      await page.click('button.btn-primary');
      await page.waitForLoadState('networkidle');

      // Check if we got a rate limit error
      if ((await page.locator('.flash-error').count()) > 0) {
        rateLimited = true;
        break;
      }
    }

    // Should have been rate limited at some point
    expect(rateLimited).toBe(true);
    await expect(page.locator('.flash-error')).toBeVisible();

    // Cleanup: reset rate limits
    await dbHelpers.resetAllRateLimits();
  });

  // ── Test 1.6: CSRF validation ─────────────────────────────────────

  test('POST without valid CSRF token is rejected', async ({
    page,
    testData,
  }) => {
    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // Tamper with CSRF hidden field — set it to a garbage value
    await page.evaluate(() => {
      const csrfInput = document.querySelector<HTMLInputElement>('input[name="_csrf"]');
      if (csrfInput) csrfInput.value = 'tampered-csrf-token-invalid';
    });

    // Fill the email field and submit
    await page.fill('#email', testData.resettableUserEmail);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show a CSRF error (flash-error div or 403 status)
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  // ── Test 1.7: Back to login link ──────────────────────────────────

  test('back to login link is present', async ({
    page,
    testData,
  }) => {
    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // The template has a "back to login" link
    const backLink = page.locator('a:has-text("Back to login"), a:has-text("back to login")');
    await expect(backLink).toBeVisible();
  });

  // ── Test 1.8: Email field accepts email type ──────────────────────

  test('email field has type="email" for browser validation', async ({
    page,
    testData,
  }) => {
    await page.goto(forgotPasswordUrl(testData.baseUrl, testData.orgSlug));

    // The email input should have type="email" for client-side format validation
    const emailType = await page.locator('#email').getAttribute('type');
    expect(emailType).toBe('email');

    // The input should have placeholder text
    const placeholder = await page.locator('#email').getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });
});
