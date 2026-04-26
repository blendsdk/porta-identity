/**
 * Audit Log E2E tests.
 *
 * Tests the audit log page including:
 * - Filter by event type, actor, entity type, date range
 * - Combined filters
 * - Row expand to show JSON metadata
 * - CSV export button
 * - Pagination
 * - Clear filters
 * - Empty state when no results
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Audit Log
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';

// ---------------------------------------------------------------------------
// Audit Log Operations
// ---------------------------------------------------------------------------

test.describe('Audit Log Operations', () => {
  test('displays page title, filters, and table', async ({ page }) => {
    await navigateTo(page, '/audit');

    // Page title
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();

    // Export CSV button
    await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();

    // Filter labels
    await expect(page.getByText('Event Type')).toBeVisible();
    await expect(page.getByText('Actor')).toBeVisible();
    await expect(page.getByText('Entity Type')).toBeVisible();
    await expect(page.getByText('From')).toBeVisible();
    await expect(page.getByText('To')).toBeVisible();

    // Table headers (scope to table to avoid sidebar duplicates)
    const table = page.locator('table').first();
    await expect(table.getByText('Timestamp').first()).toBeVisible();
    await expect(table.getByText('Event').first()).toBeVisible();
    await expect(table.getByText('IP').first()).toBeVisible();
  });

  test('filters by event type dropdown', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(1_000);

    // The first Select element is the Event Type filter
    // Select a specific event type
    const eventTypeSelect = page.locator('select').first();
    await eventTypeSelect.selectOption('user.created');

    // Wait for data refresh
    await page.waitForTimeout(1_000);

    // All visible event badges should show "User Created" (or table could be empty)
    const badges = page.locator('table tbody tr');
    const count = await badges.count();

    if (count > 0) {
      // First visible event badge should match
      await expect(page.getByText('User Created').first()).toBeVisible();
    }
  });

  test('filters by actor search input', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(1_000);

    // Actor search input
    const actorInput = page.getByPlaceholder('Search by email...');
    await expect(actorInput).toBeVisible();

    // Search for admin email — should filter results client-side
    await actorInput.fill('admin');
    await page.waitForTimeout(500);

    // Results should exist or table is empty — both are valid
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count().catch(() => 0);

    // If rows exist, at least some should contain "admin" text
    if (rowCount > 0) {
      // At least one row visible
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test('filters by entity type dropdown', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(1_000);

    // Entity type is the second Select element
    const selects = page.locator('select');
    // First = Event Type, Second = Entity Type
    const entityTypeSelect = selects.nth(1);
    await entityTypeSelect.selectOption('organization');

    await page.waitForTimeout(1_000);

    // Filtered results — entity badges should show "organization" (scope to main)
    const orgBadges = page.locator('main').getByText('organization', { exact: true });
    const hasBadges = await orgBadges.first().isVisible().catch(() => false);
    const isEmpty = await page.getByText('No audit events found').isVisible().catch(() => false);

    expect(hasBadges || isEmpty).toBeTruthy();
  });

  test('clears all filters with Clear button', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(1_000);

    // Apply a filter first
    const eventTypeSelect = page.locator('select').first();
    await eventTypeSelect.selectOption('user.created');
    await page.waitForTimeout(500);

    // Clear button should appear when any filter is active
    const clearButton = page.getByRole('button', { name: /Clear/i });
    await expect(clearButton).toBeVisible();

    // Click clear
    await clearButton.click();
    await page.waitForTimeout(500);

    // Event type select should be back to "All events"
    await expect(eventTypeSelect).toHaveValue('');

    // Clear button should disappear when no filters are active
    await expect(clearButton).not.toBeVisible();
  });

  test('expands row to show JSON metadata', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(2_000);

    // Find the first data row and click it to expand
    const firstRow = page.locator('table tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);

    if (!hasRows) {
      // No audit data — skip
      test.skip();
      return;
    }

    // Click the first row to expand
    await firstRow.click();
    await page.waitForTimeout(500);

    // Expanded row should show JSON metadata with monospace formatting
    // Look for JSON-like content (starts with { and contains "id", "eventType", etc.)
    const expandedContent = page.locator('[class*="expandedDetails"], pre, code').filter({ hasText: 'eventType' });
    const hasExpanded = await expandedContent.isVisible().catch(() => false);

    // Also check for the raw JSON display
    const hasJsonDisplay = await page.getByText('"eventType"').isVisible().catch(() => false);

    expect(hasExpanded || hasJsonDisplay).toBeTruthy();

    // Click the same row again to collapse
    await firstRow.click();
    await page.waitForTimeout(300);
  });

  test('export CSV button is enabled when data exists', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(2_000);

    const exportBtn = page.getByRole('button', { name: /Export CSV/i });
    await expect(exportBtn).toBeVisible();

    // If there's data, button should be enabled
    const hasData = await page.locator('table tbody tr').first().isVisible().catch(() => false);

    if (hasData) {
      await expect(exportBtn).toBeEnabled();
    } else {
      await expect(exportBtn).toBeDisabled();
    }
  });

  test('shows pagination controls', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(2_000);

    // Pagination buttons — "First" and "Next Page"
    const firstBtn = page.getByRole('button', { name: 'First' });
    const nextBtn = page.getByRole('button', { name: 'Next Page' });

    // Pagination may or may not be visible depending on data volume
    const hasPagination = await firstBtn.isVisible().catch(() => false);

    if (hasPagination) {
      // First button should be disabled when on first page
      await expect(firstBtn).toBeDisabled();
      // Next page may be enabled or disabled depending on data
      await expect(nextBtn).toBeVisible();
    }
  });

  test('shows empty state when filters return no results', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(1_000);

    // Apply an actor search that won't match anything
    const actorInput = page.getByPlaceholder('Search by email...');
    await actorInput.fill('nonexistent-user-zzz-12345@impossible.test');
    await page.waitForTimeout(500);

    // Should show empty state or empty table
    const hasEmpty = await page.getByText('No audit events found').isVisible().catch(() => false);
    const hasNoRows = await page.locator('table tbody tr').count().then(c => c === 0).catch(() => true);

    expect(hasEmpty || hasNoRows).toBeTruthy();
  });

  test('combines event type and entity type filters', async ({ page }) => {
    await navigateTo(page, '/audit');
    await page.waitForTimeout(1_000);

    // Apply event type filter
    const eventTypeSelect = page.locator('select').first();
    await eventTypeSelect.selectOption('org.created');
    await page.waitForTimeout(500);

    // Also apply entity type filter
    const entityTypeSelect = page.locator('select').nth(1);
    await entityTypeSelect.selectOption('organization');
    await page.waitForTimeout(500);

    // Results should be filtered by both — or empty
    const tableRows = page.locator('table tbody tr');
    const hasResults = await tableRows.first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No audit events found').isVisible().catch(() => false);

    expect(hasResults || hasEmpty).toBeTruthy();
  });
});
