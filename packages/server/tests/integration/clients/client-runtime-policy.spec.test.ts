import { beforeEach, describe, expect, it } from 'vitest';
import { archiveApplication, deactivateApplication } from '../../../src/applications/service.js';
import { createClient, findForOidc, verifyClientSecret } from '../../../src/clients/service.js';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import {
  buildProviderConfiguration,
  type BuildProviderConfigParams,
} from '../../../src/oidc/configuration.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
} from '../helpers/factories.js';
import { truncateAllTables } from '../helpers/database.js';

interface PkceConfiguration {
  readonly required: (ctx: object, client: Record<string, unknown>) => boolean;
  readonly methods: readonly string[];
}

/** Build the provider configuration with inert dependencies for policy evaluation. */
function providerConfiguration(): Record<string, unknown> {
  const params: BuildProviderConfigParams = {
    ttl: {
      accessToken: 3600,
      authorizationCode: 600,
      idToken: 3600,
      refreshToken: 86400,
      interaction: 3600,
      session: 1209600,
      grant: 1209600,
    },
    jwks: { keys: [] },
    cookieKeys: ['runtime-policy-test-cookie-key-12345'],
    findAccount: async () => undefined,
    adapterFactory: class RuntimePolicyAdapter {},
    interactionUrl: (_ctx, interaction) => `/interaction/${interaction.uid}`,
  };
  return buildProviderConfiguration(params);
}

/** Read the provider's PKCE decision for persisted client metadata. */
function requiresPkce(metadata: Record<string, unknown>): boolean {
  const configuration = providerConfiguration();
  const pkce = configuration.pkce as PkceConfiguration;
  return pkce.required({}, metadata);
}

describe('OIDC client runtime policy specification', () => {
  beforeEach(async () => truncateAllTables());

  it('ST-15A honors persisted false for a confidential client', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id, {
      clientType: 'confidential',
      tokenEndpointAuthMethod: 'client_secret_basic',
      requirePkce: false,
    });
    const metadata = await findForOidc(client.clientId);

    expect(metadata).toBeDefined();
    expect(requiresPkce(metadata!)).toBe(false);
  });

  it('ST-15A requires PKCE for a public authorization-code client despite persisted false', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id, {
      clientType: 'public',
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code'],
      requirePkce: false,
    });
    const metadata = await findForOidc(client.clientId);

    expect(metadata).toBeDefined();
    expect(requiresPkce(metadata!)).toBe(true);
  });

  it.each(['inactive', 'archived'] as const)(
    'ST-15B keeps existing authentication active but rejects new clients after application becomes %s',
    async (applicationState) => {
      const organization = await createTestOrganization();
      const application = await createTestApplication();
      const existingClient = await createTestClient(organization.id, application.id, {
        clientType: 'confidential',
        tokenEndpointAuthMethod: 'client_secret_basic',
      });
      const existingSecret = await generateAndStore(existingClient.id, { label: 'existing' });

      if (applicationState === 'inactive') {
        await deactivateApplication(application.id);
      } else {
        await archiveApplication(application.id);
      }

      await expect(
        verifyClientSecret(existingClient.clientId, existingSecret.plaintext),
      ).resolves.toBe(true);
      await expect(
        createClient({
          organizationId: organization.id,
          applicationId: application.id,
          clientName: 'New client after lifecycle transition',
          clientType: 'public',
          applicationType: 'spa',
          redirectUris: ['https://client.example.test/callback'],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
          tokenEndpointAuthMethod: 'none',
          requirePkce: true,
        }),
      ).rejects.toThrow();
    },
  );
});
