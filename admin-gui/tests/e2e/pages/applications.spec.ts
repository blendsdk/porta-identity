/**
 * Application pages E2E tests.
 *
 * Tests the complete application management flow through the real
 * BFF → Porta → PostgreSQL stack:
 *   - List page: renders seeded apps, search, status filter, org filter
 *   - Create page: form submission, validation, new app appears in list
 *   - Detail page: all 8 tabs render, info displayed correctly
 *   - Status transitions: archive with type-to-confirm
 *
 * Seed data provides 3 applications:
 *   - Porta Admin (super admin app, linked to porta-admin org)
 *   - Acme Customer Portal (active, linked to acme-corp)
 *   - Legacy Dashboard (archived, linked to acme-corp)
 *
 * Tests are ordered: list → create → detail → status transitions.
 * Tests that create new apps use unique names to avoid collisions.
 */

import { test, expect } from '../fixtures/admin-fixtures';

// ---------------------------------------------------------------------------
// Constants from seed data
// ---------------------------------------------------------------------------

/** Known application names from seed-data.ts */
const SEEDED_APPS = {
  adminApp: 'Porta Admin',
  active: 'Acme Customer Portal',
  archived: 'Legacy Dashboard',
};

/** Known organization name for the active test apps */
const ACME_ORG = 'Acme Corporation';

// ---------------------------------------------------------------------------
// Application List Tests
// ---------------------------------------------------------------------------

test.describe('Application List', () => {
  test('renders the application list page', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Create button should be present (verifies page loaded)
    await expect(page.getByRole('button', { name: /create application/i })).toBeVisible();

    // Page title should be visible (scoped to main to avoid sidebar/breadcrumb matches)
    await expect(page.locator('main').getByText('Applications').first()).toBeVisible();
  });

  test('displays seeded applications in the list', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // The seeded active application should appear (scoped to table to avoid sidebar matches)
    await expect(page.locator('table').getByText(SEEDED_APPS.active)).toBeVisible();

    // The admin application should also appear (scoped to table — 'Porta Admin' also in topbar)
    await expect(page.locator('table').getByText(SEEDED_APPS.adminApp)).toBeVisible();
  });

  test('filters applications by search text', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Search for "Customer" — should find Acme Customer Portal
    const searchInput = page.getByPlaceholder(/search applications/i);
    await searchInput.fill('Customer');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('table').getByText(SEEDED_APPS.active)).toBeVisible();
    // Admin app should not match the search (scoped to table — brand name stays in topbar)
    await expect(page.locator('table').getByText(SEEDED_APPS.adminApp)).not.toBeVisible();
  });

  test('filters applications by status', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Open the status dropdown and select "Archived"
    const statusDropdown = page.getByText('All Statuses');
    await statusDropdown.click();
    await page.getByRole('option', { name: 'Archived' }).click();
    await page.waitForLoadState('networkidle');

    // Archived app should be visible
    await expect(page.getByText(SEEDED_APPS.archived)).toBeVisible();

    // Active apps should not be visible
    await expect(page.getByText(SEEDED_APPS.active)).not.toBeVisible();
  });

  test('navigates to application detail on row click', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Click on the seeded active application row (scoped to table)
    await page.locator('table').getByText(SEEDED_APPS.active).click();

    // Should navigate to the detail page
    await expect(page).toHaveURL(/\/applications\/[a-f0-9-]+/);

    // Application name should be in the header (scoped to main, skip sidebar)
    await expect(page.locator('main').getByText(SEEDED_APPS.active).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Application Create Tests
// ---------------------------------------------------------------------------

test.describe('Application Create', () => {
  test('navigates to the create form', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create application/i }).click();
    await expect(page).toHaveURL('/applications/new');

    // Form fields should be present (scoped to main to avoid sidebar matches)
    await expect(page.locator('main').getByText('Application Name')).toBeVisible();
    await expect(page.locator('main').getByText('Organization', { exact: true })).toBeVisible();
    await expect(page.locator('main').getByText('Slug')).toBeVisible();
    await expect(page.locator('main').getByText('Description')).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/applications/new');
    await page.waitForLoadState('networkidle');

    // Click Create without filling in required fields
    await page.getByRole('button', { name: /create application/i }).click();

    // Validation errors should appear for name and organization
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Organization is required')).toBeVisible();
  });

  test('creates a new application successfully', async ({ page }) => {
    await page.goto('/applications/new');
    await page.waitForLoadState('networkidle');

    // Generate a unique name to avoid collisions with other test runs
    const uniqueName = `E2E Test App ${Date.now()}`;

    // Select organization — click dropdown, then select Acme Corporation
    const orgDropdown = page.getByText('Select an organization');
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Fill in the name
    await page.getByPlaceholder('e.g. Customer Portal').fill(uniqueName);

    // Add a description
    await page.getByPlaceholder(/brief description/i).fill('E2E test application');

    // Submit the form
    await page.getByRole('button', { name: /create application/i }).click();

    // Should redirect to the detail page of the new application
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await expect(page.getByText(uniqueName)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Application Detail Tests
// ---------------------------------------------------------------------------

test.describe('Application Detail', () => {
  test('displays the overview tab with correct info', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Navigate to the seeded active application (scoped to table)
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Overview tab should be active by default
    await expect(page.locator('main').getByText(SEEDED_APPS.active).first()).toBeVisible();

    // Key info should be present
    await expect(page.locator('main').getByText('acme-customer-portal')).toBeVisible(); // slug
    await expect(page.locator('main').getByText(ACME_ORG)).toBeVisible(); // org name
    await expect(page.getByText(/active/i).first()).toBeVisible(); // status (StatusBadge capitalizes)
  });

  test('shows the settings tab with editable fields', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the Settings tab
    await page.getByRole('tab', { name: 'Settings' }).click();

    // Should show name input (FluentUI Label not associated via htmlFor — check by placeholder)
    await expect(page.getByPlaceholder('e.g. Customer Portal')).toBeVisible();
  });

  test('shows the modules tab with toggle switches', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the Modules tab
    await page.getByRole('tab', { name: 'Modules' }).click();

    // Known module types should be listed
    await expect(page.getByText('Authentication')).toBeVisible();
    await expect(page.getByText('RBAC')).toBeVisible();
    await expect(page.getByText('Custom Claims')).toBeVisible();
    await expect(page.getByText('Two-Factor Auth')).toBeVisible();
  });

  test('shows the clients tab', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the Clients tab
    await page.getByRole('tab', { name: 'Clients' }).click();

    // Should show either client list or empty state
    const content = page.locator('[role="tabpanel"]');
    await expect(content).toBeVisible();
  });

  test('shows the roles tab', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the Roles tab
    await page.getByRole('tab', { name: 'Roles' }).click();

    // Should show either role list or empty state
    const content = page.locator('[role="tabpanel"]');
    await expect(content).toBeVisible();
  });

  test('shows the permissions tab', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the Permissions tab
    await page.getByRole('tab', { name: 'Permissions' }).click();

    const content = page.locator('[role="tabpanel"]');
    await expect(content).toBeVisible();
  });

  test('shows the claims tab', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the Claims tab
    await page.getByRole('tab', { name: 'Claims' }).click();

    const content = page.locator('[role="tabpanel"]');
    await expect(content).toBeVisible();
  });

  test('shows the history tab', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');
    await page.locator('table').getByText(SEEDED_APPS.active).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Click the History tab
    await page.getByRole('tab', { name: 'History' }).click();

    const content = page.locator('[role="tabpanel"]');
    await expect(content).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Application Status Transition Tests
// ---------------------------------------------------------------------------

test.describe('Application Status Transitions', () => {
  test('archives an active application with type-to-confirm', async ({ page }) => {
    // First create a temporary application to archive (don't modify seed data)
    await page.goto('/applications/new');
    await page.waitForLoadState('networkidle');

    const archiveName = `Archive Target ${Date.now()}`;
    const expectedSlug = archiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Select organization
    const orgDropdown = page.getByText('Select an organization');
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Fill name
    await page.getByPlaceholder('e.g. Customer Portal').fill(archiveName);

    // Create
    await page.getByRole('button', { name: /create application/i }).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 });

    // Should be on the detail page with active status
    await expect(page.getByText(archiveName)).toBeVisible();
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Click the Archive button
    await page.getByRole('button', { name: /archive/i }).click();

    // Archive dialog should appear with type-to-confirm
    await expect(page.getByText('Archive Application')).toBeVisible();

    // The confirm button should be disabled until we type the slug
    const confirmButton = page.getByRole('button', { name: /archive application/i }).last();
    await expect(confirmButton).toBeDisabled();

    // Type the slug to confirm
    const confirmInput = page.getByPlaceholder(expectedSlug);
    if (await confirmInput.isVisible()) {
      await confirmInput.fill(expectedSlug);
    } else {
      // Fallback: find the input inside the dialog
      const dialogInput = page.locator('dialog input, [role="dialog"] input').last();
      await dialogInput.fill(expectedSlug);
    }

    // Now the confirm button should be enabled
    await expect(confirmButton).toBeEnabled({ timeout: 5000 });
    await confirmButton.click();

    // After archiving, the status should change to archived
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/archived/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('archived application hides the archive button', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Filter to show only archived apps
    const statusDropdown = page.getByText('All Statuses');
    await statusDropdown.click();
    await page.getByRole('option', { name: 'Archived' }).click();
    await page.waitForLoadState('networkidle');

    // Click on the seeded archived application
    await page.getByText(SEEDED_APPS.archived).click();
    await page.waitForLoadState('networkidle');

    // Archive button should NOT be visible for already-archived apps
    await expect(page.getByRole('button', { name: /archive/i })).not.toBeVisible();
  });

  test('archived application shows disabled settings', async ({ page }) => {
    await page.goto('/applications');
    await page.waitForLoadState('networkidle');

    // Filter to archived
    const statusDropdown = page.getByText('All Statuses');
    await statusDropdown.click();
    await page.getByRole('option', { name: 'Archived' }).click();
    await page.waitForLoadState('networkidle');

    // Navigate to the archived app detail
    await page.getByText(SEEDED_APPS.archived).click();
    await page.waitForLoadState('networkidle');

    // Go to Settings tab
    await page.getByRole('tab', { name: 'Settings' }).click();

    // The name input should be disabled for archived apps
    const nameInput = page.getByPlaceholder('e.g. Customer Portal');
    await expect(nameInput).toBeDisabled();
  });
});
