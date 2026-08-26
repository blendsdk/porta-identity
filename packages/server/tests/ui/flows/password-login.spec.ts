/**
 * Password Login Flow — Playwright browser tests.
 *
 * Drives a real Chromium browser through Porta's password-based login UI,
 * verifying that forms render correctly, credentials are validated,
 * CSRF tokens are present, and successful login redirects to the callback
 * with an authorization code.
 *
 * Uses the shared `testData` fixture (seeded org → app → client → user)
 * and `startAuthFlow` helper to initiate an OIDC authorization request.
 *
 * Depends on the **primary test tenant** which inherits the default
 * organization login methods `['password', 'magic_link']`. If the primary
 * tenant is ever reconfigured to disable password auth, these tests will
 * fail deterministically at the `#password` / magic-link-button visibility
 * asserts — see `tests/ui/flows/login-methods.spec.ts` for the
 * per-client override coverage.
 *
 * @see plans/ui-testing/05-playwright-tests.md — Password Login spec
 * @see tests/ui/flows/login-methods.spec.ts — Configurable login methods
 */

import { expect, test } from '../fixtures/test-fixtures.js';

test.describe('Password Login Flow', () => {
  test('should login successfully and receive authorization code', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Start OIDC authorization flow — redirects to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // 2. Fill in credentials
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);

    // 3. Submit login form
    await page.click('button.btn-primary');

    // 4. Handle consent page if displayed (OIDC provider may require explicit consent)
    await page.waitForLoadState('networkidle');

    const allowBtn = page.locator('button:has-text("Allow access")');
    if ((await allowBtn.count()) > 0) {
      await allowBtn.click();
    }

    // 5. Should redirect to callback with ?code=...&state=...
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 25_000 });

    // Verify authorization code in callback URL
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  test('should render login page with all required fields', async ({ page, startAuthFlow }) => {
    // Navigate to login page via OIDC auth request
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Verify email field exists and is visible
    await expect(page.locator('#email')).toBeVisible();
    // Verify password field exists and is visible
    await expect(page.locator('#password')).toBeVisible();
    // Verify submit button exists (login form has btn-primary)
    await expect(page.locator('button.btn-primary')).toBeVisible();
    // Verify magic link button exists — confirms the primary tenant
    // inherits BOTH login methods (password + magic_link). If this asserts
    // fails, check whether the primary tenant's login_methods were
    // accidentally narrowed in global-setup.
    await expect(page.locator('#magic-link-btn')).toBeVisible();
    // Sanity check: the divider between the two forms is rendered only
    // when both methods are active on the effective login methods set.
    await expect(page.locator('.divider')).toBeVisible();
  });

  test('should have CSRF token in hidden form field', async ({ page, startAuthFlow }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Check that the hidden _csrf input exists with a non-empty value
    const csrfInput = page.locator('input[name="_csrf"]').first();
    await expect(csrfInput).toBeAttached();
    const csrfValue = await csrfInput.getAttribute('value');
    expect(csrfValue).toBeTruthy();
    expect(csrfValue!.length).toBeGreaterThan(10);
  });

  test('should show error for invalid credentials', async ({ page, testData, startAuthFlow }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Submit with correct email but wrong password
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', 'wrong-password-123');
    await page.click('button[type="submit"]');

    // Should stay on login page (still an interaction URL)
    await page.waitForURL('**/interaction/**');

    // Should show an error message
    await expect(page.locator('.flash-error, .error, .alert-error')).toBeVisible();

    // Email should be pre-filled for convenience
    await expect(page.locator('#email')).toHaveValue(testData.userEmail);
  });

  test('should prevent empty form submission via browser validation', async ({
    page,
    startAuthFlow,
  }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Both email and password have `required` attribute — browser prevents submission.
    // Attempting to submit triggers HTML5 validation, NOT a server POST.
    const emailRequired = await page.locator('#email').getAttribute('required');
    const passwordRequired = await page.locator('#password').getAttribute('required');

    // The `required` attribute is present (value is '' or 'required')
    expect(emailRequired).not.toBeNull();
    expect(passwordRequired).not.toBeNull();

    // Verify that clicking submit without filling fields doesn't navigate away.
    // We capture the URL before and after clicking.
    const urlBefore = page.url();
    await page.click('button[type="submit"]');

    // Give a moment for any potential navigation
    await page.waitForTimeout(500);

    // URL should not have changed — browser validation blocked submission
    expect(page.url()).toBe(urlBefore);
  });

  test('should have correct form action attributes', async ({ page, startAuthFlow }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Extract the interaction UID from the current URL
    const interactionUid = page.url().match(/interaction\/([^/]+)/)?.[1];
    expect(interactionUid).toBeTruthy();

    // Login form action should point to /interaction/{uid}/login
    const loginFormAction = await page.locator('form[action*="/login"]').getAttribute('action');
    expect(loginFormAction).toBe(`/interaction/${interactionUid}/login`);

    // Magic link form action should point to /interaction/{uid}/magic-link
    const magicLinkFormAction = await page
      .locator('form[action*="/magic-link"]')
      .getAttribute('action');
    expect(magicLinkFormAction).toBe(`/interaction/${interactionUid}/magic-link`);
  });
});
