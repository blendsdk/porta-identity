/** Focused implementation edges for durable CLI refresh transactions. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCliAuth,
  type CliCredentialPersistence,
  type StoredCredentials,
} from '../../src/auth/cli-auth.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
import { readFile } from 'node:fs/promises';

const readCredentials = vi.mocked(readFile);

/** Creates one expired credential snapshot. */
function expired(): StoredCredentials {
  return {
    server: 'https://porta.example.test',
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    idToken: 'old-id',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    userInfo: { sub: 'subject-1', email: 'admin@example.test' },
  };
}

describe('durable refresh implementation edges', () => {
  it('should reject a non-object stored credential document', async () => {
    readCredentials.mockResolvedValue('null');
    const auth = createCliAuth({ credentialsPath: '/tmp/credentials.json' });

    await expect(auth.getToken()).rejects.toThrow('missing required fields');
  });

  it('should pass caller cancellation to the refresh request', async () => {
    readCredentials.mockResolvedValue(JSON.stringify(expired()));
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    const auth = createCliAuth({
      credentialsPath: '/tmp/porta-refresh.json',
      signal: controller.signal,
    });

    controller.abort();
    await expect(auth.getToken()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails before grant dispatch when the consumer lock fails', async () => {
    readCredentials.mockResolvedValue(JSON.stringify(expired()));
    const persistence: CliCredentialPersistence = {
      withRefreshLock: vi.fn().mockRejectedValue(new Error('lock unavailable')),
      persistRefreshedCredentials: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = createCliAuth({
      credentialsPath: '/tmp/credentials.json',
      credentialPersistence: persistence,
    });
    await expect(auth.getToken()).rejects.toThrow('lock unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adopts a newer usable on-disk snapshot without replaying a grant', async () => {
    const old = expired();
    const current = {
      ...old,
      accessToken: 'already-refreshed',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    readCredentials
      .mockResolvedValueOnce(JSON.stringify(old))
      .mockResolvedValueOnce(JSON.stringify(current));
    const persistence: CliCredentialPersistence = {
      withRefreshLock: async (operation) => operation(),
      persistRefreshedCredentials: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = createCliAuth({
      credentialsPath: '/tmp/credentials.json',
      credentialPersistence: persistence,
    });
    await expect(auth.getToken()).resolves.toBe('already-refreshed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON token responses without persistence', async () => {
    readCredentials.mockResolvedValue(JSON.stringify(expired()));
    const persistence: CliCredentialPersistence = {
      withRefreshLock: async (operation) => operation(),
      persistRefreshedCredentials: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', { status: 200 })));
    const auth = createCliAuth({
      credentialsPath: '/tmp/credentials.json',
      credentialPersistence: persistence,
    });
    await expect(auth.getToken()).rejects.toThrow('invalid response');
    expect(persistence.persistRefreshedCredentials).not.toHaveBeenCalled();
  });
});
