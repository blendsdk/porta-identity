/**
 * Application modules E2E tests.
 *
 * Tests the application Modules tab: toggle switches for enabling/disabling
 * application modules (auth, rbac, custom_claims, two_factor), API payload
 * verification, archived app disabled state, and archive status transition.
 *
 * Module operations:
 *   - Enable: POST /api/applications/{id}/modules { moduleType }
 *   - Disable: DELETE /api/applications/{id}/modules/{moduleId}
 *
 * Seed data provides:
 *   - Acme Customer Portal (active, seedIds.testAppId)
 *   - Legacy Dashboard (archived, seedIds.archivedAppId)
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Applications Modules
 */

import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateToEntity,
  clickTab,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';
import { createTestApp, uniqueName, getCsrfToken } from '../helpers/entity-factory';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known module labels as displayed in the UI */
const MODULE_LABELS = ['Authentication', 'RBAC', 'Custom Claims', 'Two-Factor Auth'];

// ---------------------------------------------------------------------------
// Application Module Operations
// ---------------------------------------------------------------------------

test.describe('Application Module Operations', () => {
  test('shows all 4 module types with toggle switches', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.testAppId);
    await clickTab(page, 'Modules');

    // All module labels should be visible — scope to tabpanel to avoid sidebar nav collisions
    const tabpanel = page.getByRole('tabpanel');
    for (const label of MODULE_LABELS) {
      await expect(tabpanel.getByText(label, { exact: true })).toBeVisible();
    }

    // Each module should have a description
    await expect(page.getByText(/login, magic link, password reset/i)).toBeVisible();
    await expect(page.getByText(/role-based access control/i)).toBeVisible();
    await expect(page.getByText(/custom user claims/i)).toBeVisible();
    await expect(page.getByText(/totp, email otp, recovery codes/i)).toBeVisible();

    // Explanatory text should be visible
    await expect(
      page.getByText(/application modules control which features/i),
    ).toBeVisible();

    // Each module should have a switch (there should be 4 switches)
    const switches = page.getByRole('switch');
    await expect(switches).toHaveCount(4);
  });

  test('enables a module and verifies POST payload', async ({ page, request, seedIds }) => {
    // Create a fresh app so we control its initial module state
    const app = await createTestApp(request, seedIds.activeOrgId, uniqueName('Module Enable'));

    await navigateToEntity(page, 'applications', app.id);
    await clickTab(page, 'Modules');

    // Find the Authentication module switch — it should be off initially
    // Module switches are rendered in order: auth, rbac, custom_claims, two_factor
    const authSwitch = page.getByRole('switch').first();

    // Capture the POST request when enabling the module
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/applications/${app.id}/modules`),
      authSwitch.click(),
    ]);

    // Verify POST was sent with correct module type
    expect(apiRequest.method).toBe('POST');
    const body = apiRequest.body as Record<string, unknown>;
    expect(body.moduleType).toBe('auth');
  });

  test('disables a module and verifies DELETE request', async ({ page, request, seedIds }) => {
    // Create a fresh app and enable a module via API first
    const app = await createTestApp(request, seedIds.activeOrgId, uniqueName('Module Disable'));

    // Enable the auth module via API (with CSRF token)
    const BFF_BASE_URL = process.env.ADMIN_GUI_URL ?? 'http://localhost:49301';
    const csrf = await getCsrfToken(request);
    const enableResponse = await request.post(
      `${BFF_BASE_URL}/api/applications/${app.id}/modules`,
      {
        data: { moduleType: 'auth' },
        headers: { 'X-CSRF-Token': csrf },
      },
    );
    expect(enableResponse.ok()).toBeTruthy();

    // Navigate to the app's modules tab
    await navigateToEntity(page, 'applications', app.id);
    await clickTab(page, 'Modules');

    // The first switch (Authentication) should now be checked
    const authSwitch = page.getByRole('switch').first();

    // Capture the DELETE request when disabling the module
    const [apiRequest] = await Promise.all([
      captureApiRequest(page, `/api/applications/${app.id}/modules/`),
      authSwitch.click(),
    ]);

    // Verify DELETE was sent
    expect(apiRequest.method).toBe('DELETE');
    // URL should contain the module ID
    expect(apiRequest.url).toContain(`/api/applications/${app.id}/modules/`);
  });

  test('archived application has disabled module switches', async ({ page, seedIds }) => {
    await navigateToEntity(page, 'applications', seedIds.archivedAppId);
    await clickTab(page, 'Modules');

    // All switches should be disabled for archived apps
    const switches = page.getByRole('switch');
    const count = await switches.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      await expect(switches.nth(i)).toBeDisabled();
    }
  });

  test('archives active application with type-to-confirm', async ({ page, request, seedIds }) => {
    // Create a fresh app to archive (don't modify seed data)
    const appName = uniqueName('Archive Target');
    const app = await createTestApp(request, seedIds.activeOrgId, appName);
    const expectedSlug = app.slug;

    await navigateToEntity(page, 'applications', app.id);

    // App should show active status and Archive button
    await expect(page.getByText(/active/i).first()).toBeVisible();
    const archiveButton = page.getByRole('button', { name: /archive/i });
    await expect(archiveButton).toBeVisible();

    // Click Archive
    await archiveButton.click();

    // Archive dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Archive Application')).toBeVisible();

    // The confirm button should be disabled until we type the slug
    const confirmButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /archive application/i });
    await expect(confirmButton).toBeDisabled();

    // Type the slug to confirm
    const dialogInput = page.getByRole('dialog').getByRole('textbox');
    await dialogInput.fill(expectedSlug);

    // Now the confirm button should be enabled
    await expect(confirmButton).toBeEnabled({ timeout: 5_000 });

    // Capture the archive POST request
    const [request_] = await Promise.all([
      captureApiRequest(page, `/api/applications/${app.id}/archive`),
      confirmButton.click(),
    ]);

    expect(request_.method).toBe('POST');

    // After archiving, status should change to archived
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/archived/i).first()).toBeVisible({ timeout: 10_000 });

    // Archive button should no longer be visible
    await expect(page.getByRole('button', { name: /archive/i })).not.toBeVisible();
  });

  test('cancel archive dialog does not change status', async ({ page, request, seedIds }) => {
    // Create a fresh app
    const app = await createTestApp(request, seedIds.activeOrgId, uniqueName('Cancel Archive'));

    await navigateToEntity(page, 'applications', app.id);

    // Click Archive
    await page.getByRole('button', { name: /archive/i }).click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();

    // Cancel the dialog
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Status should still be active
    await expect(page.getByText(/active/i).first()).toBeVisible();

    // Archive button should still be available
    await expect(page.getByRole('button', { name: /archive/i })).toBeVisible();
  });
});
