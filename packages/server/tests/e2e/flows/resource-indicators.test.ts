/**
 * End-to-end resource-indicator resolution through the real provider.
 *
 * Two applications own separate resource servers. A client may resolve only its own application's
 * resource, and the token audience must be the configured audience rather than the identifier.
 */

import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import {
  createTestApplication,
  createTestClientWithSecret,
  createTestOrganization,
} from '../../integration/helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../../integration/helpers/database.js';
import { OidcTestClient } from '../helpers/oidc-client.js';

/** One application, its OIDC client, and a registered resource server. */
interface ResourceFixture {
  readonly organizationSlug: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly identifier: string;
  readonly audience: string;
}

let baseUrl: string;
let owner: ResourceFixture;
let other: ResourceFixture;

beforeAll(() => {
  baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta-harness.ci.portaidentity.com:3443';
});

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  const organization = await createTestOrganization();
  owner = await createFixture(organization.id, organization.slug, ['billing:read', 'billing:write']);
  other = await createFixture(organization.id, organization.slug, ['billing:read', 'billing:write']);
});

/** Creates one application client and one distinct-audience resource server. */
async function createFixture(
  organizationId: string,
  organizationSlug: string,
  scopes: readonly string[],
): Promise<ResourceFixture> {
  const application = await createTestApplication();
  const { client, clientSecret } = await createTestClientWithSecret(organizationId, application.id, {
    grantTypes: ['client_credentials'],
  });
  const identifier = `https://resource-${randomUUID()}.example.test`;
  const audience = `https://audience-${randomUUID()}.example.test`;
  const resource = await getPool().query<{ id: string }>(
    `INSERT INTO resource_servers (application_id, slug, name, identifier, audience)
     VALUES ($1, $2, 'Resource API', $3, $4) RETURNING id`,
    [application.id, `resource-${randomUUID()}`, identifier, audience],
  );
  const resourceId = resource.rows[0]?.id;
  if (!resourceId) throw new Error('Resource-server fixture was not created');
  for (const scope of scopes) {
    await getPool().query(
      'INSERT INTO resource_server_scopes (resource_server_id, scope) VALUES ($1, $2)',
      [resourceId, scope],
    );
  }
  return {
    organizationSlug,
    clientId: client.clientId,
    clientSecret,
    identifier,
    audience,
  };
}

/** Builds one real client bound to the fixture's organization and client secret. */
function client(fixture: ResourceFixture): OidcTestClient {
  return new OidcTestClient(
    baseUrl,
    fixture.organizationSlug,
    fixture.clientId,
    fixture.clientSecret,
  );
}

describe('Resource indicator E2E', () => {
  it('issues a token for the owning application with the configured audience and scope', async () => {
    const oidc = client(owner);
    const tokens = await oidc.clientCredentials('billing:read', owner.identifier);
    const introspection = await oidc.introspect(tokens.access_token);

    expect(introspection.active).toBe(true);
    expect(introspection.scope).toContain('billing:read');
    expect(introspection.scope).not.toContain('billing:write');
    expect(introspection.aud).toBe(owner.audience);
  });

  it('rejects another application client requesting the resource', async () => {
    const oidc = client(other);

    await expect(oidc.clientCredentials('billing:read', owner.identifier)).rejects.toThrow(
      /invalid_target/,
    );
  });

  it('rejects the owning client requesting a resource registered to another application', async () => {
    const oidc = client(owner);

    await expect(oidc.clientCredentials('billing:read', other.identifier)).rejects.toThrow(
      /invalid_target/,
    );
  });

  it('rejects an unregistered custom scope for the owning client', async () => {
    const oidc = client(owner);

    await expect(oidc.clientCredentials('billing:admin', owner.identifier)).rejects.toThrow(
      /invalid_scope/,
    );
  });

  it('preserves the unrestricted no-resource path', async () => {
    const oidc = client(owner);
    const tokens = await oidc.clientCredentials('openid');
    const introspection = await oidc.introspect(tokens.access_token);

    expect(introspection.active).toBe(true);
    expect(introspection.scope).toContain('openid');
    expect(introspection.aud).toBeUndefined();
  });
});
