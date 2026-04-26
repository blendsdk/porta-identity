/**
 * RBAC Permission CRUD E2E tests.
 *
 * Tests permission creation, list display, detail overview, roles tab,
 * archive with type-to-confirm, and API payload verification.
 *
 * Seed data provides:
 *   - Acme Customer Portal app (seedIds.testAppId) with:
 *     - 3 permissions: Read Content, Write Content, Delete Content
 *     - 2 roles: Editor (all perms), Viewer (read only)
 *
 * @see plans/admin-gui-testing/05-rbac-claims-e2e-tests.md
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestPermission, uniqueName } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_APP_NAME = 'Acme Customer Portal';
const READ_PERM = 'Read Content';
const WRITE_PERM = 'Write Content';
const DELETE_PERM = 'Delete Content';
const EDITOR_ROLE = 'Editor';
const VIEWER_ROLE = 'Viewer';

// ---------------------------------------------------------------------------
// Helper: select app and navigate to a permission detail
// ---------------------------------------------------------------------------

async function navigateToPermissionDetail(
  page: import('@playwright/test').Page,
  permName: string,
) {
  await navigateTo(page, '/permissions');

  const dropdown = page.locator('[role="combobox"]').first();
  await dropdown.click();
  await page.getByRole('option', { name: TEST_APP_NAME }).click();
  await page.waitForLoadState('networkidle');

  await page.getByText(permName).click();
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Permission CRUD Operations
// ---------------------------------------------------------------------------

test.describe('Permission CRUD Operations', () => {
  test('permission list shows all permissions for selected app', async ({ page }) => {
    await navigateTo(page, '/permissions');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(READ_PERM)).toBeVisible();
    await expect(page.getByText(WRITE_PERM)).toBeVisible();
    await expect(page.getByText(DELETE_PERM)).toBeVisible();
  });

  test('permission list search filters by name', async ({ page }) => {
    await navigateTo(page, '/permissions');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder('Search permissions...');
    await searchInput.fill('Read');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(READ_PERM)).toBeVisible();
  });

  test('creates a new permission via Create Permission button', async ({ page, seedIds }) => {
    await navigateTo(page, '/permissions');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Click Create Permission
    await page.getByRole('button', { name: /Create Permission/i }).click();
    await page.waitForLoadState('networkidle');

    // Should navigate to new permission page
    await expect(page).toHaveURL(/\/permissions\/new/);
  });

  test('permission detail overview shows name, slug, description', async ({ page }) => {
    await navigateToPermissionDetail(page, READ_PERM);

    await expect(page.getByText(READ_PERM).first()).toBeVisible();
    await expect(page.getByText('read-content')).toBeVisible(); // slug
    await expect(page.getByText('Permission to view content')).toBeVisible();
  });

  test('permission detail shows all 3 tabs', async ({ page }) => {
    await navigateToPermissionDetail(page, READ_PERM);

    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Roles' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  });

  test('permission roles tab lists app roles', async ({ page }) => {
    await navigateToPermissionDetail(page, READ_PERM);
    await clickTab(page, 'Roles');

    // Both roles should be visible (Read Content is assigned to both)
    await expect(page.getByText(EDITOR_ROLE)).toBeVisible();
    await expect(page.getByText(VIEWER_ROLE)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Permission Archive
// ---------------------------------------------------------------------------

test.describe('Permission Archive', () => {
  test('archives a permission with type-to-confirm dialog', async ({ page, request, seedIds }) => {
    const permName = uniqueName('Archive Perm');
    const perm = await createTestPermission(request, seedIds.testAppId, permName, 'To be archived');

    // Navigate to permission detail via list
    await navigateTo(page, '/permissions');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(permName).click();
    await page.waitForLoadState('networkidle');

    // Click Archive button
    const archiveButton = page.getByRole('button', { name: /archive/i });
    await expect(archiveButton).toBeVisible();
    await archiveButton.click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Archive Permission')).toBeVisible();

    // Confirm button disabled until type-to-confirm
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /archive/i });
    await expect(confirmButton).toBeDisabled();

    // Type the permission name
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill(permName);

    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });

    // Click confirm
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/applications/${seedIds.testAppId}/permissions/${perm.id}`),
      confirmButton.click(),
    ]);

    expect(apiRequest.method).toBe('DELETE');
  });

  test('cancel archive dialog does not change permission', async ({ page, request, seedIds }) => {
    const permName = uniqueName('Cancel Perm');
    await createTestPermission(request, seedIds.testAppId, permName);

    await navigateTo(page, '/permissions');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(permName).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /archive/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Archive button still visible
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible();
  });
});
