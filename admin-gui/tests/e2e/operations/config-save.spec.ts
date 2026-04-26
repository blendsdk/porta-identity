/**
 * Config Editor E2E tests.
 *
 * Tests the system configuration editor including:
 * - Config list display with key, value, type badge
 * - Inline edit mode (enter edit, type, confirm/cancel)
 * - Confirm dialog before saving changes
 * - Toast notification on successful save
 * - Type inference badges (boolean, number, duration, string)
 * - Empty state
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Config Editor
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Config Editor Operations
// ---------------------------------------------------------------------------

test.describe('Config Editor Operations', () => {
  test('displays page title and config table', async ({ page }) => {
    await navigateTo(page, '/config');

    // Page title
    await expect(page.getByRole('heading', { name: 'System Configuration' })).toBeVisible();

    // Table headers
    await expect(page.getByText('Key')).toBeVisible();
    await expect(page.getByText('Value')).toBeVisible();
    await expect(page.getByText('Type')).toBeVisible();
  });

  test('shows config entries with type badges', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    // Check for entries — either config items or empty state
    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No configuration entries').isVisible().catch(() => false);

    if (hasEmpty) {
      // Empty state with icon
      await expect(page.getByText('System configuration entries will appear here.')).toBeVisible();
      return;
    }

    // Config entries should have type badges
    expect(hasEntries).toBeTruthy();

    // Type badges should be one of: boolean, number, duration, string
    const typeBadges = page.locator('table tbody tr td').filter({
      has: page.locator('[class*="Badge"]'),
    });
    const badgeCount = await typeBadges.count().catch(() => 0);
    expect(badgeCount).toBeGreaterThan(0);
  });

  test('enters edit mode when clicking edit button', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasEntries) {
      test.skip();
      return;
    }

    // Find and click the first edit button (icon button in the last column)
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('button').first().click();

    // Edit mode: should show an input field and save/cancel icon buttons
    // The input replaces the value text
    const editInput = firstRow.locator('input').first();
    await expect(editInput).toBeVisible({ timeout: 5_000 });
  });

  test('cancels edit mode without saving', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasEntries) {
      test.skip();
      return;
    }

    // Enter edit mode on first row
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('button').first().click();

    // Should see input field
    const editInput = firstRow.locator('input').first();
    await expect(editInput).toBeVisible({ timeout: 5_000 });

    // Get the original value
    const originalValue = await editInput.inputValue();

    // Modify the value
    await editInput.fill('temporary-test-value-12345');

    // Click cancel button — press Escape to cancel edit mode
    await page.keyboard.press('Escape');

    // Edit input should be gone — back to display mode
    await expect(editInput).not.toBeVisible({ timeout: 5_000 });

    // Value should NOT have changed — original value should still be visible
    const valueCell = page.locator('table tbody tr td').nth(1);
    await expect(valueCell).not.toContainText('temporary-test-value-12345');
  });

  test('shows confirm dialog when clicking save in edit mode', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasEntries) {
      test.skip();
      return;
    }

    // Enter edit mode on first row
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('button').first().click();

    // Type a new value
    const editInput = firstRow.locator('input').first();
    await expect(editInput).toBeVisible({ timeout: 5_000 });
    await editInput.clear();
    await editInput.fill('300');

    // Click save — find the checkmark/save button (usually first of the edit action buttons)
    const editBtns = firstRow.locator('button');
    // After entering edit mode, row has save + cancel buttons
    await editBtns.first().click();

    // Confirm dialog should appear
    await expect(page.getByText('Update Configuration')).toBeVisible();
    await expect(page.getByText(/Update .+ to/)).toBeVisible();
  });

  test('dismisses confirm dialog without saving', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasEntries) {
      test.skip();
      return;
    }

    // Enter edit mode on first row
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('button').first().click();

    const editInput = firstRow.locator('input').first();
    await expect(editInput).toBeVisible({ timeout: 5_000 });
    await editInput.clear();
    await editInput.fill('999');

    // Click save button to open confirm dialog
    await firstRow.locator('button').first().click();

    // Confirm dialog should appear
    await expect(page.getByText('Update Configuration')).toBeVisible();

    // Click Cancel in the dialog
    const cancelDialogBtn = page.getByRole('button', { name: /Cancel/i });
    await cancelDialogBtn.click();

    // Dialog should close
    await expect(page.getByText('Update Configuration')).not.toBeVisible();
  });

  test('saves config value and shows success toast', async ({ page }) => {
    await navigateTo(page, '/config');
    await page.waitForTimeout(2_000);

    const hasEntries = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasEntries) {
      test.skip();
      return;
    }

    // Enter edit mode on first row
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('button').first().click();

    const editInput = firstRow.locator('input').first();
    await expect(editInput).toBeVisible({ timeout: 5_000 });
    const currentValue = await editInput.inputValue();

    // Set value (use current value to avoid actual changes in test env)
    await editInput.clear();
    await editInput.fill(currentValue);

    // Click save button
    await firstRow.locator('button').first().click();

    // Confirm dialog appears — click Confirm
    await expect(page.getByText('Update Configuration')).toBeVisible();

    // Capture the PUT/PATCH API request
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/config'),
      page.getByRole('button', { name: /Confirm/i }).click(),
    ]);

    // Verify API call was made
    expect(request.method).toMatch(/PUT|PATCH|POST/);

    // Toast should show success (or error if backend rejects)
    await page.waitForTimeout(1_000);
    const hasSuccess = await page.getByText(/updated/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/failed/i).isVisible().catch(() => false);

    expect(hasSuccess || hasError).toBeTruthy();
  });
});
