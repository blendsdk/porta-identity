/**
 * Direct URL navigation tests.
 *
 * Tests that every page can be loaded by directly visiting its URL
 * (not by clicking a sidebar link). This is a stricter test than
 * sidebar navigation because it forces a full SPA cold start at
 * the target route, which exercises different code paths:
 *   - Data loading without pre-populated context
 *   - Component rendering without cached API responses
 *   - Error handling for missing/loading states
 *
 * These tests rely on the automatic React error detection in
 * admin-fixtures.ts — if a page crashes with a React error boundary
 * or throws an uncaught JS error, the test will fail automatically.
 */

import { test, expect } from '../fixtures/admin-fixtures';

/**
 * All admin GUI pages and their expected routes.
 * Each entry is tested by navigating directly to the URL.
 */
/**
 * Known pages that crash on direct URL access (cold navigation).
 * These have pre-existing bugs where components try to access
 * API response data before it's loaded. Once fixed, remove the
 * page from this set — the test will then auto-detect the fix
 * (test.fail() will flip to a failure if the page stops crashing).
 */
const KNOWN_BROKEN_PAGES = new Set([
  '/sessions',    // Cannot read properties of null (reading 'slice')
  '/audit',       // Cannot read properties of undefined (reading 'replace')
  '/config',      // s.map is not a function
]);

const PAGES = [
  { name: 'Dashboard', path: '/' },
  { name: 'Organizations', path: '/organizations' },
  { name: 'Applications', path: '/applications' },
  { name: 'Clients', path: '/clients' },
  { name: 'Users', path: '/users' },
  { name: 'Roles', path: '/roles' },
  { name: 'Permissions', path: '/permissions' },
  { name: 'Custom Claims', path: '/claims' },
  { name: 'Sessions', path: '/sessions' },
  { name: 'Audit Log', path: '/audit' },
  { name: 'Configuration', path: '/config' },
  { name: 'Signing Keys', path: '/keys' },
  { name: 'Import / Export', path: '/import-export' },
];

test.describe('Direct URL Navigation', () => {
  for (const { name, path } of PAGES) {
    test(`${name} (${path}) loads without React errors`, async ({ page }) => {
      // Mark known broken pages as expected failures.
      // When the bug is fixed, this test will auto-detect:
      // Playwright reports "expected to fail but passed" → remove from KNOWN_BROKEN_PAGES.
      if (KNOWN_BROKEN_PAGES.has(path)) {
        test.fail(true, `Known bug: ${name} crashes on direct URL navigation`);
      }

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // Verify the URL didn't redirect away (e.g., to login)
      await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`));

      // The page should not show a React error boundary.
      // This is checked automatically by admin-fixtures teardown,
      // but we also do an explicit check here for clarity.
      const errorBoundary = page.locator('text="Unexpected Application Error!"');
      await expect(errorBoundary).not.toBeVisible({ timeout: 3_000 });
    });
  }
});
