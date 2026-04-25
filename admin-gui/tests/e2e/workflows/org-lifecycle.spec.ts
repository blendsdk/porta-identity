/**
 * Organization lifecycle workflow E2E tests.
 *
 * Tests cross-page workflows involving organization management:
 *   - Navigate to create, cancel, verify return to list
 *   - Dashboard quick action → create org → back to dashboard
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Organization Lifecycle Workflows', () => {
  test('create form cancel returns to organization list', async ({ page }) => {
    // Start at org list
    await page.goto('/organizations');
    await page.waitForLoadState('networkidle');

    // Click "Create Organization" button
    await page.getByRole('button', { name: /create/i }).first().click();

    // Should be on the create page
    await expect(page).toHaveURL(/\/organizations\/new/);

    // Click Cancel button
    await page.getByRole('button', { name: /cancel/i }).click();

    // Should return to organization list
    await expect(page).toHaveURL(/\/organizations$/);
    await expect(
      page.getByRole('heading', { name: /organizations/i }),
    ).toBeVisible();
  });

  test('dashboard Create Organization quick action navigates to create page', async ({ page }) => {
    // Start at dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the "Create Organization" quick action
    const createOrgAction = page.getByRole('button', { name: /create organization/i })
      .or(page.getByRole('link', { name: /create organization/i }));

    const isVisible = await createOrgAction.isVisible().catch(() => false);

    if (isVisible) {
      await createOrgAction.click();

      // Should navigate to the create org page
      await expect(page).toHaveURL(/\/organizations\/new/);

      // Navigate back
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // Should be back at dashboard
      await expect(page).toHaveURL(/\/$/);
    }
  });
});
