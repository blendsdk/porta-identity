/**
 * Permission Matrix E2E tests.
 *
 * Tests the visual roles × permissions matrix grid: app selection,
 * grid display, checkbox toggling, dirty state with Save/Reset,
 * and legend display.
 *
 * Seed data provides:
 *   - Acme Customer Portal app with:
 *     - 2 roles: Editor, Viewer
 *     - 3 permissions: Read/Write/Delete Content
 *     - Editor has all 3 permissions, Viewer has Read only
 *
 * @see plans/admin-gui-testing/05-rbac-claims-e2e-tests.md
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_APP_NAME = 'Acme Customer Portal';
const EDITOR_ROLE = 'Editor';
const VIEWER_ROLE = 'Viewer';
const READ_PERM = 'Read Content';
const WRITE_PERM = 'Write Content';
const DELETE_PERM = 'Delete Content';

// ---------------------------------------------------------------------------
// Helper: navigate to matrix and select app
// ---------------------------------------------------------------------------

async function navigateToMatrix(page: import('@playwright/test').Page) {
  await navigateTo(page, '/roles/matrix');

  // Select the test app
  const dropdown = page.locator('[role="combobox"]').first();
  await dropdown.click();
  await page.getByRole('option', { name: TEST_APP_NAME }).click();

  // Wait for permissions data to load (matrix fetches per-role permissions)
  await page.waitForTimeout(2000);
}

// ---------------------------------------------------------------------------
// Permission Matrix Operations
// ---------------------------------------------------------------------------

test.describe('Permission Matrix Operations', () => {
  test('displays the matrix page with app selector and title', async ({ page }) => {
    await navigateTo(page, '/roles/matrix');

    await expect(
      page.getByText('Permission Matrix', { exact: true }),
    ).toBeVisible();

    // App dropdown should be visible
    const dropdown = page.locator('[role="combobox"]').first();
    await expect(dropdown).toBeVisible();
  });

  test('shows roles as rows and permissions as columns', async ({ page }) => {
    await navigateToMatrix(page);

    // Role names should be visible in the table
    await expect(page.getByText(EDITOR_ROLE)).toBeVisible();
    await expect(page.getByText(VIEWER_ROLE)).toBeVisible();

    // Permission names should be visible as column headers
    await expect(page.getByText(READ_PERM)).toBeVisible();
    await expect(page.getByText(WRITE_PERM)).toBeVisible();
    await expect(page.getByText(DELETE_PERM)).toBeVisible();
  });

  test('displays legend with role and permission counts', async ({ page }) => {
    await navigateToMatrix(page);

    await expect(page.getByText(/2 roles/)).toBeVisible();
    await expect(page.getByText(/3 permissions/)).toBeVisible();
  });

  test('matrix contains checkboxes for each role-permission cell', async ({ page }) => {
    await navigateToMatrix(page);

    // With 2 roles × 3 permissions, there should be at least 6 checkboxes
    const checkboxes = page.getByRole('checkbox');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('toggling a checkbox shows Save/Reset buttons', async ({ page }) => {
    await navigateToMatrix(page);

    // Initially Save Changes should not be visible
    await expect(
      page.getByRole('button', { name: /save changes/i }),
    ).not.toBeVisible();

    // Toggle one checkbox
    const firstCheckbox = page.getByRole('checkbox').first();
    await firstCheckbox.click();

    // Save and Reset should appear
    await expect(
      page.getByRole('button', { name: /save changes/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /reset/i }),
    ).toBeVisible();
  });

  test('reset restores original matrix state', async ({ page }) => {
    await navigateToMatrix(page);

    // Toggle a checkbox
    const firstCheckbox = page.getByRole('checkbox').first();
    const initialState = await firstCheckbox.isChecked();
    await firstCheckbox.click();

    // Verify dirty state
    await expect(
      page.getByRole('button', { name: /save changes/i }),
    ).toBeVisible();

    // Click Reset
    await page.getByRole('button', { name: /reset/i }).click();

    // Save/Reset should disappear
    await expect(
      page.getByRole('button', { name: /save changes/i }),
    ).not.toBeVisible();

    // Checkbox should be back to original state
    if (initialState) {
      await expect(firstCheckbox).toBeChecked();
    } else {
      await expect(firstCheckbox).not.toBeChecked();
    }
  });

  test('switching apps reloads the matrix and clears dirty state', async ({ page }) => {
    await navigateToMatrix(page);

    // Toggle a checkbox to make dirty
    const firstCheckbox = page.getByRole('checkbox').first();
    await firstCheckbox.click();

    await expect(
      page.getByRole('button', { name: /save changes/i }),
    ).toBeVisible();

    // Switch to a different app (if available) or back to the same
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();

    // Re-select the same app (this should reset)
    const options = page.getByRole('option');
    const optionCount = await options.count();
    if (optionCount > 1) {
      // Select a different app
      await options.nth(1).click();
      await page.waitForTimeout(1000);

      // Dirty state should be cleared
      await expect(
        page.getByRole('button', { name: /save changes/i }),
      ).not.toBeVisible();
    }
  });
});
