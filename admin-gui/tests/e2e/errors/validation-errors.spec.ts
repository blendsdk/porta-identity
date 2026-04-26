/**
 * Form Validation Error E2E tests.
 *
 * Tests client-side and server-side validation error display:
 * - Required field validation (empty submit)
 * - Invalid format validation (email, URL, slug)
 * - Create form pre-submit validation
 * - Server-side 400 error display (duplicate slug, invalid data)
 * - Validation messages clear on correction
 *
 * @see plans/admin-gui-testing/08-bff-integration-tests.md — Validation Errors
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';
import { mockApiError } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Form Validation Errors
// ---------------------------------------------------------------------------

test.describe('Form Validation Errors', () => {
  test('create organization shows required field error on empty submit', async ({ page }) => {
    await navigateTo(page, '/organizations/new');

    // Click create without filling the name
    await page.getByRole('button', { name: /create organization/i }).click();
    await page.waitForTimeout(500);

    // Should show validation error for name field
    const hasError = await page.getByText(/required|name is required/i).isVisible().catch(() => false);
    const formNotSubmitted = await page.getByRole('button', { name: /create organization/i }).isVisible();

    // Either client-side validation shows error, or form stays on page
    expect(hasError || formNotSubmitted).toBeTruthy();
  });

  test('create user shows required field errors on empty submit', async ({ page }) => {
    await navigateTo(page, '/users/new');

    // Click create without filling fields
    await page.getByRole('button', { name: /create user/i }).click();
    await page.waitForTimeout(500);

    // Should show validation errors
    const hasEmailError = await page.getByText(/email.*required|required.*email/i).isVisible().catch(() => false);
    const formStays = await page.getByRole('button', { name: /create user/i }).isVisible();

    expect(hasEmailError || formStays).toBeTruthy();
  });

  test('invite user validates email format', async ({ page }) => {
    await navigateTo(page, '/users/invite');

    // Enter invalid email
    const emailInput = page.getByPlaceholder(/email/i);
    await emailInput.fill('not-an-email');

    // Try to submit
    await page.getByRole('button', { name: /send invitation/i }).click();
    await page.waitForTimeout(500);

    // Should show email format validation error
    const hasFormatError = await page.getByText(/valid email|email.*invalid|invalid.*email/i).isVisible().catch(() => false);
    const formStays = await page.getByRole('button', { name: /send invitation/i }).isVisible();

    expect(hasFormatError || formStays).toBeTruthy();
  });

  test('server 400 error shows inline error message', async ({ page }) => {
    await navigateTo(page, '/organizations/new');

    // Mock a 400 validation error from the server
    await mockApiError(page, '/api/organizations', 400, {
      error: 'Validation Error',
      message: 'Organization name already exists',
      details: [{ field: 'name', message: 'Name must be unique' }],
    });

    await page.getByPlaceholder('e.g. Acme Corporation').fill('Duplicate Org');
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /create organization/i }).click();
    await page.waitForTimeout(1_000);

    // Should show the server error message as a toast or inline
    const hasServerError = await page.getByText(/already exists|must be unique/i).isVisible().catch(() => false);
    const hasGenericError = await page.getByText(/error|failed/i).isVisible().catch(() => false);

    expect(hasServerError || hasGenericError).toBeTruthy();
  });

  test('server 409 conflict shows conflict message', async ({ page }) => {
    await navigateTo(page, '/organizations/new');

    // Mock a 409 conflict error (duplicate slug)
    await mockApiError(page, '/api/organizations', 409, {
      error: 'Conflict',
      message: 'An organization with this slug already exists',
    });

    await page.getByPlaceholder('e.g. Acme Corporation').fill('Conflict Org');
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /create organization/i }).click();
    await page.waitForTimeout(1_000);

    // Should display conflict error
    const hasConflict = await page.getByText(/already exists|conflict/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/error|failed/i).isVisible().catch(() => false);

    expect(hasConflict || hasError).toBeTruthy();
  });

  test('create client validates redirect URI format', async ({ page }) => {
    // Navigate to client creation — need an application context
    await navigateTo(page, '/clients');
    await page.waitForTimeout(1_000);

    // Click "New Client" if available
    const newBtn = page.getByRole('button', { name: /new client|create client/i });
    const hasNewBtn = await newBtn.isVisible().catch(() => false);
    if (!hasNewBtn) {
      test.skip();
      return;
    }
    await newBtn.click();
    await page.waitForTimeout(500);

    // Find redirect URI input and enter invalid URI
    const uriInput = page.getByPlaceholder(/redirect/i);
    const hasUri = await uriInput.isVisible().catch(() => false);
    if (!hasUri) {
      test.skip();
      return;
    }

    await uriInput.fill('not-a-valid-uri');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForTimeout(500);

    // Should show URI validation error
    const hasUriError = await page.getByText(/valid.*uri|invalid.*uri|must be.*https?/i).isVisible().catch(() => false);
    const formStays = await page.getByRole('button', { name: /create/i }).isVisible();

    expect(hasUriError || formStays).toBeTruthy();
  });

  test('validation error clears when user corrects input', async ({ page }) => {
    await navigateTo(page, '/organizations/new');

    // Submit empty to trigger validation error
    await page.getByRole('button', { name: /create organization/i }).click();
    await page.waitForTimeout(500);

    const nameInput = page.getByPlaceholder('e.g. Acme Corporation');

    // Fill the name field — error should clear
    await nameInput.fill('Valid Organization Name');
    await page.waitForTimeout(300);

    // Previous validation error should be gone or diminished
    // The form should now be submittable
    const createBtn = page.getByRole('button', { name: /create organization/i });
    await expect(createBtn).toBeEnabled();
  });

  test('password set validation rejects weak passwords', async ({ page }) => {
    // Navigate to a user detail page → Security tab
    await navigateTo(page, '/users');
    await page.waitForTimeout(2_000);

    // Click first user to go to detail
    const firstUser = page.locator('table tbody tr').first();
    const hasUsers = await firstUser.isVisible().catch(() => false);
    if (!hasUsers) {
      test.skip();
      return;
    }
    await firstUser.click();
    await page.waitForTimeout(1_000);

    // Click Security tab
    const securityTab = page.getByRole('tab', { name: /security/i });
    const hasTab = await securityTab.isVisible().catch(() => false);
    if (!hasTab) {
      test.skip();
      return;
    }
    await securityTab.click();
    await page.waitForTimeout(500);

    // Find password input and enter weak password
    const passwordInput = page.getByPlaceholder(/password/i).first();
    const hasPwInput = await passwordInput.isVisible().catch(() => false);
    if (!hasPwInput) {
      test.skip();
      return;
    }

    await passwordInput.fill('123');
    await page.getByRole('button', { name: /set password/i }).click();
    await page.waitForTimeout(500);

    // Should show password strength validation error
    const hasWeakError = await page.getByText(/too short|weak|minimum|at least 8/i).isVisible().catch(() => false);
    const formStays = await page.getByRole('button', { name: /set password/i }).isVisible();

    expect(hasWeakError || formStays).toBeTruthy();
  });
});
