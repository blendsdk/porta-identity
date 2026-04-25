/**
 * Shared test fixtures for Admin GUI E2E tests.
 *
 * Extends Playwright's base `test` with admin-specific fixtures:
 *   - `testData`: Environment-derived test constants (URLs, emails, etc.)
 *   - `mailhog`: Pre-configured MailHog client for email verification
 *   - `page`: Overridden page fixture with automatic React error detection
 *
 * React Error Detection:
 *   Every test using this fixture automatically monitors for:
 *   1. Uncaught JavaScript errors (via `pageerror` event)
 *   2. React error boundaries (checks for "Unexpected Application Error!")
 *   If either is detected, the test fails with a descriptive error message.
 *   This ensures page crashes are never silently ignored.
 *
 * Usage in test files:
 *   import { test, expect } from '../fixtures/admin-fixtures';
 *
 *   test('example', async ({ page, testData, mailhog }) => {
 *     await page.goto(testData.bffUrl);
 *     // ...
 *   });
 *
 * All authenticated tests automatically load the storageState from
 * .auth/admin-session.json (configured in playwright.config.ts).
 */

import { test as base, expect } from '@playwright/test';
import { MailHogClient } from './mailhog.js';

// ---------------------------------------------------------------------------
// Test Data Interface
// ---------------------------------------------------------------------------

/**
 * Environment-derived test constants.
 *
 * Values are set by global-setup.ts via process.env and read here.
 * This provides a typed interface instead of scattered process.env reads.
 */
export interface AdminTestData {
  /** Admin GUI BFF base URL (e.g., http://localhost:49301) */
  bffUrl: string;
  /** Porta OIDC server base URL (e.g., http://localhost:49300) */
  portaUrl: string;
  /** Admin user email (used for login assertions) */
  adminEmail: string;
  /** MailHog API base URL (e.g., http://localhost:8025) */
  mailhogUrl: string;
}

// ---------------------------------------------------------------------------
// Extended Test with Fixtures
// ---------------------------------------------------------------------------

/**
 * Extended Playwright test with admin-specific fixtures.
 *
 * Fixtures:
 *   - `page` — Overridden with automatic React error detection
 *   - `testData` — Typed test constants from environment variables
 *   - `mailhog` — MailHog API client instance (pre-configured)
 */
export const test = base.extend<{
  /** Typed test data from environment variables */
  testData: AdminTestData;
  /** MailHog API client for email verification */
  mailhog: MailHogClient;
}>({
  /**
   * Override the default page fixture to add automatic error detection.
   *
   * Monitors for:
   *   1. Uncaught JS errors (via pageerror event) — captures all errors thrown
   *      during the test, then asserts none occurred in the fixture teardown.
   *   2. React error boundary — after the test body completes, checks if the
   *      page shows React Router's "Unexpected Application Error!" screen.
   *
   * This means tests don't need to manually check for errors — any React
   * crash or uncaught exception will automatically fail the test.
   */
  page: async ({ page }, use) => {
    // Collect uncaught JavaScript errors from the browser page.
    // React errors that escape error boundaries appear here.
    const pageErrors: Error[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });

    // Run the actual test body
    await use(page);

    // ── Post-test checks (fixture teardown) ──────────────────────────

    // Check 1: React Router error boundary
    // When a route component throws, React Router shows a full-page error
    // with heading "Unexpected Application Error!" — detect this.
    const errorBoundary = page.locator('text="Unexpected Application Error!"');
    const hasErrorBoundary = await errorBoundary.isVisible().catch(() => false);

    if (hasErrorBoundary) {
      // Extract the error message from the <h3> element below the heading
      const errorMessage = await page
        .locator('h2 + h3, h2 + p')
        .first()
        .textContent()
        .catch(() => 'unknown error');

      throw new Error(
        `React error boundary triggered on page.\n` +
          `Error: ${errorMessage}\n` +
          `URL: ${page.url()}\n` +
          `This indicates a runtime crash in a React component.`,
      );
    }

    // Check 2: Uncaught JavaScript errors
    // Filter out known noise (e.g., ResizeObserver in some browsers)
    const realErrors = pageErrors.filter(
      (e) => !e.message.includes('ResizeObserver loop'),
    );

    if (realErrors.length > 0) {
      const messages = realErrors
        .map((e, i) => `  ${i + 1}. ${e.message}`)
        .join('\n');

      throw new Error(
        `Page had ${realErrors.length} uncaught JavaScript error(s):\n` +
          `${messages}\n` +
          `URL: ${page.url()}\n` +
          `These errors indicate runtime crashes that must be fixed.`,
      );
    }
  },

  testData: async ({}, use) => {
    const data: AdminTestData = {
      bffUrl: process.env.ADMIN_GUI_URL ?? 'http://localhost:49301',
      portaUrl: process.env.PORTA_URL ?? 'http://localhost:49300',
      adminEmail: process.env.ADMIN_EMAIL ?? 'admin@porta-test.local',
      mailhogUrl: process.env.MAILHOG_API_URL ?? 'http://localhost:8025',
    };
    await use(data);
  },

  mailhog: async ({ testData }, use) => {
    const client = new MailHogClient(testData.mailhogUrl);
    await use(client);
  },
});

// Re-export expect for convenience — test files only need one import
export { expect };
