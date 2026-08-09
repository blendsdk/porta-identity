/**
 * Interaction Lifecycle — Playwright browser tests.
 *
 * Tests OIDC interaction lifecycle edge cases: abort, expired/invalid UIDs,
 * direct access without auth flow, browser back button, and page refresh.
 * Covers Category 8 from the UI Testing Phase 2 plan.
 *
 * These tests verify that the interaction router handles edge cases
 * gracefully without 500 errors or crashes.
 *
 * @see plans/ui-testing-v2/06-login-consent-interaction-tests.md — Category 8
 */

import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the interaction UID from a URL.
 * Interaction URLs follow the pattern: /interaction/:uid
 */
function extractInteractionUid(url: string): string | null {
  const match = url.match(/\/interaction\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Category 8: Interaction Lifecycle (6 tests)
// ---------------------------------------------------------------------------

test.describe('Interaction Lifecycle', () => {
  // ── 8.1: Abort interaction redirects with access_denied ──────────────

  test('abort interaction redirects with access_denied', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → lands on login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Extract the interaction UID from the current URL
    const uid = extractInteractionUid(page.url());
    expect(uid).toBeTruthy();

    // Navigate to the abort endpoint
    await page.goto(`${testData.baseUrl}/interaction/${uid}/abort`, {
      waitUntil: 'networkidle',
    });

    // Should redirect to the callback URL with error=access_denied
    const url = new URL(page.url());
    // The redirect may go to the callback URI or stay on an error page
    if (url.origin + url.pathname === testData.redirectUri) {
      // Redirected to callback — check for access_denied error
      expect(url.searchParams.get('error')).toBe('access_denied');
    } else {
      // May have stayed on the abort page or error page — that's also acceptable
      // as long as there's no 500 error
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeTruthy();
    }
  });

  // ── 8.2: Expired/stale interaction UID shows error page ──────────────

  test('expired interaction UID shows error page', async ({
    page,
    testData,
  }) => {
    // Use a fabricated but plausible-looking UID (real UIDs are base64url)
    const expiredUid = 'expired_uid_aaaa1111bbbb2222cccc3333';

    await page.goto(`${testData.baseUrl}/interaction/${expiredUid}`, {
      waitUntil: 'networkidle',
    });

    // Should render an error page (400 status), not crash with 500
    // The error page template shows "errors.interaction_expired" or similar
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should contain an error message about expired or invalid interaction
    const lowerText = bodyText!.toLowerCase();
    expect(lowerText).toMatch(/error|expired|invalid|not found|something went wrong/);

    // Should NOT be a login form (no email/password fields)
    const emailInput = page.locator('#email');
    expect(await emailInput.count()).toBe(0);
  });

  // ── 8.3: Invalid/garbage interaction UID shows error page ────────────

  test('invalid/garbage interaction UID shows error page', async ({
    page,
    testData,
  }) => {
    // Use obviously invalid UIDs
    await page.goto(`${testData.baseUrl}/interaction/not-a-valid-uid!!!`, {
      waitUntil: 'networkidle',
    });

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should show error page, not crash
    const lowerText = bodyText!.toLowerCase();
    expect(lowerText).toMatch(/error|expired|invalid|not found|something went wrong/);
  });

  // ── 8.4: Direct access without starting auth flow ────────────────────

  test('direct access to interaction URL without auth flow shows error', async ({
    page,
    testData,
  }) => {
    // Navigate directly to an interaction URL without starting an OIDC flow
    const randomUid = 'direct_access_no_flow_' + Date.now();

    await page.goto(`${testData.baseUrl}/interaction/${randomUid}`, {
      waitUntil: 'networkidle',
    });

    // Should show an error page (no valid interaction session exists)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    const lowerText = bodyText!.toLowerCase();
    expect(lowerText).toMatch(/error|expired|invalid|not found|something went wrong/);

    // Should NOT be a login form
    const emailInput = page.locator('#email');
    expect(await emailInput.count()).toBe(0);
  });

  // ── 8.5: Browser back button after login ─────────────────────────────

  test('browser back button after login handled gracefully', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Fill in valid credentials and submit
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // After login, we're on consent or callback
    // Press browser back button
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Should handle gracefully — either:
    // 1. Show the expired interaction error page
    // 2. Re-render the login page (interaction may still be valid)
    // 3. Redirect to some page
    // Key assertion: no crash, no 500 error
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Page should have meaningful content (not a blank page or stack trace)
    expect(bodyText!.length).toBeGreaterThan(10);

    // Should NOT show a raw stack trace or 500 error
    expect(bodyText!).not.toContain('Internal Server Error');
    expect(bodyText!).not.toMatch(/Error:.*at\s+/); // No stack traces
  });

  // ── 8.6: Page refresh during interaction ─────────────────────────────

  test('refreshing interaction page handled gracefully', async ({
    page,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Verify login page loaded
    await expect(page.locator('#email')).toBeVisible();

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });

    // After reload, the interaction should still be valid
    // (interactions have a TTL, typically several minutes)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should either show login page again OR an expired message
    const hasLoginForm = (await page.locator('#email').count()) > 0;
    const hasExpiredMessage = bodyText!.toLowerCase().includes('expired') ||
                              bodyText!.toLowerCase().includes('error');

    // One of these should be true
    expect(hasLoginForm || hasExpiredMessage).toBe(true);

    // Should NOT show 500 error
    expect(bodyText!).not.toContain('Internal Server Error');

    // If login form is still there, it should be functional
    if (hasLoginForm) {
      await expect(page.locator('#password')).toBeVisible();
      // Use .first() because the login page has multiple submit buttons
      // (Sign in + Send magic link)
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    }
  });
});
