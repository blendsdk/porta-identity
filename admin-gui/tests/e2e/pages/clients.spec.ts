/**
 * Client pages E2E tests.
 *
 * Tests the complete client management flow through the real
 * BFF → Porta → PostgreSQL stack:
 *   - List page: renders seeded clients, search, filters (app/type/status)
 *   - Create wizard: 4-step form (basic info, OAuth, security, review + create)
 *   - Detail page: all tabs render, info displayed correctly
 *   - Status transitions: revoke with type-to-confirm
 *   - Secret management: secrets tab for confidential clients
 *
 * Seed data provides test clients:
 *   - Admin GUI BFF (E2E) — confidential, linked to Porta Admin app
 *   - Acme SPA Client — public, linked to Acme Customer Portal
 *   - Acme Backend Service — confidential, linked to Acme Customer Portal
 *
 * Tests are ordered: list → create → detail → revoke → secrets.
 * Tests that create new clients use unique names to avoid collisions.
 */

import { test, expect } from '../fixtures/admin-fixtures';

// ---------------------------------------------------------------------------
// Constants from seed data
// ---------------------------------------------------------------------------

/** Known client names from seed-data.ts */
const SEEDED_CLIENTS = {
  publicClient: 'Acme SPA Client',
  confidentialClient: 'Acme Backend Service',
  bffClient: 'Admin GUI BFF (E2E)',
};

/** Known application name for test clients */
const ACME_APP = 'Acme Customer Portal';

// ---------------------------------------------------------------------------
// Client List Tests
// ---------------------------------------------------------------------------

test.describe('Client List', () => {
  test('renders the client list page', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Page title should be visible
    await expect(page.getByText('Clients', { exact: false })).toBeVisible();

    // Create button should be present
    await expect(page.getByRole('button', { name: /create client/i })).toBeVisible();
  });

  test('displays seeded clients in the list', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // The seeded public client should appear
    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).toBeVisible();

    // The seeded confidential client should also appear
    await expect(page.getByText(SEEDED_CLIENTS.confidentialClient)).toBeVisible();
  });

  test('filters clients by search text', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Search for "SPA" — should find Acme SPA Client
    const searchInput = page.getByPlaceholder(/search clients/i);
    await searchInput.fill('SPA');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).toBeVisible();
    // Confidential client should not match
    await expect(page.getByText(SEEDED_CLIENTS.confidentialClient)).not.toBeVisible();
  });

  test('filters clients by type (public)', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Open type filter and select "Public"
    const typeDropdown = page.getByText('All Types');
    await typeDropdown.click();
    await page.getByRole('option', { name: 'Public' }).click();
    await page.waitForLoadState('networkidle');

    // Public client should be visible
    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).toBeVisible();

    // Confidential client should not be visible
    await expect(page.getByText(SEEDED_CLIENTS.confidentialClient)).not.toBeVisible();
  });

  test('filters clients by type (confidential)', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Open type filter and select "Confidential"
    const typeDropdown = page.getByText('All Types');
    await typeDropdown.click();
    await page.getByRole('option', { name: 'Confidential' }).click();
    await page.waitForLoadState('networkidle');

    // Confidential clients should be visible
    await expect(page.getByText(SEEDED_CLIENTS.confidentialClient)).toBeVisible();

    // Public client should not be visible
    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).not.toBeVisible();
  });

  test('navigates to client detail on row click', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Click on the seeded public client row
    await page.getByText(SEEDED_CLIENTS.publicClient).click();

    // Should navigate to the detail page
    await expect(page).toHaveURL(/\/clients\/[a-f0-9-]+/);

    // Client name should be in the header
    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Client Create Wizard Tests
// ---------------------------------------------------------------------------

test.describe('Client Create Wizard', () => {
  test('navigates to the create wizard', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create client/i }).click();
    await expect(page).toHaveURL('/clients/new');

    // Step 1 should be visible
    await expect(page.getByText('Application')).toBeVisible();
    await expect(page.getByText('Client Name')).toBeVisible();
  });

  test('validates step 1 required fields', async ({ page }) => {
    await page.goto('/clients/new');
    await page.waitForLoadState('networkidle');

    // Try to proceed without filling required fields
    await page.getByRole('button', { name: /next/i }).click();

    // Validation errors should appear
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('creates a public client end-to-end', async ({ page }) => {
    await page.goto('/clients/new');
    await page.waitForLoadState('networkidle');

    const uniqueName = `E2E Public Client ${Date.now()}`;

    // ── Step 1: Basic Info ──
    // Select application
    const appDropdown = page.getByText('Select an application');
    await appDropdown.click();
    await page.getByRole('option', { name: ACME_APP }).click();

    // Enter client name
    await page.getByPlaceholder(/e\.g\./i).fill(uniqueName);

    // Select public type (should be default or click Public radio)
    const publicRadio = page.getByLabel(/public/i);
    if (await publicRadio.isVisible()) {
      await publicRadio.click();
    }

    await page.getByRole('button', { name: /next/i }).click();

    // ── Step 2: OAuth Config ──
    // Add a redirect URI
    const uriInput = page.getByPlaceholder(/https:\/\//i).first();
    await uriInput.fill('http://localhost:5000/callback');
    await page.getByRole('button', { name: /add/i }).first().click();

    // Check authorization_code grant type (should be default)
    await page.getByRole('button', { name: /next/i }).click();

    // ── Step 3: Security ──
    await page.getByRole('button', { name: /next/i }).click();

    // ── Step 4: Review & Create ──
    // Should show summary with the client name
    await expect(page.getByText(uniqueName)).toBeVisible();

    // Click Create
    await page.getByRole('button', { name: /create client/i }).click();

    // Should show success with client ID
    await expect(page.getByText(/client created/i)).toBeVisible({ timeout: 10000 });
  });

  test('creates a confidential client and shows secret', async ({ page }) => {
    await page.goto('/clients/new');
    await page.waitForLoadState('networkidle');

    const uniqueName = `E2E Confidential Client ${Date.now()}`;

    // ── Step 1: Basic Info ──
    const appDropdown = page.getByText('Select an application');
    await appDropdown.click();
    await page.getByRole('option', { name: ACME_APP }).click();

    await page.getByPlaceholder(/e\.g\./i).fill(uniqueName);

    // Select confidential type
    const confRadio = page.getByLabel(/confidential/i);
    if (await confRadio.isVisible()) {
      await confRadio.click();
    }

    await page.getByRole('button', { name: /next/i }).click();

    // ── Step 2: OAuth Config ──
    const uriInput = page.getByPlaceholder(/https:\/\//i).first();
    await uriInput.fill('http://localhost:6000/auth/callback');
    await page.getByRole('button', { name: /add/i }).first().click();

    await page.getByRole('button', { name: /next/i }).click();

    // ── Step 3: Security ──
    await page.getByRole('button', { name: /next/i }).click();

    // ── Step 4: Review & Create ──
    await expect(page.getByText(uniqueName)).toBeVisible();
    await page.getByRole('button', { name: /create client/i }).click();

    // Should show success with secret display (confidential client)
    await expect(page.getByText(/client created/i)).toBeVisible({ timeout: 10000 });
    // SecretDisplay component shows "Save this" warning
    await expect(page.getByText(/save this/i)).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Client Detail Tests
// ---------------------------------------------------------------------------

test.describe('Client Detail', () => {
  test('displays the overview tab with correct info', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Navigate to the seeded public client
    await page.getByText(SEEDED_CLIENTS.publicClient).click();
    await page.waitForLoadState('networkidle');

    // Overview tab should be active by default
    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).toBeVisible();

    // Key info should be present
    await expect(page.getByText('Public')).toBeVisible(); // type badge
    await expect(page.getByText('active')).toBeVisible(); // status
    await expect(page.getByText(ACME_APP)).toBeVisible(); // application name
  });

  test('shows the settings tab with editable fields', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await page.getByText(SEEDED_CLIENTS.publicClient).click();
    await page.waitForLoadState('networkidle');

    // Click the Settings tab
    await page.getByRole('tab', { name: 'Settings' }).click();

    // Should show name input and redirect URI fields
    await expect(page.getByRole('textbox', { name: /client name/i })).toBeVisible();
  });

  test('shows the login methods tab', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await page.getByText(SEEDED_CLIENTS.publicClient).click();
    await page.waitForLoadState('networkidle');

    // Click the Login Methods tab
    await page.getByRole('tab', { name: 'Login Methods' }).click();

    // Should show inherit/override options
    await expect(page.getByText(/inherit from organization/i)).toBeVisible();
  });

  test('shows the history tab', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await page.getByText(SEEDED_CLIENTS.publicClient).click();
    await page.waitForLoadState('networkidle');

    // Click the History tab
    await page.getByRole('tab', { name: 'History' }).click();

    const content = page.locator('[role="tabpanel"]');
    await expect(content).toBeVisible();
  });

  test('confidential client shows secrets tab', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Navigate to the confidential client
    await page.getByText(SEEDED_CLIENTS.confidentialClient).click();
    await page.waitForLoadState('networkidle');

    // Should have a Secrets tab
    const secretsTab = page.getByRole('tab', { name: 'Secrets' });
    await expect(secretsTab).toBeVisible();

    // Click it and verify content
    await secretsTab.click();
    await expect(page.getByText(/generate new secret/i)).toBeVisible();
  });

  test('public client does NOT show secrets tab', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Navigate to the public client
    await page.getByText(SEEDED_CLIENTS.publicClient).click();
    await page.waitForLoadState('networkidle');

    // Should NOT have a Secrets tab
    const secretsTab = page.getByRole('tab', { name: 'Secrets' });
    await expect(secretsTab).not.toBeVisible();
  });

  test('loads client detail via direct URL', async ({ page }) => {
    // First get the client ID by navigating through the list
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await page.getByText(SEEDED_CLIENTS.publicClient).click();

    // Extract the URL with client ID
    await page.waitForURL(/\/clients\/[a-f0-9-]+/);
    const detailUrl = page.url();

    // Navigate directly to the detail URL
    await page.goto(detailUrl);
    await page.waitForLoadState('networkidle');

    // Client name should be visible
    await expect(page.getByText(SEEDED_CLIENTS.publicClient)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Client Status Transition Tests
// ---------------------------------------------------------------------------

test.describe('Client Status Transitions', () => {
  test('revokes an active client with type-to-confirm', async ({ page }) => {
    // First create a temporary client to revoke (don't modify seed data)
    await page.goto('/clients/new');
    await page.waitForLoadState('networkidle');

    const revokeName = `Revoke Target ${Date.now()}`;

    // Step 1: Basic Info
    const appDropdown = page.getByText('Select an application');
    await appDropdown.click();
    await page.getByRole('option', { name: ACME_APP }).click();
    await page.getByPlaceholder(/e\.g\./i).fill(revokeName);
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: OAuth Config — add redirect URI
    const uriInput = page.getByPlaceholder(/https:\/\//i).first();
    await uriInput.fill('http://localhost:9999/callback');
    await page.getByRole('button', { name: /add/i }).first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: Security
    await page.getByRole('button', { name: /next/i }).click();

    // Step 4: Create
    await page.getByRole('button', { name: /create client/i }).click();
    await expect(page.getByText(/client created/i)).toBeVisible({ timeout: 10000 });

    // Navigate to the client detail
    await page.getByRole('button', { name: /view client/i }).click();
    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 10000 });

    // Should be active
    await expect(page.getByText('active')).toBeVisible();

    // Click the Revoke button
    await page.getByRole('button', { name: /revoke/i }).click();

    // Revoke dialog should appear with type-to-confirm
    await expect(page.getByText('Revoke Client')).toBeVisible();

    // The confirm button should be disabled until we type the client ID
    const confirmButton = page.getByRole('button', { name: /revoke client/i }).last();
    await expect(confirmButton).toBeDisabled();

    // Type the client ID to confirm — find the placeholder hint
    const dialogInput = page.locator('[role="dialog"] input, dialog input').last();
    const placeholder = await dialogInput.getAttribute('placeholder');
    if (placeholder) {
      await dialogInput.fill(placeholder);
    }

    // Now the confirm button should be enabled
    await expect(confirmButton).toBeEnabled({ timeout: 5000 });
    await confirmButton.click();

    // After revoking, the status should change
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('revoked')).toBeVisible({ timeout: 10000 });
  });

  test('revoked client hides the revoke button', async ({ page }) => {
    // Create and revoke a client, then verify the button is hidden
    await page.goto('/clients/new');
    await page.waitForLoadState('networkidle');

    const name = `Already Revoked ${Date.now()}`;

    // Quick wizard pass-through
    const appDropdown = page.getByText('Select an application');
    await appDropdown.click();
    await page.getByRole('option', { name: ACME_APP }).click();
    await page.getByPlaceholder(/e\.g\./i).fill(name);
    await page.getByRole('button', { name: /next/i }).click();

    const uriInput = page.getByPlaceholder(/https:\/\//i).first();
    await uriInput.fill('http://localhost:8888/callback');
    await page.getByRole('button', { name: /add/i }).first().click();
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /create client/i }).click();
    await expect(page.getByText(/client created/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /view client/i }).click();
    await page.waitForURL(/\/clients\/[a-f0-9-]+/, { timeout: 10000 });

    // Revoke it
    await page.getByRole('button', { name: /revoke/i }).click();
    const dialogInput = page.locator('[role="dialog"] input, dialog input').last();
    const placeholder = await dialogInput.getAttribute('placeholder');
    if (placeholder) await dialogInput.fill(placeholder);
    await page.getByRole('button', { name: /revoke client/i }).last().click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('revoked')).toBeVisible({ timeout: 10000 });

    // Now the revoke button should NOT be visible
    await expect(page.getByRole('button', { name: /revoke/i })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Client Secret Management Tests
// ---------------------------------------------------------------------------

test.describe('Client Secret Management', () => {
  test('secrets tab shows generate form for confidential client', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Navigate to the confidential client
    await page.getByText(SEEDED_CLIENTS.confidentialClient).click();
    await page.waitForLoadState('networkidle');

    // Go to Secrets tab
    await page.getByRole('tab', { name: 'Secrets' }).click();

    // Should show the generate form
    await expect(page.getByText(/generate new secret/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();
  });
});
