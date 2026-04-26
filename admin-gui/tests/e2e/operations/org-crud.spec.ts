/**
 * Organization CRUD E2E tests.
 *
 * Tests creating, listing, and viewing organizations through the
 * full BFF → Porta → PostgreSQL stack. Uses entity factory for
 * API-level setup and API interceptors for request verification.
 *
 * Complements pages/organizations.spec.ts with deeper verification:
 * - API request payloads and methods
 * - All-fields creation (locale, login methods, slug)
 * - Duplicate slug backend error handling
 * - Seed data entity navigation via seedIds
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Organizations CRUD
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
// Organization CRUD Operations
// ---------------------------------------------------------------------------

test.describe('Organization CRUD Operations', () => {
  test('creates organization with name only and verifies POST payload', async ({ page }) => {
    const orgName = uniqueName('Crud Name Only');

    await navigateTo(page, '/organizations/new');

    // Fill name only — slug is auto-generated
    await page.getByPlaceholder('e.g. Acme Corporation').fill(orgName);
    await page.waitForTimeout(300); // slug auto-generation debounce

    // Capture the POST request and click create simultaneously
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations'),
      page.getByRole('button', { name: /create organization/i }).click(),
    ]);

    // Verify API call details
    expect(request.method).toBe('POST');
    const body = request.body as Record<string, unknown>;
    expect(body.name).toBe(orgName);
    // Slug should be auto-generated from name
    expect(body.defaultLocale).toBe('en');
    expect(body.defaultLoginMethods).toEqual(['password', 'magic_link']);

    // Should redirect to the new org's detail page
    await page.waitForURL(/\/organizations\/[a-f0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText(orgName)).toBeVisible();
  });

  test('creates organization with all fields (name, slug, locale, login methods)', async ({ page }) => {
    const orgName = uniqueName('Crud All Fields');
    const customSlug = `e2e-all-${Date.now()}`;

    await navigateTo(page, '/organizations/new');

    // Fill name
    await page.getByPlaceholder('e.g. Acme Corporation').fill(orgName);

    // Override the auto-generated slug
    const slugInput = page.getByPlaceholder('auto-generated from name');
    await slugInput.fill(customSlug);

    // Change locale to Dutch — first combobox on create page is locale
    const localeDropdown = page.getByRole('combobox').first();
    await localeDropdown.click();
    await page.getByRole('option', { name: /Dutch/i }).click();

    // Uncheck Magic Link (keep only Password)
    await page.getByRole('checkbox', { name: /Magic Link/i }).click();

    // Capture POST request
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations'),
      page.getByRole('button', { name: /create organization/i }).click(),
    ]);

    // Verify all fields in payload
    expect(request.method).toBe('POST');
    const body = request.body as Record<string, unknown>;
    expect(body.name).toBe(orgName);
    expect(body.slug).toBe(customSlug);
    expect(body.defaultLocale).toBe('nl');
    expect(body.defaultLoginMethods).toEqual(['password']);

    // Should redirect to detail page showing the custom slug
    await page.waitForURL(/\/organizations\/[a-f0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByText(orgName)).toBeVisible();
    await expect(page.getByText(customSlug)).toBeVisible();
  });

  test('shows validation error for empty name', async ({ page }) => {
    await navigateTo(page, '/organizations/new');

    // Submit without filling the name
    await page.getByRole('button', { name: /create organization/i }).click();

    // Should stay on the create page
    await expect(page).toHaveURL('/organizations/new');

    // Should show validation error
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test('shows backend error for duplicate slug', async ({ page }) => {
    // Seed data already has "acme-corp" slug
    await navigateTo(page, '/organizations/new');

    await page.getByPlaceholder('e.g. Acme Corporation').fill('Duplicate Slug Test');
    // Manually set slug to the existing acme-corp
    await page.getByPlaceholder('auto-generated from name').fill('acme-corp');

    await page.getByRole('button', { name: /create organization/i }).click();

    // Should stay on create page and show a backend error
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL('/organizations/new');

    // Backend returns an error — shown in a MessageBar
    // The error message may vary (slug exists / conflict / duplicate)
    const errorBar = page.locator('[class*="intent"][class*="error"], [data-intent="error"]').first();
    const hasErrorBar = await errorBar.isVisible().catch(() => false);
    const hasErrorText = await page.getByText(/already exists|duplicate|conflict|slug.*taken/i).isVisible().catch(() => false);
    const hasGenericError = await page.getByText(/failed to create/i).isVisible().catch(() => false);

    expect(hasErrorBar || hasErrorText || hasGenericError).toBeTruthy();
  });

  test('shows new organization in list after creation', async ({ page }) => {
    const orgName = uniqueName('Crud List Visible');

    // Create org through the UI
    await navigateTo(page, '/organizations/new');
    await page.getByPlaceholder('e.g. Acme Corporation').fill(orgName);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /create organization/i }).click();
    await page.waitForURL(/\/organizations\/[a-f0-9-]+$/, { timeout: 10_000 });

    // Navigate to the list
    await navigateTo(page, '/organizations');
    await waitForTableLoaded(page);

    // Search for the new org
    await page.getByPlaceholder(/search/i).fill(orgName);
    await page.waitForTimeout(500); // debounce

    // The new org should appear in the filtered list
    await expect(page.getByText(orgName)).toBeVisible();
  });

  test('navigates to detail page from list row click', async ({ page, seedIds }) => {
    await navigateTo(page, '/organizations');
    await waitForTableLoaded(page);

    // Click on Acme Corporation row
    await page.getByText('Acme Corporation').click();

    // Should navigate to the correct detail page URL
    await expect(page).toHaveURL(new RegExp(`/organizations/${seedIds.activeOrgId}`));

    // Detail page should display the org info
    await expect(page.getByText('Acme Corporation')).toBeVisible();
  });

  test('shows correct data on Overview tab', async ({ page, seedIds }) => {
    // Navigate directly to seeded active org detail
    await navigateToEntity(page, 'organizations', seedIds.activeOrgId);

    // Overview tab is the default — verify all card sections

    // Stats row: Status, Applications, Users
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('Applications')).toBeVisible();
    await expect(page.getByText('Users')).toBeVisible();

    // General Information card
    await expect(page.getByText('General Information')).toBeVisible();
    await expect(page.getByText('Acme Corporation')).toBeVisible();
    await expect(page.getByText('acme-corp')).toBeVisible();

    // Security & Authentication card
    await expect(page.getByText('Security & Authentication')).toBeVisible();
    await expect(page.getByText('Login Methods')).toBeVisible();
    await expect(page.getByText('Two-Factor Policy')).toBeVisible();
    await expect(page.getByText('Default Locale')).toBeVisible();

    // Timestamps footer
    await expect(page.getByText(/Created /)).toBeVisible();
    await expect(page.getByText(/Last updated /)).toBeVisible();
  });
});
