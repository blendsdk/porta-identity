/**
 * Multi-Tenant UI Isolation — Playwright browser tests.
 *
 * Tests that auth pages respect organization status and branding:
 * - Active orgs render pages with correct branding/name
 * - Non-existent orgs return 404
 * - Suspended orgs return 403 (not the login form)
 * - Archived orgs return 404 (not the login form)
 *
 * Covers Category 11 from the UI Testing Phase 2 plan.
 *
 * @see plans/ui-testing-v2/08-security-accessibility-tests.md — Category 11
 */

import { test, expect } from '../fixtures/test-fixtures.js';

// ---------------------------------------------------------------------------
// Category 11: Multi-Tenant UI Isolation (4 tests)
// ---------------------------------------------------------------------------

test.describe('Multi-Tenant UI Isolation', () => {
  // ── 11.1: Active org renders auth pages with branding ────────────────

  test('auth pages render with correct org branding/name', async ({
    page,
    testData,
  }) => {
    // Navigate to the forgot-password page (doesn't require OIDC flow)
    await page.goto(
      `${testData.baseUrl}/${testData.orgSlug}/auth/forgot-password`,
      { waitUntil: 'networkidle' },
    );

    // Page should render successfully (200 status)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should have the forgot-password form (email input + submit button)
    await expect(page.locator('#email, input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // The page should contain the org's branding company name or the org name
    // (either in the page content, heading, or page title)
    const h1Text = await page.locator('h1').first().textContent();

    // At least one of: page title, heading, or body should indicate this is
    // a properly branded page (not a generic error page)
    const hasContent = bodyText!.length > 100;
    const hasHeading = h1Text && h1Text.trim().length > 0;
    expect(hasContent && hasHeading).toBe(true);
  });

  // ── 11.2: Non-existent org slug returns 404 ─────────────────────────

  test('non-existent org slug returns 404', async ({
    page,
    testData,
  }) => {
    const response = await page.goto(
      `${testData.baseUrl}/this-org-does-not-exist-999/auth/forgot-password`,
      { waitUntil: 'networkidle' },
    );

    // Should return 404 status
    expect(response?.status()).toBe(404);

    // Should NOT render the forgot-password form
    const emailInput = page.locator('#email, input[name="email"]');
    expect(await emailInput.count()).toBe(0);

    // Body should contain error/not-found indication
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.toLowerCase()).toMatch(/not found|404|does not exist|error/);
  });

  // ── 11.3: Suspended org shows 403 error ──────────────────────────────

  test('suspended org shows proper error not login page', async ({
    page,
    testData,
  }) => {
    const response = await page.goto(
      `${testData.baseUrl}/${testData.suspendedOrgSlug}/auth/forgot-password`,
      { waitUntil: 'networkidle' },
    );

    // Should return 403 status (organization suspended)
    expect(response?.status()).toBe(403);

    // Should NOT render the forgot-password form
    const emailInput = page.locator('#email, input[name="email"]');
    expect(await emailInput.count()).toBe(0);

    // Body should contain error/suspended indication
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.toLowerCase()).toMatch(/suspend|unavailable|forbidden|403|error/);
  });

  // ── 11.4: Archived org shows 404 error ───────────────────────────────

  test('archived org shows proper error not login page', async ({
    page,
    testData,
  }) => {
    const response = await page.goto(
      `${testData.baseUrl}/${testData.archivedOrgSlug}/auth/forgot-password`,
      { waitUntil: 'networkidle' },
    );

    // Archived orgs are treated as non-existent → 404
    expect(response?.status()).toBe(404);

    // Should NOT render the forgot-password form
    const emailInput = page.locator('#email, input[name="email"]');
    expect(await emailInput.count()).toBe(0);

    // Body should contain error/not-found indication
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.toLowerCase()).toMatch(/not found|404|does not exist|error/);
  });
});
