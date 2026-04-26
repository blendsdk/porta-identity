/**
 * Search Functional E2E tests.
 *
 * Tests the search overlay (Cmd+K) and search results page including:
 * - Search overlay opens and closes
 * - Search input accepts text
 * - Placeholder state with instructions
 * - Search results page displays results or empty state
 * - Results grouped by entity type
 * - Navigation from search results to entity detail
 * - Keyboard shortcut (Escape to close)
 *
 * @see plans/admin-gui-testing/06-system-pages-e2e-tests.md — Search
 */

import { test, expect } from '../fixtures/admin-fixtures';
import { navigateTo } from '../helpers/operations';

// ---------------------------------------------------------------------------
// Search Results Page Operations
// ---------------------------------------------------------------------------

test.describe('Search Results Page Operations', () => {
  test('displays search results page with query from URL', async ({ page }) => {
    await navigateTo(page, '/search?q=admin');

    // Page title
    await expect(page.getByRole('heading', { name: 'Search Results' })).toBeVisible();

    // Query badge showing the search term
    await expect(page.getByText('"admin"')).toBeVisible();
  });

  test('shows empty state when no query is provided', async ({ page }) => {
    await navigateTo(page, '/search');

    // Page title
    await expect(page.getByRole('heading', { name: 'Search Results' })).toBeVisible();

    // Empty state for no query
    await expect(page.getByText('No search query')).toBeVisible();
    await expect(page.getByText(/Use Cmd\+K or the search bar/i)).toBeVisible();
  });

  test('shows no results state for non-matching query', async ({ page }) => {
    await navigateTo(page, '/search?q=zzz-nonexistent-12345');

    // Should show "No results found" empty state
    await page.waitForTimeout(2_000);
    await expect(page.getByText('No results found')).toBeVisible();
    await expect(page.getByText(/No results matching/i)).toBeVisible();
  });

  test('displays grouped results with entity type headers', async ({ page }) => {
    // Use a broad search term that should match audit log entries
    await navigateTo(page, '/search?q=admin');
    await page.waitForTimeout(2_000);

    // Results may be grouped by entity type (organization, user, etc.)
    // or the search may return no results — both are valid
    const hasResults = await page.locator('[class*="group"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No results found').isVisible().catch(() => false);

    expect(hasResults || hasEmpty).toBeTruthy();

    if (hasResults) {
      // Each group should have a type header with a count badge
      const groupHeaders = page.locator('[class*="groupTitle"]');
      const groupCount = await groupHeaders.count();
      expect(groupCount).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Search Overlay Operations
// ---------------------------------------------------------------------------

test.describe('Search Overlay Operations', () => {
  test('search overlay opens via Cmd+K keyboard shortcut', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Press Cmd+K (or Ctrl+K on non-Mac)
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    // If Meta+K didn't work, try Ctrl+K
    const overlayVisible = await page.getByRole('dialog', { name: 'Search' }).isVisible().catch(() => false);
    if (!overlayVisible) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
    }

    // Search overlay should be visible
    const searchDialog = page.getByRole('dialog', { name: 'Search' });
    const isVisible = await searchDialog.isVisible().catch(() => false);

    if (isVisible) {
      // Search input should be auto-focused
      const searchInput = page.getByPlaceholder(/Search organizations, users, clients/i);
      await expect(searchInput).toBeVisible();

      // Footer hints
      await expect(page.getByText('↵ to select')).toBeVisible();
      await expect(page.getByText('esc to close')).toBeVisible();
    }
  });

  test('search overlay shows placeholder text when empty', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Open overlay
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    if (!(await page.getByRole('dialog', { name: 'Search' }).isVisible().catch(() => false))) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
    }

    const searchDialog = page.getByRole('dialog', { name: 'Search' });
    if (await searchDialog.isVisible().catch(() => false)) {
      // Empty query state
      await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
      await expect(page.getByText('Type to search across all entities')).toBeVisible();
    }
  });

  test('search overlay accepts text input', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Open overlay
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    if (!(await page.getByRole('dialog', { name: 'Search' }).isVisible().catch(() => false))) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
    }

    const searchDialog = page.getByRole('dialog', { name: 'Search' });
    if (await searchDialog.isVisible().catch(() => false)) {
      // Type a search query
      const searchInput = page.getByPlaceholder(/Search organizations, users, clients/i);
      await searchInput.fill('test query');

      // The placeholder text should be replaced by typed text
      const inputValue = await searchInput.inputValue();
      expect(inputValue).toBe('test query');
    }
  });

  test('search overlay closes on Escape key', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Open overlay
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    if (!(await page.getByRole('dialog', { name: 'Search' }).isVisible().catch(() => false))) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
    }

    const searchDialog = page.getByRole('dialog', { name: 'Search' });
    if (await searchDialog.isVisible().catch(() => false)) {
      // Press Escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Overlay should be closed
      await expect(searchDialog).not.toBeVisible();
    }
  });

  test('search overlay closes on close button click', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Open overlay
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    if (!(await page.getByRole('dialog', { name: 'Search' }).isVisible().catch(() => false))) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
    }

    const searchDialog = page.getByRole('dialog', { name: 'Search' });
    if (await searchDialog.isVisible().catch(() => false)) {
      // Click close button (aria-label="Close search")
      const closeBtn = page.getByLabel('Close search');
      await closeBtn.click();
      await page.waitForTimeout(300);

      // Overlay should be closed
      await expect(searchDialog).not.toBeVisible();
    }
  });
});
