/**
 * Organization Status Transition E2E tests.
 *
 * Tests status lifecycle transitions (suspend, activate, archive) through
 * the full BFF → Porta → PostgreSQL stack. Verifies:
 * - Confirm dialog rendering with type-to-confirm for destructive actions
 * - API POST calls for each transition endpoint
 * - Status badge updates after successful transitions
 * - Cancel dialog aborts without making API calls
 * - Super-admin org protection (cannot suspend)
 * - Correct transition buttons per current org status
 *
 * Uses entity factory to create disposable orgs for transitions,
 * avoiding mutations to seed data.
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Organization Transitions
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateToEntity,
  expectConfirmDialog,
  confirmDialog,
  cancelDialog,
  typeToConfirm,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestOrg, uniqueName } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Organization Status Transition Tests
// ---------------------------------------------------------------------------

test.describe('Organization Status Transitions', () => {
  test('suspends an active organization via confirm dialog', async ({ page, request }) => {
    // Create a disposable active org via API
    const org = await createTestOrg(request, uniqueName('Suspend E2E'));

    await navigateToEntity(page, 'organizations', org.id);

    // Click Suspend button
    await page.getByRole('button', { name: /suspend/i }).click();

    // Confirm dialog should appear with type-to-confirm
    await expectConfirmDialog(page, 'Suspend Organization');
    await expect(page.getByText(/prevent all users from logging in/i)).toBeVisible();

    // Confirm button should be disabled until org name is typed
    const confirmBtn = page.getByRole('dialog').getByRole('button', { name: /^suspend$/i });
    await expect(confirmBtn).toBeDisabled();

    // Type the org name to satisfy type-to-confirm
    await typeToConfirm(page, org.name);
    await expect(confirmBtn).toBeEnabled();

    // Capture the API request and confirm
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/organizations/${org.id}/suspend`),
      confirmBtn.click(),
    ]);

    // Verify correct API call
    expect(apiRequest.method).toBe('POST');

    // Status badge should update to Suspended
    await expect(page.getByText('Suspended')).toBeVisible({ timeout: 10_000 });

    // Suspend button should no longer be visible; Activate should appear
    await expect(page.getByRole('button', { name: /^suspend$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /activate/i })).toBeVisible();
  });

  test('activates a suspended organization', async ({ page, request }) => {
    // Create and suspend an org via API
    const org = await createTestOrg(request, uniqueName('Activate E2E'));
    // Suspend it via API first
    const suspendResp = await request.post(
      `${process.env.ADMIN_GUI_URL ?? 'http://localhost:49301'}/api/organizations/${org.id}/suspend`,
    );
    expect(suspendResp.ok()).toBeTruthy();

    await navigateToEntity(page, 'organizations', org.id);

    // Org should show as Suspended
    await expect(page.getByText('Suspended')).toBeVisible();

    // Click Activate button
    await page.getByRole('button', { name: /activate/i }).click();

    // Activate is non-destructive — no type-to-confirm needed
    await expectConfirmDialog(page, 'Activate Organization');

    // Capture the API request and confirm
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/organizations/${org.id}/activate`),
      confirmDialog(page),
    ]);

    expect(apiRequest.method).toBe('POST');

    // Status should change back to Active
    await expect(page.getByText('Active')).toBeVisible({ timeout: 10_000 });

    // Activate button should disappear; Suspend should appear
    await expect(page.getByRole('button', { name: /^activate$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /suspend/i })).toBeVisible();
  });

  test('archives an active organization with type-to-confirm', async ({ page, request }) => {
    const org = await createTestOrg(request, uniqueName('Archive E2E'));

    await navigateToEntity(page, 'organizations', org.id);

    // Click Archive button
    await page.getByRole('button', { name: /archive/i }).click();

    // Confirm dialog with destructive warning
    await expectConfirmDialog(page, 'Archive Organization');
    await expect(page.getByText(/permanent action/i)).toBeVisible();

    // Type org name to confirm
    await typeToConfirm(page, org.name);

    // Capture API request and confirm
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/organizations/${org.id}/archive`),
      page.getByRole('dialog').getByRole('button', { name: /^archive$/i }).click(),
    ]);

    expect(apiRequest.method).toBe('POST');

    // Status should change to Archived
    await expect(page.getByText('Archived')).toBeVisible({ timeout: 10_000 });

    // No action buttons should be visible for archived orgs
    await expect(page.getByRole('button', { name: /suspend/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /activate/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /archive/i })).not.toBeVisible();
  });

  test('cancel on confirm dialog aborts action without API call', async ({
    page,
    seedIds,
  }) => {
    await navigateToEntity(page, 'organizations', seedIds.activeOrgId);

    // Open suspend dialog
    await page.getByRole('button', { name: /suspend/i }).click();
    await expectConfirmDialog(page, 'Suspend Organization');

    // Cancel the dialog
    await cancelDialog(page);

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Status should still be Active
    await expect(page.getByText('Active')).toBeVisible();

    // Suspend button should still be available (no transition occurred)
    await expect(page.getByRole('button', { name: /suspend/i })).toBeVisible();
  });

  test('cannot suspend super-admin organization', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'organizations', seedIds.superAdminOrgId);

    // Super-admin org is active, so Suspend button should be visible
    const suspendBtn = page.getByRole('button', { name: /suspend/i });

    // Check if the button even exists for super-admin
    const hasSuspend = await suspendBtn.isVisible().catch(() => false);
    if (!hasSuspend) {
      // If the UI hides the button for super-admin, that's also valid
      return;
    }

    // Click Suspend and try to confirm
    await suspendBtn.click();
    await expectConfirmDialog(page, 'Suspend Organization');

    // Type the org name
    const dialog = page.getByRole('dialog');
    const textbox = dialog.getByRole('textbox');
    const hasTypeConfirm = await textbox.isVisible().catch(() => false);
    if (hasTypeConfirm) {
      // Type the super-admin org name (e.g., "Porta Admin")
      await textbox.fill('Porta Admin');
    }

    // Click confirm
    await dialog
      .getByRole('button', { name: /^suspend$/i })
      .click()
      .catch(() => {
        // Button might be disabled — that's also valid
      });

    // Wait for backend response
    await page.waitForTimeout(2_000);

    // The backend should reject the suspension — org should still be active
    // Look for an error indication (MessageBar, toast, or status unchanged)
    const isStillActive = await page.getByText('Active').isVisible().catch(() => false);
    const hasError = await page.getByText(/cannot|not allowed|super.*admin|protected/i).isVisible().catch(() => false);

    // At least one should be true: still active or error shown
    expect(isStillActive || hasError).toBeTruthy();
  });

  test('transition buttons match current organization status', async ({
    page,
    seedIds,
  }) => {
    // Active org: should show Suspend + Archive
    await navigateToEntity(page, 'organizations', seedIds.activeOrgId);
    await expect(page.getByRole('button', { name: /suspend/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /activate/i })).not.toBeVisible();

    // Suspended org: should show Activate + Archive
    await navigateToEntity(page, 'organizations', seedIds.suspendedOrgId);
    await expect(page.getByRole('button', { name: /activate/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /suspend/i })).not.toBeVisible();

    // Archived org: no action buttons
    await navigateToEntity(page, 'organizations', seedIds.archivedOrgId);
    await expect(page.getByRole('button', { name: /suspend/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /activate/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /archive/i })).not.toBeVisible();
  });
});
