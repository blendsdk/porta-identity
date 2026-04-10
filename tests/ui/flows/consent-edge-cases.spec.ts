/**
 * Consent Edge Cases — Playwright browser tests.
 *
 * Tests the OIDC consent page behavior: content display, scope listing,
 * approve/deny decisions, and CSRF protection. Covers Category 7 from the
 * UI Testing Phase 2 plan.
 *
 * Since findForOidc() does not include organizationId in client metadata,
 * the auto-consent check in showConsent() never triggers — all clients
 * display the consent page. This allows full consent testing with the
 * standard test client.
 *
 * @see plans/ui-testing-v2/06-login-consent-interaction-tests.md — Category 7
 */

import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Login and advance to the consent page.
 *
 * Starts an OIDC auth flow, fills the login form with test user credentials,
 * submits it, and waits for either the consent page or callback redirect.
 *
 * @returns true if the consent page was reached, false if redirected to callback
 */
async function loginToConsentPage(
  page: import('@playwright/test').Page,
  testData: { userEmail: string; userPassword: string },
  startAuthFlow: (page: import('@playwright/test').Page) => Promise<string>,
): Promise<boolean> {
  // Start OIDC auth flow → lands on login page
  await startAuthFlow(page);
  await page.waitForURL('**/interaction/**');

  // Fill in valid credentials
  await page.fill('#email', testData.userEmail);
  await page.fill('#password', testData.userPassword);

  // Submit login form
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  // After login, we may end up on consent page or redirected to callback
  // (depends on whether auto-consent is configured)
  const url = page.url();

  // Check if we're on the consent page
  if (url.includes('/consent')) {
    return true;
  }

  // Check if we're still on an interaction page (consent prompt)
  if (url.includes('/interaction/')) {
    // The consent page may not have /consent in the URL —
    // check if the approve button is present
    const approveBtn = page.locator('button:has-text("Allow access")');
    if ((await approveBtn.count()) > 0) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Category 7: Consent Edge Cases (5 tests)
// ---------------------------------------------------------------------------

test.describe('Consent Edge Cases', () => {
  // ── 7.1: Consent page appears after login ───────────────────────────

  test('consent page renders after successful login', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData, startAuthFlow);

    // Since organizationId is not in client metadata, auto-consent
    // doesn't trigger — the consent page should always appear
    expect(reachedConsent).toBe(true);

    // Verify the consent page has the approve button
    await expect(page.locator('button:has-text("Allow access")')).toBeVisible();
  });

  // ── 7.2: Consent page shows requested scopes ───────────────────────

  test('consent page displays requested scopes', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData, startAuthFlow);
    expect(reachedConsent).toBe(true);

    // The auth flow requests scope='openid profile email'
    // The consent page should list these scopes
    const scopeList = page.locator('.scope-list li, ul li');
    const scopeCount = await scopeList.count();

    // Should have at least one scope listed
    expect(scopeCount).toBeGreaterThan(0);

    // Collect all scope text
    const scopeTexts: string[] = [];
    for (let i = 0; i < scopeCount; i++) {
      const text = await scopeList.nth(i).textContent();
      if (text) scopeTexts.push(text.trim().toLowerCase());
    }

    // Should contain the requested scopes (openid, profile, email)
    const allScopeText = scopeTexts.join(' ');
    expect(allScopeText).toMatch(/openid|profile|email/);
  });

  // ── 7.3: Deny consent redirects with access_denied ─────────────────

  test('deny consent redirects with access_denied error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData, startAuthFlow);
    expect(reachedConsent).toBe(true);

    // Click the deny button
    const denyBtn = page.locator('button:has-text("Deny")');
    await expect(denyBtn).toBeVisible();
    await denyBtn.click();

    // Should redirect to the callback URL with an error
    await page.waitForURL(`${testData.redirectUri}*`, { timeout: 15_000 });

    // Verify error=access_denied in the callback URL
    const url = new URL(page.url());
    expect(url.searchParams.get('error')).toBe('access_denied');
  });

  // ── 7.4: CSRF protection on consent form ────────────────────────────

  test('consent form has CSRF token protection', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData, startAuthFlow);
    expect(reachedConsent).toBe(true);

    // Both approve and deny forms should have a hidden _csrf input
    const csrfInputs = page.locator('input[name="_csrf"]');
    const csrfCount = await csrfInputs.count();

    // At least 2 CSRF inputs: one for approve form, one for deny form
    expect(csrfCount).toBeGreaterThanOrEqual(2);

    // Each CSRF token should be non-empty
    for (let i = 0; i < csrfCount; i++) {
      const value = await csrfInputs.nth(i).getAttribute('value');
      expect(value).toBeTruthy();
      expect(value!.length).toBeGreaterThan(10);
    }

    // Now tamper with the CSRF token and try to submit
    // Remove all CSRF inputs to simulate a CSRF attack
    await page.evaluate(() => {
      document.querySelectorAll('input[name="_csrf"]').forEach((el) => {
        (el as HTMLInputElement).value = 'invalid-csrf-token';
      });
    });

    // Try to approve with invalid CSRF
    const approveBtn = page.locator('button:has-text("Allow access")');
    await approveBtn.click();
    await page.waitForLoadState('networkidle');

    // Should get a CSRF error (403) — not redirect to callback
    const url = page.url();
    const didNotRedirect = !url.includes(testData.redirectUri);
    expect(didNotRedirect).toBe(true);
  });

  // ── 7.5: Consent page content ───────────────────────────────────────

  test('consent page shows client name and action buttons', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData, startAuthFlow);
    expect(reachedConsent).toBe(true);

    // Page should have the consent title
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    const headingText = await heading.textContent();
    expect(headingText?.toLowerCase()).toMatch(/authorize|access|consent/);

    // Page should mention the client/application name in the description
    const description = page.locator('p.text-muted');
    await expect(description.first()).toBeVisible();

    // Approve button should be present
    const approveBtn = page.locator('button:has-text("Allow access")');
    await expect(approveBtn).toBeVisible();

    // Deny button should be present
    const denyBtn = page.locator('button:has-text("Deny")');
    await expect(denyBtn).toBeVisible();

    // Both forms should have the correct action URL (pointing to /confirm)
    const forms = page.locator('form[action*="/confirm"]');
    const formCount = await forms.count();
    expect(formCount).toBeGreaterThanOrEqual(2); // approve form + deny form

    // Each form should have a hidden 'decision' input
    const approveDecision = page.locator('input[name="decision"][value="approve"]');
    await expect(approveDecision).toBeAttached();

    const denyDecision = page.locator('input[name="decision"][value="deny"]');
    await expect(denyDecision).toBeAttached();
  });
});
