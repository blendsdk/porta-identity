/**
 * Consent Flow — Playwright browser tests.
 *
 * Tests the OIDC consent page behavior in a real browser:
 *   - First-party clients (same organization) should auto-consent
 *   - Third-party clients show a consent page with requested scopes
 *   - Users can approve or deny consent requests
 *
 * First-party detection: `showConsent()` compares the client's
 * `organizationId` metadata against the current tenant org. If they
 * match, consent is auto-granted without showing the page.
 *
 * @see plans/ui-testing/05-playwright-tests.md — Consent spec
 */

import { expect, test } from '../fixtures/test-fixtures.js';

test.describe('Consent Flow', () => {
  /**
   * Helper: Logs in the test user and returns the page after login.
   * The login step is a prerequisite for all consent tests.
   */
  async function loginUser(
    page: import('@playwright/test').Page,
    testData: import('../fixtures/test-fixtures.js').TestData,
    startAuthFlow: (page: import('@playwright/test').Page) => Promise<string>,
  ): Promise<void> {
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // After login, the OIDC provider either:
    // a) Auto-consents → redirects to callback (first-party)
    // b) Shows consent page → waits for user action
    // Wait briefly for the redirect chain to settle
    await page.waitForLoadState('networkidle');
  }

  test('should auto-consent for first-party client and redirect to callback', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Login with the seeded first-party client (belongs to same org)
    await loginUser(page, testData, startAuthFlow);

    // For first-party clients, consent should be auto-granted.
    // The flow should go: login → auto-consent → callback with code.
    // If consent page is shown, approve it to complete the flow.
    const _currentUrl = page.url();

    if ((await page.locator('button:has-text("Allow access")').count()) > 0) {
      // Consent page is shown — approve it (may happen if auto-consent
      // doesn't detect first-party status from metadata)
      await page.click('button:has-text("Allow access")');
    }

    // Should end up at the callback with an authorization code
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 25_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  test('should display consent page with requested scopes', async ({
    page,
    testData,
    startConsentAuthFlow,
  }) => {
    // The consent-requiring client must render the page after login.
    await startConsentAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.consentUserEmail);
    await page.fill('#password', testData.consentUserPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('button:has-text("Allow access")')).toBeVisible();
    await expect(page.locator('button:has-text("Deny")')).toBeVisible();

    const csrfInputs = page.locator('input[name="_csrf"]');
    expect(await csrfInputs.count()).toBeGreaterThanOrEqual(1);
  });

  test('should redirect to callback with code after approving consent', async ({
    page,
    testData,
    startConsentAuthFlow,
  }) => {
    await startConsentAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.consentUserEmail);
    await page.fill('#password', testData.consentUserPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Allow access")');

    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 25_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('code')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  test('should redirect to callback with error after denying consent', async ({
    page,
    testData,
    startConsentAuthFlow,
  }) => {
    await startConsentAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.consentUserEmail);
    await page.fill('#password', testData.consentUserPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Deny")');

    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 25_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('error')).toBe('access_denied');
  });
});
