/**
 * Magic Link Abuse — Playwright security tests.
 *
 * Tests security properties of the magic link system:
 *   - Brute-force token guessing always fails
 *   - Non-existent and suspended user emails show the same success page
 *     (anti-enumeration)
 *   - No information leakage in error messages
 *
 * These are security-focused tests that verify the system's resilience
 * against common attack patterns on magic link authentication.
 *
 * @see plans/ui-testing-v2/05-magic-link-invitation-tests.md
 */

import { test, expect } from '../fixtures/test-fixtures.js';

test.describe('Magic Link Abuse', () => {
  /**
   * Test 4.1: Brute-force token guessing.
   *
   * Tries multiple random base64url-like strings as magic link tokens.
   * All should result in error pages with no information leakage —
   * the error messages should be generic and not reveal whether a
   * token existed, was expired, or was already used.
   */
  test('random tokens all fail with error pages', async ({
    page,
    testData,
  }) => {
    // Try 5 random token-like strings
    const fakeTokens = [
      'aaabbbccc111222333dddeeefff444555',
      'AAAA_BBBB_CCCC_DDDD_EEEE',
      'dGhpc2lzYWZha2V0b2tlbg',
      'x'.repeat(43),
      'ThisIsDefinitelyNotAValidToken2024!',
    ];

    for (const fakeToken of fakeTokens) {
      const url = `${testData.baseUrl}/${testData.orgSlug}/auth/magic-link/${fakeToken}`;
      await page.goto(url, { waitUntil: 'networkidle' });

      // Should render the error page
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();

      // Should not leak any technical details
      const bodyText = await page.textContent('body');
      expect(bodyText?.toLowerCase()).not.toContain('stack');
      expect(bodyText?.toLowerCase()).not.toContain('sql');
      expect(bodyText?.toLowerCase()).not.toContain('token_hash');
      expect(bodyText?.toLowerCase()).not.toContain('undefined');
    }
  });

  /**
   * Test 4.2: Non-existent email shows same success page (anti-enumeration).
   *
   * Requests a magic link via the login form using an email that doesn't
   * exist in the database. The system should show the same "check your
   * email" confirmation page — indistinguishable from a valid request.
   * This prevents email enumeration attacks.
   */
  test('non-existent email shows same success message', async ({
    page,
    startAuthFlow,
  }) => {
    // 1. Start auth flow to get to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // 2. Submit magic link request with a non-existent email
    await page.fill('#email', 'nonexistent-magic-link@nowhere.example.com');
    await page.click('#magic-link-btn');

    // 3. Should show the same "check your email" page as a valid request
    await expect(page.locator('h1')).toBeVisible();
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('email');

    // 4. Should not indicate whether the user exists or not
    expect(bodyText?.toLowerCase()).not.toContain('not found');
    expect(bodyText?.toLowerCase()).not.toContain('does not exist');
  });

  /**
   * Test 4.3: Suspended user email shows same success page.
   *
   * Requests a magic link for a user whose account is suspended.
   * The system should show the same confirmation page to prevent
   * account status enumeration.
   */
  test('suspended user email shows same success message', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Start auth flow to get to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // 2. Submit magic link request with the suspended user's email
    await page.fill('#email', testData.suspendedUserEmail);
    await page.click('#magic-link-btn');

    // 3. Should show the same "check your email" page
    await expect(page.locator('h1')).toBeVisible();
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('email');

    // 4. Should not reveal that the account is suspended
    expect(bodyText?.toLowerCase()).not.toContain('suspended');
    expect(bodyText?.toLowerCase()).not.toContain('disabled');
  });

  /**
   * Test 4.4: Locked user email shows same success page.
   *
   * Requests a magic link for a user whose account is locked.
   * Same anti-enumeration behavior expected.
   */
  test('locked user email shows same success message', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // 1. Start auth flow to get to login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // 2. Submit magic link request with the locked user's email
    await page.fill('#email', testData.lockedUserEmail);
    await page.click('#magic-link-btn');

    // 3. Should show the same "check your email" page
    await expect(page.locator('h1')).toBeVisible();
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('email');

    // 4. Should not reveal that the account is locked
    expect(bodyText?.toLowerCase()).not.toContain('locked');
  });
});
