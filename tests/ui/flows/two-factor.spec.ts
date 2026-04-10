/**
 * Two-Factor Authentication Flow — Playwright browser tests.
 *
 * Tests the email-based OTP two-factor authentication flow:
 *   1. User logs in with password → redirected to 2FA verification page
 *   2. OTP code is sent via email (captured by MailHog)
 *   3. User enters the code → completes authentication → callback
 *
 * Enables email 2FA for the test user in beforeAll, disables in afterAll
 * to avoid affecting other test files. Uses MailHog to intercept OTP emails
 * and extract the verification code from the email subject.
 *
 * @see plans/ui-testing/05-playwright-tests.md — Two-Factor spec
 */

import { test, expect } from '../fixtures/test-fixtures.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { TEST_MAILHOG_URL } from '../../helpers/constants.js';

/** MailHog client for intercepting OTP emails */
const mailhog = new MailHogClient(TEST_MAILHOG_URL);

/**
 * Extract the OTP code from a MailHog message.
 * The email subject format is: "Your verification code: 123456"
 */
function extractOtpCode(message: { subject: string; body: string }): string | null {
  // Try subject first — format: "Your verification code: XXXXXX"
  const subjectMatch = message.subject.match(/verification code:\s*(\d+)/i);
  if (subjectMatch) return subjectMatch[1];

  // Fallback: try the body for a standalone 6-digit code
  const bodyMatch = message.body.match(/\b(\d{6})\b/);
  if (bodyMatch) return bodyMatch[1];

  return null;
}

test.describe('Two-Factor Authentication Flow', () => {
  // Enable email 2FA for the test user before these tests run.
  // Playwright workers run in separate processes from global-setup, so the
  // shared app DB pool isn't available. We use a standalone pg.Pool instead.
  test.beforeAll(async () => {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const orgSlug = process.env.TEST_ORG_SLUG!;
      const userEmail = process.env.TEST_USER_EMAIL!;

      // Look up org → user via raw SQL
      const orgResult = await pool.query(
        'SELECT id FROM organizations WHERE slug = $1', [orgSlug]
      );
      if (orgResult.rows.length === 0) throw new Error(`Test org ${orgSlug} not found`);
      const orgId = orgResult.rows[0].id;

      const userResult = await pool.query(
        'SELECT id, two_factor_enabled FROM users WHERE organization_id = $1 AND email = $2',
        [orgId, userEmail]
      );
      if (userResult.rows.length === 0) throw new Error(`Test user ${userEmail} not found`);
      const userId = userResult.rows[0].id;

      if (!userResult.rows[0].two_factor_enabled) {
        // Enable email-based 2FA directly via SQL
        await pool.query(
          `UPDATE users SET two_factor_enabled = true, two_factor_method = 'email'
           WHERE id = $1`,
          [userId]
        );
      }

      // Invalidate Redis cache so the server reads fresh DB data
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
  });

  // Disable 2FA after all tests in this file to avoid side effects
  test.afterAll(async () => {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const orgSlug = process.env.TEST_ORG_SLUG!;
      const userEmail = process.env.TEST_USER_EMAIL!;

      const orgResult = await pool.query(
        'SELECT id FROM organizations WHERE slug = $1', [orgSlug]
      );
      if (orgResult.rows.length === 0) return;
      const orgId = orgResult.rows[0].id;

      await pool.query(
        `UPDATE users SET two_factor_enabled = false, two_factor_method = NULL
         WHERE organization_id = $1 AND email = $2`,
        [orgId, userEmail]
      );
    } finally {
      await pool.end();
    }
  });

  // Clear MailHog inbox before each test to isolate OTP emails
  test.beforeEach(async () => {
    await mailhog.clearAll();
  });

  // FIXME: 2FA tests require modifying user state from the Playwright worker process
  // (separate from the server process). The SQL UPDATE + Redis cache invalidation
  // runs in the worker, but the server's user service reads from its own connection
  // pool. The server doesn't reliably detect 2FA as enabled. These tests need a
  // dedicated test API endpoint or fixture hook to enable 2FA on the server side.
  test.fixme('should render 2FA verification page after login', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Start OIDC auth flow and login with password
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // 2. Should be redirected to the two-factor verification page
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 3. Verify the 2FA page renders with required elements
    //    - Code input field
    await expect(page.locator('#code')).toBeVisible();
    //    - Verify/submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    //    - Resend link/button (for email OTP method)
    await expect(
      page.locator('form[action*="/two-factor/resend"] button, a[href*="resend"]')
    ).toBeVisible();
  });

  test.fixme('should authenticate with valid OTP code', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 2. Retrieve the OTP code from MailHog
    //    The processLogin handler auto-sends the first OTP email
    const message = await mailhog.waitForMessage(testData.userEmail, 10_000);
    expect(message).toBeDefined();

    const otpCode = extractOtpCode(message!);
    expect(otpCode).toBeTruthy();

    // 3. Enter the OTP code and submit
    await page.fill('#code', otpCode!);
    await page.click('button[type="submit"]');

    // 4. Should complete auth flow → consent (auto or explicit) → callback
    //    Handle potential consent page
    await page.waitForLoadState('networkidle');

    if ((await page.locator('button:has-text("Allow access")').count()) > 0) {
      await page.click('button:has-text("Allow access")');
    }

    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  test.fixme('should show error for invalid OTP code', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 2. Enter an incorrect OTP code
    await page.fill('#code', '000000');
    await page.click('button[type="submit"]');

    // 3. Should stay on the 2FA page with an error message
    await page.waitForURL('**/interaction/*/two-factor*');
    await expect(
      page.locator('.flash-error, .error, .alert-error')
    ).toBeVisible();

    // Code input should still be visible for retry
    await expect(page.locator('#code')).toBeVisible();
  });

  test.fixme('should receive new OTP email after clicking resend', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 2. Wait for the first OTP email to arrive, then clear inbox
    await mailhog.waitForMessage(testData.userEmail, 10_000);
    await mailhog.clearAll();

    // 3. Click the resend button — triggers a new OTP to be sent
    await page.click('form[action*="/two-factor/resend"] button');

    // 4. Wait for the resend to process (redirect back to 2FA page)
    await page.waitForURL('**/interaction/*/two-factor*');

    // 5. Verify a new OTP email was received in MailHog
    const newMessage = await mailhog.waitForMessage(testData.userEmail, 10_000);
    expect(newMessage).toBeDefined();
    expect(newMessage!.subject.toLowerCase()).toContain('verification code');
  });
});
