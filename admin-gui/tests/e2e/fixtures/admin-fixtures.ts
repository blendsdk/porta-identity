/**
 * Admin GUI E2E test fixtures.
 *
 * Extends Playwright's base `test` with an `AdminFixtures` interface
 * providing typed access to test environment data: admin email, URLs,
 * and MailHog API. All values come from environment variables set by
 * global-setup.ts during Playwright initialization.
 *
 * Usage in test files:
 *
 *   import { test, expect } from '../fixtures/admin-fixtures.js';
 *
 *   test('example', async ({ page, testData }) => {
 *     await page.goto(testData.adminGuiUrl);
 *     // testData.adminEmail, testData.portaUrl, etc.
 *   });
 *
 * @see setup/global-setup.ts — Sets env vars for all fixture values
 * @see setup/auth-setup.ts — Uses these same env vars for auth flow
 */

import { test as base } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixture Types
// ---------------------------------------------------------------------------

/** Test data fixture — populated from env vars set by global-setup */
export interface AdminFixtures {
  /**
   * Test data references from seed + env.
   * All values default to the standard E2E test ports/addresses
   * if the corresponding env var is not set.
   */
  testData: {
    /** Admin user email used for authentication */
    adminEmail: string;
    /** Admin GUI BFF base URL (serves SPA + API proxy) */
    adminGuiUrl: string;
    /** Porta OIDC server base URL (admin API + OIDC endpoints) */
    portaUrl: string;
    /** MailHog REST API base URL (for email verification) */
    mailhogApiUrl: string;
  };
}

// ---------------------------------------------------------------------------
// Extended test + re-exported expect
// ---------------------------------------------------------------------------

/**
 * Extended Playwright test with Admin GUI fixtures.
 *
 * Use this `test` (instead of `@playwright/test`'s default) in all
 * Admin GUI E2E spec files to get access to the `testData` fixture.
 *
 * The `testData` fixture is auto-populated from environment variables
 * set during global setup — no manual configuration needed.
 */
export const test = base.extend<AdminFixtures>({
  testData: async ({}, use) => {
    await use({
      adminEmail: process.env.ADMIN_EMAIL ?? 'admin@porta-test.local',
      adminGuiUrl: process.env.ADMIN_GUI_URL ?? 'http://localhost:49301',
      portaUrl: process.env.PORTA_URL ?? 'http://localhost:49300',
      mailhogApiUrl: process.env.MAILHOG_API_URL ?? 'http://localhost:8025',
    });
  },
});

/** Re-export expect from Playwright for convenience */
export { expect } from '@playwright/test';
