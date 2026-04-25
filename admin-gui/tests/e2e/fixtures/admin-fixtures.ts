/**
 * Shared test fixtures for Admin GUI E2E tests.
 *
 * Extends Playwright's base `test` with admin-specific fixtures:
 *   - `testData`: Environment-derived test constants (URLs, emails, etc.)
 *   - `mailhog`: Pre-configured MailHog client for email verification
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
 *   - `testData` — Typed test constants from environment variables
 *   - `mailhog` — MailHog API client instance (pre-configured)
 */
export const test = base.extend<{
  /** Typed test data from environment variables */
  testData: AdminTestData;
  /** MailHog API client for email verification */
  mailhog: MailHogClient;
}>({
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
