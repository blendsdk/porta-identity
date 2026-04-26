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

/** Seed entity IDs — populated from env vars set by global-setup */
export interface SeedIds {
  /** Super-admin organization ID */
  superAdminOrgId: string;
  /** Active test org (Acme Corporation) ID */
  activeOrgId: string;
  /** Suspended test org ID */
  suspendedOrgId: string;
  /** Archived test org ID */
  archivedOrgId: string;
  /** Active test application (Acme Customer Portal) ID */
  testAppId: string;
  /** Archived test application ID */
  archivedAppId: string;
  /** Public test client ID (internal UUID, not OIDC client_id) */
  publicClientId: string;
  /** Confidential test client ID (internal UUID) */
  confClientId: string;
  /** Active test user ID */
  activeUserId: string;
  /** Suspended test user ID */
  suspendedUserId: string;
  /** Editor role ID */
  editorRoleId: string;
  /** Viewer role ID */
  viewerRoleId: string;
  /** Read permission ID */
  readPermId: string;
  /** Write permission ID */
  writePermId: string;
  /** Delete permission ID */
  deletePermId: string;
  /** Department claim definition ID */
  deptClaimId: string;
  /** Access level claim definition ID */
  levelClaimId: string;
}

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
  /**
   * Seed entity IDs for direct entity navigation and API verification.
   * All values populated from SEED_* env vars set during global setup.
   */
  seedIds: SeedIds;
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
  seedIds: async ({}, use) => {
    await use({
      superAdminOrgId: process.env.SEED_SUPER_ADMIN_ORG_ID ?? '',
      activeOrgId: process.env.SEED_ACTIVE_ORG_ID ?? '',
      suspendedOrgId: process.env.SEED_SUSPENDED_ORG_ID ?? '',
      archivedOrgId: process.env.SEED_ARCHIVED_ORG_ID ?? '',
      testAppId: process.env.SEED_TEST_APP_ID ?? '',
      archivedAppId: process.env.SEED_ARCHIVED_APP_ID ?? '',
      publicClientId: process.env.SEED_PUBLIC_CLIENT_ID ?? '',
      confClientId: process.env.SEED_CONF_CLIENT_ID ?? '',
      activeUserId: process.env.SEED_ACTIVE_USER_ID ?? '',
      suspendedUserId: process.env.SEED_SUSPENDED_USER_ID ?? '',
      editorRoleId: process.env.SEED_EDITOR_ROLE_ID ?? '',
      viewerRoleId: process.env.SEED_VIEWER_ROLE_ID ?? '',
      readPermId: process.env.SEED_READ_PERM_ID ?? '',
      writePermId: process.env.SEED_WRITE_PERM_ID ?? '',
      deletePermId: process.env.SEED_DELETE_PERM_ID ?? '',
      deptClaimId: process.env.SEED_DEPT_CLAIM_ID ?? '',
      levelClaimId: process.env.SEED_LEVEL_CLAIM_ID ?? '',
    });
  },
});

/** Re-export expect from Playwright for convenience */
export { expect } from '@playwright/test';
