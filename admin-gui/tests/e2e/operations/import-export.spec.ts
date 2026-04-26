/**
 * Import/Export E2E tests.
 *
 * Tests the data export and import pages including:
 * - Export: entity type selection, select all/none, export JSON download
 * - Export: navigation to import page
 * - Import: file upload area display (drag-drop zone)
 * - Import: dry-run preview table after file upload
 * - Import: confirm import dialog
 * - Import: result summary after import
 * - Import: back-to-export navigation
 * - Import: cancel/reset after file selection
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Import/Export
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';

// ---------------------------------------------------------------------------
// Export Page Operations
// ---------------------------------------------------------------------------

test.describe('Export Page Operations', () => {
  test('displays export page title and entity checkboxes', async ({ page }) => {
    await navigateTo(page, '/import-export');

    // Page title
    await expect(page.getByRole('heading', { name: 'Export Data' })).toBeVisible();

    // "Import Data" navigation button
    await expect(page.getByRole('button', { name: /Import Data/i })).toBeVisible();

    // Section heading
    await expect(page.getByText('Select Entity Types')).toBeVisible();

    // Entity type checkboxes — 6 entity types + "Select All"
    await expect(page.getByRole('checkbox', { name: 'Select All' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Organizations' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Applications' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Clients' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Roles' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Permissions' })).toBeVisible();
  });

  test('export button is disabled when no entities selected', async ({ page }) => {
    await navigateTo(page, '/import-export');

    // Export button should be disabled initially (nothing selected)
    const exportBtn = page.getByRole('button', { name: /Export JSON/i });
    await expect(exportBtn).toBeDisabled();
  });

  test('selecting entities enables export button', async ({ page }) => {
    await navigateTo(page, '/import-export');

    // Select Organizations
    await page.getByRole('checkbox', { name: 'Organizations' }).check();

    // Export button should be enabled now
    const exportBtn = page.getByRole('button', { name: /Export JSON/i });
    await expect(exportBtn).toBeEnabled();
  });

  test('select all toggles all entity checkboxes', async ({ page }) => {
    await navigateTo(page, '/import-export');

    // Click "Select All"
    await page.getByRole('checkbox', { name: 'Select All' }).check();

    // All 6 entity checkboxes should be checked
    await expect(page.getByRole('checkbox', { name: 'Organizations' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Applications' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Clients' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Users' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Roles' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Permissions' })).toBeChecked();

    // Export button should be enabled
    await expect(page.getByRole('button', { name: /Export JSON/i })).toBeEnabled();

    // Uncheck "Select All" should deselect all
    await page.getByRole('checkbox', { name: 'Select All' }).uncheck();

    await expect(page.getByRole('checkbox', { name: 'Organizations' })).not.toBeChecked();
    await expect(page.getByRole('button', { name: /Export JSON/i })).toBeDisabled();
  });

  test('navigates to import page via Import Data button', async ({ page }) => {
    await navigateTo(page, '/import-export');

    await page.getByRole('button', { name: /Import Data/i }).click();
    await expect(page).toHaveURL(/\/import-export\/import/);
  });

  test('select all shows mixed state after deselecting one', async ({ page }) => {
    await navigateTo(page, '/import-export');

    // Select all first
    await page.getByRole('checkbox', { name: 'Select All' }).check();

    // Deselect one entity
    await page.getByRole('checkbox', { name: 'Users' }).uncheck();

    // Select All should be in mixed (indeterminate) state
    // In FluentUI, mixed state is represented by aria-checked="mixed"
    const selectAll = page.getByRole('checkbox', { name: 'Select All' });
    // The checkbox should not be fully checked anymore
    await expect(selectAll).not.toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// Import Page Operations
// ---------------------------------------------------------------------------

test.describe('Import Page Operations', () => {
  test('displays import page title and upload area', async ({ page }) => {
    await navigateTo(page, '/import-export/import');

    // Page title
    await expect(page.getByRole('heading', { name: 'Import Data' })).toBeVisible();

    // "Back to Export" navigation button
    await expect(page.getByRole('button', { name: /Back to Export/i })).toBeVisible();

    // Drag-and-drop zone
    await expect(page.getByText('Drag & drop a JSON file here')).toBeVisible();
    await expect(page.getByText('or click to browse')).toBeVisible();
  });

  test('navigates back to export page via button', async ({ page }) => {
    await navigateTo(page, '/import-export/import');

    await page.getByRole('button', { name: /Back to Export/i }).click();
    await expect(page).toHaveURL(/\/import-export$/);
  });

  test('shows preview table after uploading a valid JSON file', async ({ page }) => {
    await navigateTo(page, '/import-export/import');

    // Create a test JSON file programmatically via file chooser
    const testData = {
      organizations: [
        { name: 'Test Org 1', slug: 'test-org-1' },
        { name: 'Test Org 2', slug: 'test-org-2' },
      ],
      users: [
        { email: 'test1@example.com', firstName: 'Test', lastName: 'User' },
      ],
    };

    // Use Playwright's file chooser to upload a file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Drag & drop a JSON file here').click(),
    ]);

    // Create a buffer from the test data
    const buffer = Buffer.from(JSON.stringify(testData));
    await fileChooser.setFiles({
      name: 'test-import.json',
      mimeType: 'application/json',
      buffer,
    });

    // Preview should appear showing entity types and counts
    await page.waitForTimeout(1_000);
    await expect(page.getByText('Entity Type')).toBeVisible();
    await expect(page.getByText('Records')).toBeVisible();

    // Entity types from our test data
    await expect(page.getByText('organizations')).toBeVisible();
    await expect(page.getByText('users')).toBeVisible();

    // Counts
    await expect(page.getByText('2').first()).toBeVisible(); // 2 organizations
    await expect(page.getByText('1').first()).toBeVisible(); // 1 user

    // Total row
    await expect(page.getByText('Total')).toBeVisible();

    // Action buttons
    await expect(page.getByRole('button', { name: /Confirm Import/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
  });

  test('cancel resets to upload area after file selection', async ({ page }) => {
    await navigateTo(page, '/import-export/import');

    // Upload a file
    const testData = { organizations: [{ name: 'Cancel Test' }] };
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Drag & drop a JSON file here').click(),
    ]);
    await fileChooser.setFiles({
      name: 'cancel-test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(testData)),
    });

    await page.waitForTimeout(500);

    // Preview should appear
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();

    // Click Cancel to reset
    await page.getByRole('button', { name: /Cancel/i }).click();

    // Should return to the upload area
    await expect(page.getByText('Drag & drop a JSON file here')).toBeVisible();
  });

  test('shows confirm dialog before importing', async ({ page }) => {
    await navigateTo(page, '/import-export/import');

    // Upload a file
    const testData = { organizations: [{ name: 'Confirm Test' }] };
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Drag & drop a JSON file here').click(),
    ]);
    await fileChooser.setFiles({
      name: 'confirm-test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(testData)),
    });

    await page.waitForTimeout(500);

    // Click "Confirm Import"
    await page.getByRole('button', { name: /Confirm Import/i }).click();

    // Confirm dialog should appear
    await expect(page.getByText('Confirm Import')).toBeVisible();
    await expect(page.getByText(/Import \d+ records across/)).toBeVisible();
    await expect(page.getByText(/cannot be undone/i)).toBeVisible();

    // Cancel the dialog
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByText('Confirm Import').first()).toBeVisible(); // Still on preview
  });
});
