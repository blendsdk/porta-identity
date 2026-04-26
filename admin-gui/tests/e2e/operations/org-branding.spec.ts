/**
 * Organization Branding E2E tests.
 *
 * Tests the Branding tab on the organization detail page through the
 * full BFF → Porta → PostgreSQL stack. Verifies:
 * - BrandingEditor rendering (logo, favicon, color picker, company name, CSS)
 * - Logo and favicon file uploads via file chooser
 * - Primary color selection via hex input
 * - Company name text entry
 * - File size validation (oversized file rejected client-side)
 * - Live preview updates reflecting changes before save
 *
 * @see plans/admin-gui-testing/04-entity-e2e-tests.md — Organization Branding
 */

import path from 'path';
import { test, expect } from '../fixtures/admin-fixtures';
import {
  navigateToEntity,
  clickTab,
} from '../helpers/operations';
import { captureApiRequest } from '../helpers/api-interceptors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path to test fixture images */
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/test-images');
const TEST_LOGO_PATH = path.join(FIXTURES_DIR, 'test-logo.png');
const TEST_FAVICON_PATH = path.join(FIXTURES_DIR, 'test-favicon.png');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to an org's Branding tab */
async function goToBranding(
  page: import('@playwright/test').Page,
  orgId: string,
): Promise<void> {
  await navigateToEntity(page, 'organizations', orgId);
  await clickTab(page, 'Branding');
}

// ---------------------------------------------------------------------------
// Organization Branding Tests
// ---------------------------------------------------------------------------

test.describe('Organization Branding', () => {
  test('branding tab renders editor with all fields', async ({ page, seedIds }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Section titles
    await expect(page.getByText('Branding Settings')).toBeVisible();
    await expect(page.getByText('Preview')).toBeVisible();

    // Upload buttons
    await expect(page.getByRole('button', { name: /upload logo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /upload favicon/i })).toBeVisible();

    // Color picker label
    await expect(page.getByText('Primary Color')).toBeVisible();

    // Company name input
    await expect(page.getByPlaceholder(/company name/i)).toBeVisible();

    // Custom CSS textarea
    await expect(page.getByPlaceholder(/custom css/i)).toBeVisible();

    // Live preview elements
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    await expect(page.getByText('Your Company')).toBeVisible();
  });

  test('uploads logo image and shows preview', async ({ page, seedIds }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Use Playwright's file chooser API to upload a logo
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload logo/i }).click(),
    ]);

    await fileChooser.setFiles(TEST_LOGO_PATH);

    // After upload, the logo preview image should appear
    // The BrandingEditor shows an <img> with alt="Organization logo"
    const logoPreview = page.getByAltText('Organization logo');
    await expect(logoPreview).toBeVisible({ timeout: 5_000 });

    // The preview section should also show the logo
    const previewLogo = page.getByAltText('Preview logo');
    await expect(previewLogo).toBeVisible();

    // A "Remove" button should appear for the uploaded logo
    await expect(
      page.getByRole('button', { name: /remove/i }).first(),
    ).toBeVisible();
  });

  test('uploads favicon image and shows preview', async ({ page, seedIds }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Upload favicon
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload favicon/i }).click(),
    ]);

    await fileChooser.setFiles(TEST_FAVICON_PATH);

    // Favicon preview image should appear
    const faviconPreview = page.getByAltText('Organization favicon');
    await expect(faviconPreview).toBeVisible({ timeout: 5_000 });
  });

  test('sets primary color via hex input', async ({ page, seedIds }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Find the hex color input (aria-label="Primary Color hex value")
    const hexInput = page.getByLabel('Primary Color hex value');
    await hexInput.fill('#FF5733');

    // Color preview swatch should appear (aria-label="Preview: #FF5733")
    const swatch = page.getByLabel(/Preview: #FF5733/i);
    await expect(swatch).toBeVisible();

    // Clear button should appear
    await expect(page.getByLabel('Clear color')).toBeVisible();

    // Now save and verify the API payload
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations/'),
      page.getByRole('button', { name: /save branding/i }).click(),
    ]);

    const body = request.body as Record<string, unknown>;
    expect(body.brandingPrimaryColor).toBe('#FF5733');
  });

  test('sets company name and verifies in save payload', async ({ page, seedIds }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Fill the company name field
    const companyInput = page.getByPlaceholder(/company name/i);
    await companyInput.fill('Acme Industries');

    // The live preview should update to show the company name
    await expect(page.getByText('Acme Industries')).toBeVisible();

    // Save and verify payload
    const [request] = await Promise.all([
      captureApiRequest(page, '/api/organizations/'),
      page.getByRole('button', { name: /save branding/i }).click(),
    ]);

    const body = request.body as Record<string, unknown>;
    expect(body.brandingCompanyName).toBe('Acme Industries');
  });

  test('validates image file size and shows error for oversized file', async ({
    page,
    seedIds,
  }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Upload an oversized logo (> 512KB limit)
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload logo/i }).click(),
    ]);

    // Create an in-memory oversized file (600KB of zeros)
    await fileChooser.setFiles({
      name: 'oversized-logo.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(600 * 1024),
    });

    // Should show a file size error message
    await expect(
      page.getByText(/file too large|maximum size/i),
    ).toBeVisible({ timeout: 5_000 });

    // The logo preview should NOT show the oversized file
    await expect(page.getByAltText('Organization logo')).not.toBeVisible();
  });

  test('live preview updates reflect changes before save', async ({ page, seedIds }) => {
    await goToBranding(page, seedIds.activeOrgId);

    // Set a company name — preview header should update
    const companyInput = page.getByPlaceholder(/company name/i);
    await companyInput.fill('Live Preview Corp');

    // The preview should show the company name instead of "Your Company"
    await expect(page.getByText('Live Preview Corp')).toBeVisible();
    await expect(page.getByText('Your Company')).not.toBeVisible();

    // Set a primary color — preview button and header border should update
    const hexInput = page.getByLabel('Primary Color hex value');
    await hexInput.fill('#00AA55');

    // The preview "Sign In" button should have the color applied
    // (We can verify the swatch preview exists with that color)
    await expect(page.getByLabel(/Preview: #00AA55/i)).toBeVisible();

    // Upload a logo — preview should show it
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload logo/i }).click(),
    ]);
    await fileChooser.setFiles(TEST_LOGO_PATH);

    // Preview logo should appear
    await expect(page.getByAltText('Preview logo')).toBeVisible({ timeout: 5_000 });

    // All changes visible in preview, but NOT yet saved to server
    // (No API call should have been made yet)
  });

  test('branding editor is disabled for archived organization', async ({
    page,
    seedIds,
  }) => {
    await goToBranding(page, seedIds.archivedOrgId);

    // Upload buttons should be disabled
    await expect(page.getByRole('button', { name: /upload logo/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /upload favicon/i })).toBeDisabled();

    // Company name input should be disabled
    await expect(page.getByPlaceholder(/company name/i)).toBeDisabled();

    // Custom CSS textarea should be disabled
    await expect(page.getByPlaceholder(/custom css/i)).toBeDisabled();

    // Save button should NOT be rendered for archived orgs
    await expect(page.getByRole('button', { name: /save branding/i })).not.toBeVisible();
  });
});
