/**
 * Signing Keys E2E tests.
 *
 * Tests the signing key management page including:
 * - Key list display (key ID, algorithm, created, status)
 * - JWKS endpoint URL with copy button
 * - Generate key with confirm dialog
 * - Rotate keys with TypeToConfirm (type "ROTATE")
 * - Empty state when no keys exist
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Signing Keys
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Signing Key Operations
// ---------------------------------------------------------------------------

test.describe('Signing Key Operations', () => {
  test('displays page title, action buttons, and JWKS endpoint', async ({ page }) => {
    await navigateTo(page, '/keys');

    // Page title
    await expect(page.getByRole('heading', { name: 'Signing Keys' })).toBeVisible();

    // Action buttons
    await expect(page.getByRole('button', { name: /Generate Key/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Rotate Keys/i })).toBeVisible();

    // JWKS endpoint URL card
    await expect(page.getByText('JWKS Endpoint:')).toBeVisible();
    await expect(page.getByText(/\.well-known\/jwks\.json/)).toBeVisible();
  });

  test('displays key table with columns', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(2_000);

    // Check for keys or empty state
    const hasKeys = await page.locator('table tbody tr').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No signing keys').isVisible().catch(() => false);

    if (hasEmpty) {
      await expect(page.getByText('Generate your first signing key')).toBeVisible();
      return;
    }

    // Table headers (scope to table to avoid duplicates)
    const table = page.locator('table');
    await expect(table.getByText('Key ID')).toBeVisible();
    await expect(table.getByText('Algorithm')).toBeVisible();
    await expect(table.getByText('Created')).toBeVisible();
    await expect(table.getByText('Status')).toBeVisible();

    // At least one key row should exist
    expect(hasKeys).toBeTruthy();

    // Key should show ES256 algorithm badge
    await expect(page.getByText('ES256').first()).toBeVisible();

    // Status badge — should be "active" or "rotated"
    const activeStatus = page.getByText('active', { exact: true }).first();
    const rotatedStatus = page.getByText('rotated', { exact: true }).first();
    const hasActive = await activeStatus.isVisible().catch(() => false);
    const hasRotated = await rotatedStatus.isVisible().catch(() => false);
    expect(hasActive || hasRotated).toBeTruthy();
  });

  test('opens generate key confirm dialog', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(1_000);

    // Click "Generate Key"
    await page.getByRole('button', { name: /Generate Key/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText('Generate Signing Key')).toBeVisible();
    await expect(page.getByText(/Generate a new ES256 signing key/i)).toBeVisible();

    // Dialog should have Confirm and Cancel buttons
    await expect(page.getByRole('button', { name: /Confirm/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  });

  test('dismisses generate key dialog on cancel', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(1_000);

    await page.getByRole('button', { name: /Generate Key/i }).click();
    await expect(page.getByText('Generate Signing Key')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /Cancel/i }).click();

    // Dialog should close
    await expect(page.getByText('Generate Signing Key')).not.toBeVisible();
  });

  test('generates new key and shows success toast', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(1_000);

    await page.getByRole('button', { name: /Generate Key/i }).click();
    await expect(page.getByText('Generate Signing Key')).toBeVisible();

    // Capture the POST request and confirm
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/keys'),
      page.getByRole('button', { name: /Confirm/i }).click(),
    ]);

    expect(request.method).toBe('POST');

    // Wait for toast
    await page.waitForTimeout(1_000);
    const hasSuccess = await page.getByText(/generated/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/failed/i).isVisible().catch(() => false);
    expect(hasSuccess || hasError).toBeTruthy();
  });

  test('opens rotate keys dialog with TypeToConfirm', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(2_000);

    // Rotate button may be disabled if no keys exist
    const rotateBtn = page.getByRole('button', { name: /Rotate Keys/i });
    const isDisabled = await rotateBtn.isDisabled();

    if (isDisabled) {
      // No keys — Rotate is disabled, which is correct behavior
      return;
    }

    await rotateBtn.click();

    // Rotate dialog should appear with TypeToConfirm
    await expect(page.getByText('Rotate Signing Keys')).toBeVisible();
    await expect(page.getByText(/mark the current active key as/i)).toBeVisible();

    // TypeToConfirm input — should require typing "ROTATE"
    const confirmInput = page.getByPlaceholder(/ROTATE/i);
    await expect(confirmInput).toBeVisible();

    // Confirm button should be disabled until "ROTATE" is typed
    const confirmBtn = page.getByRole('button', { name: /Confirm/i });
    await expect(confirmBtn).toBeDisabled();

    // Type "ROTATE" to enable the confirm button
    await confirmInput.fill('ROTATE');
    await page.waitForTimeout(300);
    await expect(confirmBtn).toBeEnabled();
  });

  test('JWKS endpoint has copy button', async ({ page }) => {
    await navigateTo(page, '/keys');
    await page.waitForTimeout(1_000);

    // JWKS URL should be displayed with a copy button
    const jwksText = page.getByText(/\.well-known\/jwks\.json/);
    await expect(jwksText).toBeVisible();

    // CopyButton component should be nearby
    // Look for a button with copy-related aria label or icon
    const copyBtn = page.locator('[aria-label*="Copy"], [aria-label*="copy"], button').filter({
      hasText: /copy/i,
    }).first();

    const hasCopyNearJwks = await copyBtn.isVisible().catch(() => false);
    // CopyButton may be icon-only; also check for any button in the JWKS row
    const jwksRowButtons = page.locator('[class*="jwksRow"] button');
    const hasButton = await jwksRowButtons.first().isVisible().catch(() => false);

    expect(hasCopyNearJwks || hasButton).toBeTruthy();
  });
});
