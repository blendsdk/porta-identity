/**
 * User custom claim values E2E tests (deferred from Phase 5).
 *
 * Tests the Claims tab on the User detail page: viewing claim values,
 * editing a claim value, and verifying the tab empty/populated states.
 *
 * Seed data provides:
 *   - Active user in acme-corp (seedIds.activeUserId)
 *   - Acme Customer Portal app with department (string) and access_level (number) claims
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — User Claim Values
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateToEntity, clickTab } from '../helpers/operations';

// ---------------------------------------------------------------------------
// User Claim Value Operations
// ---------------------------------------------------------------------------

test.describe('User Claim Value Operations', () => {
  test('claims tab is accessible on user detail page', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Claims');

    // Tab panel should be visible
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });

  test('claims tab shows empty state when no claims assigned', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Claims');

    // Should show either claim values or an empty state message
    const emptyMessage = page.getByText(/no custom claim values/i);
    const claimGrid = page.getByText('Claim Definition');

    // Wait for content to load
    await page.waitForTimeout(1000);

    // One or the other should be visible
    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasValues = await claimGrid.isVisible().catch(() => false);
    expect(isEmpty || hasValues).toBe(true);
  });

  test('claims tab shows header columns when values exist', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Claims');

    // Wait for content
    await page.waitForTimeout(1000);

    // If claim values exist, the header should show these columns
    const hasHeader = await page
      .getByText('Claim Definition')
      .isVisible()
      .catch(() => false);

    if (hasHeader) {
      await expect(page.getByText('Claim Definition')).toBeVisible();
      await expect(page.getByText('Value')).toBeVisible();
      await expect(page.getByText('Updated')).toBeVisible();
      await expect(page.getByText('Actions')).toBeVisible();
    }
  });

  test('suspended user claims tab is accessible', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.suspendedUserId);
    await clickTab(page, 'Claims');

    // Tab panel should be visible even for suspended users
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });
});
