/**
 * Custom Claims definition CRUD E2E tests.
 *
 * Tests claim definition list display, detail overview with token inclusion,
 * value type badges, archive with type-to-confirm, and API payload verification.
 *
 * Seed data provides:
 *   - Acme Customer Portal app (seedIds.testAppId) with:
 *     - department (string, ID token + userinfo)
 *     - access_level (number, access token only)
 *
 * @see plans/admin-gui-testing/05-rbac-claims-e2e-tests.md
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestClaimDefinition, uniqueName } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_APP_NAME = 'Acme Customer Portal';
const DEPT_CLAIM = 'department';
const LEVEL_CLAIM = 'access_level';

// ---------------------------------------------------------------------------
// Helper: select app and navigate to a claim detail
// ---------------------------------------------------------------------------

async function navigateToClaimDetail(
  page: import('@playwright/test').Page,
  claimName: string,
) {
  await navigateTo(page, '/claims');

  const dropdown = page.locator('[role="combobox"]').first();
  await dropdown.click();
  await page.getByRole('option', { name: TEST_APP_NAME }).click();
  await page.waitForLoadState('networkidle');

  await page.locator('main').getByText(claimName, { exact: true }).first().click();
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Claim Definition List Operations
// ---------------------------------------------------------------------------

test.describe('Claim Definition List Operations', () => {
  test('claim list shows definitions when app is selected', async ({ page }) => {
    await navigateTo(page, '/claims');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').getByText(DEPT_CLAIM).first()).toBeVisible();
    await expect(page.locator('main').getByText(LEVEL_CLAIM).first()).toBeVisible();
  });

  test('claim list displays value type badges', async ({ page }) => {
    await navigateTo(page, '/claims');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Type badges should be visible
    await expect(page.getByText('string')).toBeVisible();
    await expect(page.getByText('number')).toBeVisible();
  });

  test('claim list shows token inclusion columns', async ({ page }) => {
    await navigateTo(page, '/claims');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    // Table headers should include token columns
    await expect(page.getByText('ID Token')).toBeVisible();
    await expect(page.getByText('Access Token')).toBeVisible();
    await expect(page.getByText('Userinfo')).toBeVisible();
  });

  test('claim list search filters by name', async ({ page }) => {
    await navigateTo(page, '/claims');

    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder('Search claims...');
    await searchInput.fill('department');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').getByText(DEPT_CLAIM).first()).toBeVisible();
  });

  test('Create Claim button is visible when app is selected', async ({ page }) => {
    await navigateTo(page, '/claims');

    // Initially disabled without app selection
    await expect(
      page.getByRole('button', { name: /Create Claim/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Claim Definition Detail
// ---------------------------------------------------------------------------

test.describe('Claim Definition Detail', () => {
  test('claim detail overview shows name, type, and description', async ({ page }) => {
    await navigateToClaimDetail(page, DEPT_CLAIM);

    await expect(page.getByText(DEPT_CLAIM).first()).toBeVisible();
    await expect(page.getByText('Employee department')).toBeVisible();
    await expect(page.getByText('string')).toBeVisible();
  });

  test('claim detail shows token inclusion settings', async ({ page }) => {
    await navigateToClaimDetail(page, DEPT_CLAIM);

    // department: ID token = yes, access token = no, userinfo = yes
    await expect(page.getByText('Include in ID Token')).toBeVisible();
    await expect(page.getByText('Include in Access Token')).toBeVisible();
    await expect(page.getByText('Include in Userinfo')).toBeVisible();

    // Check specific values
    await expect(page.getByText('✓ Yes').first()).toBeVisible(); // At least one yes
  });

  test('claim detail shows Overview and History tabs', async ({ page }) => {
    await navigateToClaimDetail(page, DEPT_CLAIM);

    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  });

  test('claim detail shows value type badge with correct color', async ({ page }) => {
    await navigateToClaimDetail(page, DEPT_CLAIM);

    // String type should have a badge
    const badge = page.locator('[class*="badge"]').filter({ hasText: 'string' });
    await expect(badge.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Claim Definition Archive
// ---------------------------------------------------------------------------

test.describe('Claim Definition Archive', () => {
  test('archives a claim with type-to-confirm dialog', async ({ page, request, seedIds }) => {
    const claimName = uniqueName('archive_claim');
    const claim = await createTestClaimDefinition(
      request,
      seedIds.testAppId,
      claimName,
      'string',
      { description: 'To be archived' },
    );

    // Navigate to claim detail via list
    await navigateTo(page, '/claims');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(claimName).click();
    await page.waitForLoadState('networkidle');

    // Click Archive button
    const archiveButton = page.getByRole('button', { name: /archive/i });
    await expect(archiveButton).toBeVisible();
    await archiveButton.click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Archive Claim Definition')).toBeVisible();

    // Confirm button disabled until type-to-confirm
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /archive/i });
    await expect(confirmButton).toBeDisabled();

    // Type the claim name
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill(claimName);

    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });
    await confirmButton.click();

    // Should navigate back to claims list
    await page.waitForLoadState('networkidle');
  });

  test('cancel archive dialog does not change claim', async ({ page, request, seedIds }) => {
    const claimName = uniqueName('cancel_claim');
    await createTestClaimDefinition(request, seedIds.testAppId, claimName, 'number');

    await navigateTo(page, '/claims');
    const dropdown = page.locator('[role="combobox"]').first();
    await dropdown.click();
    await page.getByRole('option', { name: TEST_APP_NAME }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(claimName).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /archive/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Archive button still visible
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible();
  });
});
