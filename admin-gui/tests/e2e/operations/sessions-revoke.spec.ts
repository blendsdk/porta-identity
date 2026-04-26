/**
 * Session Management E2E tests.
 *
 * Tests the active sessions page including:
 * - Session list display (user, org, IP, created, last active, user agent)
 * - Auto-refresh indicator
 * - Single session revoke with confirm dialog
 * - Per-row context menu (revoke session, revoke all for user, revoke all for org)
 * - Bulk "Revoke All" with TypeToConfirm (type "REVOKE ALL")
 * - Pagination controls
 * - Empty state
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Sessions
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';

// ---------------------------------------------------------------------------
// Session Management Operations
// ---------------------------------------------------------------------------

test.describe('Session Management Operations', () => {
  test('displays page title and auto-refresh indicator', async ({ page }) => {
    await navigateTo(page, '/sessions');

    // Page title
    await expect(page.getByRole('heading', { name: 'Active Sessions' })).toBeVisible();

    // Auto-refresh indicator text
    await expect(page.getByText(/Auto-refreshes every 30s/)).toBeVisible();

    // "Revoke All" button
    await expect(page.getByRole('button', { name: /Revoke All/i })).toBeVisible();
  });

  test('displays session table with column headers', async ({ page }) => {
    await navigateTo(page, '/sessions');
    await page.waitForTimeout(2_000);

    // Check for sessions or empty state
    const hasSessions = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No active sessions').isVisible().catch(() => false);

    if (hasEmpty) {
      await expect(page.getByText('There are no active admin sessions')).toBeVisible();
      return;
    }

    // Table headers
    await expect(page.getByText('User')).toBeVisible();
    await expect(page.getByText('Organization')).toBeVisible();
    await expect(page.getByText('IP Address')).toBeVisible();
    await expect(page.getByText('Created')).toBeVisible();
    await expect(page.getByText('Last Active')).toBeVisible();
    await expect(page.getByText('User Agent')).toBeVisible();

    // At least one session row exists
    expect(hasSessions).toBeTruthy();
  });

  test('shows session row context menu with revoke options', async ({ page }) => {
    await navigateTo(page, '/sessions');
    await page.waitForTimeout(2_000);

    const hasSessions = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasSessions) {
      test.skip();
      return;
    }

    // Click the "more options" button (MoreHorizontalRegular icon) on first row
    const moreBtn = page.locator('table tbody tr').first().locator('button').last();
    await moreBtn.click();

    // Context menu should show three options
    await expect(page.getByRole('menuitem', { name: /Revoke Session/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Revoke All for User/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Revoke All for Org/i })).toBeVisible();
  });

  test('opens single session revoke dialog from context menu', async ({ page }) => {
    await navigateTo(page, '/sessions');
    await page.waitForTimeout(2_000);

    const hasSessions = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    if (!hasSessions) {
      test.skip();
      return;
    }

    // Open context menu on first row
    const moreBtn = page.locator('table tbody tr').first().locator('button').last();
    await moreBtn.click();

    // Click "Revoke Session"
    await page.getByRole('menuitem', { name: /Revoke Session/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText('Revoke Session')).toBeVisible();
    await expect(page.getByText(/Are you sure you want to revoke the session for/i)).toBeVisible();

    // Dialog should have Confirm and Cancel buttons
    await expect(page.getByRole('button', { name: /Confirm/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();

    // Cancel to close the dialog
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByText(/Are you sure you want to revoke the session for/i)).not.toBeVisible();
  });

  test('opens "Revoke All" dialog with TypeToConfirm', async ({ page }) => {
    await navigateTo(page, '/sessions');
    await page.waitForTimeout(2_000);

    const revokeAllBtn = page.getByRole('button', { name: /Revoke All/i });

    // Button may be disabled if no sessions exist
    const isDisabled = await revokeAllBtn.isDisabled();
    if (isDisabled) {
      return;
    }

    await revokeAllBtn.click();

    // Revoke ALL dialog with TypeToConfirm
    await expect(page.getByText('Revoke ALL Sessions')).toBeVisible();
    await expect(page.getByText(/ALL active sessions/i)).toBeVisible();

    // TypeToConfirm input
    const confirmInput = page.getByPlaceholder(/REVOKE ALL/i);
    await expect(confirmInput).toBeVisible();

    // Confirm button should be disabled until "REVOKE ALL" is typed
    const confirmBtn = page.getByRole('button', { name: /Confirm/i });
    await expect(confirmBtn).toBeDisabled();

    // Type the confirmation text
    await confirmInput.fill('REVOKE ALL');
    await page.waitForTimeout(300);
    await expect(confirmBtn).toBeEnabled();

    // Cancel instead of confirming
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByText('Revoke ALL Sessions')).not.toBeVisible();
  });

  test('pagination controls are present when data exists', async ({ page }) => {
    await navigateTo(page, '/sessions');
    await page.waitForTimeout(2_000);

    // Pagination may or may not be visible
    const firstBtn = page.getByRole('button', { name: 'First' });
    const nextBtn = page.getByRole('button', { name: 'Next Page' });
    const hasPagination = await firstBtn.isVisible().catch(() => false);

    if (hasPagination) {
      // First button disabled on first page
      await expect(firstBtn).toBeDisabled();
      await expect(nextBtn).toBeVisible();
    }
  });
});
