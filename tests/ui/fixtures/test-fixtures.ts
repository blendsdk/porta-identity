/**
 * Playwright test fixtures for Porta UI tests.
 *
 * Extends the base Playwright `test` object with:
 *   - `testData` — Entity details (org slug, client ID, user email, etc.)
 *     seeded by global setup and read from environment variables.
 *   - `startAuthFlow` — Helper to initiate an OIDC authorization flow
 *     with PKCE and navigate the browser to the resulting login page.
 *
 * All spec files should import `test` and `expect` from this module
 * instead of `@playwright/test` to get access to these fixtures.
 *
 * @example
 * ```ts
 * import { test, expect } from '../fixtures/test-fixtures.js';
 *
 * test('login page shows email field', async ({ page, testData, startAuthFlow }) => {
 *   await startAuthFlow(page);
 *   await expect(page.locator('input[name="login"]')).toBeVisible();
 * });
 * ```
 */

import crypto from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { createMailCapture, type MailCapture } from './mail-capture.js';
import { createDbHelpers, type DbHelpers } from './db-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Test data seeded by global setup and shared across all spec files.
 *
 * Values come from environment variables set in global-setup.ts
 * after creating a full test tenant (org → app → client → user).
 */
export interface TestData {
  // ── Phase 1 fields (existing) ──────────────────────────────────────

  /** Organization slug — used in URL paths (e.g., /:orgSlug/auth/...) */
  orgSlug: string;
  /** OIDC client_id for the test application (public client) */
  clientId: string;
  /** Plaintext client secret for token exchange */
  clientSecret: string;
  /** Registered redirect URI for the test client */
  redirectUri: string;
  /** Email address of the test user */
  userEmail: string;
  /** Plaintext password of the test user */
  userPassword: string;
  /** Base URL of the Porta test server (e.g., http://localhost:49200) */
  baseUrl: string;
  /** Confidential client org slug — separate tenant for confidential client testing */
  confOrgSlug: string;
  /** Confidential client OIDC client_id */
  confClientId: string;
  /** Confidential client plaintext secret (SHA-256 hashed in DB) */
  confClientSecret: string;
  /** Confidential client user email */
  confUserEmail: string;
  /** Confidential client user password */
  confUserPassword: string;

  // ── Phase 2 fields (user status tests) ─────────────────────────────

  /** Email of a user with 'suspended' status */
  suspendedUserEmail: string;
  /** Email of a user with 'inactive' status */
  inactiveUserEmail: string;
  /** Email of a user with 'locked' status */
  lockedUserEmail: string;
  /** Email of an active user that can be locked during tests */
  lockableUserEmail: string;
  /** Password for the lockable user */
  lockableUserPassword: string;
  /** Email of an inactive user with no password (simulates pending invitation) */
  invitedUserEmail: string;
  /** Email of an active user for password reset tests */
  resettableUserEmail: string;
  /** Current password of the resettable user */
  resettableUserPassword: string;
  /** UUID of the resettable user — needed for token creation */
  resettableUserId: string;

  // ── Phase 2 fields (tenant isolation tests) ────────────────────────

  /** Slug of an org with 'suspended' status */
  suspendedOrgSlug: string;
  /** Slug of an org with 'archived' status */
  archivedOrgSlug: string;
}

// ---------------------------------------------------------------------------
// PKCE Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a PKCE code verifier — a random 43-character URL-safe string.
 * Used to create the code_challenge for authorization requests.
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a PKCE code challenge from a verifier using S256 method.
 * SHA-256 hashes the verifier and base64url-encodes the result.
 *
 * @param verifier - The code verifier string
 * @returns The S256 code challenge
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// Extended Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Extended Playwright test with Porta-specific fixtures.
 *
 * Provides `testData` (seeded entity details) and `startAuthFlow`
 * (browser navigation helper for OIDC authorization flows).
 */
export const test = base.extend<{
  /** Seeded test data — org, client, user details */
  testData: TestData;
  /** Navigate browser to login page via OIDC auth request with PKCE */
  startAuthFlow: (page: Page) => Promise<string>;
  /** Mail capture fixture — read/search/wait for MailHog emails */
  mailCapture: MailCapture;
  /** Database helper fixture — direct DB/Redis access for test setup */
  dbHelpers: DbHelpers;
}>({
  /**
   * Fixture: testData
   *
   * Reads entity details from environment variables set by global setup.
   * Available in every test via destructuring: `({ testData }) => { ... }`
   */
  // eslint-disable-next-line no-empty-pattern
  testData: async ({}, use) => {
    await use({
      orgSlug: process.env.TEST_ORG_SLUG!,
      clientId: process.env.TEST_CLIENT_ID!,
      clientSecret: process.env.TEST_CLIENT_SECRET!,
      redirectUri: process.env.TEST_REDIRECT_URI!,
      userEmail: process.env.TEST_USER_EMAIL!,
      userPassword: process.env.TEST_USER_PASSWORD!,
      baseUrl: process.env.TEST_UI_BASE_URL!,
      confOrgSlug: process.env.TEST_CONF_ORG_SLUG!,
      confClientId: process.env.TEST_CONF_CLIENT_ID!,
      confClientSecret: process.env.TEST_CONF_CLIENT_SECRET!,
      confUserEmail: process.env.TEST_CONF_USER_EMAIL!,
      confUserPassword: process.env.TEST_CONF_USER_PASSWORD!,

      // Phase 2: Additional users for status tests
      suspendedUserEmail: process.env.UI_TEST_SUSPENDED_USER_EMAIL!,
      inactiveUserEmail: process.env.UI_TEST_INACTIVE_USER_EMAIL!,
      lockedUserEmail: process.env.UI_TEST_LOCKED_USER_EMAIL!,
      lockableUserEmail: process.env.UI_TEST_LOCKABLE_USER_EMAIL!,
      lockableUserPassword: process.env.UI_TEST_LOCKABLE_USER_PASSWORD!,
      invitedUserEmail: process.env.UI_TEST_INVITED_USER_EMAIL!,
      resettableUserEmail: process.env.UI_TEST_RESETTABLE_USER_EMAIL!,
      resettableUserPassword: process.env.UI_TEST_RESETTABLE_USER_PASSWORD!,
      resettableUserId: process.env.UI_TEST_RESETTABLE_USER_ID!,

      // Phase 2: Additional orgs for tenant isolation tests
      suspendedOrgSlug: process.env.UI_TEST_SUSPENDED_ORG_SLUG!,
      archivedOrgSlug: process.env.UI_TEST_ARCHIVED_ORG_SLUG!,
    });
  },

  /**
   * Fixture: startAuthFlow
   *
   * Helper function that builds an OIDC authorization URL with PKCE
   * parameters and navigates the browser to it. The OIDC provider
   * redirects to the interaction login page, and this function
   * returns the final URL (the login page).
   *
   * Usage:
   * ```ts
   * const loginUrl = await startAuthFlow(page);
   * // Page is now on the login form
   * ```
   */
  startAuthFlow: async ({ testData }, use) => {
    const startFlow = async (page: Page): Promise<string> => {
      // Generate PKCE parameters
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Build the OIDC authorization URL with all required parameters
      const authUrl = new URL(`${testData.baseUrl}/${testData.orgSlug}/auth`);
      authUrl.searchParams.set('client_id', testData.clientId);
      authUrl.searchParams.set('redirect_uri', testData.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      // Random state for CSRF protection at the client level
      authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));

      // Navigate — follows redirects to the interaction login page
      await page.goto(authUrl.toString(), { waitUntil: 'networkidle' });

      // Store the code verifier on the page context for later token exchange
      // (accessible via page.evaluate if tests need to complete the full flow)
      await page.evaluate((cv) => {
        (window as unknown as Record<string, string>).__CODE_VERIFIER = cv;
      }, codeVerifier);

      return page.url();
    };

    await use(startFlow);
  },

  /**
   * Fixture: mailCapture
   *
   * Provides MailHog API integration for capturing and inspecting
   * emails sent during tests. Use to verify password reset, magic link,
   * and invitation emails.
   *
   * Usage:
   * ```ts
   * const email = await mailCapture.waitForEmail('user@test.com');
   * const link = mailCapture.extractLink(email, /\/reset\/[A-Za-z0-9_-]+/);
   * ```
   */
  // eslint-disable-next-line no-empty-pattern
  mailCapture: async ({}, use) => {
    const capture = createMailCapture();
    await use(capture);
  },

  /**
   * Fixture: dbHelpers
   *
   * Provides direct database and Redis access for test setup operations
   * that cannot be done through the browser UI (token creation, status
   * updates, rate limit resets).
   *
   * Usage:
   * ```ts
   * const token = await dbHelpers.createPasswordResetToken(userId, orgId);
   * await dbHelpers.resetAllRateLimits();
   * ```
   */
  // eslint-disable-next-line no-empty-pattern
  dbHelpers: async ({}, use) => {
    const helpers = createDbHelpers();
    await use(helpers);
  },
});

// Re-export expect so spec files only need one import
export { expect };
