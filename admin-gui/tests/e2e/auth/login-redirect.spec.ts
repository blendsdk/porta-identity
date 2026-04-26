/**
 * Authentication redirect tests (unauthenticated).
 *
 * Verifies that unauthenticated users are redirected to the login page
 * and that non-auth endpoints like /health remain accessible.
 *
 * These tests run in the "unauthenticated" Playwright project —
 * no storageState, no session cookie. Every request starts fresh.
 *
 * @see playwright.config.ts — "unauthenticated" project
 * @see src/client/components/RequireAuth.tsx — SPA auth guard
 * @see src/client/pages/Login.tsx — Login redirect component
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Login Redirect (Unauthenticated)', () => {
  test('unauthenticated root access redirects to login', async ({ page }) => {
    await page.goto('/');

    // RequireAuth component detects no session → Navigate to /login
    // Login component then triggers window.location.href = '/auth/login'
    // We check for the /login route (React Router redirect)
    await page.waitForURL(/\/login|\/auth\/login/, { timeout: 15_000 });

    // Should see the login redirect spinner OR the OIDC login page
    const url = page.url();
    expect(url).toMatch(/\/login|\/auth/);
  });

  test('unauthenticated deep link redirects to login', async ({ page }) => {
    await page.goto('/organizations');

    // Deep link should also be caught by RequireAuth → redirect to /login
    await page.waitForURL(/\/login|\/auth\/login/, { timeout: 15_000 });

    const url = page.url();
    expect(url).toMatch(/\/login|\/auth/);
  });

  test('login page triggers redirect to OIDC login', async ({ page }) => {
    // Navigate directly to /login
    await page.goto('/login');

    // The Login component renders a Spinner with "Redirecting to login..."
    // then immediately does window.location.href = '/auth/login'.
    // The redirect often fires before Playwright can capture the spinner,
    // so we accept either outcome:
    //   1) Spinner is visible briefly (caught before redirect)
    //   2) Page already redirected to /auth/login or /interaction
    await page.waitForURL(/\/login|\/auth\/login|\/interaction/, { timeout: 10_000 });

    // Wait a moment for potential redirect to complete
    await page.waitForTimeout(1_000);

    const url = page.url();
    const redirected = url.includes('/auth/login') || url.includes('/interaction');

    if (!redirected) {
      // We're still on /login — spinner should be visible
      const spinner = page.locator('text=/redirecting|loading|sign in/i');
      await expect(spinner.first()).toBeVisible({ timeout: 5_000 });
    }
    // Either way, the login redirect flow is triggered — test passes
  });

  test('health endpoint is accessible without authentication', async ({
    page,
    testData,
  }) => {
    // Use Playwright's API request context to hit /health directly
    const response = await page.request.get(`${testData.adminGuiUrl}/health`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});
