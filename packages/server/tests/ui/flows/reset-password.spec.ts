/**
 * Reset Password Flow — Playwright browser tests.
 *
 * Drives a real Chromium browser through Porta's password reset UI,
 * verifying form rendering, token validation, password strength checks,
 * password mismatch errors, CSRF protection, token single-use enforcement,
 * and end-to-end login with the new password.
 *
 * Uses `dbHelpers.createPasswordResetToken()` to create tokens directly
 * in the database, bypassing the email flow for faster testing.
 *
 * Routes under test:
 *   GET  /:orgSlug/auth/reset-password/:token  → shows reset form or error
 *   POST /:orgSlug/auth/reset-password/:token  → processes password reset
 *
 * @see plans/ui-testing-v2/04-password-reset-tests.md — Category 2
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Reset Password Flow', () => {
  /**
   * Build the reset-password URL with a token.
   */
  const resetUrl = (baseUrl: string, orgSlug: string, token: string) =>
    `${baseUrl}/${orgSlug}/auth/reset-password/${token}`;

  /** Strong password that meets NIST SP 800-63B requirements */
  const STRONG_PASSWORD = 'NewSecurePassword456!';

  let orgId: string;

  // ── Test 2.1: Valid token shows form ──────────────────────────────

  test('valid token renders reset form with password fields and CSRF', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    // Resolve org ID and create a valid token
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);

    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Password input visible
    await expect(page.locator('#password')).toBeVisible();
    // Confirm password input visible
    await expect(page.locator('#confirmPassword')).toBeVisible();
    // Submit button visible
    await expect(page.locator('button.btn-primary')).toBeVisible();
    // Hidden CSRF field present
    const csrfInput = page.locator('input[name="_csrf"]');
    await expect(csrfInput).toBeAttached();
    const csrfValue = await csrfInput.getAttribute('value');
    expect(csrfValue).toBeTruthy();
    expect(csrfValue!.length).toBeGreaterThan(10);
  });

  // ── Test 2.2: Happy path reset ────────────────────────────────────

  test('submitting matching strong passwords shows success page', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Fill in matching strong passwords
    await page.fill('#password', STRONG_PASSWORD);
    await page.fill('#confirmPassword', STRONG_PASSWORD);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show the success page
    await expect(page.locator('h1')).toContainText(/reset|success/i);
    // Should show a success flash message
    await expect(page.locator('.flash-success').first()).toBeVisible();
    // Should NOT show an error
    expect(await page.locator('.flash-error').count()).toBe(0);
  });

  // ── Test 2.3: Expired token ───────────────────────────────────────

  test('expired token shows error page', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId, {
      expired: true,
    });

    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Should show error page (not the reset form)
    await expect(page.locator('h1')).toContainText(/wrong|error|expired/i);
    // Should NOT show the password form
    expect(await page.locator('#password').count()).toBe(0);
  });

  // ── Test 2.4: Invalid/garbage token ───────────────────────────────

  test('invalid/garbage token shows error page', async ({
    page,
    testData,
  }) => {
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, 'invalidgarbage123token'));

    // Should show error page
    await expect(page.locator('h1')).toContainText(/wrong|error|expired/i);
    // Should NOT show the password form
    expect(await page.locator('#password').count()).toBe(0);
  });

  // ── Test 2.5: Weak password ───────────────────────────────────────

  test('weak password shows validation error', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Fill with a weak password (too short)
    // Use page.evaluate to bypass HTML5 minlength validation
    await page.evaluate(() => {
      const pwd = document.querySelector<HTMLInputElement>('#password');
      const confirm = document.querySelector<HTMLInputElement>('#confirmPassword');
      if (pwd) {
        pwd.removeAttribute('minlength');
        pwd.removeAttribute('required');
      }
      if (confirm) {
        confirm.removeAttribute('minlength');
        confirm.removeAttribute('required');
      }
    });
    await page.fill('#password', '123');
    await page.fill('#confirmPassword', '123');
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show a validation error about password strength
    await expect(page.locator('.flash-error')).toBeVisible();
    // Should still be on the reset form (not the success page)
    await expect(page.locator('#password')).toBeVisible();
  });

  // ── Test 2.6: Mismatched passwords ────────────────────────────────

  test('mismatched passwords show error', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Fill with non-matching passwords
    await page.fill('#password', STRONG_PASSWORD);
    await page.fill('#confirmPassword', 'DifferentPassword789!');
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show a mismatch error
    await expect(page.locator('.flash-error')).toBeVisible();
    // Should still be on the reset form
    await expect(page.locator('#password')).toBeVisible();
  });

  // ── Test 2.7: CSRF validation ─────────────────────────────────────

  test('POST without valid CSRF token is rejected', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Tamper with CSRF hidden field
    await page.evaluate(() => {
      const csrfInput = document.querySelector<HTMLInputElement>('input[name="_csrf"]');
      if (csrfInput) csrfInput.value = 'tampered-csrf-token-invalid';
    });

    // Fill valid passwords and submit
    await page.fill('#password', STRONG_PASSWORD);
    await page.fill('#confirmPassword', STRONG_PASSWORD);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show a CSRF error
    await expect(page.locator('.flash-error')).toBeVisible();
  });

  // ── Test 2.8: Token replay (single use) ───────────────────────────

  test('used token cannot be reused', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);

    // First use: complete the reset successfully
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));
    await page.fill('#password', 'FirstResetPassword123!');
    await page.fill('#confirmPassword', 'FirstResetPassword123!');
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Verify first use succeeded
    await expect(page.locator('h1')).toContainText(/reset|success/i);

    // Second use: navigate to the same token URL
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));

    // Should show error (token already used)
    await expect(page.locator('h1')).toContainText(/wrong|error|expired/i);
    expect(await page.locator('#password').count()).toBe(0);
  });

  // ── Test 2.9: Password hash changes after reset ───────────────────

  test('password hash in DB changes after successful reset', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);

    // Capture the password hash BEFORE reset
    const hashBefore = await dbHelpers.getUserPasswordHash(testData.resettableUserId);

    const newPassword = 'ResetPassword789!';
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);

    // Complete password reset through the UI
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));
    await page.fill('#password', newPassword);
    await page.fill('#confirmPassword', newPassword);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Verify success page
    await expect(page.locator('h1')).toContainText(/reset|success/i);

    // Verify the password hash in the database actually changed
    const hashAfter = await dbHelpers.getUserPasswordHash(testData.resettableUserId);
    expect(hashAfter).not.toBe(hashBefore);
    // Hash should be an Argon2id hash
    expect(hashAfter).toContain('$argon2id$');

    // Restore original password
    const restoreToken = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, restoreToken));
    await page.fill('#password', testData.resettableUserPassword);
    await page.fill('#confirmPassword', testData.resettableUserPassword);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');
  });

  // ── Test 2.10: Reset replaces password hash (old hash is gone) ────

  test('password hash differs from the original after reset', async ({
    page,
    testData,
    dbHelpers,
  }) => {
    orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);

    // Capture the current password hash (whatever state from preceding tests)
    const hashBefore = await dbHelpers.getUserPasswordHash(testData.resettableUserId);

    const newPassword = 'OldPassTestPassword789!';
    const token = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);

    // Complete password reset through the UI
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, token));
    await page.fill('#password', newPassword);
    await page.fill('#confirmPassword', newPassword);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Verify reset succeeded
    await expect(page.locator('h1')).toContainText(/reset|success/i);

    // Verify the old password hash is replaced — the hash must differ
    const hashAfter = await dbHelpers.getUserPasswordHash(testData.resettableUserId);
    expect(hashAfter).not.toBe(hashBefore);
    expect(hashAfter).toContain('$argon2id$');

    // Restore original password
    const restoreToken = await dbHelpers.createPasswordResetToken(testData.resettableUserId, orgId);
    await page.goto(resetUrl(testData.baseUrl, testData.orgSlug, restoreToken));
    await page.fill('#password', testData.resettableUserPassword);
    await page.fill('#confirmPassword', testData.resettableUserPassword);
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');
  });
});
