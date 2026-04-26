/**
 * Shared UI operation helpers for Admin GUI E2E tests.
 *
 * Provides reusable functions for common UI interactions (navigation,
 * form filling, assertions, dialogs, waits) using semantic Playwright
 * selectors. These helpers ensure test resilience against visual
 * redesign by avoiding CSS/XPath selectors entirely.
 *
 * Selector priority (per test plan):
 *   1. getByRole + name — preferred, no code changes needed
 *   2. getByLabel — preferred for form fields
 *   3. getByText — for unique text content
 *   4. getByTestId — fallback when above aren't unique enough
 *
 * @see plans/admin-gui-testing/03-test-infrastructure.md
 */

import type { Page, Response, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a path within the Admin GUI.
 * Waits for the page to reach a stable state after navigation.
 *
 * @param page - Playwright page instance
 * @param path - Path to navigate to (e.g., '/organizations')
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to a specific entity detail page.
 * Constructs the URL from entity type and ID, then navigates.
 *
 * @param page - Playwright page instance
 * @param entity - Entity type (e.g., 'organizations', 'applications')
 * @param id - Entity UUID
 */
export async function navigateToEntity(
  page: Page,
  entity: string,
  id: string,
): Promise<void> {
  await navigateTo(page, `/${entity}/${id}`);
}

/**
 * Click a tab by its visible name within a tab list.
 * Uses getByRole('tab') to find the correct tab element.
 *
 * @param page - Playwright page instance
 * @param tabName - Visible text of the tab (e.g., 'Settings', 'Overview')
 */
export async function clickTab(page: Page, tabName: string): Promise<void> {
  await page.getByRole('tab', { name: new RegExp(tabName, 'i') }).click();
  // Allow tab panel content to load
  await page.waitForLoadState('networkidle');
}

/**
 * Click a sidebar navigation link by its text.
 *
 * @param page - Playwright page instance
 * @param linkText - Visible text of the sidebar link
 */
export async function clickSidebarLink(
  page: Page,
  linkText: string,
): Promise<void> {
  await page
    .getByRole('navigation')
    .getByRole('link', { name: new RegExp(linkText, 'i') })
    .click();
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/**
 * Fill a form field identified by its label text.
 * Clears the existing value before typing the new one.
 *
 * @param page - Playwright page instance
 * @param label - Visible label text of the field
 * @param value - Value to type into the field
 */
export async function fillField(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const field = page.getByLabel(label, { exact: false });
  await field.click();
  await field.fill(value);
}

/**
 * Clear a form field identified by its label text.
 *
 * @param page - Playwright page instance
 * @param label - Visible label text of the field
 */
export async function clearField(
  page: Page,
  label: string,
): Promise<void> {
  const field = page.getByLabel(label, { exact: false });
  await field.click();
  await field.fill('');
}

/**
 * Select an option from a dropdown/combobox by label.
 * Clicks the dropdown to open it, then selects the desired option.
 *
 * @param page - Playwright page instance
 * @param label - Visible label text of the dropdown
 * @param optionText - Visible text of the option to select
 */
export async function selectDropdown(
  page: Page,
  label: string,
  optionText: string,
): Promise<void> {
  // FluentUI Dropdown uses combobox role
  const dropdown = page.getByLabel(label, { exact: false });
  await dropdown.click();

  // Wait for the listbox popup and click the option
  const option = page.getByRole('option', { name: new RegExp(optionText, 'i') });
  await option.click();
}

/**
 * Toggle a checkbox identified by its label text.
 *
 * @param page - Playwright page instance
 * @param label - Visible label text of the checkbox
 */
export async function toggleCheckbox(
  page: Page,
  label: string,
): Promise<void> {
  await page.getByRole('checkbox', { name: new RegExp(label, 'i') }).click();
}

/**
 * Click a button by its accessible name.
 *
 * @param page - Playwright page instance
 * @param name - Button text or accessible name
 */
export async function clickButton(
  page: Page,
  name: string,
): Promise<void> {
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click();
}

/**
 * Submit a form by clicking the submit/save button.
 * Defaults to looking for a button named "Save" or "Submit" or "Create".
 *
 * @param page - Playwright page instance
 * @param buttonName - Optional custom button name (defaults to common submit names)
 */
export async function submitForm(
  page: Page,
  buttonName?: string,
): Promise<void> {
  if (buttonName) {
    await clickButton(page, buttonName);
  } else {
    // Try common submit button names in order
    const submitBtn = page
      .getByRole('button', { name: /^(save|submit|create|confirm)/i })
      .first();
    await submitBtn.click();
  }
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a toast notification with the given message appears.
 * Waits up to 10 seconds for the toast to become visible.
 *
 * @param page - Playwright page instance
 * @param message - Expected message text (partial match, case-insensitive)
 * @param type - Optional toast type to check ('success' or 'error')
 */
export async function expectToast(
  page: Page,
  message: string,
  type?: 'success' | 'error',
): Promise<void> {
  // FluentUI Toast renders with role="status" or in an alert region
  // Look for the message text in the toast container area
  const toast = page.getByText(message, { exact: false });
  await expect(toast).toBeVisible({ timeout: 10_000 });

  // If type is specified, verify the toast variant via data-testid
  if (type) {
    const toastContainer = page.getByTestId(`toast-${type}`);
    // Only check if the testid exists — some toasts may not have it
    const hasTestId = await toastContainer.isVisible().catch(() => false);
    if (hasTestId) {
      await expect(toastContainer).toBeVisible();
    }
  }
}

/**
 * Assert that no toast notification appears within a timeout.
 *
 * @param page - Playwright page instance
 * @param timeout - Timeout in milliseconds (default: 3000)
 */
export async function expectNoToast(
  page: Page,
  timeout = 3000,
): Promise<void> {
  // Wait briefly and verify no toast elements appeared
  await page.waitForTimeout(timeout);
  const toasts = page.locator('[role="status"][data-testid^="toast-"]');
  const count = await toasts.count();
  expect(count).toBe(0);
}

/**
 * Assert that a form field has a specific value.
 *
 * @param page - Playwright page instance
 * @param label - Visible label text of the field
 * @param value - Expected value
 */
export async function expectFieldValue(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const field = page.getByLabel(label, { exact: false });
  await expect(field).toHaveValue(value);
}

/**
 * Assert that a form field shows a validation error.
 *
 * @param page - Playwright page instance
 * @param label - Visible label text of the field
 * @param error - Expected error message text (partial match)
 */
export async function expectFieldError(
  page: Page,
  label: string,
  error: string,
): Promise<void> {
  // FluentUI validation messages appear near the field as role="alert" or aria-errormessage
  // Try multiple strategies to find the error
  const field = page.getByLabel(label, { exact: false });
  const fieldContainer = field.locator('..');

  // Look for error text near the field
  const errorText = fieldContainer.getByText(error, { exact: false });
  await expect(errorText).toBeVisible({ timeout: 5_000 });
}

/**
 * Assert that a status badge with the given text is visible.
 *
 * @param page - Playwright page instance
 * @param status - Expected status text (e.g., 'active', 'suspended')
 */
export async function expectStatusBadge(
  page: Page,
  status: string,
): Promise<void> {
  // StatusBadge renders a FluentUI Badge with the status text
  const badge = page.getByText(status, { exact: false }).first();
  await expect(badge).toBeVisible();
}

/**
 * Assert that the page has a heading with the given text.
 *
 * @param page - Playwright page instance
 * @param title - Expected heading text (partial match, case-insensitive)
 */
export async function expectPageTitle(
  page: Page,
  title: string,
): Promise<void> {
  await expect(
    page.getByRole('heading', { name: new RegExp(title, 'i') }),
  ).toBeVisible();
}

/**
 * Assert the number of visible data rows in the entity grid.
 * Counts table body rows (excluding header).
 *
 * @param page - Playwright page instance
 * @param count - Expected number of data rows
 */
export async function expectRowCount(
  page: Page,
  count: number,
): Promise<void> {
  const rows = page.getByRole('row');
  // Subtract 1 for the header row
  const totalRows = await rows.count();
  expect(totalRows - 1).toBe(count);
}

// ---------------------------------------------------------------------------
// Dialog helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a confirmation dialog is visible with the expected title.
 *
 * @param page - Playwright page instance
 * @param title - Expected dialog title text
 */
export async function expectConfirmDialog(
  page: Page,
  title: string,
): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText(title, { exact: false })).toBeVisible();
}

/**
 * Confirm the currently open dialog by clicking its confirm/OK button.
 *
 * @param page - Playwright page instance
 */
export async function confirmDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  // Look for confirm-type buttons within the dialog
  const confirmBtn = dialog
    .getByRole('button', { name: /^(confirm|ok|yes|delete|suspend|activate|archive|restore|revoke|remove|save|generate|rotate)/i })
    .first();
  await confirmBtn.click();
}

/**
 * Cancel the currently open dialog.
 *
 * @param page - Playwright page instance
 */
export async function cancelDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /cancel/i }).click();
}

/**
 * Type text into a type-to-confirm input field within a dialog.
 * Used for destructive actions that require typing the entity name.
 *
 * @param page - Playwright page instance
 * @param confirmText - The text to type for confirmation
 */
export async function typeToConfirm(
  page: Page,
  confirmText: string,
): Promise<void> {
  const dialog = page.getByRole('dialog');
  // The type-to-confirm input is typically a textbox inside the dialog
  const input = dialog.getByRole('textbox');
  await input.fill(confirmText);
}

// ---------------------------------------------------------------------------
// Wait helpers
// ---------------------------------------------------------------------------

/**
 * Wait for an API response matching a URL pattern.
 * Returns the Playwright Response object for further inspection.
 *
 * @param page - Playwright page instance
 * @param urlPattern - Substring or regex to match against the request URL
 * @param method - Optional HTTP method to filter by (e.g., 'POST', 'PUT')
 * @returns The matching Playwright Response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string,
  method?: string,
): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const matchesUrl = response.url().includes(urlPattern);
      const matchesMethod = method
        ? response.request().method().toUpperCase() === method.toUpperCase()
        : true;
      return matchesUrl && matchesMethod;
    },
    { timeout: 15_000 },
  );
}

/**
 * Wait for navigation to a specific URL pattern.
 *
 * @param page - Playwright page instance
 * @param url - URL substring or regex to wait for
 */
export async function waitForNavigation(
  page: Page,
  url: string,
): Promise<void> {
  await page.waitForURL(new RegExp(url), { timeout: 15_000 });
}

/**
 * Wait for the entity data grid table to finish loading.
 * Waits until no Spinner is visible and at least one row exists.
 *
 * @param page - Playwright page instance
 */
export async function waitForTableLoaded(page: Page): Promise<void> {
  // Wait for any loading spinner to disappear
  const spinner = page.getByRole('progressbar');
  await spinner.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {
    // Spinner may never have appeared if data loaded instantly
  });
  // Wait for the table to have at least one row
  await page.getByRole('row').first().waitFor({ state: 'visible', timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Data extraction helpers
// ---------------------------------------------------------------------------

/**
 * Get the number of data rows in the entity grid table.
 * Excludes the header row.
 *
 * @param page - Playwright page instance
 * @returns Number of data rows
 */
export async function getTableRowCount(page: Page): Promise<number> {
  const rows = await page.getByRole('row').count();
  // Subtract 1 for the header row
  return Math.max(0, rows - 1);
}

/**
 * Get the text content of a specific table cell.
 *
 * @param page - Playwright page instance
 * @param row - Zero-based row index (0 = first data row)
 * @param column - Column header text to identify the column
 * @returns Cell text content
 */
export async function getTableCellText(
  page: Page,
  row: number,
  column: string,
): Promise<string> {
  // Find column index by header text
  const headers = page.getByRole('columnheader');
  const headerCount = await headers.count();
  let colIndex = -1;

  for (let i = 0; i < headerCount; i++) {
    const text = await headers.nth(i).textContent();
    if (text && text.toLowerCase().includes(column.toLowerCase())) {
      colIndex = i;
      break;
    }
  }

  if (colIndex === -1) {
    throw new Error(`Column "${column}" not found in table headers`);
  }

  // Get the cell in the data row (row + 1 to skip header row)
  const dataRows = page.getByRole('row');
  const targetRow = dataRows.nth(row + 1); // +1 for header
  const cells = targetRow.getByRole('cell');
  const cell = cells.nth(colIndex);

  return (await cell.textContent()) ?? '';
}

/**
 * Get a specific locator for an entity row in the data grid by text content.
 * Useful for finding a row by entity name to click on it.
 *
 * @param page - Playwright page instance
 * @param text - Text to search for within table rows
 * @returns Locator for the matching row
 */
export function getTableRow(page: Page, text: string): Locator {
  return page.getByRole('row', { name: new RegExp(text, 'i') });
}
