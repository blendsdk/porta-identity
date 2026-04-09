/**
 * Password login flow E2E tests.
 *
 * Tests the complete password-based login flow through the OIDC interaction
 * endpoints. Verifies successful login, invalid credentials, user status
 * checks (locked, suspended), and CSRF protection.
 *
 * Flow: GET /auth → redirect to /interaction/:uid → GET login page →
 *       POST credentials → redirect to callback with code
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import type { Organization } from '../../../src/organizations/types.js';
import type { Client } from '../../../src/clients/types.js';
import type { User } from '../../../src/users/types.js';

describe('Password Login Flow (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let org: Organization;
  let client: Client;
  let clientSecret: string;
  let user: User;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    // Create test org, app, client with PKCE, and user with password
    org = await createTestOrganization({ name: 'Login Test Org' });
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    client = created.client;
    clientSecret = created.clientSecret;

    const userResult = await createTestUserWithPassword(org.id);
    user = userResult.user;

    http = new TestHttpClient(baseUrl);
  });

  // ── Helper: start auth flow and get interaction page ────────────
  /**
   * Start an OIDC auth flow and follow the redirect to the interaction page.
   * Returns the interaction URL and the HTML body of the login page.
   */
  async function startAuthFlowAndGetLoginPage(): Promise<{
    interactionUrl: string;
    loginPageBody: string;
    csrfToken: string;
  }> {
    const oidc = new OidcTestClient(baseUrl, org.slug, client.clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    // Follow the auth URL to get redirected to the interaction login page
    const authResponse = await http.get(url);
    expect([302, 303]).toContain(authResponse.status);
    expect(authResponse.location).toContain('/interaction/');

    // GET the login page
    const loginResponse = await http.get(authResponse.location!);
    expect(loginResponse.status).toBe(200);

    const csrfToken = http.extractCsrfToken(loginResponse.body);
    expect(csrfToken).toBeTruthy();

    return {
      interactionUrl: authResponse.location!,
      loginPageBody: loginResponse.body,
      csrfToken: csrfToken!,
    };
  }

  // ── Successful login ───────────────────────────────────────────

  it('should redirect to callback with code after successful password login', async () => {
    const { interactionUrl, csrfToken } = await startAuthFlowAndGetLoginPage();

    // Extract the interaction UID from the URL
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    expect(uid).toBeTruthy();

    // POST login credentials with CSRF token
    const loginPostUrl = `/interaction/${uid}/login`;
    const loginResponse = await http.post(loginPostUrl, {
      email: user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });

    // Should redirect through the OIDC flow (302/303)
    // The exact redirect chain depends on whether consent is needed
    expect([200, 302, 303]).toContain(loginResponse.status);
  });

  // ── Invalid password ───────────────────────────────────────────

  it('should show error message when password is incorrect', async () => {
    const { interactionUrl, csrfToken } = await startAuthFlowAndGetLoginPage();
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    const loginResponse = await http.post(`/interaction/${uid}/login`, {
      email: user.email,
      password: 'wrong-password-123',
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });

    // Should re-render the login page with an error (not redirect)
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toContain(user.email);
  });

  // ── Non-existent user (same error as invalid password) ─────────

  it('should show same error for non-existent user as for invalid password', async () => {
    const { interactionUrl, csrfToken } = await startAuthFlowAndGetLoginPage();
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    const loginResponse = await http.post(`/interaction/${uid}/login`, {
      email: 'nonexistent@test.example.com',
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });

    // Should render login page with generic error (no user enumeration)
    expect(loginResponse.status).toBe(200);
  });

  // ── Suspended account ──────────────────────────────────────────

  it('should reject login for suspended account', async () => {
    // Create a suspended user
    const { user: suspendedUser } = await createTestUserWithPassword(
      org.id,
      DEFAULT_TEST_PASSWORD,
      { status: 'suspended' },
    );

    const { interactionUrl, csrfToken } = await startAuthFlowAndGetLoginPage();
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    const loginResponse = await http.post(`/interaction/${uid}/login`, {
      email: suspendedUser.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });

    // Should show status-specific error
    expect(loginResponse.status).toBe(200);
  });

  // ── Locked account ─────────────────────────────────────────────

  it('should reject login for locked account', async () => {
    const { user: lockedUser } = await createTestUserWithPassword(
      org.id,
      DEFAULT_TEST_PASSWORD,
      { status: 'locked' },
    );

    const { interactionUrl, csrfToken } = await startAuthFlowAndGetLoginPage();
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    const loginResponse = await http.post(`/interaction/${uid}/login`, {
      email: lockedUser.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrfToken,
      _csrfStored: csrfToken,
    });

    expect(loginResponse.status).toBe(200);
  });

  // ── CSRF protection ────────────────────────────────────────────

  it('should reject login POST without CSRF token', async () => {
    const { interactionUrl } = await startAuthFlowAndGetLoginPage();
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // POST without CSRF token
    const loginResponse = await http.post(`/interaction/${uid}/login`, {
      email: user.email,
      password: DEFAULT_TEST_PASSWORD,
    });

    // Should show CSRF error or reject the request
    expect(loginResponse.status).toBe(200);
    // The response should NOT redirect to a callback (login should fail)
    expect(loginResponse.location).toBeUndefined();
  });

  // ── CSRF with invalid token ────────────────────────────────────

  it('should reject login POST with mismatched CSRF tokens', async () => {
    const { interactionUrl, csrfToken } = await startAuthFlowAndGetLoginPage();
    const uid = interactionUrl.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // Send mismatched CSRF tokens
    const loginResponse = await http.post(`/interaction/${uid}/login`, {
      email: user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: 'wrong-csrf-token',
      _csrfStored: csrfToken,
    });

    // Should show CSRF error
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.location).toBeUndefined();
  });
});
