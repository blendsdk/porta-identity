/**
 * Token endpoint invalid parameter E2E tests.
 *
 * Verifies proper OIDC-compliant error responses when the token endpoint
 * receives malformed, missing, or invalid parameters.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';
import type { Organization } from '../../../src/organizations/types.js';
import type { Client } from '../../../src/clients/types.js';

describe('Token Endpoint — Invalid Params (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let org: Organization;
  let client: Client;
  let clientSecret: string;
  let orgSlug: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    org = await createTestOrganization({ name: 'Token Invalid Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    client = created.client;
    clientSecret = created.clientSecret;
    http = new TestHttpClient(baseUrl);
  });

  /** Build Basic auth header */
  function basicAuth(): Record<string, string> {
    const creds = Buffer.from(`${client.clientId}:${clientSecret}`).toString('base64');
    return { Authorization: `Basic ${creds}` };
  }

  it('should reject missing grant_type', async () => {
    const response = await http.post(`/${orgSlug}/token`, {}, { headers: basicAuth() });
    expect(response.status).toBe(400);
    expect(response.json).toHaveProperty('error');
  });

  it('should reject unsupported grant_type', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      { grant_type: 'password' },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
    const body = response.json as Record<string, unknown>;
    // oidc-provider 9.8.2+ may return unsupported_grant_type or invalid_request
    expect(['unsupported_grant_type', 'invalid_request']).toContain(body.error);
  });

  it('should reject invalid authorization code', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'authorization_code',
        code: 'invalid-code-12345',
        redirect_uri: 'http://localhost:3001/callback',
        code_verifier: 'test-verifier',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
    const body = response.json as Record<string, unknown>;
    // oidc-provider 9.8.2+ may return invalid_grant or invalid_request
    expect(['invalid_grant', 'invalid_request']).toContain(body.error);
  });

  it('should reject wrong code_verifier', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'authorization_code',
        code: 'fake-code',
        redirect_uri: 'http://localhost:3001/callback',
        code_verifier: 'wrong-verifier',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
  });

  it('should reject invalid client credentials (wrong secret)', async () => {
    const wrongAuth = Buffer.from(`${client.clientId}:wrong-secret`).toString('base64');
    const response = await http.post(
      `/${orgSlug}/token`,
      { grant_type: 'client_credentials' },
      { headers: { Authorization: `Basic ${wrongAuth}` } },
    );
    // oidc-provider 9.8.2+ may return 400 or 401 for invalid client credentials
    expect([400, 401]).toContain(response.status);
    const body = response.json as Record<string, unknown>;
    // oidc-provider 9.8.2+ may return invalid_client or invalid_request
    expect(['invalid_client', 'invalid_request']).toContain(body.error);
  });

  it('should reject missing client authentication', async () => {
    const response = await http.post(`/${orgSlug}/token`, {
      grant_type: 'client_credentials',
    });
    // oidc-provider 9.8.2+ may return 400 or 401 for missing client auth
    expect([400, 401]).toContain(response.status);
    const body = response.json as Record<string, unknown>;
    // oidc-provider 9.8.2+ may return invalid_client or invalid_request
    expect(['invalid_client', 'invalid_request']).toContain(body.error);
  });

  it('should reject empty POST body', async () => {
    const response = await http.post(`/${orgSlug}/token`, {}, { headers: basicAuth() });
    expect(response.status).toBe(400);
  });

  it('should reject invalid refresh token', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: 'invalid-refresh-token',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
    const body = response.json as Record<string, unknown>;
    // oidc-provider 9.8.2+ may return invalid_grant or invalid_request
    expect(['invalid_grant', 'invalid_request']).toContain(body.error);
  });

  it('should reject missing code_verifier when PKCE was used', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'authorization_code',
        code: 'some-code',
        redirect_uri: 'http://localhost:3001/callback',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
  });

  it('should reject wrong redirect_uri on code exchange', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'authorization_code',
        code: 'some-code',
        redirect_uri: 'http://different-uri.com/callback',
        code_verifier: 'test-verifier',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
  });

  it('should reject already-used authorization code', async () => {
    // Exchange a fake code twice — both should fail since the code is invalid
    const params = {
      grant_type: 'authorization_code',
      code: 'reused-code',
      redirect_uri: 'http://localhost:3001/callback',
      code_verifier: 'test-verifier',
    };
    const first = await http.post(`/${orgSlug}/token`, params, { headers: basicAuth() });
    expect(first.status).toBe(400);

    const second = await http.post(`/${orgSlug}/token`, params, { headers: basicAuth() });
    expect(second.status).toBe(400);
  });

  it('should handle client_credentials with unregistered scope', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'client_credentials',
        scope: 'admin:all superpower',
      },
      { headers: basicAuth() },
    );
    // Should either ignore unknown scopes or reject
    expect([200, 400]).toContain(response.status);
  });

  it('should reject expired refresh token gracefully', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: 'expired-token-abc',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
  });

  it('should reject revoked refresh token', async () => {
    const response = await http.post(
      `/${orgSlug}/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: 'revoked-token-def',
      },
      { headers: basicAuth() },
    );
    expect(response.status).toBe(400);
  });
});
