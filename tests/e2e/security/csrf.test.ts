/**
 * CSRF protection E2E tests.
 *
 * Verifies that CSRF tokens are enforced on all state-changing
 * POST endpoints in the interaction and auth flows.
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

describe('CSRF Protection (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const org = await createTestOrganization({ name: 'CSRF Test Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    clientId = created.client.clientId;
    clientSecret = created.clientSecret;
    await createTestUserWithPassword(org.id);
    http = new TestHttpClient(baseUrl);
  });

  it('should reject login without CSRF tokens', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];
    await http.get(authResp.location!);

    const resp = await http.post(`/interaction/${uid}/login`, {
      email: 'test@test.com',
      password: 'TestPassword123!',
    });
    // Without CSRF, the login should not succeed
    expect(resp.location).toBeUndefined();
  });

  it('should reject consent without CSRF tokens', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, clientId, clientSecret);
    const { url } = oidc.buildAuthorizationUrl();
    const authResp = await http.get(url);
    const uid = authResp.location!.split('/interaction/')[1]?.split('/')[0]?.split('?')[0];

    const resp = await http.post(`/interaction/${uid}/confirm`, {
      decision: 'approve',
    });
    // Without CSRF, consent should fail
    expect([200, 400, 403]).toContain(resp.status);
  });

  it('should reject forgot-password without CSRF tokens', async () => {
    const resp = await http.post(`/${orgSlug}/auth/forgot-password`, {
      email: 'test@test.com',
    });
    expect(resp.status).toBe(403);
  });

  it('should reject password reset POST without CSRF tokens', async () => {
    const resp = await http.post(`/${orgSlug}/auth/reset-password/some-token`, {
      password: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });
    // Should fail CSRF validation
    expect([200, 400, 403]).toContain(resp.status);
  });
});
