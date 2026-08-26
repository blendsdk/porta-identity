/**
 * Cookie Flags Security — Playwright browser tests.
 *
 * Verifies that all cookies set during authentication flows have
 * appropriate security flags:
 *   - CSRF cookie: HttpOnly, SameSite=Lax
 *   - OIDC interaction cookies: present during auth flows
 *   - No sensitive data exposed in non-HttpOnly cookies
 *
 * These tests use Playwright's `page.context().cookies()` API to inspect
 * cookie properties, which provides full visibility into flags that are
 * invisible to client-side JavaScript (like HttpOnly cookies).
 *
 * @see plans/ui-testing/05-playwright-tests.md — Cookie Flags spec
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Cookie Security Flags', () => {
  test('should set CSRF cookie as HttpOnly', async ({
    page,
    startAuthFlow,
  }) => {
    // Navigate to a form page (login) to trigger CSRF cookie
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === '_csrf');

    expect(csrfCookie).toBeDefined();

    // HttpOnly prevents JavaScript from reading the cookie via document.cookie,
    // protecting the CSRF token from XSS attacks
    expect(csrfCookie!.httpOnly).toBe(true);

    // Verify the cookie is NOT accessible via document.cookie in the browser
    const clientCookies = await page.evaluate(() => document.cookie);
    expect(clientCookies).not.toContain('_csrf');
  });

  test('should set CSRF cookie as SameSite=Lax', async ({
    page,
    startAuthFlow,
  }) => {
    // Navigate to a form page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === '_csrf');

    expect(csrfCookie).toBeDefined();

    // SameSite=Lax prevents the cookie from being sent on cross-origin
    // form submissions, adding defense-in-depth to CSRF protection
    expect(csrfCookie!.sameSite).toBe('Lax');
  });

  test('should have OIDC interaction cookies during auth flow', async ({
    page,
    startAuthFlow,
  }) => {
    // Start an auth flow — the OIDC provider sets interaction cookies
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const cookies = await page.context().cookies();
    const cookieNames = cookies.map((c) => c.name);

    // node-oidc-provider sets `_interaction` and `_interaction_resume` cookies
    // to maintain session state across the login/consent interaction.
    // At least one of these should be present on the interaction page.
    const hasInteractionCookie =
      cookieNames.some((name) => name.startsWith('_interaction'));

    expect(hasInteractionCookie).toBe(true);

    // Interaction cookies should also be HttpOnly
    const interactionCookies = cookies.filter((c) =>
      c.name.startsWith('_interaction')
    );
    for (const cookie of interactionCookies) {
      expect(cookie.httpOnly).toBe(true);
    }
  });

  test('should not expose sensitive data in non-HttpOnly cookies', async ({
    page,
    startAuthFlow,
  }) => {
    // Navigate through the auth flow
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    const cookies = await page.context().cookies();

    // Get cookies that are NOT HttpOnly (accessible to JavaScript)
    const nonHttpOnlyCookies = cookies.filter((c) => !c.httpOnly);

    // Sensitive cookie names that must always be HttpOnly
    const sensitiveCookieNames = [
      '_csrf',
      '_interaction',
      '_interaction_resume',
      '_session',
      'connect.sid',
    ];

    // Verify none of the non-HttpOnly cookies match sensitive names
    for (const cookie of nonHttpOnlyCookies) {
      const isSensitive = sensitiveCookieNames.some(
        (name) => cookie.name === name || cookie.name.startsWith(name)
      );
      expect(isSensitive).toBe(false);
    }

    // Additional check: no non-HttpOnly cookie should contain token-like values
    // that could be session identifiers or auth tokens
    for (const cookie of nonHttpOnlyCookies) {
      // Cookie values longer than 40 chars that look like hex/base64 tokens
      // are suspicious — they should be HttpOnly
      if (cookie.value.length > 40) {
        const looksLikeToken = /^[a-f0-9]{32,}$/i.test(cookie.value) ||
          /^[A-Za-z0-9+/=]{32,}$/.test(cookie.value);

        expect(looksLikeToken).toBe(false);
      }
    }
  });
});
