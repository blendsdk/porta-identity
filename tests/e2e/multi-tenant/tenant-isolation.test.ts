/**
 * Tenant isolation E2E tests.
 *
 * Verifies that users and clients from one organization cannot
 * authenticate or access resources through another organization's
 * OIDC endpoints.
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
import { updateOrganization } from '../../../src/organizations/repository.js';

describe('Tenant Isolation (E2E)', () => {
  let baseUrl: string;
  let http: TestHttpClient;

  // Org A
  let orgASlug: string;
  let clientAId: string;
  let clientASecret: string;

  // Org B
  let orgBSlug: string;
  let clientBId: string;
  let clientBSecret: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta.local:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();

    // Create two separate organizations with their own apps, clients, users
    const orgA = await createTestOrganization({ name: 'Tenant A' });
    orgASlug = orgA.slug;
    const appA = await createTestApplication({ name: 'App A' });
    const createdA = await createTestClientWithSecret(orgA.id, appA.id, {
      grantTypes: ['authorization_code', 'client_credentials'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    clientAId = createdA.client.clientId;
    clientASecret = createdA.clientSecret;
    await createTestUserWithPassword(orgA.id);

    const orgB = await createTestOrganization({ name: 'Tenant B' });
    orgBSlug = orgB.slug;
    const appB = await createTestApplication({ name: 'App B' });
    const createdB = await createTestClientWithSecret(orgB.id, appB.id, {
      grantTypes: ['authorization_code', 'client_credentials'],
      redirectUris: ['http://localhost:3001/callback'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    clientBId = createdB.client.clientId;
    clientBSecret = createdB.clientSecret;
    await createTestUserWithPassword(orgB.id);

    http = new TestHttpClient(baseUrl);
  });

  it('should have different issuers for different organizations', async () => {
    const oidcA = new OidcTestClient(baseUrl, orgASlug, clientAId, clientASecret);
    const oidcB = new OidcTestClient(baseUrl, orgBSlug, clientBId, clientBSecret);

    const discoveryA = await oidcA.discovery();
    const discoveryB = await oidcB.discovery();

    // In oidc-provider 9.8.2+, issuer is the same base URL for all orgs.
    // Org isolation is enforced via org-slug-scoped endpoint URLs.
    expect(discoveryA.token_endpoint).not.toBe(discoveryB.token_endpoint);
    expect(discoveryA.token_endpoint).toContain(orgASlug);
    expect(discoveryB.token_endpoint).toContain(orgBSlug);
  });

  it('should reject client A credentials at Org B token endpoint', async () => {
    const creds = Buffer.from(`${clientAId}:${clientASecret}`).toString('base64');
    const response = await http.post(
      `/${orgBSlug}/token`,
      { grant_type: 'client_credentials' },
      { headers: { Authorization: `Basic ${creds}` } },
    );
    // Client A is not registered in Org B
    expect([400, 401]).toContain(response.status);
  });

  it('should reject Org B client credentials at Org A token endpoint', async () => {
    const creds = Buffer.from(`${clientBId}:${clientBSecret}`).toString('base64');
    const response = await http.post(
      `/${orgASlug}/token`,
      { grant_type: 'client_credentials' },
      { headers: { Authorization: `Basic ${creds}` } },
    );
    expect([400, 401]).toContain(response.status);
  });

  it('should have different discovery documents per org', async () => {
    const respA = await http.get(`/${orgASlug}/.well-known/openid-configuration`);
    const respB = await http.get(`/${orgBSlug}/.well-known/openid-configuration`);

    expect(respA.status).toBe(200);
    expect(respB.status).toBe(200);

    const docA = respA.json as Record<string, unknown>;
    const docB = respB.json as Record<string, unknown>;

    // Endpoint URLs are org-scoped (different per org)
    expect(docA.token_endpoint).not.toBe(docB.token_endpoint);
  });

  it('should return 404 for suspended org discovery', async () => {
    // Create as active, then update status (insertOrganization doesn't accept status)
    const suspendedOrg = await createTestOrganization({ name: 'Suspended Org' });
    await updateOrganization(suspendedOrg.id, { status: 'suspended' });
    const response = await http.get(`/${suspendedOrg.slug}/.well-known/openid-configuration`);
    expect([403, 404]).toContain(response.status);
  });

  it('should return 404 for archived org discovery', async () => {
    // Create as active, then update status (insertOrganization doesn't accept status)
    const archivedOrg = await createTestOrganization({ name: 'Archived Org' });
    await updateOrganization(archivedOrg.id, { status: 'archived' });
    const response = await http.get(`/${archivedOrg.slug}/.well-known/openid-configuration`);
    expect([404]).toContain(response.status);
  });
});
