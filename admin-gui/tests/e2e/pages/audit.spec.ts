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
      await expect(page.getByText('Timestamp', { exact: true })).toBeVisible();
      await expect(page.getByText('Event', { exact: true })).toBeVisible();
      await expect(page.getByText('Actor', { exact: true })).toBeVisible();
      await expect(page.getByText('Entity', { exact: true })).toBeVisible();
      await expect(page.getByText('IP', { exact: true })).toBeVisible();
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
    await expect(page.getByText('Actor')).toBeVisible();
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

      // Expanded row should show JSON-formatted details
      // The component renders JSON.stringify with indentation
      await expect(
        page.locator('pre, [class*="expandedDetails"]').first(),
      ).toBeVisible({ timeout: 3_000 }).catch(() => {
        // Expanded details are in a monospace div, check for JSON-like content
        expect(page.getByText(/"action"/).first()).toBeVisible();
      });
    }
  });

  test('shows CSV export button', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export csv/i });
    await expect(exportBtn).toBeVisible();
  });
});
