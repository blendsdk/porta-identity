/**
 * Public refresh-transaction specifications for CLI authentication consumers.
 *
 * These tests deliberately exercise only observable SDK behavior. Persistence is
 * supplied by the consumer, so the SDK remains independent of any filesystem.
 */

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  CliAuthOptions,
  CliCredentialPersistence,
  StoredCredentials,
} from '../../src/auth/index.js';
import { createCliAuth } from '../../src/auth/index.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';

const credentialsPath = '/tmp/porta-refresh-spec.json';
const readCredentials = vi.mocked(readFile);

/** Creates an expired but otherwise valid stored credential snapshot. */
function expiredCredentials(overrides: Partial<StoredCredentials> = {}): StoredCredentials {
  return {
    server: 'https://porta.example.test',
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    idToken: 'old-id-token',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    userInfo: { sub: 'subject-1', email: 'admin@example.test', name: 'Admin' },
    ...overrides,
  };
}

/** Creates a JSON token response without introducing a remote dependency. */
function tokenResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CLI authentication refresh transaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should expose the exact optional credential persistence contract when constructing CLI auth', () => {
    expectTypeOf<CliCredentialPersistence>().toEqualTypeOf<{
      readonly withRefreshLock: <T>(operation: () => Promise<T>) => Promise<T>;
      readonly persistRefreshedCredentials: (
        previous: StoredCredentials,
        refreshed: StoredCredentials,
      ) => Promise<void>;
    }>();
    expectTypeOf<CliAuthOptions['credentialPersistence']>().toEqualTypeOf<
      CliCredentialPersistence | undefined
    >();
    expectTypeOf<StoredCredentials['refreshToken']>().toEqualTypeOf<string | undefined>();
  });

  it('should share one frozen refresh and withhold access until persistence commits when callers race', async () => {
    const previous = expiredCredentials();
    readCredentials.mockResolvedValue(JSON.stringify(previous));

    let releasePersistence: (() => void) | undefined;
    const persistenceGate = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const persistence: CliCredentialPersistence = {
      withRefreshLock: vi.fn(async (operation) => operation()),
      persistRefreshedCredentials: vi.fn(async () => persistenceGate),
    };
    const fetchMock = vi.fn().mockImplementation(async () =>
      tokenResponse({
        access_token: 'committed-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const auth = createCliAuth({ credentialsPath, credentialPersistence: persistence });
    const first = auth.getToken();
    const second = auth.getToken();
    const firstState = vi.fn();
    const secondState = vi.fn();
    void first.then(firstState);
    void second.then(secondState);
    await vi.waitFor(() => expect(persistence.persistRefreshedCredentials).toHaveBeenCalledOnce());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(firstState).not.toHaveBeenCalled();
    expect(secondState).not.toHaveBeenCalled();

    releasePersistence?.();
    await expect(first).resolves.toBe('committed-access-token');
    await expect(second).resolves.toBe('committed-access-token');
  });

  it('should reject an invalid refresh response without persistence or grant replay', async () => {
    readCredentials.mockResolvedValue(JSON.stringify(expiredCredentials()));
    const persistence: CliCredentialPersistence = {
      withRefreshLock: vi.fn(async (operation) => operation()),
      persistRefreshedCredentials: vi.fn(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(tokenResponse({ access_token: 42, expires_in: 'not-a-number' }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = createCliAuth({ credentialsPath, credentialPersistence: persistence });

    await expect(auth.getToken()).rejects.toThrow();
    await expect(auth.getToken()).rejects.toMatchObject({ code: 'REFRESH_INDETERMINATE' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(persistence.persistRefreshedCredentials).not.toHaveBeenCalled();
  });

  it('should preserve the previous refresh token when a valid response omits rotation', async () => {
    const previous = expiredCredentials();
    readCredentials.mockResolvedValue(JSON.stringify(previous));
    const persistence: CliCredentialPersistence = {
      withRefreshLock: vi.fn(async (operation) => operation()),
      persistRefreshedCredentials: vi.fn(),
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(tokenResponse({ access_token: 'next-access-token', expires_in: 3600 })),
    );

    const auth = createCliAuth({ credentialsPath, credentialPersistence: persistence });
    await expect(auth.getToken()).resolves.toBe('next-access-token');

    expect(persistence.persistRefreshedCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'old-refresh-token' }),
      expect.objectContaining({ refreshToken: 'old-refresh-token' }),
    );
  });

  it('should retain memory-only refresh behavior when persistence is omitted', async () => {
    readCredentials.mockResolvedValueOnce(JSON.stringify(expiredCredentials()));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(tokenResponse({ access_token: 'memory-access-token', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = createCliAuth({ credentialsPath });

    await expect(auth.getToken()).resolves.toBe('memory-access-token');
    await expect(auth.getToken()).resolves.toBe('memory-access-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readCredentials).toHaveBeenCalledOnce();
  });
});
