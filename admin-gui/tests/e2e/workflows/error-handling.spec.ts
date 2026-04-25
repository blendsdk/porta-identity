/**
 * Error handling workflow E2E tests.
 *
 * Tests application resilience to edge cases:
 *   - 404 route shows NotFound page
 *   - Rapid navigation between pages doesn't crash
 *   - Browser back/forward buttons work correctly
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Error Handling Workflows', () => {
  test('unknown route shows 404 / NotFound page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz');
    await page.waitForLoadState('networkidle');

    // Should show a "not found" or "404" indicator
    // The NotFound.tsx page component renders error content
    const notFound = page.getByText(/not found|404|page doesn.t exist/i);
    await expect(notFound).toBeVisible({ timeout: 5_000 });
  });

  test('rapid navigation between pages does not crash', async ({ page }) => {
    // Navigate rapidly between multiple pages
    const routes = [
      '/organizations',
      '/applications',
      '/users',
      '/audit',
      '/keys',
      '/',
    ];

    for (const route of routes) {
      await page.goto(route);
      // Don't wait for networkidle — intentionally fast navigation
    }

    // After rapid navigation, the final page should load without errors
    await page.waitForLoadState('networkidle');

    // Should not show React error boundary
    const errorBoundary = page.locator('text="Unexpected Application Error!"');
    await expect(errorBoundary).not.toBeVisible({ timeout: 3_000 });
  });

  test('browser back/forward navigation works', async ({ page }) => {
    // Navigate: Dashboard → Organizations → Applications
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/organizations');
    await page.waitForLoadState('networkidle');

    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Go back to Organizations
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/organizations/);

    // Go back to Dashboard
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/$/);

    // Go forward to Organizations
    await page.goForward();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/organizations/);
  });
});
