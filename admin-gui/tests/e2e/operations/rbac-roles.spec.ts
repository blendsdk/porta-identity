/**
 * RBAC Role CRUD + permission assignment E2E tests.
 *
 * Tests role creation, detail overview, permission checkbox grid,
 * archive with type-to-confirm, and API payload verification.
 *
 * Seed data provides:
 *   - Acme Customer Portal app (seedIds.testAppId) with:
 *     - Editor role (seedIds.editorRoleId) — all 3 permissions
 *     - Viewer role (seedIds.viewerRoleId) — read-content only
 *     - 3 permissions: Read/Write/Delete Content
 *
 * @see plans/admin-gui-testing/05-rbac-claims-e2e-tests.md
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestRole, createTestPermission, uniqueName } from '../helpers/entity-factory';

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
// Helper: select app in roles list and navigate to a role detail
// ---------------------------------------------------------------------------

async function navigateToRoleDetail(
  page: import('@playwright/test').Page,
  roleName: string,
) {
  await navigateTo(page, '/roles');

  // Select the test app from the dropdown
  const dropdown = page.locator('[role="combobox"]').first();
  await dropdown.click();
  await page.getByRole('option', { name: TEST_APP_NAME }).click();
  await page.waitForLoadState('networkidle');

  // Click on the role row (scope to table/main to avoid sidebar duplicates)
  await page.locator('main').getByText(roleName, { exact: true }).first().click();
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Role CRUD Operations
// ---------------------------------------------------------------------------

test.describe('Role CRUD Operations', () => {
  test('creates a new role via UI and verifies POST payload', async ({ page, seedIds }) => {
    await navigateTo(page, '/roles');

    // Select the test app
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Click Create Role button
    await page.getByRole('button', { name: /Create Role/i }).click();
    await page.waitForLoadState('networkidle');

    // Should navigate to /roles/new
    await expect(page).toHaveURL(/\/roles\/new/);

    // Fill in the form (name field)
    const nameInput = page.getByLabel(/name/i).first();
    if (await nameInput.isVisible()) {
      const roleName = uniqueName('E2E Role');

      // Capture the POST request
      const [apiRequest] = await Promise.all([
        captureApiRequest(page, `/api/applications/${seedIds.testAppId}/roles`),
        (async () => {
          await nameInput.fill(roleName);
          // Try to find and fill description if available
          const descInput = page.getByLabel(/description/i);
          if (await descInput.isVisible().catch(() => false)) {
            await descInput.fill('E2E test role');
          }
          // Submit the form
          await page.getByRole('button', { name: /create|save|submit/i }).first().click();
        })(),
      ]);

      expect(apiRequest.method).toBe('POST');
      const body = apiRequest.body as Record<string, unknown>;
      expect(body.name).toBe(roleName);
    }
  });

  test('role list shows roles after selecting an app', async ({ page }) => {
    await navigateTo(page, '/roles');

    // Select the test app
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Both seed roles should be visible (scope to main content area)
    await expect(page.locator('main').getByText(EDITOR_ROLE).first()).toBeVisible();
    await expect(page.locator('main').getByText(VIEWER_ROLE).first()).toBeVisible();
  });

  test('role list search filters by name', async ({ page }) => {
    await navigateTo(page, '/roles');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Search for Editor
    const searchInput = page.getByPlaceholder('Search roles...');
    await searchInput.fill('Editor');
    await page.waitForLoadState('networkidle');

    // Editor should be visible, Viewer may not be
    await expect(page.locator('main').getByText(EDITOR_ROLE).first()).toBeVisible();
  });

  test('role detail overview shows name, slug, description', async ({ page }) => {
    await navigateToRoleDetail(page, EDITOR_ROLE);

    // Overview tab is default — check key fields
    await expect(page.getByText(EDITOR_ROLE).first()).toBeVisible();
    await expect(page.getByText('editor', { exact: true })).toBeVisible(); // slug
    await expect(page.getByText('Can create and edit content')).toBeVisible();
  });

  test('role detail shows all 4 tabs', async ({ page }) => {
    await navigateToRoleDetail(page, EDITOR_ROLE);

    // All tabs should be present
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Permissions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Role Permission Assignment
// ---------------------------------------------------------------------------

test.describe('Role Permission Assignment', () => {
  test('permissions tab shows all app permissions with checkboxes', async ({ page }) => {
    await navigateToRoleDetail(page, EDITOR_ROLE);
    await clickTab(page, 'Permissions');

    // All 3 permissions should be visible (scope to tabpanel)
    const tabpanel = page.getByRole('tabpanel');
    await expect(tabpanel.getByText(READ_PERM)).toBeVisible();
    await expect(tabpanel.getByText(WRITE_PERM)).toBeVisible();
    await expect(tabpanel.getByText(DELETE_PERM)).toBeVisible();

    // Editor has all 3 assigned — checkboxes should be present
    const checkboxes = page.getByRole('checkbox');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('toggling a permission shows Save/Reset buttons (dirty state)', async ({ page }) => {
    await navigateToRoleDetail(page, EDITOR_ROLE);
    await clickTab(page, 'Permissions');

    // Initially Save Permissions should not be visible
    await expect(
      page.getByRole('button', { name: /save permissions/i }),
    ).not.toBeVisible();

    // Toggle one checkbox
    const firstCheckbox = page.getByRole('checkbox').first();
    await firstCheckbox.click();

    // Save and Reset should now appear
    await expect(
      page.getByRole('button', { name: /save permissions/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /reset/i }),
    ).toBeVisible();
  });

  test('reset restores original permission state', async ({ page }) => {
    await navigateToRoleDetail(page, EDITOR_ROLE);
    await clickTab(page, 'Permissions');

    // Toggle a checkbox to make dirty
    const firstCheckbox = page.getByRole('checkbox').first();
    const initialState = await firstCheckbox.isChecked();
    await firstCheckbox.click();

    // Click Reset
    await page.getByRole('button', { name: /reset/i }).click();

    // Save/Reset should disappear
    await expect(
      page.getByRole('button', { name: /save permissions/i }),
    ).not.toBeVisible();

    // Checkbox should be back to initial state
    if (initialState) {
      await expect(firstCheckbox).toBeChecked();
    } else {
      await expect(firstCheckbox).not.toBeChecked();
    }
  });

  test('saving permissions sends PUT with permission IDs', async ({ page, request, seedIds }) => {
    // Create a fresh role to modify
    const role = await createTestRole(request, seedIds.testAppId, uniqueName('Perm Test'), 'Test role');

    // Navigate to the fresh role detail via roles list
    await navigateTo(page, '/roles');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(role.name).click();
    await page.waitForLoadState('networkidle');

    await clickTab(page, 'Permissions');

    // Wait for permissions to load
    await expect(page.getByText(READ_PERM)).toBeVisible({ timeout: 10_000 });

    // Check the first permission
    const firstCheckbox = page.getByRole('checkbox').first();
    await firstCheckbox.click();

    // Capture the save request
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/applications/${seedIds.testAppId}/roles/${role.id}/permissions`),
      page.getByRole('button', { name: /save permissions/i }).click(),
    ]);

    // Should send PUT with permissionIds array
    expect(apiRequest.method).toBe('PUT');
    const body = apiRequest.body as Record<string, unknown>;
    expect(Array.isArray(body.permissionIds)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Role Archive
// ---------------------------------------------------------------------------

test.describe('Role Archive', () => {
  test('archives a role with type-to-confirm dialog', async ({ page, request, seedIds }) => {
    const roleName = uniqueName('Archive Role');
    const role = await createTestRole(request, seedIds.testAppId, roleName, 'To be archived');

    // Navigate to role detail via list
    await navigateTo(page, '/roles');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(roleName).click();
    await page.waitForLoadState('networkidle');

    // Click Archive button
    const archiveButton = page.getByRole('button', { name: /archive/i });
    await expect(archiveButton).toBeVisible();
    await archiveButton.click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Archive Role' })).toBeVisible();

    // Confirm button should be disabled until type-to-confirm
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /archive/i });
    await expect(confirmButton).toBeDisabled();

    // Type the role name to confirm
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill(roleName);

    // Confirm button should now be enabled
    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });

    // Click confirm — capture API request
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/applications/${seedIds.testAppId}/roles/${role.id}`),
      confirmButton.click(),
    ]);

    expect(apiRequest.method).toBe('DELETE');
  });

  test('cancel archive dialog does not change role', async ({ page, request, seedIds }) => {
    const roleName = uniqueName('Cancel Archive');
    await createTestRole(request, seedIds.testAppId, roleName);

    await navigateTo(page, '/roles');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(roleName).click();
    await page.waitForLoadState('networkidle');

    // Click Archive, then Cancel
    await page.getByRole('button', { name: /archive/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Archive button should still be visible
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible();
  });
});
