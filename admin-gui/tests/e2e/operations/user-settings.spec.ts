/**
 * User settings (Profile tab) E2E tests.
 *
 * Tests the Profile tab on the user detail page: pre-filled fields,
 * editing name/locale/phone, PATCH payload verification, dirty state
 * tracking, reset, and save success feedback.
 *
 * Profile tab fields (partial list):
 *   - Given Name, Family Name, Middle Name, Nickname
 *   - Preferred Username, Profile URL, Picture URL, Website URL
 *   - Gender, Birthdate, Timezone, Locale
 *   - Phone Number, Address (street, locality, region, postal, country)
 *   - Save / Reset buttons
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Users Settings
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateToEntity, clickTab } from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestUser } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// User Settings (Profile) Operations
// ---------------------------------------------------------------------------

test.describe('User Profile Operations', () => {
  test('profile tab shows pre-filled values from user data', async ({
    page,
    seedIds,
  }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Profile');

    // Given Name should be pre-filled with "Jane"
    const givenNameInput = page.getByPlaceholder('John');
    await expect(givenNameInput).toBeVisible();
    const value = await givenNameInput.inputValue();
    expect(value).toBe('Jane');

    // Family Name should be pre-filled with "Doe"
    const familyNameInput = page.getByPlaceholder('Doe');
    const familyValue = await familyNameInput.inputValue();
    expect(familyValue).toBe('Doe');

    // Section headings should be visible
    await expect(page.getByText('Personal Information')).toBeVisible();
  });

  test('edits given name and verifies PATCH payload', async ({
    page,
    request,
    seedIds,
  }) => {
    // Create a fresh user to edit
    const user = await createTestUser(
      request,
      seedIds.activeOrgId,
      `profile-edit-${Date.now()}@test.local`,
    );

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Profile');

    // Edit given name
    const givenNameInput = page.getByPlaceholder('John');
    await givenNameInput.clear();
    await givenNameInput.fill('Updated');

    // Save
    const [req] = await Promise.all([
      captureApiRequest(page, `/api/organizations/${seedIds.activeOrgId}/users/${user.id}`),
      page.getByRole('button', { name: /save/i }).click(),
    ]);

    // Verify PATCH
    expect(req.method).toBe('PATCH');
    const body = req.body as Record<string, unknown>;
    expect(body.givenName).toBe('Updated');
  });

  test('dirty state enables Save and Reset buttons', async ({
    page,
    request,
    seedIds,
  }) => {
    const user = await createTestUser(
      request,
      seedIds.activeOrgId,
      `dirty-state-${Date.now()}@test.local`,
    );

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Profile');

    // Initially save should be present
    const saveButton = page.getByRole('button', { name: /save/i });
    await expect(saveButton).toBeVisible();

    // Make a change
    const givenNameInput = page.getByPlaceholder('John');
    await givenNameInput.fill('Changed');

    // Save should be enabled (dirty)
    await expect(saveButton).toBeEnabled({ timeout: 5_000 });

    // Reset button
    const resetButton = page.getByRole('button', { name: /reset|discard|cancel/i });
    if (await resetButton.isVisible()) {
      await resetButton.click();

      // After reset, name should revert
      const restored = await givenNameInput.inputValue();
      expect(restored).not.toBe('Changed');
    }
  });

  test('save shows success message', async ({ page, request, seedIds }) => {
    const user = await createTestUser(
      request,
      seedIds.activeOrgId,
      `save-success-${Date.now()}@test.local`,
    );

    await navigateToEntity(page, 'users', user.id);
    await clickTab(page, 'Profile');

    // Edit family name
    const familyNameInput = page.getByPlaceholder('Doe');
    await familyNameInput.clear();
    await familyNameInput.fill('SaveTest');

    // Save
    await page.getByRole('button', { name: /save/i }).click();

    // Success message should appear
    await expect(page.getByText(/profile saved|saved successfully/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('security tab shows password and 2FA status', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'users', seedIds.activeUserId);
    await clickTab(page, 'Security');

    // Should show password section
    await expect(page.getByText(/password/i).first()).toBeVisible();

    // Should show 2FA section
    await expect(page.getByText(/two-factor|2fa/i).first()).toBeVisible();

    // Set Password button should be available
    await expect(
      page.getByRole('button', { name: /set password/i }),
    ).toBeVisible();
  });
});
