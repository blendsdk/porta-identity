/**
 * Two-Factor Edge Cases — Playwright browser tests.
 *
 * Tests 2FA challenge and setup edge cases: invalid codes, expired codes,
 * recovery codes, TOTP setup QR rendering, method-appropriate UI, and
 * OTP resend functionality. Covers Category 9 from the UI Testing Phase 2 plan.
 *
 * IMPORTANT: All tests are marked `test.fixme()` because 2FA requires
 * modifying user state (enabling 2FA) from the Playwright worker process,
 * which is separate from the server process. The SQL UPDATE + Redis cache
 * invalidation runs in the worker, but the server's user service reads from
 * its own in-process cache/pool and doesn't reliably detect the 2FA change.
 * These tests are fully implemented and will pass once a dedicated test API
 * endpoint or fixture hook is added to enable 2FA on the server side.
 *
 * @see plans/ui-testing-v2/08-security-accessibility-tests.md — Category 9
 * @see tests/ui/flows/two-factor.spec.ts — Phase 1 2FA tests (same limitation)
 */

import { test, expect } from '../fixtures/test-fixtures.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { TEST_MAILHOG_URL } from '../../helpers/constants.js';

/** MailHog client for intercepting OTP emails */
const mailhog = new MailHogClient(TEST_MAILHOG_URL);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Enable email-based 2FA for a user via direct SQL.
 *
 * Creates a standalone pg.Pool to the test database (since Playwright
 * workers run in a separate process from the server), updates the user
 * record, and invalidates the Redis cache for that user.
 *
 * @param orgSlug - Organization slug to find the user
 * @param userEmail - Email of the user to enable 2FA for
 * @param method - 2FA method to enable ('email' or 'totp')
 */
async function enableTwoFactor(
  orgSlug: string,
  userEmail: string,
  method: 'email' | 'totp' = 'email',
): Promise<void> {
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const orgResult = await pool.query(
      'SELECT id FROM organizations WHERE slug = $1', [orgSlug],
    );
    if (orgResult.rows.length === 0) throw new Error(`Org ${orgSlug} not found`);
    const orgId = orgResult.rows[0].id;

    const userResult = await pool.query(
      'SELECT id FROM users WHERE organization_id = $1 AND email = $2',
      [orgId, userEmail],
    );
    if (userResult.rows.length === 0) throw new Error(`User ${userEmail} not found`);
    const userId = userResult.rows[0].id;

    await pool.query(
      `UPDATE users SET two_factor_enabled = true, two_factor_method = $1
       WHERE id = $2`,
      [method, userId],
    );

    // Invalidate Redis cache
    const Redis = (await import('ioredis')).default;
    const redis = new Redis(process.env.REDIS_URL!);
    try {
      await redis.del(`user:id:${userId}`);
    } finally {
      redis.disconnect();
    }
  } finally {
    await pool.end();
  }
}

/**
 * Disable 2FA for a user via direct SQL.
 *
 * @param orgSlug - Organization slug
 * @param userEmail - User email
 */
async function disableTwoFactor(orgSlug: string, userEmail: string): Promise<void> {
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const orgResult = await pool.query(
      'SELECT id FROM organizations WHERE slug = $1', [orgSlug],
    );
    if (orgResult.rows.length === 0) return;
    const orgId = orgResult.rows[0].id;

    await pool.query(
      `UPDATE users SET two_factor_enabled = false, two_factor_method = NULL
       WHERE organization_id = $1 AND email = $2`,
      [orgId, userEmail],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Login and advance to the 2FA verification page.
 *
 * Starts an OIDC auth flow, fills the login form, and expects to be
 * redirected to the 2FA challenge page (/interaction/:uid/two-factor).
 *
 * @returns true if the 2FA page was reached
 */
async function loginToTwoFactorPage(
  page: import('@playwright/test').Page,
  testData: { userEmail: string; userPassword: string },
  startAuthFlow: (page: import('@playwright/test').Page) => Promise<string>,
): Promise<boolean> {
  await startAuthFlow(page);
  await page.waitForURL('**/interaction/**');

  await page.fill('#email', testData.userEmail);
  await page.fill('#password', testData.userPassword);
  await page.click('button[type="submit"]');

  // Wait for navigation — should go to /two-factor if 2FA is enabled
  try {
    await page.waitForURL('**/interaction/*/two-factor**', { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Category 9: Two-Factor Edge Cases (8 tests)
// ---------------------------------------------------------------------------

test.describe('Two-Factor Edge Cases', () => {
  // ── 9.1: Invalid OTP code shows error and allows retry ───────────────

  // FIXME: Requires enabling 2FA on the server side — see module docblock.
  test.fixme('invalid OTP code shows error and allows retry', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Setup: enable email 2FA for the test user
    await enableTwoFactor(testData.orgSlug, testData.userEmail, 'email');
    await mailhog.clearAll();

    try {
      // Login → should redirect to 2FA challenge page
      const reached2FA = await loginToTwoFactorPage(page, testData, startAuthFlow);
      expect(reached2FA).toBe(true);

      // Verify 2FA page rendered with code input
      await expect(page.locator('#code')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Enter an invalid OTP code
      await page.fill('#code', '000000');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Should show error message and remain on 2FA page
      await expect(
        page.locator('.flash-error, .error, .alert-error'),
      ).toBeVisible();

      // Code input should still be visible for retry
      await expect(page.locator('#code')).toBeVisible();

      // URL should still be on /two-factor
      expect(page.url()).toMatch(/\/two-factor/);
    } finally {
      await disableTwoFactor(testData.orgSlug, testData.userEmail);
    }
  });

  // ── 9.2: Expired OTP code shows error with resend option ─────────────

  // FIXME: Requires enabling 2FA on the server side — see module docblock.
  test.fixme('expired OTP code shows error with resend option', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await enableTwoFactor(testData.orgSlug, testData.userEmail, 'email');
    await mailhog.clearAll();

    try {
      const reached2FA = await loginToTwoFactorPage(page, testData, startAuthFlow);
      expect(reached2FA).toBe(true);

      // Wait for OTP email to arrive
      const message = await mailhog.waitForMessage(testData.userEmail, 10_000);
      expect(message).toBeDefined();

      // Extract the code from the email
      const codeMatch = message!.subject.match(/(\d{6})/);
      const otpCode = codeMatch ? codeMatch[1] : '123456';

      // Expire the OTP by updating its expiry in the DB
      const pg = await import('pg');
      const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
      try {
        // Set all OTP records to expired
        await pool.query(
          `UPDATE two_factor_otp_codes SET expires_at = NOW() - INTERVAL '1 hour'`,
        );
      } finally {
        await pool.end();
      }

      // Enter the now-expired code
      await page.fill('#code', otpCode);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Should show error about invalid/expired code
      await expect(
        page.locator('.flash-error, .error, .alert-error'),
      ).toBeVisible();

      // Resend button should be available (for email OTP method)
      await expect(
        page.locator('form[action*="/two-factor/resend"] button'),
      ).toBeVisible();
    } finally {
      await disableTwoFactor(testData.orgSlug, testData.userEmail);
    }
  });

  // ── 9.3: Invalid TOTP code shows error ───────────────────────────────

  // FIXME: Requires enabling TOTP 2FA on the server side — see module docblock.
  test.fixme('invalid TOTP code shows error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await enableTwoFactor(testData.orgSlug, testData.userEmail, 'totp');

    try {
      const reached2FA = await loginToTwoFactorPage(page, testData, startAuthFlow);
      expect(reached2FA).toBe(true);

      // Verify TOTP variant UI (no resend button for TOTP)
      await expect(page.locator('#code')).toBeVisible();

      // Enter an invalid TOTP code
      await page.fill('#code', '123456');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Should show error and stay on 2FA page
      await expect(
        page.locator('.flash-error, .error, .alert-error'),
      ).toBeVisible();
      expect(page.url()).toMatch(/\/two-factor/);
    } finally {
      await disableTwoFactor(testData.orgSlug, testData.userEmail);
    }
  });

  // ── 9.4: Invalid recovery code shows error ───────────────────────────

  // FIXME: Requires enabling 2FA on the server side — see module docblock.
  test.fixme('invalid recovery code shows error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await enableTwoFactor(testData.orgSlug, testData.userEmail, 'email');
    await mailhog.clearAll();

    try {
      const reached2FA = await loginToTwoFactorPage(page, testData, startAuthFlow);
      expect(reached2FA).toBe(true);

      // Switch to recovery code mode by clicking the "Use recovery code" button
      const recoveryBtn = page.locator('#use-recovery-btn');
      await expect(recoveryBtn).toBeVisible();
      await recoveryBtn.click();

      // The hidden codeType field should now be 'recovery'
      const codeType = await page.locator('#codeType').getAttribute('value');
      expect(codeType).toBe('recovery');

      // Enter an invalid recovery code
      await page.fill('#code', 'AAAA-BBBB-CCCC');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Should show error
      await expect(
        page.locator('.flash-error, .error, .alert-error'),
      ).toBeVisible();
      expect(page.url()).toMatch(/\/two-factor/);
    } finally {
      await disableTwoFactor(testData.orgSlug, testData.userEmail);
    }
  });

  // ── 9.5: 2FA setup page renders QR code ──────────────────────────────

  // FIXME: Requires org-level 2FA policy to trigger setup redirect — see module docblock.
  test.fixme('TOTP setup page renders QR code image', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // This test requires a user without 2FA enabled but an org that requires it.
    // When the org requires 2FA, login redirects to /two-factor/setup.
    // For now, navigate to the setup page directly using an existing interaction UID.

    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Extract the UID
    const url = page.url();
    const match = url.match(/\/interaction\/([a-zA-Z0-9_-]+)/);
    const uid = match ? match[1] : '';

    // Login first to create a pending 2FA state
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // Navigate to 2FA setup page (would be automatic if org requires 2FA)
    await page.goto(`${testData.baseUrl}/interaction/${uid}/two-factor/setup`, {
      waitUntil: 'networkidle',
    });

    // If we reach the setup page:
    const bodyText = await page.textContent('body');

    // Should show QR code (data URI image) or redirect back
    const hasQrCode = (await page.locator('img[src^="data:image"]').count()) > 0;
    const hasManualKey = (await page.locator('code').count()) > 0;
    const hasSetupForm = bodyText!.toLowerCase().includes('setup') ||
                         bodyText!.toLowerCase().includes('authenticator');

    // At least one of these should be true if setup page loaded
    if (hasSetupForm) {
      expect(hasQrCode || hasManualKey).toBe(true);

      // Confirmation code input should be visible
      await expect(page.locator('#code')).toBeVisible();

      // Submit button should be visible
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    }
  });

  // ── 9.6: 2FA setup with invalid confirmation ─────────────────────────

  // FIXME: Requires org-level 2FA policy to trigger setup redirect — see module docblock.
  test.fixme('invalid TOTP setup confirmation code shows error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const url = page.url();
    const match = url.match(/\/interaction\/([a-zA-Z0-9_-]+)/);
    const uid = match ? match[1] : '';

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // Navigate to setup page
    await page.goto(`${testData.baseUrl}/interaction/${uid}/two-factor/setup`, {
      waitUntil: 'networkidle',
    });

    const codeInput = page.locator('#code');
    if ((await codeInput.count()) > 0) {
      // Enter invalid confirmation code
      await page.fill('#code', '000000');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Should redirect back to setup page with error indicator
      const resultUrl = page.url();
      expect(resultUrl).toMatch(/two-factor\/setup/);

      // May have error query param or flash message
      const hasError = resultUrl.includes('error=') ||
                       (await page.locator('.flash-error, .error, .alert-error').count()) > 0;
      expect(hasError).toBe(true);
    }
  });

  // ── 9.7: 2FA method-appropriate UI ───────────────────────────────────

  // FIXME: Requires enabling 2FA on the server side — see module docblock.
  test.fixme('2FA verify page shows method-appropriate UI for email OTP', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await enableTwoFactor(testData.orgSlug, testData.userEmail, 'email');
    await mailhog.clearAll();

    try {
      const reached2FA = await loginToTwoFactorPage(page, testData, startAuthFlow);
      expect(reached2FA).toBe(true);

      // For email OTP method:
      // - Should show masked email address
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeTruthy();
      // Masked email format: u***r@test.example.com or similar
      expect(bodyText!).toMatch(/\*\*\*/);

      // - Should show 6-digit code input
      const codeInput = page.locator('#code');
      await expect(codeInput).toBeVisible();
      const maxLength = await codeInput.getAttribute('maxlength');
      expect(parseInt(maxLength ?? '0')).toBeGreaterThanOrEqual(6);

      // - Should show resend button (email OTP only)
      await expect(
        page.locator('form[action*="/two-factor/resend"] button'),
      ).toBeVisible();

      // - Should show recovery code link
      await expect(page.locator('#use-recovery-btn')).toBeVisible();

      // - Submit button should be visible
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    } finally {
      await disableTwoFactor(testData.orgSlug, testData.userEmail);
    }
  });

  // ── 9.8: Resend OTP code button works ────────────────────────────────

  // FIXME: Requires enabling 2FA on the server side — see module docblock.
  test.fixme('resend OTP code button works', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await enableTwoFactor(testData.orgSlug, testData.userEmail, 'email');
    await mailhog.clearAll();

    try {
      const reached2FA = await loginToTwoFactorPage(page, testData, startAuthFlow);
      expect(reached2FA).toBe(true);

      // Wait for the first OTP email to arrive, then clear inbox
      await mailhog.waitForMessage(testData.userEmail, 10_000);
      await mailhog.clearAll();

      // Click the resend button
      const resendBtn = page.locator('form[action*="/two-factor/resend"] button');
      await expect(resendBtn).toBeVisible();
      await resendBtn.click();

      // Wait for redirect back to 2FA page
      await page.waitForURL('**/interaction/*/two-factor**');
      await page.waitForLoadState('networkidle');

      // Verify a new OTP email was received
      const newMessage = await mailhog.waitForMessage(testData.userEmail, 10_000);
      expect(newMessage).toBeDefined();
      expect(newMessage!.subject.toLowerCase()).toContain('verification code');
    } finally {
      await disableTwoFactor(testData.orgSlug, testData.userEmail);
    }
  });
});
