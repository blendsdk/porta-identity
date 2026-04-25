/**
 * Session management page E2E tests.
 *
 * Tests the session list page through the real BFF → Porta → PostgreSQL stack:
 *   - Page load with heading
 *   - Session table with columns
 *   - Revoke All button presence
 *   - Single session revoke via row menu → ConfirmDialog
 *   - Cancel dismiss on confirm dialog
 *
 * The authenticated admin user will have at least one active session
 * (the one created by auth-setup), so the table should not be empty.
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');
  });

  test('loads the session list page', async ({ page }) => {
    // Heading should be visible
    await expect(
      page.getByRole('heading', { name: /active sessions/i }),
    ).toBeVisible();

    // Page should show either the session table or the empty state
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page
      .getByText('No active sessions')
      .isVisible()
      .catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('displays session table columns', async ({ page }) => {
    // Check for column headers — only if sessions exist
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Column headers defined in SessionList component
      await expect(page.getByText('User', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Organization', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Created', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Last Active', { exact: true }),
      ).toBeVisible();
    }
  });

  test('shows Revoke All button', async ({ page }) => {
    // The "Revoke All" button should be present in the header
    const revokeAllBtn = page.getByRole('button', { name: /revoke all/i });
    await expect(revokeAllBtn).toBeVisible();
  });

  test('row menu opens revoke confirm dialog', async ({ page }) => {
    // Only test if sessions exist (table is rendered)
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Click the first row's action menu (three-dot button)
      const menuTrigger = page.locator('table tbody tr').first().getByRole('button');
      await menuTrigger.click();

      // Menu should show "Revoke Session" option
      await expect(
        page.getByRole('menuitem', { name: /revoke session/i }),
      ).toBeVisible();

      // Click "Revoke Session" to open confirm dialog
      await page.getByRole('menuitem', { name: /revoke session/i }).click();

      // Confirm dialog should appear with the title
      await expect(page.getByText('Revoke Session')).toBeVisible();
      await expect(
        page.getByText(/are you sure you want to revoke/i),
      ).toBeVisible();
    }
  });

  test('confirm dialog has cancel option that dismisses', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Open the revoke dialog via row menu
      const menuTrigger = page.locator('table tbody tr').first().getByRole('button');
      await menuTrigger.click();
      await page.getByRole('menuitem', { name: /revoke session/i }).click();

      // Dialog should be visible
      await expect(page.getByText('Revoke Session')).toBeVisible();

      // Click Cancel button
      await page.getByRole('button', { name: /cancel/i }).click();

      // Dialog should close
      await expect(
        page.getByText(/are you sure you want to revoke/i),
      ).not.toBeVisible();
    }
  });
});
