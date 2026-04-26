/**
 * Client CRUD E2E tests.
 *
 * Tests creating, listing, and viewing OIDC clients through the
 * full BFF → Porta → PostgreSQL stack. Uses API interceptors for
 * request verification and entity factory for setup.
 *
 * Complements pages/clients.spec.ts with deeper verification:
 * - API request payloads (POST)
 * - Public vs confidential creation paths
 * - Validation errors (empty name, missing application)
 * - Seed data navigation via seedIds
 * - Overview tab data verification
 *
 * Seed data provides:
 *   - Acme SPA Client (public, seedIds.publicClientId)
 *   - Acme Backend Service (confidential, seedIds.confClientId)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Clients CRUD
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateTo,
  navigateToEntity,
  waitForTableLoaded,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Constants from seed data
// ---------------------------------------------------------------------------

const ACME_APP = 'Acme Customer Portal';
const SEEDED_CLIENTS = {
  publicClient: 'Acme SPA Client',
  confidentialClient: 'Acme Backend Service',
};

// ---------------------------------------------------------------------------
// Client CRUD Operations
// ---------------------------------------------------------------------------

test.describe('Client CRUD Operations', () => {
  test('creates a public client via wizard and verifies POST payload', async ({ page }) => {
    const clientName = `Crud Public ${Date.now()}`;

    await navigateTo(page, '/clients/new');

    // Step 1: Basic Info
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: ACME_APP }).click();
    await page.getByPlaceholder(/e\.g\./i).fill(clientName);
    // Public is the default type
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: OAuth Config — add redirect URI
    await page.getByPlaceholder(/https:\/\//i).first().fill('http://localhost:5000/callback');
    await page.getByRole('button', { name: /add/i }).first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: Security
    await page.getByRole('button', { name: /next/i }).click();

    // Step 4: Review & Create — capture POST
    await expect(page.getByText(clientName)).toBeVisible();
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/clients'),
      page.getByRole('button', { name: /create client/i }).click(),
    ]);

    // Verify POST payload
    expect(request.method).toBe('POST');
    const body = request.body as Record<string, unknown>;
    expect(body.clientName).toBe(clientName);
    expect(body.applicationId).toBeTruthy();
    // Public client should have tokenEndpointAuthMethod = 'none'
    expect(body.tokenEndpointAuthMethod).toBe('none');

    // Should show success
    await expect(page.getByText(/client created/i)).toBeVisible({ timeout: 10_000 });
  });

  test('creates a confidential client and shows one-time secret', async ({ page }) => {
    const clientName = `Crud Confidential ${Date.now()}`;

    await navigateTo(page, '/clients/new');

    // Step 1: Basic Info — select confidential type
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: ACME_APP }).click();
    await page.getByPlaceholder(/e\.g\./i).fill(clientName);
    await page.getByLabel(/confidential/i).click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: OAuth Config
    await page.getByPlaceholder(/https:\/\//i).first().fill('http://localhost:6000/auth/callback');
    await page.getByRole('button', { name: /add/i }).first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: Security
    await page.getByRole('button', { name: /next/i }).click();

    // Step 4: Create
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/clients'),
      page.getByRole('button', { name: /create client/i }).click(),
    ]);

    // Verify confidential-specific payload
    expect(request.method).toBe('POST');
    const body = request.body as Record<string, unknown>;
    expect(body.clientName).toBe(clientName);
    // Confidential should have client_secret_post auth method
    expect(body.tokenEndpointAuthMethod).toBe('client_secret_post');

    // Should show success with secret display
    await expect(page.getByText(/client created/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/save this/i)).toBeVisible({ timeout: 5_000 });
  });

  test('shows validation error for empty client name', async ({ page }) => {
    await navigateTo(page, '/clients/new');

    // Select application but leave name empty
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: ACME_APP }).click();

    // Try to proceed
    await page.getByRole('button', { name: /next/i }).click();

    // Should show name validation error
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('navigates to detail from list row click', async ({ page, seedIds }) => {
    await navigateTo(page, '/clients');
    await waitForTableLoaded(page);

    // Click on the public client (scoped to table)
    await page.locator('table').getByText(SEEDED_CLIENTS.publicClient).click();

    // Should navigate to the correct detail URL
    await expect(page).toHaveURL(new RegExp(`/clients/${seedIds.publicClientId}`));

    // Client name should be visible in the header
    await expect(page.locator('main').getByText(SEEDED_CLIENTS.publicClient).first()).toBeVisible();
  });

  test('shows correct data on Overview tab for public client', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'clients', seedIds.publicClientId);

    // Overview tab is default — verify key fields
    // Name
    await expect(page.locator('main').getByText(SEEDED_CLIENTS.publicClient).first()).toBeVisible();

    // Type badge (scope to main to avoid sidebar/header duplicates)
    await expect(page.locator('main').getByText('Public').first()).toBeVisible();

    // Status
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Application name
    await expect(page.getByText(ACME_APP)).toBeVisible();

    // Client ID should be displayed (monospace)
    await expect(page.getByText('Client ID')).toBeVisible();

    // Grant Types section
    await expect(page.getByText('Grant Types')).toBeVisible();

    // Redirect URIs section
    await expect(page.getByText('Redirect URIs')).toBeVisible();

    // Timestamps
    await expect(page.getByText(/Created/)).toBeVisible();
    await expect(page.getByText(/Updated/)).toBeVisible();
  });

  test('shows correct data on Overview tab for confidential client', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'clients', seedIds.confClientId);

    // Type badge should show Confidential (scope to main)
    await expect(page.locator('main').getByText('Confidential').first()).toBeVisible();

    // Status
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Confidential client should have Secrets tab
    await expect(page.getByRole('tab', { name: 'Secrets' })).toBeVisible();
  });

  test('public client does NOT have Secrets tab', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'clients', seedIds.publicClientId);

    // Public client should NOT have Secrets tab
    await expect(page.getByRole('tab', { name: 'Secrets' })).not.toBeVisible();
  });
});
