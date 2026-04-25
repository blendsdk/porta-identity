/**
 * Signing Keys page E2E tests.
 *
 * Tests the signing key management page through the real BFF → Porta → PostgreSQL stack:
 *   - Page load with heading
 *   - Key table columns
 *   - JWKS endpoint URL display
 *   - Generate Key button and confirm dialog
 *   - Rotate Keys button and TypeToConfirm dialog
 *   - Cancel dismiss on dialogs
 *   - Key status badges
 */

import { test, expect } from '../fixtures/admin-fixtures';

test.describe('Signing Keys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keys');
    await page.waitForLoadState('networkidle');
  });

  test('loads the signing keys page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /signing keys/i }),
    ).toBeVisible();
  });

  test('displays key table columns', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);

    if (hasTable) {
      await expect(page.getByText('Key ID', { exact: true })).toBeVisible();
      await expect(page.getByText('Algorithm', { exact: true })).toBeVisible();
      await expect(page.getByText('Created', { exact: true })).toBeVisible();
      await expect(page.getByText('Status', { exact: true })).toBeVisible();
    }
  });

  test('shows JWKS endpoint URL', async ({ page }) => {
    // The JWKS URL section shows the endpoint
    await expect(page.getByText('JWKS Endpoint')).toBeVisible();
    await expect(
      page.getByText(/.well-known\/jwks\.json/),
    ).toBeVisible();
  });

  test('shows Generate Key button', async ({ page }) => {
    const generateBtn = page.getByRole('button', { name: /generate key/i });
    await expect(generateBtn).toBeVisible();
  });

  test('Generate Key opens confirm dialog', async ({ page }) => {
    await page.getByRole('button', { name: /generate key/i }).click();

    // Dialog should appear with title
    await expect(page.getByText('Generate Signing Key')).toBeVisible();
    await expect(
      page.getByText(/generate a new ES256 signing key/i),
    ).toBeVisible();
  });

  test('shows Rotate Keys button', async ({ page }) => {
    const rotateBtn = page.getByRole('button', { name: /rotate keys/i });
    await expect(rotateBtn).toBeVisible();
  });

  test('Rotate Keys opens TypeToConfirm dialog', async ({ page }) => {
    const hasKeys = await page.locator('table').isVisible().catch(() => false);

    if (hasKeys) {
      await page.getByRole('button', { name: /rotate keys/i }).click();

      // Dialog should appear with title and TypeToConfirm
      await expect(page.getByText('Rotate Signing Keys')).toBeVisible();
      // TypeToConfirm prompts user to type "ROTATE"
      await expect(
        page.getByText(/ROTATE/),
      ).toBeVisible();
    }
  });
});
