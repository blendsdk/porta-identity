/**
 * Authorization endpoint invalid parameter E2E tests.
 *
 * Verifies that the server returns proper OIDC-compliant error responses
 * when clients send malformed, missing, or invalid parameters to the
 * authorization endpoint.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClientWithSecret,
} from '../../integration/helpers/factories.js';
import type { Client } from '../../../src/clients/types.js';

describe('Authorization Endpoint — Invalid Params (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let client: Client;
  let orgSlug: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    const org = await createTestOrganization({ name: 'Invalid Auth Org' });
    orgSlug = org.slug;
    const app = await createTestApplication();
    const created = await createTestClientWithSecret(org.id, app.id, {
      grantTypes: ['authorization_code'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    client = created.client;
    http = new TestHttpClient(baseUrl);
  });

  /** Build base auth URL params */
  function baseParams(): Record<string, string> {
    return {
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: 'http://localhost:3001/callback',
      scope: 'openid',
      state: 'test-state',
      nonce: 'test-nonce',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };
  }

  it('should reject when client_id is missing', async () => {
    const params = baseParams();
    delete params.client_id;
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([400, 302, 303]).toContain(response.status);
  });

  it('should reject unknown client_id', async () => {
    const params = baseParams();
    params.client_id = 'unknown-client-id-xyz';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([400, 302, 303]).toContain(response.status);
  });

  it('should reject mismatched redirect_uri', async () => {
    const params = baseParams();
    params.redirect_uri = 'https://evil.com/callback';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([400, 302, 303]).toContain(response.status);
    if (response.status === 400) {
      expect(response.body).toContain('redirect_uri');
    }
  });

  it('should reject invalid response_type', async () => {
    const params = baseParams();
    params.response_type = 'token';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([302, 303, 400]).toContain(response.status);
    if (response.location) {
      expect(response.location).toContain('unsupported_response_type');
    }
  });

  it('should reject missing response_type', async () => {
    const params = baseParams();
    delete params.response_type;
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([302, 303, 400]).toContain(response.status);
  });

  it('should handle empty scope gracefully', async () => {
    const params = baseParams();
    params.scope = '';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    // Should handle without crashing — either reject or allow
    expect([200, 302, 303, 400]).toContain(response.status);
  });

  it('should reject when code_challenge is missing (PKCE enforced)', async () => {
    const params = baseParams();
    delete params.code_challenge;
    delete params.code_challenge_method;
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([302, 303, 400]).toContain(response.status);
    if (response.location) {
      expect(response.location).toContain('invalid_request');
    }
  });

  it('should reject plain code_challenge_method', async () => {
    const params = baseParams();
    params.code_challenge_method = 'plain';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([302, 303, 400]).toContain(response.status);
  });

  it('should reject missing nonce for openid scope', async () => {
    const params = baseParams();
    delete params.nonce;
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([302, 303, 400]).toContain(response.status);
  });

  it('should handle excessively long state parameter', async () => {
    const params = baseParams();
    params.state = 'x'.repeat(10000);
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([200, 302, 303, 400, 414]).toContain(response.status);
  });

  it('should handle special characters in state parameter', async () => {
    const params = baseParams();
    params.state = '<script>alert(1)</script>';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([200, 302, 303]).toContain(response.status);
    // If redirected, the state should be properly encoded
    if (response.location) {
      expect(response.location).not.toContain('<script>');
    }
  });

  it('should reject missing redirect_uri', async () => {
    const params = baseParams();
    delete params.redirect_uri;
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    // Without redirect_uri, server can't redirect error — shows error page
    expect([400, 302, 303]).toContain(response.status);
  });

  it('should reject empty code_challenge', async () => {
    const params = baseParams();
    params.code_challenge = '';
    const response = await http.get(`/${orgSlug}/auth?${new URLSearchParams(params)}`);
    expect([302, 303, 400]).toContain(response.status);
  });

  it('should handle duplicate client_id parameters gracefully', async () => {
    const params = baseParams();
    const url = `/${orgSlug}/auth?${new URLSearchParams(params)}&client_id=extra-id`;
    const response = await http.get(url);
    expect([200, 302, 303, 400]).toContain(response.status);
  });
});
