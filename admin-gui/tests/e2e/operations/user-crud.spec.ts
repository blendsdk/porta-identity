/**
 * User CRUD E2E tests.
 *
 * Tests user creation, invitation, listing, and detail viewing through
 * the full BFF → Porta → PostgreSQL stack. Verifies API payloads and
 * overview tab data.
 *
 * Users are org-scoped — an organization must be selected before users
 * appear in the list. CreateUser requires org + email at minimum.
 *
 * User tabs: Overview, Profile, Status, Roles, Claims, Security, Sessions, History
 *
 * Seed data provides:
 *   - Jane Doe (jane.doe@acme-test.local, active, seedIds.testUserId)
 *   - Suspended Tester (suspended.user@acme-test.local, suspended, seedIds.suspendedUserId)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Users CRUD
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateTo,
  navigateToEntity,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Constants from seed data
// ---------------------------------------------------------------------------

const ACME_ORG = 'Acme Corporation';

const SEEDED_USERS = {
  active: {
    email: 'jane.doe@acme-test.local',
    givenName: 'Jane',
    familyName: 'Doe',
  },
  suspended: {
    email: 'suspended.user@acme-test.local',
  },
};

// ---------------------------------------------------------------------------
// User CRUD Operations
// ---------------------------------------------------------------------------

test.describe('User CRUD Operations', () => {
  test('creates a user with password and verifies POST payload', async ({ page }) => {
    const email = `crud-${Date.now()}@test.local`;

    await navigateTo(page, '/users/new');

    // Select organization (combobox may already have a pre-selected value)
    const orgDropdown = page.locator('[role="combobox"]').first();
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Enter email
    const emailInput = page.getByPlaceholder('user@example.com');
    await emailInput.fill(email);

    // Enter name
    const givenNameInput = page.getByPlaceholder('First name');
    if (await givenNameInput.isVisible()) {
      await givenNameInput.fill('Test');
    }
    const familyNameInput = page.getByPlaceholder('Last name');
    if (await familyNameInput.isVisible()) {
      await familyNameInput.fill('User');
    }

    // Select "Set password now" radio if present
    const setPasswordRadio = page.getByLabel(/set password now/i);
    if (await setPasswordRadio.isVisible()) {
      await setPasswordRadio.click();

      // Enter password
      const passwordInput = page.getByPlaceholder('Minimum 8 characters');
      await passwordInput.fill('SecureP@ss123!');
      const confirmInput = page.getByPlaceholder('Re-enter password');
      if (await confirmInput.isVisible()) {
        await confirmInput.fill('SecureP@ss123!');
      }
    }

    // Capture the POST request
    const [req] = await Promise.all([
      captureApiRequest(page, '/api/organizations/'),
      page.getByRole('button', { name: /create user/i }).click(),
    ]);

    // Verify POST payload
    expect(req.method).toBe('POST');
    const body = req.body as Record<string, unknown>;
    expect(body.email).toBe(email);
  });

  test('shows validation error for empty email', async ({ page }) => {
    await navigateTo(page, '/users/new');

    // Select organization (combobox may already have a pre-selected value)
    const orgDropdown = page.locator('[role="combobox"]').first();
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Leave email empty and try to submit
    await page.getByRole('button', { name: /create user/i }).click();

    // Should show validation error
    await expect(page.getByText(/email.*required|valid email/i)).toBeVisible();
  });

  test('shows validation error for missing organization', async ({ page }) => {
    await navigateTo(page, '/users/new');

    // Enter email but don't select org
    const emailInput = page.getByPlaceholder('user@example.com');
    await emailInput.fill('test@test.local');

    // Try to submit
    await page.getByRole('button', { name: /create user/i }).click();

    // Should show org validation error
    await expect(page.getByText(/organization.*required/i)).toBeVisible();
  });

  test('navigates to invite wizard from list page', async ({ page }) => {
    await navigateTo(page, '/users');
    await page.getByRole('button', { name: /invite user/i }).click();

    await expect(page).toHaveURL('/users/invite');

    // Wizard step 1 should show email and org fields
    await expect(page.getByText(/email/i).first()).toBeVisible();
  });

  test('user list shows seeded users when org is selected', async ({ page }) => {
    await navigateTo(page, '/users');

    // Select Acme org (combobox may show "All Organizations" or pre-selected org)
    const orgDropdown = page.locator('[role="combobox"]').first();
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Active user should appear
    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();
  });

  test('filters users by search text', async ({ page }) => {
    await navigateTo(page, '/users');

    // Select org first (combobox may show "All Organizations" or pre-selected org)
    const orgDropdown = page.locator('[role="combobox"]').first();
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Search for "jane"
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('jane');
    await page.waitForLoadState('networkidle');

    // Jane Doe should be visible
    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();
    // Suspended user should not match
    await expect(page.getByText(SEEDED_USERS.suspended.email)).not.toBeVisible();
  });

  test('navigates to user detail from list row click', async ({ page, seedIds }) => {
    await navigateTo(page, '/users');

    // Select org (combobox may show "All Organizations" or pre-selected org)
    const orgDropdown = page.locator('[role="combobox"]').first();
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Click on Jane Doe
    await page.getByText(SEEDED_USERS.active.email).click();

    // Should navigate to user detail
    await expect(page).toHaveURL(/\/users\/[a-f0-9-]+/);
  });

  test('overview tab shows correct data for active user', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);

    // Overview is default tab — verify key fields
    // Email
    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();

    // Status badge
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Name
    await expect(page.getByText('Jane')).toBeVisible();
    await expect(page.getByText('Doe')).toBeVisible();

    // Email Verified badge
    await expect(page.getByText(/verified|unverified/i).first()).toBeVisible();

    // Created timestamp
    await expect(page.getByText(/Created/)).toBeVisible();

    // User ID label
    await expect(page.getByText('User ID')).toBeVisible();
  });

  test('all 8 tabs are visible on user detail', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);

    const expectedTabs = [
      'Overview',
      'Profile',
      'Status',
      'Roles',
      'Claims',
      'Security',
      'Sessions',
      'History',
    ];

    for (const tabName of expectedTabs) {
      await expect(page.getByRole('tab', { name: tabName })).toBeVisible();
    }
  });
});
