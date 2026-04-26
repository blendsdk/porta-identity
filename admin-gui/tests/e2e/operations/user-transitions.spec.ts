/**
 * User status transition E2E tests.
 *
 * Tests the Status tab on the user detail page: status state machine
 * transitions (deactivate, activate, suspend, unlock), confirm dialogs,
 * type-to-confirm for destructive actions, and POST payload verification.
 *
 * Status state machine:
 *   active    → [deactivate, suspend]
 *   suspended → [activate]
 *   locked    → [unlock]
 *   inactive  → [activate]
 *
 * Destructive actions (suspend, deactivate) require TypeToConfirm
 * with the user's email address.
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Users Status
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateToEntity, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestUser } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// User Status Transition Operations
// ---------------------------------------------------------------------------

test.describe('User Status Transitions', () => {
  test('Status tab shows available actions for active user', async ({
    page,
    seedIds,
  }) => {
    await navigateToEntity(page, 'users', seedIds.testUserId);
    await clickTab(page, 'Status');

    // Active user should have Deactivate and Suspend actions
    await expect(page.getByRole('button', { name: /deactivate/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /suspend/i })).toBeVisible();

    // Should NOT have Activate or Unlock
    await expect(page.getByRole('button', { name: /^activate$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /unlock/i })).not.toBeVisible();
  });

  test('deactivates active user with type-to-confirm', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create a fresh user to deactivate
    const email = `deactivate-${Date.now()}@test.local`;
    const user = await createTestUser(request, seedIds.activeOrgId, email);

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Status');

    // Click Deactivate
    await page.getByRole('button', { name: /deactivate/i }).click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Deactivate User')).toBeVisible();
    await expect(page.getByText(/prevent them from logging in/i)).toBeVisible();

    // Confirm button should be disabled (type-to-confirm required)
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /deactivate/i });
    await expect(confirmButton).toBeDisabled();

    // Type the email to confirm
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill(email);

    // Now confirm should be enabled
    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });

    // Capture the POST
    const [req] = await Promise.all([
      captureApiRequest(page, `/api/organizations/${seedIds.activeOrgId}/users/${user.id}/deactivate`),
      confirmButton.click(),
    ]);

    expect(req.method).toBe('POST');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });

  test('suspends active user with type-to-confirm', async ({
    page,
    request,
    seedIds,
  }) => {
    const email = `suspend-${Date.now()}@test.local`;
    const user = await createTestUser(request, seedIds.activeOrgId, email);

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Status');

    // Click Suspend
    await page.getByRole('button', { name: /suspend/i }).click();

    // Dialog should appear with type-to-confirm
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Suspend User')).toBeVisible();
    await expect(page.getByText(/immediately prevent/i)).toBeVisible();

    // Type email to confirm
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill(email);

    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /suspend/i });
    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });

    const [req] = await Promise.all([
      captureApiRequest(page, `/api/organizations/${seedIds.activeOrgId}/users/${user.id}/suspend`),
      confirmButton.click(),
    ]);

    expect(req.method).toBe('POST');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });

  test('activates suspended user (no type-to-confirm)', async ({
    page,
    seedIds,
  }) => {
    // Use the seeded suspended user
    await navigateToEntity(page, 'users', seedIds.suspendedUserId);
    await clickTab(page, 'Status');

    // Suspended user should have Activate action
    await expect(page.getByRole('button', { name: /activate/i })).toBeVisible();

    // Should NOT have Deactivate or Suspend
    await expect(page.getByRole('button', { name: /deactivate/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /suspend/i })).not.toBeVisible();

    // Click Activate
    await page.getByRole('button', { name: /activate/i }).click();

    // Dialog should appear WITHOUT type-to-confirm (non-destructive)
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Activate User')).toBeVisible();
    await expect(page.getByText(/restore their ability/i)).toBeVisible();

    // Confirm button should be enabled immediately (no type-to-confirm)
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /activate/i });
    await expect(confirmButton).toBeEnabled();

    // Capture POST
    const [req] = await Promise.all([
      captureApiRequest(page, `/api/organizations/`),
      confirmButton.click(),
    ]);

    expect(req.method).toBe('POST');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });

  test('cancel deactivate dialog does not change status', async ({
    page,
    request,
    seedIds,
  }) => {
    const email = `cancel-deact-${Date.now()}@test.local`;
    const user = await createTestUser(request, seedIds.activeOrgId, email);

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Status');

    // Click Deactivate
    await page.getByRole('button', { name: /deactivate/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Cancel
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Deactivate button should still be available (status unchanged)
    await expect(page.getByRole('button', { name: /deactivate/i })).toBeVisible();
  });

  test('incomplete type-to-confirm keeps confirm button disabled', async ({
    page,
    request,
    seedIds,
  }) => {
    const email = `incomplete-${Date.now()}@test.local`;
    const user = await createTestUser(request, seedIds.activeOrgId, email);

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Status');

    // Click Suspend
    await page.getByRole('button', { name: /suspend/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Type only partial email
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill('wrong-email');

    // Confirm should still be disabled
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /suspend/i });
    await expect(confirmButton).toBeDisabled();

    // Cancel
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
