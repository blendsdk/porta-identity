/**
 * CSRF Protection — Playwright browser security tests.
 *
 * Verifies the cookie-based synchronized token CSRF pattern works correctly
 * in a real browser environment:
 *   - HttpOnly `_csrf` cookie is set on form pages
 *   - Hidden `_csrf` form field contains a matching token
 *   - POSTs without the CSRF token or with a tampered token are rejected
 *   - Each page load generates a fresh CSRF token
 *
 * This tests the fix implemented in Phases 1-3 of the CSRF & Playwright plan,
 * where `setCsrfCookie(ctx, token)` sets the cookie and the template embeds
 * the same token in a hidden field. On POST, the server compares the cookie
 * value against the form field value.
 *
 * @see plans/ui-testing/05-playwright-tests.md — CSRF Protection spec
 * @see plans/ui-testing/03-csrf-fix.md — CSRF fix design
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('CSRF Protection', () => {
  test('should process normal form submission successfully (CSRF valid)', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Normal login should work — both CSRF cookie and form field are present
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // Should NOT show a CSRF error — form processes correctly
    // Either redirects to callback (auto-consent) or shows consent/2FA page
    await page.waitForLoadState('networkidle');
    const bodyText = await page.textContent('body');

    // Verify no CSRF-related error message on the page
    expect(bodyText?.toLowerCase()).not.toContain('csrf');
  });

  test('should set _csrf cookie on login page', async ({
    page,
    startAuthFlow,
  }) => {
    // Navigate to the login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Get all cookies for the page via Playwright's cookie API
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === '_csrf');

    // CSRF cookie must exist
    expect(csrfCookie).toBeDefined();
    // Cookie value must be non-empty
    expect(csrfCookie!.value).toBeTruthy();
    expect(csrfCookie!.value.length).toBeGreaterThan(10);
  });

  test('should reject POST when CSRF form field is removed', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Remove the CSRF hidden field from the form via JavaScript
    await page.evaluate(() => {
      const csrfInput = document.querySelector(
        'input[name="_csrf"]'
      ) as HTMLInputElement | null;
      if (csrfInput) csrfInput.remove();
    });

    // Fill in valid credentials and submit
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // The server should reject the POST — CSRF token missing from form body.
    // The response should show a CSRF error or a 403.
    await page.waitForLoadState('networkidle');
    const bodyText = await page.textContent('body');

    // Check for CSRF-related error message in the response.
    // The actual message is intentionally vague for security: "security verification failed..."
    expect(bodyText?.toLowerCase()).toMatch(/security verification failed|csrf|forbidden|invalid.*token/);
  });

  test('should reject POST with tampered CSRF token', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Tamper with the hidden CSRF field — change its value
    await page.evaluate(() => {
      const csrfInput = document.querySelector(
        'input[name="_csrf"]'
      ) as HTMLInputElement | null;
      if (csrfInput) csrfInput.value = 'tampered-csrf-value-12345';
    });

    // Fill in valid credentials and submit
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', testData.userPassword);
    await page.click('button[type="submit"]');

    // The server should reject — cookie token doesn't match form token
    await page.waitForLoadState('networkidle');
    const bodyText = await page.textContent('body');

    // Should show CSRF error.
    // The actual message is intentionally vague for security: "security verification failed..."
    expect(bodyText?.toLowerCase()).toMatch(/security verification failed|csrf|forbidden|invalid.*token/);
  });

  test('should set CSRF cookie with correct security flags', async ({
    page,
    startAuthFlow,
  }) => {
    // Navigate to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Get cookie details via Playwright's context API
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === '_csrf');

    expect(csrfCookie).toBeDefined();

    // HttpOnly — prevents JavaScript access (XSS protection)
    expect(csrfCookie!.httpOnly).toBe(true);

    // SameSite=Lax — prevents cross-origin form submissions
    expect(csrfCookie!.sameSite).toBe('Lax');
  });

  test('should generate a new CSRF token on each page load', async ({
    page,
    startAuthFlow,
  }) => {
    // First page load — capture the CSRF token
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const firstToken = await page
      .locator('input[name="_csrf"]')
      .first()
      .getAttribute('value');
    expect(firstToken).toBeTruthy();

    // Second page load — start a new auth flow (new interaction session)
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const secondToken = await page
      .locator('input[name="_csrf"]')
      .first()
      .getAttribute('value');
    expect(secondToken).toBeTruthy();

    // Tokens should be different — each page load generates a fresh token
    expect(firstToken).not.toBe(secondToken);
  });
});
