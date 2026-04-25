/**
 * Sidebar navigation smoke tests.
 *
 * Verifies the authenticated admin GUI loads correctly:
 *   - AppShell layout (sidebar, topbar, content area)
 *   - All sidebar navigation items are visible
 *   - Navigation links route to the correct pages
 *   - No React crashes on page render (automatic via admin-fixtures)
 *
 * These tests use the storageState from auth-setup, so they
 * are already authenticated — no login flow needed.
 *
 * IMPORTANT: The admin-fixtures `page` override automatically checks for:
 *   - React error boundaries ("Unexpected Application Error!")
 *   - Uncaught JavaScript errors (via pageerror event)
 * If a page crashes after navigation, the test will fail automatically.
 * To ensure crashes are caught, always wait for `networkidle` after
 * navigation so React has time to render (and crash if it will).
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Sidebar Navigation', () => {
  test('dashboard loads with sidebar and topbar visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // AppShell layout should be visible: sidebar + content area
    const sidebar = page.locator('nav').first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Dashboard should show a heading or stats
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
  });

  test('sidebar shows all main navigation items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // All nav items from navigation.ts should be present in the sidebar
    const navLabels = [
      'Dashboard',
      'Organizations',
      'Applications',
      'Clients',
      'Users',
      'Roles & Permissions',
      'Custom Claims',
      'Sessions',
      'Audit Log',
      'Configuration',
      'Signing Keys',
      'Import / Export',
    ];

    for (const label of navLabels) {
      await expect(
        page.locator(`nav >> text="${label}"`),
        `sidebar should show "${label}"`,
      ).toBeVisible();
    }
  });

  test('clicking Organizations navigates to /organizations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav >> text="Organizations"').click();
    await expect(page).toHaveURL(/\/organizations$/);
    await page.waitForLoadState('networkidle');

    // Page content should render (breadcrumbs show "Organizations")
    await expect(page.locator('text=Organizations').first()).toBeVisible();
  });

  test('clicking Audit Log navigates to /audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav >> text="Audit Log"').click();
    await expect(page).toHaveURL(/\/audit$/);

    // Wait for the page to fully render (or crash)
    // This is critical — without this wait, the fixture teardown
    // might check for errors before React has finished rendering.
    await page.waitForLoadState('networkidle');
  });

  test('clicking Configuration navigates to /config', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav >> text="Configuration"').click();
    await expect(page).toHaveURL(/\/config$/);
    await page.waitForLoadState('networkidle');
  });

  test('clicking Signing Keys navigates to /keys', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav >> text="Signing Keys"').click();
    await expect(page).toHaveURL(/\/keys$/);
    await page.waitForLoadState('networkidle');
  });

  test('navigating back to dashboard via sidebar works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate away from dashboard
    await page.locator('nav >> text="Organizations"').click();
    await expect(page).toHaveURL(/\/organizations$/);
    await page.waitForLoadState('networkidle');

    // Navigate back to dashboard
    await page.locator('nav >> text="Dashboard"').click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
  });

  test('unknown route shows 404 page', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await page.waitForLoadState('networkidle');

    // The NotFound page should render
    await expect(page.locator('text=/not found|404/i').first()).toBeVisible();
  });
});
