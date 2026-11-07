/** Specification tests for the provider's resource-indicator callbacks. */

import { errors } from 'oidc-provider';
import { describe, expect, it, vi } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  nodeEnv: 'test',
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: 'postgresql://localhost/porta',
  redisUrl: 'redis://localhost:6379',
  issuerBaseUrl: 'https://porta.example.test',
  cookieKeys: ['test-cookie-key-0123456789'],
  smtp: { host: 'localhost', port: 587, user: '', pass: '', from: 'test@test.com' },
  logLevel: 'info',
  trustProxy: false,
}));

vi.mock('../../../src/config/index.js', () => ({ config: mockConfig }));

import {
  buildProviderConfiguration,
  type BuildProviderConfigParams,
} from '../../../src/oidc/configuration.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const IDENTIFIER = 'https://api.example.test';

/** Minimal valid provider parameters with one injected resolver. */
function params(
  resolveResourceServer: BuildProviderConfigParams['resolveResourceServer'],
): BuildProviderConfigParams {
  return {
    ttl: {
      accessToken: 900,
      authorizationCode: 600,
      idToken: 3600,
      refreshToken: 86400,
      interaction: 3600,
      session: 1209600,
      grant: 1209600,
    },
    jwks: { keys: [] },
    cookieKeys: ['test-key-for-cookie-signing-12345'],
    findAccount: async () => undefined,
    adapterFactory: class MockAdapter {},
    interactionUrl: () => '/interaction/1',
    resolveResourceServer,
  };
}

/** Reads the resource-indicator feature block from the built configuration. */
function indicators(config: Record<string, unknown>): {
  defaultResource: (ctx: unknown, client: unknown, oneOf?: string) => Promise<string | undefined>;
  getResourceServerInfo: (
    ctx: unknown,
    resource: string,
    client: unknown,
  ) => Promise<Record<string, unknown>>;
} {
  const features = config.features as Record<string, unknown>;
  return features.resourceIndicators as ReturnType<typeof indicators>;
}

describe('provider resource indicators', () => {
  it('resolves the requested resource through the injected application resolver', async () => {
    const resolve = vi.fn().mockResolvedValue({
      scope: 'openid api:read',
      audience: IDENTIFIER,
      accessTokenFormat: 'opaque',
      accessTokenTTL: 900,
    });
    const built = buildProviderConfiguration(params(resolve));
    const callback = indicators(built).getResourceServerInfo;

    const result = await callback(
      { oidc: { params: { scope: 'openid api:read' } } },
      IDENTIFIER,
      { 'urn:porta:internal_application_id': APPLICATION_ID },
    );

    expect(resolve).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      identifier: IDENTIFIER,
      requestedScope: 'openid api:read',
      accessTokenTTL: 900,
    });
    expect(result).toMatchObject({ audience: IDENTIFIER });
  });

  it.each([{}, { 'urn:porta:internal_application_id': 'not-a-uuid' }])(
    'rejects a client without a valid internal application identity',
    async (client) => {
      const resolve = vi.fn();
      const callback = indicators(buildProviderConfiguration(params(resolve))).getResourceServerInfo;

      await expect(callback({ oidc: { params: {} } }, IDENTIFIER, client)).rejects.toBeInstanceOf(
        errors.InvalidTarget,
      );
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('keeps the no-resource default path unrestricted', async () => {
    const built = buildProviderConfiguration(params(vi.fn()));
    const defaultResource = indicators(built).defaultResource;

    await expect(defaultResource({}, {})).resolves.toBeUndefined();
    await expect(defaultResource({}, {}, IDENTIFIER)).resolves.toBe(IDENTIFIER);
  });
});
