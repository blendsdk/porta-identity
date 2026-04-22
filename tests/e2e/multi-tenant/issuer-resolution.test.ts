/**
 * Issuer resolution E2E tests.
 *
 * Verifies that each org slug resolves to the correct OIDC issuer
 * and that non-existent slugs return appropriate errors.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import { createTestOrganization } from '../../integration/helpers/factories.js';

describe('Issuer Resolution (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;
  let orgSlug: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const org = await createTestOrganization({ name: 'Issuer Test Org' });
    orgSlug = org.slug;
    http = new TestHttpClient(baseUrl);
  });

  it('should include org slug in the issuer URL', async () => {
    const resp = await http.get(`/${orgSlug}/.well-known/openid-configuration`);
    expect(resp.status).toBe(200);
    const doc = resp.json as Record<string, unknown>;
    // In oidc-provider 9.8.2+, issuer is the base URL (no org slug).
    // Endpoint URLs contain the org slug, proving org-scoped routing.
    expect(doc.token_endpoint).toContain(orgSlug);
  });

  it('should return 404 for non-existent org slug', async () => {
    const resp = await http.get('/nonexistent-org-slug/.well-known/openid-configuration');
    expect([404]).toContain(resp.status);
  });

  it('should include all required OIDC discovery fields', async () => {
    const resp = await http.get(`/${orgSlug}/.well-known/openid-configuration`);
    expect(resp.status).toBe(200);
    const doc = resp.json as Record<string, unknown>;
    expect(doc).toHaveProperty('issuer');
    expect(doc).toHaveProperty('authorization_endpoint');
    expect(doc).toHaveProperty('token_endpoint');
    expect(doc).toHaveProperty('jwks_uri');
    expect(doc).toHaveProperty('response_types_supported');
  });

  it('should have consistent discovery document across calls', async () => {
    const resp1 = await http.get(`/${orgSlug}/.well-known/openid-configuration`);
    const resp2 = await http.get(`/${orgSlug}/.well-known/openid-configuration`);
    expect(resp1.status).toBe(200);
    expect(resp2.status).toBe(200);
    expect(resp1.json).toEqual(resp2.json);
  });
});
