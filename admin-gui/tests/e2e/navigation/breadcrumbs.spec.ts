/**
 * Breadcrumb navigation tests.
 *
 * Verifies the breadcrumb trail renders correctly at various route depths,
 * that breadcrumb links are clickable for navigation, and that the trail
 * updates correctly when navigating between pages.
 *
 * The Breadcrumbs component hides when there is only one breadcrumb item
 * (e.g., Dashboard at root), so we test that behavior too.
 *
 * @see src/client/components/Breadcrumbs.tsx — Breadcrumb component
 * @see src/client/hooks/useBreadcrumbs.ts — Route handle.breadcrumb extraction
 * @see src/client/router.tsx — Route config with breadcrumb metadata
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Breadcrumbs', () => {
  test('dashboard shows no breadcrumb trail (single item hidden)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dashboard is the root route — only 1 breadcrumb ("Dashboard").
    // The Breadcrumbs component returns null when length <= 1.
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).not.toBeVisible({ timeout: 5_000 });
  });

  test('organization list shows "Dashboard > Organizations" breadcrumb', async ({
    page,
  }) => {
    await page.goto('/organizations');
    await page.waitForLoadState('networkidle');

    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).toBeVisible({ timeout: 10_000 });

    // Should contain both Dashboard and Organizations
    await expect(breadcrumbs.locator('text=Dashboard')).toBeVisible();
    await expect(breadcrumbs.locator('text=Organizations')).toBeVisible();
  });

  test('create organization shows full breadcrumb trail', async ({ page }) => {
    await page.goto('/organizations/new');
    await page.waitForLoadState('networkidle');

    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).toBeVisible({ timeout: 10_000 });

    // Should show: Dashboard > Organizations > Create
    await expect(breadcrumbs.locator('text=Dashboard')).toBeVisible();
    await expect(breadcrumbs.locator('text=Organizations')).toBeVisible();
    await expect(breadcrumbs.locator('text=Create')).toBeVisible();
  });

  test('breadcrumb links are clickable and navigate correctly', async ({
    page,
  }) => {
    await page.goto('/organizations/new');
    await page.waitForLoadState('networkidle');

    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).toBeVisible({ timeout: 10_000 });

    // Click "Organizations" in the breadcrumb trail → should navigate to /organizations
    await breadcrumbs.locator('text=Organizations').click();
    await expect(page).toHaveURL(/\/organizations$/);
    await page.waitForLoadState('networkidle');

    // Now go back to a deeper page and click Dashboard
    await page.goto('/organizations/new');
    await page.waitForLoadState('networkidle');

    await breadcrumbs.locator('text=Dashboard').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('deep pages show full breadcrumb trail', async ({ page }) => {
    // Navigate to a nested route: /applications/new
    await page.goto('/applications/new');
    await page.waitForLoadState('networkidle');

    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).toBeVisible({ timeout: 10_000 });

    // Should show: Dashboard > Applications > Create
    await expect(breadcrumbs.locator('text=Dashboard')).toBeVisible();
    await expect(breadcrumbs.locator('text=Applications')).toBeVisible();
    await expect(breadcrumbs.locator('text=Create')).toBeVisible();
  });
});
