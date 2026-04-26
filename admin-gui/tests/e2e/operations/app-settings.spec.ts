/**
 * Application settings E2E tests.
 *
 * Tests the application Settings tab: editing name and description,
 * saving via PATCH, dirty state tracking, reset functionality,
 * and disabled state for archived applications.
 *
 * Uses API interceptors to verify the correct HTTP method (PATCH)
 * and payload are sent to the backend.
 *
 * Seed data provides:
 *   - Acme Customer Portal (active, seedIds.testAppId)
 *   - Legacy Dashboard (archived, seedIds.archivedAppId)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Applications Settings
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateToEntity,
  clickTab,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Application Settings Operations
// ---------------------------------------------------------------------------

test.describe('Application Settings Operations', () => {
  test('shows settings tab with current values pre-filled', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.testAppId);
    await clickTab(page, 'Settings');

    // Settings tab should show input fields — name input pre-filled with app name
    // The SettingsTab uses Input with value={name} (no placeholder)
    // and Textarea with value={description}
    // Check that the Application Name label exists
    await expect(page.getByText('Application Name')).toBeVisible();

    // The name input should have the current app name value
    // Find the input in the settings section — it follows the "Application Name" label
    const nameInput = page.locator('input').first();
    await expect(nameInput).toHaveValue('Acme Customer Portal');

    // Description field should exist
    await expect(page.getByText('Description')).toBeVisible();
  });

  test('saves name change and verifies PATCH payload', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.testAppId);
    await clickTab(page, 'Settings');

    // Find the name input and change it
    const nameInput = page.locator('input').first();
    const originalName = await nameInput.inputValue();
    const newName = `${originalName} Updated`;

    await nameInput.fill(newName);

    // Save Changes button should become enabled (dirty state)
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await expect(saveButton).toBeEnabled();

    // Capture PATCH request
    const [request] = await Promise.all([
      captureApiRequest(page, `/api/applications/${seedIds.testAppId}`),
      saveButton.click(),
    ]);

    // Verify correct HTTP method (PATCH, not PUT)
    expect(request.method).toBe('PATCH');
    const body = request.body as Record<string, unknown>;
    expect(body.name).toBe(newName);

    // Restore original name for other tests
    await page.waitForLoadState('networkidle');
    await nameInput.fill(originalName);
    await Promise.all([
      captureApiRequest(page, `/api/applications/${seedIds.testAppId}`),
      saveButton.click(),
    ]);
  });

  test('saves description change and verifies PATCH payload', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.testAppId);
    await clickTab(page, 'Settings');

    // Find the description textarea
    const descTextarea = page.locator('textarea').first();
    const newDescription = 'Updated description for E2E test';

    await descTextarea.fill(newDescription);

    // Save Changes button should become enabled
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await expect(saveButton).toBeEnabled();

    // Capture PATCH request
    const [request] = await Promise.all([
      captureApiRequest(page, `/api/applications/${seedIds.testAppId}`),
      saveButton.click(),
    ]);

    // Verify payload includes description
    expect(request.method).toBe('PATCH');
    const body = request.body as Record<string, unknown>;
    expect(body.description).toBe(newDescription);
  });

  test('tracks dirty state — save and reset disabled when clean', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.testAppId);
    await clickTab(page, 'Settings');

    // Initially, both buttons should be disabled (no changes)
    const saveButton = page.getByRole('button', { name: /save changes/i });
    const resetButton = page.getByRole('button', { name: /^reset$/i });

    await expect(saveButton).toBeDisabled();
    await expect(resetButton).toBeDisabled();

    // Make a change — type into the name input
    const nameInput = page.locator('input').first();
    const originalValue = await nameInput.inputValue();
    await nameInput.fill(originalValue + 'X');

    // Now both buttons should be enabled
    await expect(saveButton).toBeEnabled();
    await expect(resetButton).toBeEnabled();

    // Restore original value manually
    await nameInput.fill(originalValue);

    // Buttons should be disabled again (back to clean state)
    await expect(saveButton).toBeDisabled();
    await expect(resetButton).toBeDisabled();
  });

  test('reset button restores original values', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.testAppId);
    await clickTab(page, 'Settings');

    // Record original value
    const nameInput = page.locator('input').first();
    const originalValue = await nameInput.inputValue();

    // Make a change
    await nameInput.fill('Completely Different Name');
    await expect(nameInput).toHaveValue('Completely Different Name');

    // Click reset
    await page.getByRole('button', { name: /^reset$/i }).click();

    // Value should be restored to original
    await expect(nameInput).toHaveValue(originalValue);

    // Save button should be disabled again
    await expect(page.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  test('archived application shows disabled settings inputs', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.archivedAppId);
    await clickTab(page, 'Settings');

    // Name input should be disabled
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeDisabled();

    // Description textarea should be disabled
    const descTextarea = page.locator('textarea').first();
    await expect(descTextarea).toBeDisabled();

    // Save and Reset buttons should NOT be visible for archived apps
    // (the component hides the actions section when status === 'archived')
    await expect(page.getByRole('button', { name: /save changes/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^reset$/i })).not.toBeVisible();
  });
});
