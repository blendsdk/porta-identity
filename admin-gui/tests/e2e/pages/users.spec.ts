/**
 * User pages E2E tests.
 *
 * Tests the complete user management flow through the real
 * BFF → Porta → PostgreSQL stack:
 *   - List page: renders seeded users, search, status filter, org selector
 *   - Create page: form submission, validation, new user appears in list
 *   - Invite page: wizard flow renders correctly
 *   - Detail page: all 8 tabs render, info displayed correctly
 *   - Status transitions: deactivate/activate with confirm dialog
 *
 * Seed data provides 2 test users in Acme Corporation:
 *   - Jane Doe (jane.doe@acme-test.local) — active
 *   - Suspended Tester (suspended.user@acme-test.local) — suspended
 *
 * Tests are ordered: list → create → invite → detail → status transitions.
 * Tests that create new users use unique emails to avoid collisions.
 */

import { test, expect } from '../fixtures/admin-fixtures';

// ---------------------------------------------------------------------------
// Constants from seed data
// ---------------------------------------------------------------------------

/** Known user data from seed-data.ts */
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

/** Known organization name for the test users */
const ACME_ORG = 'Acme Corporation';

// ---------------------------------------------------------------------------
// User List Tests
// ---------------------------------------------------------------------------

test.describe('User List', () => {
  test('renders the user list page with org selector', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Page title should be visible
    await expect(page.getByText('Users', { exact: false })).toBeVisible();

    // Create and Invite buttons should be present
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /invite user/i })).toBeVisible();

    // Organization selector should be present
    await expect(page.getByText(/select.*organization|all organizations/i)).toBeVisible();
  });

  test('displays seeded users when Acme org is selected', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Select Acme Corporation from the org dropdown
    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // The seeded active user should appear
    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();
  });

  test('filters users by search text', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Select Acme Corporation first
    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Search for "jane" — should find Jane Doe
    const searchInput = page.getByPlaceholder(/search users/i);
    await searchInput.fill('jane');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();
    // Suspended user should not match the search
    await expect(page.getByText(SEEDED_USERS.suspended.email)).not.toBeVisible();
  });

  test('filters users by status', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Select Acme Corporation first
    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Open the status dropdown and select "Suspended"
    const statusDropdown = page.getByText('All Statuses');
    await statusDropdown.click();
    await page.getByRole('option', { name: 'Suspended' }).click();
    await page.waitForLoadState('networkidle');

    // Suspended user should be visible
    await expect(page.getByText(SEEDED_USERS.suspended.email)).toBeVisible();

    // Active user should not be visible
    await expect(page.getByText(SEEDED_USERS.active.email)).not.toBeVisible();
  });

  test('navigates to user detail on row click', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Select Acme Corporation
    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Click on the seeded active user row
    await page.getByText(SEEDED_USERS.active.email).click();

    // Should navigate to the detail page
    await expect(page).toHaveURL(/\/users\/[a-f0-9-]+/);

    // User name or email should be in the header
    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// User Create Tests
// ---------------------------------------------------------------------------

test.describe('User Create', () => {
  test('navigates to the create form', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create user/i }).click();
    await expect(page).toHaveURL('/users/new');

    // Form fields should be present
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Organization')).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/users/new');
    await page.waitForLoadState('networkidle');

    // Click Create without filling in required fields
    await page.getByRole('button', { name: /create user/i }).click();

    // Validation errors should appear
    await expect(page.getByText(/email.*required|required/i)).toBeVisible();
  });

  test('creates a new user successfully', async ({ page }) => {
    await page.goto('/users/new');
    await page.waitForLoadState('networkidle');

    // Generate a unique email to avoid collisions
    const uniqueEmail = `e2e-user-${Date.now()}@acme-test.local`;

    // Select Acme Corporation from the organization dropdown
    const orgDropdown = page.getByText(/select.*organization/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();

    // Fill in the email
    await page.getByPlaceholder(/user@example.com|email/i).fill(uniqueEmail);

    // Fill in name fields (optional but nice to test)
    const givenNameInput = page.getByPlaceholder('John');
    if (await givenNameInput.isVisible()) {
      await givenNameInput.fill('E2E');
    }
    const familyNameInput = page.getByPlaceholder('Doe');
    if (await familyNameInput.isVisible()) {
      await familyNameInput.fill('TestUser');
    }

    // Submit the form
    await page.getByRole('button', { name: /create user/i }).click();

    // Should redirect to the detail page or back to the list
    await page.waitForURL(/\/users\/[a-f0-9-]+|\/users$/, { timeout: 10000 });

    // The new user's email should be visible
    await expect(page.getByText(uniqueEmail)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// User Invite Tests
// ---------------------------------------------------------------------------

test.describe('User Invite', () => {
  test('navigates to the invite wizard', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /invite user/i }).click();
    await expect(page).toHaveURL('/users/invite');

    // Wizard step indicators or form fields should be visible
    await expect(page.getByText(/invite|invitation/i)).toBeVisible();
  });

  test('shows wizard steps with email and organization fields', async ({ page }) => {
    await page.goto('/users/invite');
    await page.waitForLoadState('networkidle');

    // First step should have email and org fields
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Organization')).toBeVisible();

    // Should have step navigation
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// User Detail Tests
// ---------------------------------------------------------------------------

test.describe('User Detail', () => {
  /** Navigate to the seeded active user's detail page */
  async function navigateToActiveUser(page: import('@playwright/test').Page) {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Select Acme Corporation
    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    // Click on Jane Doe
    await page.getByText(SEEDED_USERS.active.email).click();
    await page.waitForLoadState('networkidle');
  }

  test('displays the overview tab with correct info', async ({ page }) => {
    await navigateToActiveUser(page);

    // Overview tab should be active by default
    await expect(page.getByText(SEEDED_USERS.active.email)).toBeVisible();

    // Key info should be present
    await expect(page.getByText('Jane')).toBeVisible(); // given name
    await expect(page.getByText(/active/i).first()).toBeVisible(); // status (StatusBadge capitalizes)
    await expect(page.getByText(/verified/i).first()).toBeVisible(); // email verified
  });

  test('shows the profile tab with editable fields', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the Profile tab
    await page.getByRole('tab', { name: 'Profile' }).click();

    // Should show name input fields
    await expect(page.getByText('Given Name')).toBeVisible();
    await expect(page.getByText('Family Name')).toBeVisible();

    // Save button should be present
    await expect(page.getByRole('button', { name: /save profile/i })).toBeVisible();
  });

  test('shows the status tab with transition actions', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the Status tab
    await page.getByRole('tab', { name: 'Status' }).click();

    // Should show current status
    await expect(page.getByText(/current status/i)).toBeVisible();
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Should show available actions for active users
    await expect(page.getByRole('button', { name: /deactivate/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /suspend/i })).toBeVisible();

    // Should show lifecycle reference
    await expect(page.getByText('Status Lifecycle Reference')).toBeVisible();
  });

  test('shows the roles tab', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the Roles tab
    await page.getByRole('tab', { name: 'Roles' }).click();

    // Should show the roles section (either roles list or empty state + assign button)
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();

    // Assign Role button should be present
    await expect(page.getByRole('button', { name: /assign role/i })).toBeVisible();
  });

  test('shows the claims tab', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the Claims tab
    await page.getByRole('tab', { name: 'Claims' }).click();

    // Should show claims section (either values or empty state)
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });

  test('shows the security tab with password and 2FA info', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the Security tab
    await page.getByRole('tab', { name: 'Security' }).click();

    // Should show 2FA section
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible();

    // Should show email verification section
    await expect(page.getByText('Email Verification')).toBeVisible();

    // Should show password section
    await expect(page.getByText('Password')).toBeVisible();

    // Should show login activity
    await expect(page.getByText('Login Activity')).toBeVisible();
  });

  test('shows the sessions tab with revoke button', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the Sessions tab
    await page.getByRole('tab', { name: 'Sessions' }).click();

    // Should show session information
    await expect(page.getByText('Session Information')).toBeVisible();

    // Should show revoke all button
    await expect(page.getByRole('button', { name: /revoke all sessions/i })).toBeVisible();
  });

  test('shows the history tab', async ({ page }) => {
    await navigateToActiveUser(page);

    // Click the History tab
    await page.getByRole('tab', { name: 'History' }).click();

    // Should show timeline or empty state
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Status Transition Tests
// ---------------------------------------------------------------------------

test.describe('User Status Transitions', () => {
  test('deactivate action opens confirm dialog with type-to-confirm', async ({ page }) => {
    // Navigate to the active user
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(SEEDED_USERS.active.email).click();
    await page.waitForLoadState('networkidle');

    // Go to Status tab
    await page.getByRole('tab', { name: 'Status' }).click();

    // Click Deactivate
    await page.getByRole('button', { name: /deactivate/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText('Deactivate User')).toBeVisible();
    await expect(page.getByText(/prevent them from logging in/i)).toBeVisible();

    // Type-to-confirm should be required
    await expect(page.getByText(new RegExp(`Type.*${SEEDED_USERS.active.email}`))).toBeVisible();

    // Confirm button should be disabled before typing
    const confirmButton = page.getByRole('button', { name: /^deactivate$/i });
    await expect(confirmButton).toBeDisabled();

    // Dismiss the dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByText('Deactivate User')).not.toBeVisible();
  });

  test('suspend action opens confirm dialog', async ({ page }) => {
    // Navigate to the active user
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    const orgDropdown = page.getByText(/select.*organization|all organizations/i);
    await orgDropdown.click();
    await page.getByRole('option', { name: ACME_ORG }).click();
    await page.waitForLoadState('networkidle');

    await page.getByText(SEEDED_USERS.active.email).click();
    await page.waitForLoadState('networkidle');

    // Go to Status tab
    await page.getByRole('tab', { name: 'Status' }).click();

    // Click Suspend
    await page.getByRole('button', { name: /suspend/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText('Suspend User')).toBeVisible();
    await expect(page.getByText(/immediately prevent them/i)).toBeVisible();

    // Dismiss
    await page.getByRole('button', { name: /cancel/i }).click();
  });
});
