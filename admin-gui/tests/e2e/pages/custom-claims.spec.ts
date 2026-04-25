/**
 * E2E tests for Custom Claims pages: ClaimDefinitionList and ClaimDefinitionDetail.
 *
 * Tests verify:
 * - Claim definition list page with app filter and search
 * - Claim definition detail page with overview tab
 * - Value type badges and token inclusion indicators
 *
 * Seed data provides:
 * - Acme Customer Portal app with 2 claim definitions:
 *   - department (string, ID token + userinfo)
 *   - access_level (number, access token only)
 */

import { test, expect } from '../fixtures/admin-fixtures';

// Known seed data values
const TEST_APP_NAME = 'Acme Customer Portal';
const DEPT_CLAIM = 'department';
const LEVEL_CLAIM = 'access_level';

// ─── Claim Definition List Page ─────────────────────────────────────────────

test.describe('Claim Definition List', () => {
  test('should display the custom claims page with app filter', async ({
    page,
  }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Custom Claims', { exact: true }).first(),
    ).toBeVisible();

    // App dropdown should be visible
    await expect(page.getByText('Select Application').first()).toBeVisible();
  });

  test('should show claim definitions when an app is selected', async ({
    page,
  }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    // Select the test app
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Both claim definitions should be visible
    await expect(page.getByText(DEPT_CLAIM)).toBeVisible();
    await expect(page.getByText(LEVEL_CLAIM)).toBeVisible();
  });

  test('should display value type badges', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Type badges should be visible
    await expect(page.getByText('string')).toBeVisible();
    await expect(page.getByText('number')).toBeVisible();
  });

  test('should search claim definitions by name', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Search for department
    const searchInput = page.getByPlaceholder('Search claims...');
    await searchInput.fill('department');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(DEPT_CLAIM)).toBeVisible();
  });

  test('should have a Create Claim button', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /Create Claim/i }),
    ).toBeVisible();
  });

  test('should navigate to claim detail on row click', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Click on the department claim row
    await page.getByText(DEPT_CLAIM).click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/claims\/.+/);
  });
});

// ─── Claim Definition Detail Page ───────────────────────────────────────────

test.describe('Claim Definition Detail', () => {
  test('should display claim definition overview', async ({ page }) => {
    // Navigate via list to get appId in state
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(DEPT_CLAIM).click();
    await page.waitForLoadState('networkidle');

    // Overview should show claim details
    await expect(page.getByText(DEPT_CLAIM).first()).toBeVisible();
    await expect(page.getByText('Employee department')).toBeVisible();
    await expect(page.getByText('string')).toBeVisible();
  });

  test('should show token inclusion settings', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(DEPT_CLAIM).click();
    await page.waitForLoadState('networkidle');

    // Department claim: ID token = yes, access token = no, userinfo = yes
    await expect(page.getByText('Include in ID Token')).toBeVisible();
    await expect(page.getByText('Include in Access Token')).toBeVisible();
    await expect(page.getByText('Include in Userinfo')).toBeVisible();
  });

  test('should show history tab', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(DEPT_CLAIM).click();
    await page.waitForLoadState('networkidle');

    // Click History tab
    await page.getByRole('tab', { name: 'History' }).click();

    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });

  test('should have an Archive action button', async ({ page }) => {
    await page.goto('/claims');
    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(DEPT_CLAIM).click();
    await page.waitForLoadState('networkidle');

    // Archive button should be visible in the action bar
    await expect(
      page.getByRole('button', { name: /Archive/i }),
    ).toBeVisible();
  });
});
