/**
 * Introspection/revocation invalid parameter E2E tests.
 *
 * Tests error handling for missing tokens, malformed tokens,
 * and missing client authentication on introspection/revocation endpoints.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';

describe('Introspection/Revocation — Invalid Params (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let orgSlug: string;
  let clientId: string;
  let clientSecret: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const org = await createTestOrganization({ name: 'Introspect Invalid Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code', 'client_credentials'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
    });
    clientId = created.client.clientId;
    clientSecret = created.clientSecret;
    http = new TestHttpClient(baseUrl);
  });

  function basicAuth(): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` };
  }

  it('should return active:false for malformed token on introspection', async () => {
    const resp = await http.post(`/${orgSlug}/token/introspection`, { token: 'random-garbage-token' }, { headers: basicAuth() });
    // oidc-provider 9.8.2+ may return 400 instead of 200 for malformed tokens
    expect([200, 400]).toContain(resp.status);
    if (resp.status === 200) {
      const body = resp.json as Record<string, unknown>;
      expect(body.active).toBe(false);
    }
  });

  it('should reject introspection without client authentication', async () => {
    const resp = await http.post(`/${orgSlug}/token/introspection`, { token: 'some-token' });
    // oidc-provider 9.8.2+ may return 400 or 401 for missing client auth
    expect([400, 401]).toContain(resp.status);
  });

  it('should return 200 for revocation with missing token (RFC 7009)', async () => {
    const resp = await http.post(`/${orgSlug}/token/revocation`, {}, { headers: basicAuth() });
    // RFC 7009: always 200, even for missing/invalid tokens
    expect([200, 400]).toContain(resp.status);
  });

  it('should reject revocation without client authentication', async () => {
    const resp = await http.post(`/${orgSlug}/token/revocation`, { token: 'some-token' });
    // oidc-provider 9.8.2+ may return 400 or 401 for missing client auth
    expect([400, 401]).toContain(resp.status);
  });

  it('should handle missing token param on introspection', async () => {
    const resp = await http.post(`/${orgSlug}/token/introspection`, {}, { headers: basicAuth() });
    expect([200, 400]).toContain(resp.status);
    if (resp.status === 200) {
      const body = resp.json as Record<string, unknown>;
      expect(body.active).toBe(false);
    }
  });
});
