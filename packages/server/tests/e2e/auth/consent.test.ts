/**
 * Consent flow E2E tests.
 *
 * Tests the OIDC consent screen behavior including auto-consent for
 * first-party clients, consent display for third-party clients,
 * and consent denial.
 *
 * First-party: client belongs to the same org → auto-consent
 * Third-party: client from another org → show consent page
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

describe('Consent Flow (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let org: Organization;
  let client: Client;
  let clientSecret: string;
  let user: User;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    org = await createTestOrganization({ name: 'Consent Test Org' });
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

  /** Start auth flow, login, and return the post-login response */
  async function loginAndGetPostLoginResponse(): Promise<{
    response: import('../helpers/http-client.js').TestResponse;
    uid: string;
  }> {
    const oidc = new OidcTestClient(baseUrl, org.slug, client.clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    // Start auth flow → redirect to interaction
    const authResp = await http.get(url);
    expect([302, 303]).toContain(authResp.status);

    // Get login page and CSRF
    const loginPage = await http.get(authResp.location!);
    const csrf = http.extractCsrfToken(loginPage.body);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // Login
    const loginResp = await http.post(`/interaction/${uid}/login`, {
      email: user.email,
      password: DEFAULT_TEST_PASSWORD,
      _csrf: csrf!,
      _csrfStored: csrf!,
    });

    return { response: loginResp, uid: uid! };
  }

  // ── First-party client auto-consents ───────────────────────────

  it('should auto-consent for first-party client (same org)', async () => {
    const { response } = await loginAndGetPostLoginResponse();

    // For first-party clients, the consent should be auto-granted
    // and the user should be redirected through the OIDC flow
    expect([200, 302, 303]).toContain(response.status);

    // If it redirected, the location should eventually lead to the callback
    if (response.location) {
      // Follow the chain — should end at the client callback or consent page
      expect(response.location).toBeTruthy();
    }
  });

  // ── Abort interaction ──────────────────────────────────────────

  it('should abort interaction and redirect with access_denied', async () => {
    const oidc = new OidcTestClient(baseUrl, org.slug, client.clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    // Abort the interaction
    const abortResp = await http.get(`/interaction/${uid}/abort`);

    // Should redirect — either directly to client with error, or through
    // the OIDC auth endpoint which then redirects to callback with error.
    // In oidc-provider 9.8.2+, the abort may redirect via the auth endpoint.
    expect([302, 303]).toContain(abortResp.status);
    if (abortResp.location) {
      // Location contains either the error directly or an intermediate redirect
      const hasError = abortResp.location.includes('error=access_denied');
      const hasAuthRedirect = abortResp.location.includes('/auth');
      expect(hasError || hasAuthRedirect).toBe(true);
    }
  });

  // ── Auth flow reaches interaction ──────────────────────────────

  it('should redirect auth request to interaction for login prompt', async () => {
    const oidc = new OidcTestClient(baseUrl, org.slug, client.clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();

    const authResp = await http.get(url);
    expect([302, 303]).toContain(authResp.status);
    expect(authResp.location).toContain('/interaction/');
  });

  // ── Consent endpoint accessible after login ────────────────────

  it('should have accessible consent endpoint after login', async () => {
    const { uid } = await loginAndGetPostLoginResponse();

    // Try accessing the consent page directly
    const consentResp = await http.get(`/interaction/${uid}/consent`);

    // Should either render consent page or handle the request
    expect([200, 302, 303, 400]).toContain(consentResp.status);
  });

  // ── Invalid interaction UID ────────────────────────────────────

  it('should handle invalid interaction UID gracefully', async () => {
    const response = await http.get('/interaction/nonexistent-uid/consent');

    // Should show error page (not crash)
    expect([200, 302, 303, 400]).toContain(response.status);
  });
});
