/**
 * Export/Import page E2E tests.
 *
 * Tests the data export and import pages through the real BFF → Porta stack:
 *   - Export page load with heading
 *   - Entity type checkboxes
 *   - Select All checkbox
 *   - Export JSON button
 *   - Import page load
 *   - Drag-and-drop / file upload zone
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Data Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import-export');
    await page.waitForLoadState('networkidle');
  });

  test('loads the export page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /export data/i }),
    ).toBeVisible();
  });

  test('displays entity type checkboxes', async ({ page }) => {
    // The export page has checkboxes for each entity type
    await expect(page.getByText('Organizations')).toBeVisible();
    await expect(page.getByText('Applications')).toBeVisible();
    await expect(page.getByText('Clients')).toBeVisible();
    await expect(page.getByText('Users')).toBeVisible();
  });

  test('has Select All checkbox', async ({ page }) => {
    await expect(
      page.getByText(/select all/i),
    ).toBeVisible();
  });

  test('shows Export JSON button', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export json/i });
    await expect(exportBtn).toBeVisible();
  });

  test('has Import Data navigation button', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: /import data/i });
    await expect(importBtn).toBeVisible();
  });
});

test.describe('Data Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import-export/import');
    await page.waitForLoadState('networkidle');
  });

  test('loads the import page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /import data/i }),
    ).toBeVisible();
  });
});
