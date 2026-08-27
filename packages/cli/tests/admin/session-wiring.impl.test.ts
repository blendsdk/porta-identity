/** Focused implementation tests for the admin session production wiring. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const credentialStore = vi.hoisted(() => ({
  createCliCredentialPersistence: vi.fn(() => ({
    withRefreshLock: vi.fn(),
    persistRefreshedCredentials: vi.fn(),
  })),
  getCredentialsPath: vi.fn(() => '/tmp/porta-credentials.json'),
  loadCredentials: vi.fn(),
  saveCredentialsDurably: vi.fn(),
}));
const sdk = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue('fresh-access') }));
const login = vi.hoisted(() => ({ authenticateCliSession: vi.fn() }));

vi.mock('../../src/credential-store.js', () => credentialStore);
vi.mock('@portaidentity/sdk/node', () => ({ createCliAuth: vi.fn(() => sdk) }));
vi.mock('../../src/auth/login-coordinator.js', () => login);

import { prepareAdminSession } from '../../src/admin/session-service.js';

const server = new URL('https://porta.example.test');
const credentials = {
  server: server.origin,
  orgSlug: 'porta-admin',
  clientId: 'porta-cli',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  userInfo: { sub: 'subject-1', email: 'admin@example.test' },
};
const interaction = {
  presentAuthorizationUrl: vi.fn(),
  requestManualCallback: vi.fn(),
  confirmCredentialReplacement: vi.fn(),
};

describe('admin session production wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    credentialStore.loadCredentials.mockReturnValue(null);
  });

  it('should start unauthenticated and avoid credential services when no profile exists', async () => {
    const prepared = prepareAdminSession(server, interaction);
    expect(prepared.initialState).toEqual({ kind: 'unauthenticated', server });
    await expect(prepared.session.verify?.(new AbortController().signal)).resolves.toEqual({
      kind: 'unauthenticated',
      server,
    });
    expect(credentialStore.createCliCredentialPersistence).not.toHaveBeenCalled();
  });

  it('should map successful and cancelled login results to safe application states', async () => {
    login.authenticateCliSession
      .mockResolvedValueOnce({
        status: 'authenticated',
        identity: { sub: 'subject-1', email: 'admin@example.test' },
      })
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockResolvedValueOnce({ status: 'cancelled' });
    const prepared = prepareAdminSession(server, interaction);
    const signal = new AbortController().signal;

    await expect(prepared.session.authenticate?.(signal)).resolves.toMatchObject({
      kind: 'authenticated',
      identity: { sub: 'subject-1' },
    });
    await expect(prepared.session.authenticate?.(signal)).resolves.toEqual({
      kind: 'unauthenticated',
      server,
    });
    await expect(prepared.session.reauthenticate?.(signal)).resolves.toBeUndefined();
  });

  it('should verify a stored profile through a fresh SDK token provider', async () => {
    credentialStore.loadCredentials.mockReturnValue(credentials);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(credentials.userInfo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const prepared = prepareAdminSession(server, interaction);
    const signal = new AbortController().signal;

    expect(prepared.initialState).toEqual({ kind: 'verifying', server, canCancel: true });
    await expect(prepared.session.verify?.(signal)).resolves.toMatchObject({
      kind: 'authenticated',
      identity: { sub: 'subject-1' },
    });
    expect(credentialStore.createCliCredentialPersistence).toHaveBeenCalledWith(
      expect.objectContaining({ signal, lockTimeoutMs: 5_000 }),
    );
    vi.unstubAllGlobals();
  });
});
