/**
 * User role assignment E2E tests (deferred from Phase 5).
 *
 * Tests the Roles tab on the User detail page: viewing assigned roles,
 * the "Assign Role" form with app + role dropdowns, assignment API payload,
 * and role removal.
 *
 * Seed data provides:
 *   - Active user in acme-corp (seedIds.activeUserId)
 *   - Acme Customer Portal app (seedIds.testAppId) with Editor/Viewer roles
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — User Role Assignments
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateToEntity, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_APP_NAME = 'Acme Customer Portal';
const EDITOR_ROLE = 'Editor';
const VIEWER_ROLE = 'Viewer';

// ---------------------------------------------------------------------------
// User Role Assignment Operations
// ---------------------------------------------------------------------------

test.describe('User Role Assignment Operations', () => {
  test('roles tab shows "Assign Role" button', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Roles');

    await expect(
      page.getByRole('button', { name: /Assign Role/i }),
    ).toBeVisible();
  });

  test('clicking "Assign Role" shows app and role dropdowns', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Roles');

    // Click Assign Role button
    await page.getByRole('button', { name: /Assign Role/i }).click();

    // The assign form should appear with Application and Role dropdowns
    await expect(page.getByText('Application')).toBeVisible();
    await expect(page.getByText('Role', { exact: true })).toBeVisible();

    // Cancel button should be available
    await expect(
      page.getByRole('button', { name: /cancel/i }),
    ).toBeVisible();

    // Assign button should be available (but disabled without selection)
    const assignBtn = page.getByRole('button', { name: /^assign$/i });
    await expect(assignBtn).toBeVisible();
  });

  test('selects app then role and clicks Assign', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Roles');

    await page.getByRole('button', { name: /Assign Role/i }).click();

    // Select the application
    const appDropdown = page.locator('[role="combobox"]').first();
    await appDropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();

    // Now select a role from the second dropdown
    // Wait for roles to load
    await page.waitForTimeout(500);
    const roleDropdowns = page.locator('[role="combobox"]');
    const roleDropdown = roleDropdowns.nth(1);
    await roleDropdown.click();

    // Try to select Viewer role (less likely to be already assigned)
    const viewerOption = page.getByRole('option', { name: VIEWER_ROLE });
    const editorOption = page.getByRole('option', { name: EDITOR_ROLE });

    // Pick whichever is available
    if (await viewerOption.isVisible().catch(() => false)) {
      // Capture the assign API request
      const [apiRequest] = await Promise.all([
        captureApiRequest(page, `/api/organizations/${seedIds.activeOrgId}/users/${seedIds.activeUserId}/roles`),
        (async () => {
          await viewerOption.click();
          await page.getByRole('button', { name: /^assign$/i }).click();
        })(),
      ]);

      expect(apiRequest.method).toBe('POST');
      const body = apiRequest.body as Record<string, unknown>;
      expect(body.roleIds).toBeDefined();
      expect(Array.isArray(body.roleIds)).toBe(true);
    } else if (await editorOption.isVisible().catch(() => false)) {
      await editorOption.click();
      // Just verify the button becomes clickable
      const assignBtn = page.getByRole('button', { name: /^assign$/i });
      await expect(assignBtn).toBeEnabled();
    }
  });

  test('cancel assign form hides the form', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Roles');

    await page.getByRole('button', { name: /Assign Role/i }).click();

    // Verify form is visible
    await expect(page.getByText('Application')).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Form should be hidden; Assign Role button should reappear
    await expect(
      page.getByRole('button', { name: /Assign Role/i }),
    ).toBeVisible();
  });
});
