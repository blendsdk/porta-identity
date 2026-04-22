/**
 * Two-Factor Edge Cases — Playwright browser tests.
 *
 * Tests 2FA challenge and setup edge cases: invalid codes, expired codes,
 * recovery codes, TOTP setup QR rendering, method-appropriate UI, and
 * OTP resend functionality. Covers Category 9 from the UI Testing Phase 2 plan.
 *
 * Uses dedicated 2FA users seeded during global-setup:
 *   - twoFactorEmailUser: email OTP 2FA enabled
 *   - twoFactorTotpUser: TOTP 2FA enabled + recovery codes
 *   - twoFaSetupTenant: org requires TOTP, user not enrolled (triggers setup)
 *
 * @see plans/2fa-ui-tests/04-test-fixes.md — Test implementation spec
 */

import crypto from 'node:crypto';
import { test, expect } from '../fixtures/test-fixtures.js';
import { extractOtpCode } from '../fixtures/otp-helper.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Login with a 2FA user and advance to the 2FA verification page.
 *
 * Starts an OIDC auth flow, fills the login form, and expects to be
 * redirected to the 2FA challenge page (/interaction/:uid/two-factor).
 */
async function loginToTwoFactorPage(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  startAuthFlow: (page: import('@playwright/test').Page) => Promise<string>,
): Promise<void> {
  await startAuthFlow(page);
  await page.waitForURL('**/interaction/**');

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/interaction/*/two-factor**', { timeout: 15_000 });
}

/**
 * Start an OIDC auth flow for the TOTP-setup tenant and login.
 *
 * Uses the setup tenant's org slug and client ID instead of the default
 * primary tenant. After login, the server should redirect to the TOTP
 * setup page because the org has `required_totp` policy.
 */
async function loginWithSetupTenant(
  page: import('@playwright/test').Page,
  testData: {
    baseUrl: string;
    twoFaSetupOrgSlug: string;
    twoFaSetupClientId: string;
    twoFaSetupUserEmail: string;
    twoFaSetupUserPassword: string;
    redirectUri: string;
  },
): Promise<void> {
  // Build OIDC auth URL for the setup tenant
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const authUrl = new URL(`${testData.baseUrl}/${testData.twoFaSetupOrgSlug}/auth`);
  authUrl.searchParams.set('client_id', testData.twoFaSetupClientId);
  authUrl.searchParams.set('redirect_uri', testData.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));

  await page.goto(authUrl.toString(), { waitUntil: 'networkidle' });
  await page.waitForURL('**/interaction/**');

  // Fill login form with setup tenant user
  await page.fill('#email', testData.twoFaSetupUserEmail);
  await page.fill('#password', testData.twoFaSetupUserPassword);
  await page.click('button[type="submit"]');
}

// ---------------------------------------------------------------------------
// Category 9: Two-Factor Edge Cases (8 tests)
// ---------------------------------------------------------------------------

test.describe('Two-Factor Edge Cases', () => {
  // Run serially — these tests share a single MailHog inbox and the same
  // 2FA users, so parallel execution causes deleteAll() races and OTP
  // rate-limit exhaustion (MAX_ACTIVE_OTP_CODES = 5).
  test.describe.configure({ mode: 'serial' });

  // ── 9.1: Invalid OTP code shows error and allows retry ───────────────

  test('invalid OTP code shows error and allows retry', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await loginToTwoFactorPage(
      page, testData.twoFactorEmailUser, testData.userPassword, startAuthFlow,
    );

    // Verify 2FA page rendered with code input
    await expect(page.locator('#code')).toBeVisible();
    await expect(page.locator('button.btn-primary')).toBeVisible();

    // Enter an invalid OTP code
    await page.fill('#code', '000000');
    await page.click('button.btn-primary');
    await page.waitForLoadState('networkidle');

    // Should show error message and remain on 2FA page
    await expect(
      page.locator('.flash-error, .error, .alert-error'),
    ).toBeVisible();

    // Code input should still be visible for retry
    await expect(page.locator('#code')).toBeVisible();

    // URL should still be on /two-factor
    expect(page.url()).toMatch(/\/two-factor/);
  });

  // ── 9.2: Expired OTP code shows error with resend option ─────────────

  test('expired OTP code shows error with resend option', async ({
    page,
    testData,
    startAuthFlow,
    mailCapture,
    dbHelpers,
  }) => {
    await loginToTwoFactorPage(
      page, testData.twoFactorEmailUser, testData.userPassword, startAuthFlow,
    );

    // Wait for OTP email to arrive
    const message = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });

    // Extract the code from the email
    const otpCode = extractOtpCode(message) ?? '123456';

    // Expire all OTP codes for this user via direct SQL
    await dbHelpers.expireAllOtpCodes();

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
  });

  // ── 9.3: Invalid TOTP code shows error ───────────────────────────────

  test('invalid TOTP code shows error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await loginToTwoFactorPage(
      page, testData.twoFactorTotpUser, testData.userPassword, startAuthFlow,
    );

    // Verify TOTP verify page rendered
    await expect(page.locator('#code')).toBeVisible();

    // Enter an invalid TOTP code
    await page.fill('#code', '000000');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should show error and stay on 2FA page
    await expect(
      page.locator('.flash-error, .error, .alert-error'),
    ).toBeVisible();
    expect(page.url()).toMatch(/\/two-factor/);
  });

  // ── 9.4: Invalid recovery code shows error ───────────────────────────

  test('invalid recovery code shows error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await loginToTwoFactorPage(
      page, testData.twoFactorTotpUser, testData.userPassword, startAuthFlow,
    );

    // Switch to recovery code mode by clicking the "Use recovery code" button
    const recoveryBtn = page.locator('#use-recovery-btn');
    await expect(recoveryBtn).toBeVisible();
    await recoveryBtn.click();

    // The hidden codeType field should now be 'recovery'
    const codeType = await page.locator('#codeType').getAttribute('value');
    expect(codeType).toBe('recovery');

    // Enter an invalid recovery code
    await page.fill('#code', 'AAAA-BBBB');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should show error
    await expect(
      page.locator('.flash-error, .error, .alert-error'),
    ).toBeVisible();
    expect(page.url()).toMatch(/\/two-factor/);
  });

  // ── 9.5: 2FA setup page renders QR code ──────────────────────────────

  test('TOTP setup page renders QR code image', async ({
    page,
    testData,
  }) => {
    // Login with the setup tenant (org requires TOTP, user not enrolled)
    await loginWithSetupTenant(page, testData);

    // Should redirect to the TOTP setup page
    await page.waitForURL('**/interaction/*/two-factor/setup**', { timeout: 15_000 });

    // Should show QR code (data URI image)
    const qrImage = page.locator('img[src^="data:image"]');
    await expect(qrImage).toBeVisible();

    // Should show manual entry code
    const manualCode = page.locator('code');
    await expect(manualCode).toBeVisible();

    // Confirmation code input should be visible
    await expect(page.locator('#code')).toBeVisible();

    // Submit button should be visible
    await expect(page.locator('button.btn-primary')).toBeVisible();
  });

  // ── 9.6: 2FA setup with invalid confirmation ─────────────────────────

  test('invalid TOTP setup confirmation code shows error', async ({
    page,
    testData,
  }) => {
    // Login with the setup tenant
    await loginWithSetupTenant(page, testData);

    // Should redirect to the TOTP setup page
    await page.waitForURL('**/interaction/*/two-factor/setup**', { timeout: 15_000 });

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
  });

  // ── 9.7: 2FA method-appropriate UI ───────────────────────────────────

  test('2FA verify page shows method-appropriate UI for email OTP', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    await loginToTwoFactorPage(
      page, testData.twoFactorEmailUser, testData.userPassword, startAuthFlow,
    );

    // For email OTP method:
    // - Should show masked email address
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    // Masked email format: u***r@test.local or similar
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
    await expect(page.locator('button.btn-primary')).toBeVisible();
  });

  // ── 9.8: Resend OTP code button works ────────────────────────────────

  test('resend OTP code button works', async ({
    page,
    testData,
    startAuthFlow,
    mailCapture,
  }) => {
    await loginToTwoFactorPage(
      page, testData.twoFactorEmailUser, testData.userPassword, startAuthFlow,
    );

    // Wait for the first OTP email to arrive, then clear inbox
    await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });
    await mailCapture.deleteAll();

    // Click the resend button
    const resendBtn = page.locator('form[action*="/two-factor/resend"] button');
    await expect(resendBtn).toBeVisible();
    await resendBtn.click();

    // Wait for redirect back to 2FA page
    await page.waitForURL('**/interaction/*/two-factor**');
    await page.waitForLoadState('networkidle');

    // Verify a new OTP email was received
    const newMessage = await mailCapture.waitForEmail(testData.twoFactorEmailUser, {
      subject: 'verification',
      timeout: 10_000,
    });
    expect(newMessage).toBeDefined();
    expect(newMessage.subject.toLowerCase()).toContain('verification code');
  });
});
