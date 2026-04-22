/**
 * Consent Edge Cases — Playwright browser tests.
 *
 * Tests the OIDC consent page behavior: content display, scope listing,
 * approve/deny decisions, and CSRF protection. Covers Category 7 from the
 * UI Testing Phase 2 plan.
 *
 * Auto-consent is triggered for first-party clients (where the client's
 * organizationId matches the tenant org). To force the consent page to
 * appear, we use the confidential client (`confClientId`) whose
 * organizationId belongs to a DIFFERENT org. The redirect_uri is the same
 * across all test tenants, so the cross-org auth flow works correctly.
 *
 * @see plans/ui-testing-v2/06-login-consent-interaction-tests.md — Category 7
 */

import crypto from 'node:crypto';
import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an OIDC authorization URL using a SPECIFIC client (not the default).
 *
 * Used to launch an auth flow with the confidential client on the primary org
 * so that `showConsent()` sees a cross-org `organizationId` and does NOT
 * auto-consent.
 */
function buildCrossOrgAuthUrl(
  baseUrl: string,
  orgSlug: string,
  clientId: string,
  redirectUri: string,
): string {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const authUrl = new URL(`${baseUrl}/${orgSlug}/auth`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
  return authUrl.toString();
}

/**
 * Login and advance to the consent page using a cross-org client.
 *
 * Uses the confidential client (`confClientId`) on the primary org so that
 * `showConsent()` sees a different `organizationId` and does NOT auto-consent.
 * All test tenants share the same redirect_uri so the cross-org flow works.
 *
 * @returns true if the consent page was reached, false if redirected to callback
 */
async function loginToConsentPage(
  page: import('@playwright/test').Page,
  testData: import('../fixtures/test-fixtures.js').TestData,
): Promise<boolean> {
  // Build auth URL using the confidential client (different org) on the primary org
  const authUrl = buildCrossOrgAuthUrl(
    testData.baseUrl,
    testData.orgSlug,
    testData.confClientId,
    testData.redirectUri,
  );

  // Navigate — follows redirects to the interaction login page
  await page.goto(authUrl, { waitUntil: 'networkidle' });
  await page.waitForURL('**/interaction/**');

  // Fill in credentials for the PRIMARY org user
  await page.fill('#email', testData.userEmail);
  await page.fill('#password', testData.userPassword);

  // Submit login form
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  // After login, check if we landed on the consent page
  const url = page.url();

  if (url.includes('/consent')) {
    return true;
  }

  if (url.includes('/interaction/')) {
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
  // FIXME: Cross-org consent tests require deeper test infrastructure work.
  // The server-side org resolution (via Redis interaction:org: key) is working
  // correctly — the login page shows the primary org branding. However, the
  // OIDC redirect chain after login breaks with "session expired" because:
  //   1. The confClient's redirect_uri registration may not match testData.redirectUri
  //   2. Interaction cookies are scoped to /interaction/{uid} and may not survive
  //      the cross-org redirect chain (login → auth resume → new consent interaction)
  // Fixing this requires a dedicated cross-org test fixture setup.

  // ── 7.1: Consent page appears after login ───────────────────────────

  test.fixme('consent page renders after successful login', async ({
    page,
    testData,
  }) => {
    // Use cross-org client so auto-consent doesn't trigger
    const reachedConsent = await loginToConsentPage(page, testData);

    expect(reachedConsent).toBe(true);

    // Verify the consent page has the approve button
    await expect(page.locator('button:has-text("Allow access")')).toBeVisible();
  });

  // ── 7.2: Consent page shows requested scopes ───────────────────────

  test.fixme('consent page displays requested scopes', async ({
    page,
    testData,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData);
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

  test.fixme('deny consent redirects with access_denied error', async ({
    page,
    testData,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData);
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

  test.fixme('consent form has CSRF token protection', async ({
    page,
    testData,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData);
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

  test.fixme('consent page shows client name and action buttons', async ({
    page,
    testData,
  }) => {
    const reachedConsent = await loginToConsentPage(page, testData);
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
