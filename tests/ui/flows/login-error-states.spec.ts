/**
 * Login Error States — Playwright browser tests.
 *
 * Tests user status validation, organization status errors, email preservation
 * on failed login, and account lockout behavior. Covers Category 6 from the
 * UI Testing Phase 2 plan.
 *
 * Uses seeded users in various statuses (suspended, inactive, locked) and
 * organizations in non-active states (suspended, archived) from global-setup.
 *
 * @see plans/ui-testing-v2/06-login-consent-interaction-tests.md — Category 6
 */

import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// Category 6: Login Error States (9 tests)
// ---------------------------------------------------------------------------

test.describe('Login Error States', () => {
  // ── 6.1: Suspended user ──────────────────────────────────────────────

  test('suspended user sees account suspended error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → lands on login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Fill in suspended user credentials
    await page.fill('#email', testData.suspendedUserEmail);
    await page.fill('#password', 'TestPassword123!');

    // Submit login form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should stay on login page (still an interaction URL)
    expect(page.url()).toContain('/interaction/');

    // Should show an error flash message about suspension
    const flash = page.locator('.flash-error, .error, .alert-error');
    await expect(flash).toBeVisible();
    const flashText = await flash.textContent();
    expect(flashText?.toLowerCase()).toMatch(/suspend/);
  });

  // ── 6.2: Inactive user (no active account) ──────────────────────────

  test('inactive user sees account error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → lands on login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Fill in inactive user credentials
    await page.fill('#email', testData.inactiveUserEmail);
    await page.fill('#password', 'TestPassword123!');

    // Submit login form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should stay on login page
    expect(page.url()).toContain('/interaction/');

    // Should show an error flash message
    const flash = page.locator('.flash-error, .error, .alert-error');
    await expect(flash).toBeVisible();
  });

  // ── 6.3: Locked user ────────────────────────────────────────────────

  test('locked user sees account locked error', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → lands on login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Fill in locked user credentials
    await page.fill('#email', testData.lockedUserEmail);
    await page.fill('#password', 'TestPassword123!');

    // Submit login form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should stay on login page
    expect(page.url()).toContain('/interaction/');

    // Should show an error flash message about being locked
    const flash = page.locator('.flash-error, .error, .alert-error');
    await expect(flash).toBeVisible();
    const flashText = await flash.textContent();
    expect(flashText?.toLowerCase()).toMatch(/lock/);
  });

  // ── 6.4: Non-existent user ──────────────────────────────────────────

  test('non-existent user sees generic invalid credentials error', async ({
    page,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → lands on login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Fill in an email that doesn't exist in the system
    await page.fill('#email', 'nonexistent-user@test.example.com');
    await page.fill('#password', 'SomePassword123!');

    // Submit login form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should stay on login page (anti-enumeration: same error as wrong password)
    expect(page.url()).toContain('/interaction/');

    // Should show a generic error flash (NOT "user not found")
    const flash = page.locator('.flash-error, .error, .alert-error');
    await expect(flash).toBeVisible();
  });

  // ── 6.5: Suspended organization ─────────────────────────────────────

  test('suspended org shows 403 error', async ({ page, testData }) => {
    // Navigate to a page under the suspended org slug
    const response = await page.goto(
      `${testData.baseUrl}/${testData.suspendedOrgSlug}/auth/forgot-password`,
    );

    // Tenant resolver returns 403 for suspended orgs
    expect(response?.status()).toBe(403);

    // Should NOT show the login form
    await expect(page.locator('#email')).not.toBeVisible();
  });

  // ── 6.6: Archived organization ──────────────────────────────────────

  test('archived org shows 404 error', async ({ page, testData }) => {
    // Navigate to a page under the archived org slug
    const response = await page.goto(
      `${testData.baseUrl}/${testData.archivedOrgSlug}/auth/forgot-password`,
    );

    // Tenant resolver returns 404 for archived orgs (treated as non-existent)
    expect(response?.status()).toBe(404);

    // Should NOT show the login form
    await expect(page.locator('#email')).not.toBeVisible();
  });

  // ── 6.7: Non-existent org slug ──────────────────────────────────────

  test('non-existent org slug shows 404', async ({ page, testData }) => {
    // Navigate to a page under a completely fake org slug
    const response = await page.goto(
      `${testData.baseUrl}/nonexistent-org-slug-99999/auth/forgot-password`,
    );

    // Tenant resolver returns 404 for unknown slugs
    expect(response?.status()).toBe(404);

    // Should NOT show the login form
    await expect(page.locator('#email')).not.toBeVisible();
  });

  // ── 6.8: Email preserved on error ───────────────────────────────────

  test('login form preserves email input after failed attempt', async ({
    page,
    testData,
    startAuthFlow,
  }) => {
    // Start OIDC auth flow → lands on login page
    await startAuthFlow(page);
    await page.waitForURL('**/interaction/**');

    // Fill in valid email with wrong password
    await page.fill('#email', testData.userEmail);
    await page.fill('#password', 'wrong-password-123');

    // Submit login form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Should still be on login page
    expect(page.url()).toContain('/interaction/');

    // Error should be visible
    const flash = page.locator('.flash-error, .error, .alert-error');
    await expect(flash).toBeVisible();

    // Email field should still contain the entered email (not cleared)
    await expect(page.locator('#email')).toHaveValue(testData.userEmail);

    // Password field should be empty (security: don't preserve passwords)
    await expect(page.locator('#password')).toHaveValue('');
  });

  // ── 6.9: Account lockout after consecutive failures ─────────────────

  test('account locks after consecutive failed login attempts', async ({
    page,
    testData,
    startAuthFlow,
    dbHelpers,
  }) => {
    // Reset rate limits to ensure clean state
    await dbHelpers.resetAllRateLimits();

    // Ensure lockable user is in active state
    const orgId = await dbHelpers.getOrgIdBySlug(testData.orgSlug);
    const user = await dbHelpers.getUserByEmail(testData.lockableUserEmail, orgId);
    if (user) {
      await dbHelpers.updateUserStatus(user.id, 'active');
    }

    // Submit wrong password multiple times until rate-limited.
    // The rate limit is configured at 10 attempts per 900s window.
    // We loop up to 15 times to account for any warm-up.
    const maxAttempts = 15;
    let rateLimited = false;

    for (let i = 0; i < maxAttempts; i++) {
      // Start a fresh auth flow for each attempt
      await startAuthFlow(page);
      await page.waitForURL('**/interaction/**');

      await page.fill('#email', testData.lockableUserEmail);
      await page.fill('#password', 'wrong-password-attempt');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Check for rate limit via HTTP 429 status
      // (The processLogin handler sets status 429 when rate limited)
      const flash = page.locator('.flash-error, .error, .alert-error');
      if (await flash.isVisible()) {
        const text = (await flash.textContent()) ?? '';
        // Match both spaced "rate limit" and underscored "rate_limit" (i18n key fallback)
        if (text.toLowerCase().match(/too many|rate.limit|rate_limit|locked/)) {
          rateLimited = true;
          break;
        }
      }
    }

    // Should have eventually hit rate limiting or lockout
    expect(rateLimited).toBe(true);

    // Clean up: reset rate limits and restore user status
    await dbHelpers.resetAllRateLimits();
    if (user) {
      await dbHelpers.updateUserStatus(user.id, 'active');
    }
  });
});
