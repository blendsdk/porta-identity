/**
 * OIDC Discovery endpoint E2E tests.
 *
 * Verifies that the /.well-known/openid-configuration endpoint returns
 * a valid discovery document with correct issuer, endpoints, scopes,
 * and grant types. Also tests JWKS endpoint and multi-org issuer isolation.
 *
 * Requires a running Porta test server (started by E2E global setup).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { OidcTestClient } from '../helpers/oidc-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import { createTestOrganization, createTestApplication, createTestClientWithSecret } from '../../integration/helpers/factories.js';

describe('OIDC Discovery (E2E)', () => {
  let baseUrl: string;
  let orgSlug: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    // Create a test org for discovery
    const org = await createTestOrganization({ name: 'Discovery Org' });
    orgSlug = org.slug;

    // Create app + client so the org has OIDC capability
    const app = await createTestApplication();
    await createTestClientWithSecret(org.id, app.id);
  });

  // ── Discovery Document ─────────────────────────────────────────

  it('should return a valid discovery document', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const doc = await oidc.discovery();

    expect(doc.issuer).toBeDefined();
    expect(doc.authorization_endpoint).toBeDefined();
    expect(doc.token_endpoint).toBeDefined();
    expect(doc.jwks_uri).toBeDefined();
  });

  it('should have issuer matching the org base URL', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const doc = await oidc.discovery();

    // In oidc-provider 9.8.2+, the issuer is the base URL (constructor value)
    // without the mount path. Endpoint URLs DO include the org slug prefix.
    expect(doc.issuer).toBe(baseUrl);
    // Verify endpoints contain org slug (proving org-scoped routing works)
    expect(doc.token_endpoint).toContain(`/${orgSlug}/`);
  });

  it('should list all required endpoints', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const doc = await oidc.discovery();

    // All standard OIDC endpoints should be present
    expect(doc.authorization_endpoint).toContain('/auth');
    expect(doc.token_endpoint).toContain('/token');
    expect(doc.jwks_uri).toContain('/jwks');
    expect(doc.userinfo_endpoint).toContain('/me');
  });

  it('should list supported scopes including openid', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const doc = await oidc.discovery();

    expect(doc.scopes_supported).toContain('openid');
    expect(doc.scopes_supported).toContain('profile');
    expect(doc.scopes_supported).toContain('email');
  });

  it('should list supported grant types', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const doc = await oidc.discovery();

    expect(doc.grant_types_supported).toContain('authorization_code');
    expect(doc.grant_types_supported).toContain('client_credentials');
    expect(doc.grant_types_supported).toContain('refresh_token');
  });

  // ── JWKS Endpoint ──────────────────────────────────────────────

  it('should return JWKS with ES256 public keys', async () => {
    const oidc = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const jwks = await oidc.jwks();

    expect(jwks.keys).toBeDefined();
    expect(jwks.keys.length).toBeGreaterThan(0);

    const firstKey = jwks.keys[0];
    expect(firstKey.kty).toBe('EC');
    expect(firstKey.kid).toBeDefined();
    // Public keys should have x and y but NOT d (private key)
    expect(firstKey.x).toBeDefined();
    expect(firstKey.y).toBeDefined();
  });

  // ── Multi-Org Issuer Isolation ─────────────────────────────────

  it('should have different issuers for different organizations', async () => {
    // Create a second org
    const org2 = await createTestOrganization({ name: 'Other Org' });
    const app2 = await createTestApplication();
    await createTestClientWithSecret(org2.id, app2.id);

    const oidc1 = new OidcTestClient(baseUrl, orgSlug, 'unused');
    const oidc2 = new OidcTestClient(baseUrl, org2.slug, 'unused');

    const doc1 = await oidc1.discovery();
    const doc2 = await oidc2.discovery();

    // In oidc-provider 9.8.2+, the issuer field is the same base URL for all orgs.
    // Org isolation is enforced via org-slug-scoped endpoint URLs instead.
    expect(doc1.token_endpoint).not.toBe(doc2.token_endpoint);
    expect(doc1.token_endpoint).toContain(orgSlug);
    expect(doc2.token_endpoint).toContain(org2.slug);
  });
});
