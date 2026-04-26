/**
 * Sidebar navigation smoke tests.
 *
 * Verifies the authenticated admin GUI sidebar behavior:
 *   - AppShell layout (sidebar, topbar, content area)
 *   - All sidebar navigation items are visible
 *   - Navigation links route to the correct pages
 *   - Active item highlighting (aria-current="page")
 *   - Collapse/expand toggle
 *   - System section items (Config, Keys, Import/Export)
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

    // Navigate back to dashboard (use sidebar-nav testid to avoid matching breadcrumb nav)
    await page.locator('[data-testid="sidebar-nav"] >> text="Dashboard"').click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
  });

  test('sidebar highlights active navigation item', async ({ page }) => {
    await page.goto('/organizations');
    await page.waitForLoadState('networkidle');

    // The "Organizations" nav item should have aria-current="page"
    const orgNavItem = page.locator('[data-testid="nav-item-organizations"]');
    await expect(orgNavItem).toBeVisible({ timeout: 10_000 });
    await expect(orgNavItem).toHaveAttribute('aria-current', 'page');

    // Dashboard nav item should NOT have aria-current
    const dashboardNavItem = page.locator('[data-testid="nav-item-dashboard"]');
    await expect(dashboardNavItem).not.toHaveAttribute('aria-current', 'page');
  });

  test('sidebar collapse and expand works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('[data-testid="sidebar"]');
    const toggleButton = page.locator('[data-testid="sidebar-toggle"]');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    await expect(toggleButton).toBeVisible();

    // Sidebar should start expanded (240px wide)
    // Verify nav labels are visible when expanded
    await expect(page.locator('[data-testid="sidebar-nav"] >> text="Dashboard"')).toBeVisible();

    // Click collapse button
    await toggleButton.click();

    // After collapsing, nav labels should be hidden
    // The sidebar width shrinks to 48px and labels are hidden
    await expect(
      page.locator('[data-testid="sidebar-nav"] >> text="Dashboard"'),
    ).not.toBeVisible({ timeout: 5_000 });

    // Click expand button to restore
    await toggleButton.click();

    // Labels should be visible again
    await expect(
      page.locator('[data-testid="sidebar-nav"] >> text="Dashboard"'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('sidebar shows system section items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('[data-testid="sidebar-nav"]');
    await expect(nav).toBeVisible({ timeout: 10_000 });

    // System section items should be visible: Configuration, Signing Keys, Import / Export
    await expect(nav.locator('text="Configuration"')).toBeVisible();
    await expect(nav.locator('text="Signing Keys"')).toBeVisible();
    await expect(nav.locator('text="Import / Export"')).toBeVisible();
  });

  test('unknown route shows 404 page', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await page.waitForLoadState('networkidle');

    // The NotFound page should render
    await expect(page.locator('text=/not found|404/i').first()).toBeVisible();
  });
});
