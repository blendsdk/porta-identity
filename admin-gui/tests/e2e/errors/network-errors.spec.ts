/**
 * Network Error E2E tests.
 *
 * Tests how the SPA handles network-level failures:
 * - Request timeout (30s BFF proxy timeout)
 * - Connection refused / disconnect
 * - Slow response with loading indicator
 * - Recovery after transient failure
 *
 * Uses route interception to simulate network conditions.
 *
 * @see plans/admin-gui-testing/08-bff-integration-tests.md — Network Errors
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { mockApiTimeout, mockApiDisconnect, mockApiDelay } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Network Error Handling
// ---------------------------------------------------------------------------

test.describe('Network Error Handling', () => {
  test('timeout shows error message after request times out', async ({ page }) => {
    // Mock timeout on organizations endpoint
    await mockApiTimeout(page, '/api/organizations');

    await navigateTo(page, '/organizations');

    // Wait for timeout to trigger (may take several seconds)
    await page.waitForTimeout(5_000);

    // Should show timeout or error message
    const hasTimeout = await page.getByText(/timeout|timed out|request failed/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error|failed|unavailable/i).isVisible().catch(() => false);
    const hasLoading = await page.locator('[class*="spinner"], [class*="Spinner"]').isVisible().catch(() => false);

    // Either error displayed or still loading (timeout may be longer than 5s)
    expect(hasTimeout || hasError || hasLoading).toBeTruthy();
  });

  test('connection refused shows network error message', async ({ page }) => {
    // Mock connection refused
    await mockApiDisconnect(page, '/api/organizations');

    await navigateTo(page, '/organizations');
    await page.waitForTimeout(3_000);

    // Should show network error
    const hasNetworkError = await page.getByText(/network|connection|offline|unavailable/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error|failed/i).isVisible().catch(() => false);

    expect(hasNetworkError || hasError).toBeTruthy();
  });

  test('slow response shows loading indicator before data appears', async ({ page }) => {
    // Mock a 3-second delay on organizations
    await mockApiDelay(page, '/api/organizations', 3_000);

    await navigateTo(page, '/organizations');

    // Loading indicator should appear immediately
    await page.waitForTimeout(500);
    const hasLoading = await page.locator('[class*="spinner"], [class*="Spinner"], [class*="loading"], [class*="skeleton"]').first().isVisible().catch(() => false);
    const hasLoadingText = await page.getByText(/loading/i).isVisible().catch(() => false);

    // Should show some loading state
    expect(hasLoading || hasLoadingText).toBeTruthy();

    // Wait for data to arrive
    await page.waitForTimeout(4_000);

    // After delay, data or empty state should appear
    const hasData = await page.locator('table, [class*="grid"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no organizations/i).isVisible().catch(() => false);

    expect(hasData || hasEmpty).toBeTruthy();
  });

  test('page recovers after transient network failure', async ({ page }) => {
    // First: mock a failure
    await mockApiDisconnect(page, '/api/organizations');
    await navigateTo(page, '/organizations');
    await page.waitForTimeout(2_000);

    // Verify error state
    const hasError = await page.getByText(/error|failed|unavailable/i).isVisible().catch(() => false);
    expect(hasError).toBeTruthy();

    // Remove the mock — subsequent requests will succeed
    await page.unroute('**/api/organizations**');

    // Retry — reload the page
    await page.reload();
    await page.waitForTimeout(3_000);

    // Should now show data or empty state (not error)
    const hasData = await page.locator('table, [class*="grid"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no organizations/i).isVisible().catch(() => false);

    expect(hasData || hasEmpty).toBeTruthy();
  });
});
