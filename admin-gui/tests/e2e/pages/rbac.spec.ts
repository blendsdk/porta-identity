/**
 * E2E tests for RBAC pages: Roles, Permissions, and Permission Matrix.
 *
 * Tests verify:
 * - Role list page with app filter and search
 * - Role detail page with overview, permissions, and users tabs
 * - Permission list page with app filter and search
 * - Permission detail page with overview and roles tabs
 * - Permission matrix visual grid
 *
 * Seed data provides:
 * - Acme Customer Portal app with 2 roles (Editor, Viewer)
 * - 3 permissions (Read Content, Write Content, Delete Content)
 * - Editor role has all 3 permissions, Viewer has only Read
 */

import { test, expect } from '../fixtures/admin-fixtures';

// Known seed data values
const TEST_APP_NAME = 'Acme Customer Portal';
const EDITOR_ROLE = 'Editor';
const VIEWER_ROLE = 'Viewer';
const READ_PERM = 'Read Content';
const WRITE_PERM = 'Write Content';
const DELETE_PERM = 'Delete Content';

// ─── Role List Page ─────────────────────────────────────────────────────────

test.describe('Role List', () => {
  test('should display the roles page with app filter', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    // Title should be visible
    await expect(page.getByText('Roles', { exact: true }).first()).toBeVisible();

    // App dropdown should be visible
    await expect(page.getByText('Select Application').first()).toBeVisible();
  });

  test('should show roles when an app is selected', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    // The app dropdown should auto-select the first app
    // Wait for data to load
    await page.waitForTimeout(1000);

    // If Acme Customer Portal is selected, we should see Editor and Viewer roles
    // Try selecting it explicitly
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(EDITOR_ROLE)).toBeVisible();
    await expect(page.getByText(VIEWER_ROLE)).toBeVisible();
  });

  test('should search roles by name', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    // Select the test app
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Search for Editor
    const searchInput = page.getByPlaceholder('Search roles...');
    await searchInput.fill('Editor');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(EDITOR_ROLE)).toBeVisible();
    // Viewer should not be visible with this search
  });

  test('should have a Create Role button', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /Create Role/i }),
    ).toBeVisible();
  });

  test('should navigate to role detail on row click', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    // Select the test app
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Click on the Editor role row
    await page.getByText(EDITOR_ROLE).click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/roles\/.+/);
  });
});

// ─── Role Detail Page ───────────────────────────────────────────────────────

test.describe('Role Detail', () => {
  test('should display role overview tab', async ({ page }) => {
    // Navigate via list to get appId in state
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(EDITOR_ROLE).click();
    await page.waitForLoadState('networkidle');

    // Overview tab should show role details
    await expect(page.getByText(EDITOR_ROLE).first()).toBeVisible();
    await expect(page.getByText('editor')).toBeVisible(); // slug
    await expect(page.getByText('Can create and edit content')).toBeVisible();
  });

  test('should show permissions tab with assigned permissions', async ({
    page,
  }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(EDITOR_ROLE).click();
    await page.waitForLoadState('networkidle');

    // Click Permissions tab
    await page.getByRole('tab', { name: 'Permissions' }).click();

    // Editor should have all 3 permissions visible
    await expect(page.getByText(READ_PERM)).toBeVisible();
    await expect(page.getByText(WRITE_PERM)).toBeVisible();
    await expect(page.getByText(DELETE_PERM)).toBeVisible();
  });

  test('should show users tab', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(EDITOR_ROLE).click();
    await page.waitForLoadState('networkidle');

    // Click Users tab
    await page.getByRole('tab', { name: 'Users' }).click();

    // Should show users section (may be empty for Editor role)
    await page.waitForTimeout(500);
    // The tab content should be visible
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });

  test('should show history tab', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(EDITOR_ROLE).click();
    await page.waitForLoadState('networkidle');

    // Click History tab
    await page.getByRole('tab', { name: 'History' }).click();

    // Tab panel should be visible
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });
});

// ─── Permission List Page ───────────────────────────────────────────────────

test.describe('Permission List', () => {
  test('should display the permissions page with app filter', async ({
    page,
  }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Permissions', { exact: true }).first(),
    ).toBeVisible();
  });

  test('should show permissions when an app is selected', async ({ page }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(READ_PERM)).toBeVisible();
    await expect(page.getByText(WRITE_PERM)).toBeVisible();
    await expect(page.getByText(DELETE_PERM)).toBeVisible();
  });

  test('should search permissions by name', async ({ page }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder('Search permissions...');
    await searchInput.fill('Read');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(READ_PERM)).toBeVisible();
  });

  test('should have a Create Permission button', async ({ page }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /Create Permission/i }),
    ).toBeVisible();
  });

  test('should navigate to permission detail on row click', async ({
    page,
  }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(READ_PERM).click();

    await expect(page).toHaveURL(/\/permissions\/.+/);
  });
});

// ─── Permission Detail Page ─────────────────────────────────────────────────

test.describe('Permission Detail', () => {
  test('should display permission overview', async ({ page }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(READ_PERM).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(READ_PERM).first()).toBeVisible();
    await expect(page.getByText('read-content')).toBeVisible(); // slug
    await expect(
      page.getByText('Permission to view content'),
    ).toBeVisible();
  });

  test('should show roles tab listing app roles', async ({ page }) => {
    await page.goto('/permissions');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(READ_PERM).click();
    await page.waitForLoadState('networkidle');

    // Click Roles tab
    await page.getByRole('tab', { name: 'Roles' }).click();

    // Should show the app's roles
    await expect(page.getByText(EDITOR_ROLE)).toBeVisible();
    await expect(page.getByText(VIEWER_ROLE)).toBeVisible();
  });
});

// ─── Permission Matrix Page ─────────────────────────────────────────────────

test.describe('Permission Matrix', () => {
  test('should display the matrix page with app selector', async ({
    page,
  }) => {
    await page.goto('/roles/matrix');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Permission Matrix', { exact: true }),
    ).toBeVisible();
  });

  test('should show the roles × permissions grid', async ({ page }) => {
    await page.goto('/roles/matrix');
    await page.waitForLoadState('networkidle');

    // Select the test app
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForTimeout(2000); // Wait for permission data to load

    // Should show role names in the grid
    await expect(page.getByText(EDITOR_ROLE)).toBeVisible();
    await expect(page.getByText(VIEWER_ROLE)).toBeVisible();

    // Should show permission column headers
    await expect(page.getByText(READ_PERM)).toBeVisible();
    await expect(page.getByText(WRITE_PERM)).toBeVisible();
    await expect(page.getByText(DELETE_PERM)).toBeVisible();
  });

  test('should show legend with role and permission counts', async ({
    page,
  }) => {
    await page.goto('/roles/matrix');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForTimeout(2000);

    // Legend should show counts
    await expect(page.getByText(/2 roles/)).toBeVisible();
    await expect(page.getByText(/3 permissions/)).toBeVisible();
  });
});
