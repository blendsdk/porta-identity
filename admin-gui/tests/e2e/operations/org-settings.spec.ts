/**
 * Organization Settings E2E tests.
 *
 * Tests the Settings tab on the organization detail page through the
 * full BFF → Porta → PostgreSQL stack. Verifies:
 * - Form field rendering with current org values
 * - Locale, login methods, 2FA policy changes with API verification
 * - Dirty state tracking (save/reset button enable/disable)
 * - Disabled state for archived organizations
 * - HTTP method verification (PATCH vs PUT — BUG-5 resolved)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Organization Settings
 * @see BUGS/5.organization-settimgs.md — Settings PATCH not persisting
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateToEntity,
  clickTab,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to an org's Settings tab */
async function goToSettings(
  page: import('@playwright/test').Page,
  orgId: string,
): Promise<void> {
  await navigateToEntity(page, 'organizations', orgId);
  await clickTab(page, 'Settings');
}

// ---------------------------------------------------------------------------
// Organization Settings Tests
// ---------------------------------------------------------------------------

test.describe('Organization Settings', () => {
  test('settings tab shows current values for locale, login methods, and 2FA', async ({
    page,
    seedIds,
  }) => {
    await goToSettings(page, seedIds.activeOrgId);

    // Labels should be visible
    await expect(page.getByText('Default Locale')).toBeVisible();
    await expect(page.getByText('Default Login Methods')).toBeVisible();
    await expect(page.getByText('Two-Factor Authentication Policy')).toBeVisible();

    // Default locale dropdown should show "English (en)" for the active test org
    const localeDropdown = page.getByRole('combobox').first();
    await expect(localeDropdown).toContainText(/English/i);

    // Login method checkboxes should reflect the org's defaults
    // Acme Corp has both password and magic_link enabled by default
    const passwordCheckbox = page.getByRole('checkbox', { name: /Password/i });
    const magicLinkCheckbox = page.getByRole('checkbox', { name: /Magic Link/i });
    await expect(passwordCheckbox).toBeVisible();
    await expect(magicLinkCheckbox).toBeVisible();
  });

  test('saves changed locale and verifies API payload', async ({ page, seedIds }) => {
    await goToSettings(page, seedIds.activeOrgId);

    // Change locale to Dutch
    const localeDropdown = page.getByRole('combobox').first();
    await localeDropdown.click();
    await page.getByRole('option', { name: /Dutch/i }).click();

    // Save button should now be enabled (isDirty)
    const saveBtn = page.getByRole('button', { name: /save settings/i });
    await expect(saveBtn).toBeEnabled();

    // Capture the API request when saving
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations/'),
      saveBtn.click(),
    ]);

    // Verify the request payload includes the locale change
    const body = request.body as Record<string, unknown>;
    expect(body.defaultLocale).toBe('nl');

    // Success message should appear
    await expect(page.getByText(/settings saved|saved successfully/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('saves changed login methods and verifies API payload', async ({ page, seedIds }) => {
    await goToSettings(page, seedIds.activeOrgId);

    // Uncheck Magic Link (keep only Password)
    await page.getByRole('checkbox', { name: /Magic Link/i }).click();

    // Capture and save
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations/'),
      page.getByRole('button', { name: /save settings/i }).click(),
    ]);

    // Verify login methods payload
    const body = request.body as Record<string, unknown>;
    expect(body.defaultLoginMethods).toEqual(['password']);

    // Re-enable Magic Link to restore original state
    await page.getByRole('checkbox', { name: /Magic Link/i }).click();
    await page.getByRole('button', { name: /save settings/i }).click();
    await page.waitForTimeout(1_000);
  });

  test('saves changed 2FA policy and verifies API payload', async ({ page, seedIds }) => {
    await goToSettings(page, seedIds.activeOrgId);

    // Change 2FA policy — second combobox is the 2FA dropdown
    // Default is "optional", so we change to "required" to trigger dirty state
    const tfaDropdown = page.getByRole('combobox').nth(1);
    await tfaDropdown.click();
    await page.getByRole('option', { name: /Required/i }).click();

    // Save button should be enabled after changing to a different value
    const saveBtn = page.getByRole('button', { name: /save settings/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });

    // Capture and save
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations/'),
      saveBtn.click(),
    ]);

    // Verify 2FA policy payload
    const body = request.body as Record<string, unknown>;
    expect(body.twoFactorPolicy).toBe('required');

    // Success message should appear
    await expect(page.getByText(/settings saved|saved successfully/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('save button is disabled when no changes made', async ({ page, seedIds }) => {
    await goToSettings(page, seedIds.activeOrgId);

    // Both Save and Reset should be disabled initially (no changes)
    const saveBtn = page.getByRole('button', { name: /save settings/i });
    const resetBtn = page.getByRole('button', { name: /^reset$/i });

    await expect(saveBtn).toBeDisabled();
    await expect(resetBtn).toBeDisabled();

    // Make a change — buttons should enable
    await page.getByRole('checkbox', { name: /Magic Link/i }).click();
    await expect(saveBtn).toBeEnabled();
    await expect(resetBtn).toBeEnabled();

    // Undo the change — buttons should disable again
    await page.getByRole('checkbox', { name: /Magic Link/i }).click();
    await expect(saveBtn).toBeDisabled();
    await expect(resetBtn).toBeDisabled();
  });

  test('reset button restores original values', async ({ page, seedIds }) => {
    await goToSettings(page, seedIds.activeOrgId);

    // Record the initial locale dropdown text
    const localeDropdown = page.getByRole('combobox').first();
    const initialText = await localeDropdown.textContent();

    // Change locale to French
    await localeDropdown.click();
    await page.getByRole('option', { name: /French/i }).click();

    // Locale dropdown should now show French
    await expect(localeDropdown).toContainText(/French/i);

    // Click Reset
    await page.getByRole('button', { name: /^reset$/i }).click();

    // Locale should revert to original value
    await expect(localeDropdown).toContainText(initialText ?? 'English');

    // Save button should be disabled again (no dirty changes)
    await expect(page.getByRole('button', { name: /save settings/i })).toBeDisabled();
  });

  test('settings form is disabled for archived organization', async ({ page, seedIds }) => {
    await goToSettings(page, seedIds.archivedOrgId);

    // Dropdowns should be disabled
    const comboboxes = page.getByRole('combobox');
    const count = await comboboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(comboboxes.nth(i)).toBeDisabled();
    }

    // Checkboxes should be disabled
    const checkboxes = page.getByRole('checkbox');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await expect(checkboxes.nth(i)).toBeDisabled();
    }

    // Save and Reset buttons should NOT be rendered for archived orgs
    // (the code conditionally hides them when isDisabled)
    await expect(page.getByRole('button', { name: /save settings/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^reset$/i })).not.toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Bug detector: HTTP method verification
  // -----------------------------------------------------------------------

  test(
    'settings save uses PUT method matching backend route',
    async ({ page, seedIds }) => {
      // Regression test for BUG-5: The Settings tab previously used api.patch()
      // for organization updates, but the backend only registers PUT /:id.
      // Fixed by changing all entity update hooks from api.patch() to api.put().

      await goToSettings(page, seedIds.activeOrgId);

      // Toggle login method to trigger dirty state (more reliable than locale
      // since other tests may have already changed the locale value)
      await page.getByRole('checkbox', { name: /Magic Link/i }).click();

      // Capture the API request
      const [request] = await Promise.all([
        captureApiRequest(page, '/api/organizations/'),
        page.getByRole('button', { name: /save settings/i }).click(),
      ]);

      // Must be PUT to match backend router.put('/:id', ...)
      expect(request.method).toBe('PUT');
    },
  );
});
