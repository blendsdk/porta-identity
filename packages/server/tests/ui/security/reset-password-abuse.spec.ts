/**
 * Reset Password Abuse — Playwright security tests.
 *
 * Verifies abuse prevention mechanisms for the password reset flow:
 * brute-force token guessing, single-use enforcement, expired token
 * rejection on GET, and forgot-password rate limiting through the browser.
 *
 * These tests complement the unit-level security tests by exercising
 * the full browser → server → database flow.
 *
 * @see plans/ui-testing-v2/04-password-reset-tests.md — Category 10
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Reset Password Abuse', () => {
  // Force serial execution: test 10.4 (rate limiting) submits forgot-password
  // for the same resettable user, which calls invalidateUserTokens() and
  // expires test 10.2's token. Running in parallel causes a race condition.
  test.describe.configure({ mode: 'serial' });

  /**
   * Build the reset-password URL with a token.
   */
  const resetUrl = (baseUrl: string, orgSlug: string, token: string) =>
    `${baseUrl}/${orgSlug}/auth/reset-password/${token}`;

  const forgotPasswordUrl = (baseUrl: string, orgSlug: string) =>
    `${baseUrl}/${orgSlug}/auth/forgot-password`;

  // ── Test 10.1: Brute-force token guessing ─────────────────────────

  test('random tokens all result in error pages', async ({
    page,
    testData,
  }) => {
    // Try 5 random base64url tokens — none should show the reset form
    const randomTokens = [
      'AAAAAAAAAAAAbbbbbbbbbbbCCCCCCCCCCCC',
      'xyzRandomToken123456789abcdefghijk',
      'aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV',
      'ZZZZZ_____YYYYY-----XXXXX_____ZZZ',
      '0000000000000000000000000000000000',
    ];

    for (const token of randomTokens) {
      await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

      // Should show error page (not the reset form)
      await expect(page.locator('h1')).toContainText(/wrong|error|expired/i);
      // Password field should NOT be present
      expect(await page.locator('#password').count()).toBe(0);
    }
  });

  // ── Test 10.2: Token single-use enforcement ───────────────────────

  test('token marked as used in DB after successful reset', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);

    // Complete the reset
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));
    await page.fill('#password', 'SingleUseTest123!');
    await page.fill('#confirmPassword', 'SingleUseTest123!');
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Verify first use succeeded
    await expect(page.locator('h1')).toContainText(/reset|success/i);

    // Try to use the same token again — should fail
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Error page should appear (token is used/invalid)
    await expect(page.locator('h1')).toContainText(/wrong|error|expired/i);
    expect(await page.locator('#password').count()).toBe(0);

    // Restore original password
    const restoreToken = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, restoreToken));
    await page.fill('#password', testData.resettableUserPassword);
    await page.fill('#confirmPassword', testData.resettableUserPassword);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');
  });

  // ── Test 10.3: Expired token rejected on GET ──────────────────────

  test('expired token rejected when loading reset form', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);

    // Create a token that's already expired
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId, {
      expired: true,
    });

    // Navigate to the reset URL — should show error, not the form
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Error page should be rendered (not the password form)
    await expect(page.locator('h1')).toContainText(/wrong|error|expired/i);
    expect(await page.locator('#password').count()).toBe(0);
  });

  // ── Test 10.4: Forgot-password rate limiting in browser ───────────

  test('forgot-password rate limiting enforced in browser', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // Reset rate limits for clean state
    await dbHelpers.resetAllRateLimits();

    const url = forgotPasswordUrl(testData.baseUrl, testData.orgSlug);
    let rateLimited = false;

    // Rapidly submit forgot-password form multiple times
    for (let i = 0; i < 8; i++) {
      await page.goto(url);
      await page.fill('#email', testData.resettableUserEmail);
      await page.click('button.btn-primary');
      await page.waitForLoadState('networkidle');

      // Check if rate limit error appeared
      if ((await page.locator('.flash-error').count()) > 0) {
        rateLimited = true;
        break;
      }
    }

    // Rate limiting should have kicked in
    expect(rateLimited).toBe(true);
    await expect(page.locator('.flash-error')).toBeVisible();

    // Cleanup
    await dbHelpers.resetAllRateLimits();
  });
});
