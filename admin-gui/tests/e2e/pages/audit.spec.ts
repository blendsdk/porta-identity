/**
 * Audit Log page E2E tests.
 *
 * Tests the audit log page through the real BFF → Porta → PostgreSQL stack:
 *   - Page load with heading
 *   - Table columns when entries exist
 *   - Event type filter dropdown
 *   - Actor search input
 *   - Row expansion showing metadata
 *   - CSV export button
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');
  });

  test('loads the audit log page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /audit log/i }),
    ).toBeVisible();
  });

  test('displays table columns when entries exist', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      // Scope to table to avoid matching filter labels with same text
      const table = page.locator('table');
      await expect(table.getByText('Timestamp', { exact: true })).toBeVisible();
      await expect(table.getByText('Event', { exact: true })).toBeVisible();
      await expect(table.getByText('Actor', { exact: true })).toBeVisible();
      await expect(table.getByText('Entity', { exact: true })).toBeVisible();
      await expect(table.getByText('IP', { exact: true })).toBeVisible();
    }
  });

  test('shows event type filter dropdown', async ({ page }) => {
    // Filter section should have "Event Type" label and a select
    await expect(page.getByText('Event Type')).toBeVisible();
    // The Select has an "All events" default option
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
  });

  test('shows actor search input', async ({ page }) => {
    // Scope to main to avoid matching table column header
    await expect(page.locator('main').getByText('Actor').first()).toBeVisible();
    await expect(
      page.getByPlaceholder(/search by email/i),
    ).toBeVisible();
  });

  test('row click expands metadata details', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      const firstRow = page.locator('table tbody tr').first();
      // Click to expand
      await firstRow.click();

      // Expanded row should show JSON-formatted metadata or detail content
      await expect(
        page.locator('pre, [class*="expandedDetails"], [class*="metadata"]').first(),
      ).toBeVisible({ timeout: 5_000 }).catch(async () => {
        // Fallback: check for any JSON-like content in the expanded area
        await expect(page.locator('main').getByText(/"seeded"/).first()).toBeVisible({ timeout: 3_000 });
      });
    }
  });

  test('shows CSV export button', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export csv/i });
    await expect(exportBtn).toBeVisible();
  });
});
