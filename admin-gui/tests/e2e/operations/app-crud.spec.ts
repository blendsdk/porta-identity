/**
 * Application CRUD E2E tests.
 *
 * Tests creating, listing, and viewing applications through the
 * full BFF → Porta → PostgreSQL stack. Uses entity factory for
 * API-level setup and API interceptors for request verification.
 *
 * Complements pages/applications.spec.ts with deeper verification:
 * - API request payloads and methods
 * - All-fields creation (name, org, slug, description)
 * - Validation errors (empty name, missing org)
 * - Duplicate slug backend error handling
 * - Seed data entity navigation via seedIds
 *
 * Seed data provides:
 *   - Acme Customer Portal (active, slug: acme-customer-portal, org: Acme Corporation)
 *   - Legacy Dashboard (archived, slug: legacy-dashboard, org: Acme Corporation)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Applications CRUD
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateTo,
  navigateToEntity,
  waitForTableLoaded,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { uniqueName } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Constants from seed data
// ---------------------------------------------------------------------------

const ACME_ORG = 'Acme Corporation';
const SEEDED_APPS = {
  active: 'Acme Customer Portal',
  archived: 'Legacy Dashboard',
};

// ---------------------------------------------------------------------------
// Application CRUD Operations
// ---------------------------------------------------------------------------

test.describe('Application CRUD Operations', () => {
  test('creates application with name and org only, verifies POST payload', async ({ page }) => {
    const appName = uniqueName('Crud Name Only');

    await navigateTo(page, '/applications/new');

    // Select organization — FluentUI Dropdown uses role="combobox"
    const orgDropdown = page.getByRole('combobox');
    await orgDropdown.click();
    // Wait for org list to load, then select Acme Corporation
    await page.getByRole('option', { name: ACME_ORG }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Fill name only — slug is auto-generated
    await page.getByPlaceholder('e.g. Customer Portal').fill(appName);
    await page.waitForTimeout(300); // slug auto-generation debounce

    // Capture the POST request and click create simultaneously
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/applications'),
      page.getByRole('button', { name: /create application/i }).click(),
    ]);

    // Verify API call details
    expect(request.method).toBe('POST');
    const body = request.body as Record<string, unknown>;
    expect(body.name).toBe(appName);
    expect(body.organizationId).toBeTruthy(); // UUID of Acme Corporation
    // Slug is auto-generated — may or may not be in the payload
    // Description is omitted when empty

    // Should redirect to the new app's detail page
    await page.waitForURL(/\/applications\/[a-f0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText(appName)).toBeVisible();
  });

  test('creates application with all fields (name, org, slug, description)', async ({ page }) => {
    const appName = uniqueName('Crud All Fields');
    const customSlug = `e2e-app-${Date.now()}`;
    const description = 'E2E test application with full fields';

    await navigateTo(page, '/applications/new');

    // Select organization — click combobox and wait for options to load
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: ACME_ORG }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Fill name
    await page.getByPlaceholder('e.g. Customer Portal').fill(appName);

    // Override the auto-generated slug
    await page.getByPlaceholder('auto-generated from name').fill(customSlug);

    // Add description
    await page.getByPlaceholder(/brief description/i).fill(description);

    // Capture POST request
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/applications'),
      page.getByRole('button', { name: /create application/i }).click(),
    ]);

    // Verify all fields in payload
    expect(request.method).toBe('POST');
    const body = request.body as Record<string, unknown>;
    expect(body.name).toBe(appName);
    expect(body.slug).toBe(customSlug);
    expect(body.organizationId).toBeTruthy();
    expect(body.description).toBe(description);

    // Should redirect to detail page
    await page.waitForURL(/\/applications\/[a-f0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText(appName)).toBeVisible();
  });

  test('shows validation error for empty name', async ({ page }) => {
    await navigateTo(page, '/applications/new');

    // Select organization (to isolate name validation)
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: ACME_ORG }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Submit without filling the name
    await page.getByRole('button', { name: /create application/i }).click();

    // Should stay on the create page
    await expect(page).toHaveURL('/applications/new');

    // Should show name validation error
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('shows validation error for missing organization', async ({ page }) => {
    await navigateTo(page, '/applications/new');

    // Fill name but skip organization selection
    await page.getByPlaceholder('e.g. Customer Portal').fill('No Org App');

    // Submit without selecting an organization
    await page.getByRole('button', { name: /create application/i }).click();

    // Should stay on the create page
    await expect(page).toHaveURL('/applications/new');

    // Should show organization validation error
    await expect(page.getByText(/organization is required/i)).toBeVisible();
  });

  test('shows backend error for duplicate slug', async ({ page }) => {
    // Seed data has "acme-customer-portal" slug
    await navigateTo(page, '/applications/new');

    // Select organization
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: ACME_ORG }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Fill name
    await page.getByPlaceholder('e.g. Customer Portal').fill('Duplicate Slug Test');

    // Manually set slug to an existing one
    await page.getByPlaceholder('auto-generated from name').fill('acme-customer-portal');

    await page.getByRole('button', { name: /create application/i }).click();

    // Should stay on create page and show a backend error
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL('/applications/new');

    // Backend returns an error — check multiple possible error messages
    const hasSlugError = await page.getByText(/slug already in use/i).isVisible().catch(() => false);
    const hasDuplicateError = await page.getByText(/already exists|duplicate|conflict|slug.*taken/i).isVisible().catch(() => false);
    const hasGenericError = await page.getByText(/failed to create/i).isVisible().catch(() => false);
    const hasRequestFailed = await page.getByText(/request failed/i).isVisible().catch(() => false);

    expect(hasSlugError || hasDuplicateError || hasGenericError || hasRequestFailed).toBeTruthy();
  });

  test('shows new application in list after creation', async ({ page }) => {
    const appName = uniqueName('Crud List Visible');

    // Create app through the UI
    await navigateTo(page, '/applications/new');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: ACME_ORG }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.getByPlaceholder('e.g. Customer Portal').fill(appName);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /create application/i }).click();
    await page.waitForURL(/\/applications\/[a-f0-9-]+$/, { timeout: 10_000 });

    // Navigate to the list
    await navigateTo(page, '/applications');
    await waitForTableLoaded(page);

    // Search for the new app
    await page.getByPlaceholder(/search applications/i).fill(appName);
    await page.waitForTimeout(500); // debounce

    // The new app should appear in the filtered list
    await expect(page.locator('table').getByText(appName)).toBeVisible();
  });

  test('navigates to detail page from list row click', async ({ page, seedIds }) => {
    await navigateTo(page, '/applications');
    await waitForTableLoaded(page);

    // Click on Acme Customer Portal row (scoped to table to avoid sidebar)
    await page.locator('table').getByText(SEEDED_APPS.active).click();

    // Should navigate to the correct detail page URL
    await expect(page).toHaveURL(new RegExp(`/applications/${seedIds.testAppId}`));

    // Detail page should display the app info
    await expect(page.locator('main').getByText(SEEDED_APPS.active).first()).toBeVisible();
  });

  test('shows correct data on Overview tab', async ({ page, seedIds }) => {
    // Navigate directly to seeded active app detail
    await navigateToEntity(page, 'applications', seedIds.testAppId);

    // Overview tab is the default — verify key fields
    // Name
    await expect(page.locator('main').getByText(SEEDED_APPS.active).first()).toBeVisible();

    // Slug (rendered in monospace)
    await expect(page.locator('main').getByText('acme-customer-portal')).toBeVisible();

    // Organization name
    await expect(page.locator('main').getByText(ACME_ORG)).toBeVisible();

    // Description
    await expect(page.getByText('Customer-facing portal application')).toBeVisible();

    // Status
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Timestamps
    await expect(page.getByText(/Created/)).toBeVisible();
    await expect(page.getByText(/Updated/)).toBeVisible();
  });
});
