/**
 * Client secret management E2E tests.
 *
 * Tests the Secrets tab on confidential client detail pages:
 * generating new secrets (POST), revoking secrets, listing secrets,
 * and verifying that public clients have no Secrets tab.
 *
 * Secret operations:
 *   - Generate: POST /api/clients/{id}/secrets { label?, expiresAt? }
 *   - List: GET /api/clients/{id}/secrets
 *   - Revoke: POST /api/clients/{id}/secrets/{secretId}/revoke
 *
 * Seed data provides:
 *   - Acme Backend Service (confidential, seedIds.confClientId)
 *   - Acme SPA Client (public, seedIds.publicClientId)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Clients Secrets
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateToEntity, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestClient, uniqueName } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Client Secret Operations
// ---------------------------------------------------------------------------

test.describe('Client Secret Operations', () => {
  test('secrets tab shows generate form for confidential client', async ({
    page,
    seedIds,
  }) => {
    await navigateToEntity(page, 'clients', seedIds.confClientId);
    await clickTab(page, 'Secrets');

    // Generate form should be visible
    await expect(page.getByText(/generate new secret/i)).toBeVisible();

    // Label input and Generate button
    await expect(page.getByPlaceholder(/optional label/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();
  });

  test('generates a secret and verifies POST payload', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create a fresh confidential client
    const client = await createTestClient(
      request,
      seedIds.testAppId,
      uniqueName('Secret Gen'),
      { redirectUris: ['http://localhost:8000/callback'], isConfidential: true },
    );

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Secrets');

    // Fill in a label
    await page.getByPlaceholder(/optional label/i).fill('production-v1');

    // Capture the POST request
    const [req] = await Promise.all([
      captureApiRequest(page, `/api/clients/${client.id}/secrets`),
      page.getByRole('button', { name: /generate/i }).click(),
    ]);

    // Verify POST payload
    expect(req.method).toBe('POST');
    const body = req.body as Record<string, unknown>;
    expect(body.label).toBe('production-v1');

    // SecretDisplay should show the one-time secret
    await expect(page.getByText(/save this/i)).toBeVisible({ timeout: 10_000 });
  });

  test('generated secret appears in the secret list', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create a fresh confidential client and generate a secret via API
    const client = await createTestClient(
      request,
      seedIds.testAppId,
      uniqueName('Secret List'),
      { redirectUris: ['http://localhost:8001/callback'], isConfidential: true },
    );

    // Generate a secret via API
    const BFF_BASE_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';
    await request.post(`${BFF_BASE_URL}/api/clients/${client.id}/secrets`, {
      data: { label: 'test-label' },
    });

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Secrets');

    // The secret label should appear in the list
    await expect(page.getByText('test-label')).toBeVisible({ timeout: 10_000 });

    // Revoke button should be visible for the secret
    await expect(page.getByRole('button', { name: /revoke/i }).first()).toBeVisible();
  });

  test('revokes a secret with confirmation dialog', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create client and generate a secret
    const client = await createTestClient(
      request,
      seedIds.testAppId,
      uniqueName('Secret Revoke'),
      { redirectUris: ['http://localhost:8002/callback'], isConfidential: true },
    );

    const BFF_BASE_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';
    await request.post(`${BFF_BASE_URL}/api/clients/${client.id}/secrets`, {
      data: { label: 'revoke-me' },
    });

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Secrets');

    // Verify secret is listed
    await expect(page.getByText('revoke-me')).toBeVisible({ timeout: 10_000 });

    // Click the Revoke button on the secret row
    await page.getByRole('button', { name: /revoke/i }).first().click();

    // Confirmation dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Revoke Secret')).toBeVisible();

    // Confirm the revocation
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /revoke secret/i });
    await confirmButton.click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });

  test('revoked client disables generate form', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create a confidential client and revoke it
    const client = await createTestClient(
      request,
      seedIds.testAppId,
      uniqueName('Revoked Secrets'),
      { redirectUris: ['http://localhost:8003/callback'], isConfidential: true },
    );

    const BFF_BASE_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';
    await request.post(`${BFF_BASE_URL}/api/clients/${client.id}/revoke`);

    await navigateToEntity(page, 'clients', client.id);
    await clickTab(page, 'Secrets');

    // The generate form should NOT be visible for revoked clients
    await expect(page.getByText(/generate new secret/i)).not.toBeVisible();
  });
});
