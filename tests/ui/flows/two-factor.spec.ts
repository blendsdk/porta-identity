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

import { test, expect } from '../fixtures/test-fixtures.js';
import { extractOtpCode } from '../fixtures/otp-helper.js';

test.describe('Two-Factor Authentication Flow', () => {
  // Run serially — these tests share a single MailHog inbox and a single
  // 2FA user, so parallel execution causes deleteAll() races and OTP
  // rate-limit exhaustion (MAX_ACTIVE_OTP_CODES = 5).
  test.describe.configure({ mode: 'serial' });

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
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

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
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 2. Retrieve the OTP code from MailHog
    //    The processLogin handler auto-sends the first OTP email
    const message = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });

    const otpCode = extractOtpCode(message);
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

  test('should show error for invalid OTP code', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Login and arrive at 2FA page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.twoFactorEmailUser);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 2. Enter an incorrect OTP code
    await page.fill('#code', '000000');
    await page.click('button[type="submit"]');

    // 3. Should stay on the 2FA page with an error message
    await page.waitForURL('**/interaction/*/two-factor*');
    await expect(
      page.locator('.flash-error, .error, .alert-error'),
    ).toBeVisible();

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
    await page.waitForURL('**/interaction/*/two-factor', { timeout: 15_000 });

    // 2. Wait for the first OTP email to arrive, then clear inbox
    await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });
    await mailCapture.deleteAll();

    // 3. Click the resend button — triggers a new OTP to be sent
    await page.click('form[action*="/two-factor/resend"] button');

    // 4. Wait for the resend to process (redirect back to 2FA page)
    await page.waitForURL('**/interaction/*/two-factor*');

    // 5. Verify a new OTP email was received in MailHog
    const newMessage = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });
    expect(newMessage).toBeDefined();
    expect(newMessage.subject.toLowerCase()).toContain('verification code');
  });
});
