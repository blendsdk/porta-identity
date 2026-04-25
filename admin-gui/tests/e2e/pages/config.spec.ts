/**
 * Configuration Editor page E2E tests.
 *
 * Tests the system configuration page through the real BFF → Porta → PostgreSQL stack:
 *   - Page load with heading
 *   - Config entries display with key/value/type columns
 *   - Edit button presence
 *   - Edit mode (inline input + save/cancel buttons)
 *   - Cancel edit restores original view
 *   - Save opens confirm dialog
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Configuration Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/config');
    await page.waitForLoadState('networkidle');
  });

  test('loads the configuration page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /system configuration/i }),
    ).toBeVisible();
  });

  test('displays config entries table', async ({ page }) => {
    // Should show table or empty state
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page
      .getByText('No configuration entries')
      .isVisible()
      .catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();

    if (hasTable) {
      await expect(page.getByText('Key', { exact: true })).toBeVisible();
      await expect(page.getByText('Value', { exact: true })).toBeVisible();
      await expect(page.getByText('Type', { exact: true })).toBeVisible();
    }
  });

  test('shows edit buttons for config entries', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Each row should have an edit button (icon button)
      const editButtons = page.locator('table tbody tr button');
      const count = await editButtons.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('clicking edit button enters edit mode', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Click the first edit button
      const firstEditBtn = page.locator('table tbody tr button').first();
      await firstEditBtn.click();

      // An input field should appear (inline edit)
      await expect(page.locator('table tbody input').first()).toBeVisible();
    }
  });

  test('cancel edit restores original view', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Enter edit mode
      const firstEditBtn = page.locator('table tbody tr button').first();
      await firstEditBtn.click();

      // Should see the input
      await expect(page.locator('table tbody input').first()).toBeVisible();

      // Click the dismiss/cancel button (the second small button in the edit row)
      // The edit row has: Input, Checkmark button (save), Dismiss button (cancel)
      const dismissBtn = page.locator('table tbody tr button').nth(1);
      await dismissBtn.click();

      // Input should no longer be visible
      await expect(page.locator('table tbody input')).not.toBeVisible();
    }
  });

  test('save button opens confirm dialog', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Enter edit mode
      const firstEditBtn = page.locator('table tbody tr button').first();
      await firstEditBtn.click();

      // Click the checkmark/save button (first button in the edit row)
      const saveBtn = page.locator('table tbody tr button').first();
      await saveBtn.click();

      // Confirm dialog should appear
      await expect(page.getByText('Update Configuration')).toBeVisible();
    }
  });
});
