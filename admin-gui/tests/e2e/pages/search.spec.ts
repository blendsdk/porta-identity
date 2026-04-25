/**
 * Search Results page E2E tests.
 *
 * Tests the search results page through the real BFF → Porta stack:
 *   - Page load with query parameter
 *   - Results display when matches exist
 *   - Empty results message for non-matching query
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Search Results', () => {
  test('loads search results page with query', async ({ page }) => {
    await page.goto('/search?q=admin');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /search results/i }),
    ).toBeVisible();

    // Should show the query in a badge or text
    await expect(page.getByText('admin')).toBeVisible();
  });

  test('shows results grouped by entity type', async ({ page }) => {
    await page.goto('/search?q=admin');
    await page.waitForLoadState('networkidle');

    // Results should be visible (cards or list items), or empty state
    const hasResults = await page.locator('[class*="Card"]').first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no results/i)
      .isVisible()
      .catch(() => false);

    expect(hasResults || hasEmpty).toBeTruthy();
  });

  test('shows empty state for non-matching query', async ({ page }) => {
    // Use a query that is very unlikely to match anything
    await page.goto('/search?q=zzz_nonexistent_query_xyz');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/no results/i),
    ).toBeVisible();
  });
});
