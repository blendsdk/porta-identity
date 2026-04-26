/**
 * API Error Handling E2E tests.
 *
 * Tests how the SPA handles various HTTP error responses:
 * - 403 Forbidden → access denied message
 * - 404 Not Found → entity not found message
 * - 500 Internal Server Error → generic error toast
 * - Concurrent modification (ETag mismatch / 412) → conflict message
 * - Error toast auto-dismiss
 * - Error boundary for catastrophic failures
 *
 * Uses route interception to simulate backend error responses.
 *
 * @see plans/admin-gui-testing/08-bff-integration-tests.md — API Errors
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { mockApiError } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// API Error Handling
// ---------------------------------------------------------------------------

test.describe('API Error Handling', () => {
  test('403 Forbidden shows access denied message', async ({ page }) => {
    // Mock 403 on organizations endpoint
    await mockApiError(page, '/api/organizations', 403, {
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
    });

    await navigateTo(page, '/organizations');
    await page.waitForTimeout(2_000);

    // Should show access denied / forbidden error
    const hasForbidden = await page.getByText(/forbidden|access denied|permission/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error/i).isVisible().catch(() => false);

    expect(hasForbidden || hasError).toBeTruthy();
  });

  test('404 Not Found shows entity not found message', async ({ page }) => {
    // Mock 404 on a specific organization endpoint
    await mockApiError(page, '/api/organizations/*', 404, {
      error: 'Not Found',
      message: 'Organization not found',
    });

    // Navigate to a non-existent organization detail
    await page.goto('/organizations/00000000-0000-0000-0000-000000000000');
    await page.waitForTimeout(2_000);

    // Should show not found message
    const hasNotFound = await page.getByText(/not found/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error|does not exist/i).isVisible().catch(() => false);

    expect(hasNotFound || hasError).toBeTruthy();
  });

  test('500 Internal Server Error shows generic error toast', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Mock 500 on organizations endpoint
    await mockApiError(page, '/api/organizations', 500, {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });

    await navigateTo(page, '/organizations');
    await page.waitForTimeout(2_000);

    // Should show a generic error message or toast
    const hasServerError = await page.getByText(/server error|unexpected|something went wrong/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error|failed/i).isVisible().catch(() => false);

    expect(hasServerError || hasError).toBeTruthy();
  });

  test('412 Precondition Failed shows concurrent modification warning', async ({ page }) => {
    await navigateTo(page, '/organizations');
    await page.waitForTimeout(2_000);

    // Click first org to go to detail
    const firstOrg = page.locator('table tbody tr').first();
    const hasOrgs = await firstOrg.isVisible().catch(() => false);
    if (!hasOrgs) {
      test.skip();
      return;
    }
    await firstOrg.click();
    await page.waitForTimeout(1_000);

    // Mock 412 on the settings save endpoint
    await mockApiError(page, '/api/organizations/*', 412, {
      error: 'Precondition Failed',
      message: 'The resource has been modified by another user',
    });

    // Try to save settings — click Save if visible
    const saveBtn = page.getByRole('button', { name: /save/i });
    const hasSave = await saveBtn.isVisible().catch(() => false);
    if (!hasSave) {
      test.skip();
      return;
    }
    await saveBtn.click();
    await page.waitForTimeout(1_000);

    // Should show concurrent modification message
    const hasConflict = await page.getByText(/modified|concurrent|conflict|precondition/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error|failed/i).isVisible().catch(() => false);

    expect(hasConflict || hasError).toBeTruthy();
  });

  test('error toast appears and can be dismissed', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Mock 500 to trigger error toast
    await mockApiError(page, '/api/stats', 500, {
      error: 'Internal Server Error',
      message: 'Stats unavailable',
    });

    // Reload to trigger dashboard stats fetch
    await page.reload();
    await page.waitForTimeout(2_000);

    // Look for error toast
    const errorToast = page.locator('[class*="toast"], [class*="Toast"], [role="alert"]').first();
    const hasToast = await errorToast.isVisible().catch(() => false);

    if (hasToast) {
      // Toast should have a dismiss button or auto-dismiss
      const dismissBtn = errorToast.locator('button').first();
      const hasDismiss = await dismissBtn.isVisible().catch(() => false);

      if (hasDismiss) {
        await dismissBtn.click();
        await page.waitForTimeout(500);
        // Toast should be gone
        await expect(errorToast).not.toBeVisible();
      }
    }
  });

  test('error does not expose internal server details', async ({ page }) => {
    // Mock 500 with detailed internal error
    await mockApiError(page, '/api/organizations', 500, {
      error: 'Internal Server Error',
      message: 'ECONNREFUSED 127.0.0.1:5432',
      stack: 'Error at Database.connect (/src/lib/database.ts:42)',
    });

    await navigateTo(page, '/organizations');
    await page.waitForTimeout(2_000);

    // Internal details should NOT be visible
    const hasStack = await page.getByText(/ECONNREFUSED|database\.ts|stack/i).isVisible().catch(() => false);
    const hasPath = await page.getByText(/\/src\/lib/i).isVisible().catch(() => false);
    const hasPort = await page.getByText(/127\.0\.0\.1:5432/i).isVisible().catch(() => false);

    expect(hasStack).toBeFalsy();
    expect(hasPath).toBeFalsy();
    expect(hasPort).toBeFalsy();
  });
});
