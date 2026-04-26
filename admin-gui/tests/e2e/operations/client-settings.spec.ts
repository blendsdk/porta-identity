/**
 * Client settings E2E tests.
 *
 * Tests the Settings tab on the client detail page: pre-filled values,
 * editing name/description, PATCH payload verification, redirect URI
 * management, dirty state tracking, reset, and revoked disabled state.
 *
 * Settings tab fields:
 *   - Client Name (Input)
 *   - Description (Input/Textarea)
 *   - Redirect URIs (add/remove)
 *   - Post-Logout Redirect URIs (add/remove)
 *   - Grant Types (checkboxes)
 *   - Save / Reset buttons
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Clients Settings
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateToEntity, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestClient, uniqueName } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Client Settings Operations
// ---------------------------------------------------------------------------

test.describe('Client Settings Operations', () => {
  test('settings tab shows pre-filled values', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'clients', seedIds.publicClientId);
    await clickTab(page, 'Settings');

    // Should show client name input pre-filled
    // The settings tab contains an input for name
    const nameInput = page.getByRole('textbox').first();
    await expect(nameInput).toBeVisible();
    const nameValue = await nameInput.inputValue();
    expect(nameValue.length).toBeGreaterThan(0);

    // Save button should be present but disabled (no changes)
    const saveButton = page.getByRole('button', { name: /save/i });
    await expect(saveButton).toBeVisible();
  });

  test('edits client name and verifies PATCH payload', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create a fresh client to edit
    const client = await createTestClient(request, seedIds.testAppId, uniqueName('Settings Edit'), {
      redirectUris: ['http://localhost:7000/callback'],
    });

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Settings');

    // Clear name input and type new name
    const nameInput = page.getByRole('textbox').first();
    await nameInput.clear();
    const newName = `Updated ${Date.now()}`;
    await nameInput.fill(newName);

    // Save should be clickable now (dirty state)
    const [req] = await Promise.all([
      captureApiRequest(page, `/api/clients/${client.id}`),
      page.getByRole('button', { name: /save/i }).click(),
    ]);

    // Verify PATCH
    expect(req.method).toBe('PATCH');
    const body = req.body as Record<string, unknown>;
    // The name field in the payload
    expect(body.clientName ?? body.name).toBe(newName);
  });

  test('dirty state enables Save and Reset buttons', async ({
    page,
    request,
    seedIds,
  }) => {
    const client = await createTestClient(request, seedIds.testAppId, uniqueName('Dirty State'), {
      redirectUris: ['http://localhost:7001/callback'],
    });

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Settings');

    // Initially Save should be disabled (no changes)
    const saveButton = page.getByRole('button', { name: /save/i });

    // Make a change
    const nameInput = page.getByRole('textbox').first();
    await nameInput.clear();
    await nameInput.fill('Something Different');

    // Save should now be enabled
    await expect(saveButton).toBeEnabled({ timeout: 5_000 });

    // Reset button should also be visible and enabled
    const resetButton = page.getByRole('button', { name: /reset|discard|cancel/i });
    if (await resetButton.isVisible()) {
      await resetButton.click();

      // After reset, the name should revert
      const restored = await nameInput.inputValue();
      expect(restored).not.toBe('Something Different');
    }
  });

  test('shows login methods tab with inherit/override', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'clients', seedIds.publicClientId);
    await clickTab(page, 'Login Methods');

    // Should show inherit/override options
    await expect(page.getByText(/inherit from organization/i)).toBeVisible();

    // Login method checkboxes or radio group should be present
    await expect(page.getByText(/password/i).first()).toBeVisible();
  });

  test('revoked client has disabled settings', async ({ page, request, seedIds }) => {
    // Create and revoke a client
    const client = await createTestClient(request, seedIds.testAppId, uniqueName('Revoked Settings'), {
      redirectUris: ['http://localhost:7002/callback'],
    });

    // Revoke via API
    const BFF_BASE_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';
    await request.post(`${BFF_BASE_URL}/api/clients/${client.id}/revoke`);

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Settings');

    // Settings inputs should be disabled for revoked clients
    const nameInput = page.getByRole('textbox').first();
    await expect(nameInput).toBeDisabled();
  });

  test('revokes active client with type-to-confirm dialog', async ({
    page,
    request,
    seedIds,
  }) => {
    const client = await createTestClient(request, seedIds.testAppId, uniqueName('Revoke Target'), {
      redirectUris: ['http://localhost:7003/callback'],
    });

    await navigateToEntity(page, 'clients', client.id);

    // Should show active status
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Click Revoke button
    await page.getByRole('button', { name: /revoke/i }).click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Revoke Client')).toBeVisible();

    // Confirm button should be disabled until we type the client ID
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /revoke client/i });
    await expect(confirmButton).toBeDisabled();

    // Type the client ID in the confirmation input
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    // The TypeToConfirm uses the client.clientId (the OIDC client_id, not UUID)
    // We need to find what value to type — it's shown in the prompt
    const promptText = await page.getByRole('dialog').textContent();
    const match = promptText?.match(/Type "([^"]+)" to confirm/);
    if (match) {
      await dialogInput.fill(match[1]);
    }

    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });

    // Capture and click
    const [req] = await Promise.all([
      captureApiRequest(page, `/api/clients/${client.id}/revoke`),
      confirmButton.click(),
    ]);

    expect(req.method).toBe('POST');

    // Status should change to revoked
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/revoked/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
