/** Specification tests for per-application resource-server resolution. */

import { errors } from 'oidc-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => pool,
}));

import { resolveResourceServerInfo } from '../../../src/oidc/resource-servers.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const IDENTIFIER = 'https://api.example.test';
const AUDIENCE = 'https://api.example.test';
const TTL = 900;

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockResolvedValue({
    rows: [{ audience: AUDIENCE, scopes: ['api:read', 'api:write'] }],
  });
});

describe('resource server resolution', () => {
  it('resolves the exact application resource with registered and standard scopes', async () => {
    const info = await resolveResourceServerInfo({
      applicationId: APPLICATION_ID,
      identifier: IDENTIFIER,
      requestedScope: 'openid api:read',
      accessTokenTTL: TTL,
    });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('resource_servers'), [
      APPLICATION_ID,
      IDENTIFIER,
    ]);
    expect(info).toEqual({
      scope: expect.stringContaining('api:read'),
      audience: AUDIENCE,
      accessTokenFormat: 'opaque',
      accessTokenTTL: TTL,
    });
    expect(info.scope.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'profile', 'email', 'api:read', 'api:write']),
    );
  });

  it('rejects an unknown resource with the RFC 8707 invalid-target error', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await expect(
      resolveResourceServerInfo({
        applicationId: APPLICATION_ID,
        identifier: IDENTIFIER,
        requestedScope: 'api:read',
        accessTokenTTL: TTL,
      }),
    ).rejects.toBeInstanceOf(errors.InvalidTarget);
  });

  it('rejects an unregistered custom scope with invalid-scope', async () => {
    await expect(
      resolveResourceServerInfo({
        applicationId: APPLICATION_ID,
        identifier: IDENTIFIER,
        requestedScope: 'api:admin',
        accessTokenTTL: TTL,
      }),
    ).rejects.toBeInstanceOf(errors.InvalidScope);
  });

  it('keeps standard OIDC and offline scopes available without registering them', async () => {
    const info = await resolveResourceServerInfo({
      applicationId: APPLICATION_ID,
      identifier: IDENTIFIER,
      requestedScope: 'openid profile email offline_access',
      accessTokenTTL: TTL,
    });

    expect(info.scope.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'profile', 'email', 'offline_access']),
    );
  });

  it.each(['not-a-uri', '/relative/path', 'https://api.example.test/#fragment'])(
    'rejects the non-absolute or fragmented identifier %s before querying',
    async (identifier) => {
      await expect(
        resolveResourceServerInfo({
          applicationId: APPLICATION_ID,
          identifier,
          requestedScope: 'api:read',
          accessTokenTTL: TTL,
        }),
      ).rejects.toBeInstanceOf(errors.InvalidTarget);
      expect(pool.query).not.toHaveBeenCalled();
    },
  );

  it('resolves an empty scope registry to the standard protocol scopes', async () => {
    pool.query.mockResolvedValue({ rows: [{ audience: AUDIENCE, scopes: [] }] });

    const info = await resolveResourceServerInfo({
      applicationId: APPLICATION_ID,
      identifier: IDENTIFIER,
      requestedScope: 'openid',
      accessTokenTTL: TTL,
    });

    expect(info.scope.split(' ')).not.toContain('api:read');
    expect(info.scope.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'profile', 'email']),
    );
  });

  it('queries only the requesting application and identifier pair', async () => {
    await resolveResourceServerInfo({
      applicationId: OTHER_APPLICATION_ID,
      identifier: IDENTIFIER,
      requestedScope: 'api:read',
      accessTokenTTL: TTL,
    });

    expect(pool.query.mock.calls[0]?.[1]).toEqual([OTHER_APPLICATION_ID, IDENTIFIER]);
  });
});
