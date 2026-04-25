/**
 * TopBar navigation tests.
 *
 * Verifies the top bar renders correctly with all expected elements:
 * brand text, user menu, logout option, org selector, and search trigger.
 *
 * These tests run authenticated (storageState from auth-setup).
 *
 * @see src/client/components/TopBar.tsx — TopBar component
 * @see src/client/components/UserMenu.tsx — User menu dropdown
 * @see src/client/components/OrgSelector.tsx — Organization selector
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('TopBar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('topbar displays brand text', async ({ page }) => {
    const topbar = page.locator('[data-testid="topbar"]');
    await expect(topbar).toBeVisible({ timeout: 10_000 });

    // Brand section should show "Porta Admin"
    const brand = page.locator('[data-testid="topbar-brand"]');
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('Porta Admin');
  });

  test('user menu opens on click', async ({ page }) => {
    // Click the user menu trigger
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"]');
    await expect(userMenuTrigger).toBeVisible({ timeout: 10_000 });
    await userMenuTrigger.click();

    // The dropdown/popover should appear with menu items
    // FluentUI Menu renders a MenuPopover with menuitemradio/menuitem roles
    const menuPopover = page.locator('[role="menu"], [role="menubar"]');
    await expect(menuPopover.first()).toBeVisible({ timeout: 5_000 });
  });

  test('logout option exists in user menu', async ({ page }) => {
    // Open the user menu
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"]');
    await expect(userMenuTrigger).toBeVisible({ timeout: 10_000 });
    await userMenuTrigger.click();

    // The "Sign out" menu item should be visible
    const signOut = page.locator('[data-testid="user-menu-signout"]');
    await expect(signOut).toBeVisible({ timeout: 5_000 });
    await expect(signOut).toContainText('Sign out');
  });

  test('org selector is present in topbar', async ({ page }) => {
    // The org selector is a button with the org name or "All Organizations"
    // It's in the topbar left section
    const orgSelector = page.locator(
      '[data-testid="topbar"] button:has-text("All Organizations"), ' +
      '[data-testid="topbar"] button:has-text("Organization")',
    );
    await expect(orgSelector.first()).toBeVisible({ timeout: 10_000 });
  });

  test('org selector shows current org context', async ({ page }) => {
    // For super-admin with no org selected, should show "All Organizations"
    const orgLabel = page.locator('text=All Organizations');
    await expect(orgLabel.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search trigger is accessible', async ({ page }) => {
    // Search button with data-testid in the topbar
    const searchButton = page.locator('[data-testid="topbar-search"]');
    await expect(searchButton).toBeVisible({ timeout: 10_000 });
  });
});
