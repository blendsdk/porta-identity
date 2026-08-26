/**
 * Two-Factor Authentication Flow — Playwright browser tests.
 *
 * Tests the email-based OTP two-factor authentication flow:
 *   1. User logs in with password → redirected to 2FA verification page
 *   2. OTP code is sent via email (captured by MailHog)
 *   3. User enters the code → completes authentication → callback
 *
 * Uses a dedicated 2FA email user seeded during global-setup with
 * `two_factor_enabled=true, two_factor_method='email'`. This avoids
 * the cross-process synchronization issue where Playwright workers
 * couldn't reliably enable 2FA for users the server process reads.
 *
 * @see plans/2fa-ui-tests/04-test-fixes.md — Test implementation spec
 */

import { extractOtpCode } from '../fixtures/otp-helper.js';
import { expect, test } from '../fixtures/test-fixtures.js';

test.describe('Two-Factor Authentication Flow', () => {
  // Run serially — these tests share a single MailHog inbox and a single
  // 2FA user, so parallel execution causes deleteAll() races and OTP
  // rate-limit exhaustion (MAX_ACTIVE_OTP_CODES = 5).
  test.describe.configure({ mode: 'serial' });

  // Clean up OTP codes and MailHog inbox before each test to prevent
  // rate-limit exhaustion (MAX_ACTIVE_OTP_CODES = 5) across serial
  // runs and Playwright retries. Without this, retries accumulate
  // OTP codes and the server throws "Too many active OTP codes",
  // causing email-waiting tests to time out on CI.
  //
  // IMPORTANT: Use user-scoped expireOtpCodesForUser() instead of the
  // global expireAllOtpCodes() to avoid cross-worker interference.
  // two-factor-edge-cases.spec.ts runs on a different Playwright worker
  // and also expires OTP codes — a global expire would invalidate codes
  // being actively used by this worker.
  test.beforeEach(async ({ dbHelpers, mailCapture, testData }) => {
    await dbHelpers.expireOtpCodesForUser(testData.twoFactorEmailUser);
    await mailCapture.deleteAll();
  });

  test('should render 2FA verification page after login', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Start OIDC auth flow and login with password
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // 2. Should be redirected to the two-factor verification page
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 25_000 });

    // 3. Verify the 2FA page renders with required elements
    //    - Code input field
    await expect(page.locator('#code')).toBeVisible();
    //    - Verify/submit button (inside #verify-form, not the resend form)
    await expect(page.locator('#verify-form button[type="submit"]')).toBeVisible();
    //    - Resend link/button (for email OTP method)
    await expect(
      page.locator('form[action*="/two-factor/resend"] button, a[href*="resend"]'),
    ).toBeVisible();
  });

  test('should authenticate with valid OTP code', async ({
    page,
    testData,
    startAuthFlow,
    mailCapture,
  }) => {
    // 1. Login and arrive at 2FA page (server sends OTP email asynchronously)
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 25_000 });

    // 2. Retrieve the OTP code from the login email directly (no resend).
    //    This minimises the window for cross-worker interference: the
    //    two-factor-edge-cases.spec.ts "expired code" test runs on a
    //    separate Playwright worker and can expire this user's OTP codes
    //    at any moment via expireOtpCodesForUser(). By skipping the
    //    resend step we reduce the gap between code generation and
    //    submission to near-zero.
    const message = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 20_000,
    });

    const otpCode = extractOtpCode(message);
    expect(otpCode).toBeTruthy();

    // 3. Submit the OTP code immediately via the verify form
    await page.fill('#code', otpCode!);
    await page.click('#verify-form button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 4. Handle cross-worker race condition:
    //    If the concurrent edge-cases worker expired our code between
    //    email retrieval and form submission, we get "Invalid verification
    //    code". In that case, resend to generate a fresh code and retry.
    const stillOn2fa =
      page.url().includes('/two-factor') &&
      (await page.locator('.flash-error, .error, .alert-error').count()) > 0;

    if (stillOn2fa) {
      // Resend → fresh OTP code
      await page.click('form[action*="/two-factor/resend"] button');
      await page.waitForURL('**/interaction/*/two-factor*');

      const retryMsg = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
        subject: 'verification',
        timeout: 10_000,
      });
      const retryCode = extractOtpCode(retryMsg);
      expect(retryCode).toBeTruthy();

      await page.fill('#code', retryCode!);
      await page.click('#verify-form button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }

    // 5. Handle potential consent page
    if ((await page.locator('button:has-text("Allow access")').count()) > 0) {
      await page.click('button:has-text("Allow access")');
    }

    // 6. Should arrive at callback with auth code
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 25_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  // ── Moved from two-factor-edge-cases.spec.ts (test 9.2) ─────────────
  // This test calls expireOtpCodesForUser() which would invalidate OTP
  // codes in the "authenticate with valid OTP code" test above if both
  // tests ran on different Playwright workers. By keeping it in this
  // serial group, they execute sequentially and can't interfere.
  test('expired OTP code shows error with resend option', async ({
    page,
    testData,
    startAuthFlow,
    mailCapture,
    dbHelpers,
  }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 25_000 });

    // 2. Wait for OTP email to arrive
    const message = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });

    // 3. Extract the code from the email
    const otpCode = extractOtpCode(message) ?? '123456';

    // 4. Expire OTP codes for this user via direct SQL
    await dbHelpers.expireOtpCodesForUser(testData.twoFactorEmailUser);

    // 5. Enter the now-expired code
    await page.fill('#code', otpCode);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 6. Should show error about invalid/expired code
    await expect(page.locator('.flash-error, .error, .alert-error')).toBeVisible();

    // 7. Resend button should be available (for email OTP method)
    await expect(page.locator('form[action*="/two-factor/resend"] button')).toBeVisible();
  });

  test('should show error for invalid OTP code', async ({ page, testData, startAuthFlow }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 25_000 });

    // 2. Enter an incorrect OTP code
    await page.fill('#code', '000000');
    await page.click('button[type="submit"]');

    // 3. Should stay on the 2FA page with an error message
    await page.waitForURL('**/interaction/*/two-factor*');
    await expect(page.locator('.flash-error, .error, .alert-error')).toBeVisible();

    // Code input should still be visible for retry
    await expect(page.locator('#code')).toBeVisible();
  });

  test('should receive new OTP email after clicking resend', async ({
    page,
    testData,
    startAuthFlow,
    mailCapture,
  }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 25_000 });

    // 2. Wait for the first OTP email to arrive, then clear inbox
    await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 20_000,
    });
    await mailCapture.deleteAll();

    // 3. Click the resend button — triggers a new OTP to be sent
    await page.click('form[action*="/two-factor/resend"] button');

    // 4. Wait for the resend to process (redirect back to 2FA page)
    await page.waitForURL('**/interaction/*/two-factor*');

    // 5. Verify a new OTP email was received in MailHog
    const newMessage = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 20_000,
    });
    expect(newMessage).toBeDefined();
    expect(newMessage.subject.toLowerCase()).toContain('verification code');
  });
});
