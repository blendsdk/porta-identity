/**
 * Unit tests for the token manager / AuthProvider factory.
 *
 * Tests: getToken returns current token, refreshToken calls openid-client,
 * session mutation after refresh.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAuthProvider } from '../../src/auth/token-manager.js';
import type { SessionData } from '../../src/session.js';
import type { OidcConfig } from '../../src/auth/oidc.js';

// Mock openid-client
vi.mock('openid-client', () => ({
  refreshTokenGrant: vi.fn(),
}));

import * as oidcClient from 'openid-client';
const mockRefreshTokenGrant = vi.mocked(oidcClient.refreshTokenGrant);

/** Create a test session. */
function makeSession(): SessionData {
  return {
    id: 'session-1',
    accessToken: 'original-access-token',
    refreshToken: 'original-refresh-token',
    idToken: 'id-token',
    tokenExpiresAt: Date.now() + 3600_000,
    user: { sub: 'u1', name: 'Test', email: 'test@test.com' },
    createdAt: Date.now(),
  };
}

/** Create a mock OIDC config. */
function makeOidcConfig(): OidcConfig {
  return {
    config: {} as any,
    clientId: 'test-client',
    issuer: 'https://porta.example.com/admin',
    redirectUri: 'http://127.0.0.1:4002/auth/callback',
    postLogoutRedirectUri: 'http://127.0.0.1:4002',
    port: 4002,
    serverUrl: 'https://porta.example.com',
  };
}

describe('createAuthProvider', () => {
  it('getToken returns current access token from session', async () => {
    const session = makeSession();
    const provider = createAuthProvider(session, makeOidcConfig());

    const token = await provider.getToken();
    expect(token).toBe('original-access-token');
  });

  it('getToken reflects session mutations', async () => {
    const session = makeSession();
    const provider = createAuthProvider(session, makeOidcConfig());

    session.accessToken = 'updated-token';
    const token = await provider.getToken();
    expect(token).toBe('updated-token');
  });

  it('refreshToken calls openid-client refreshTokenGrant', async () => {
    const session = makeSession();
    const oidcConfig = makeOidcConfig();

    mockRefreshTokenGrant.mockResolvedValue({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 1800,
      claims: () => null,
    } as any);

    const provider = createAuthProvider(session, oidcConfig);
    const newToken = await provider.refreshToken();

    expect(newToken).toBe('new-access-token');
    expect(mockRefreshTokenGrant).toHaveBeenCalledWith(
      oidcConfig.config,
      'original-refresh-token',
    );
  });

  it('refreshToken updates session access token', async () => {
    const session = makeSession();

    mockRefreshTokenGrant.mockResolvedValue({
      access_token: 'refreshed-token',
      refresh_token: 'rotated-refresh',
      expires_in: 3600,
      claims: () => null,
    } as any);

    const provider = createAuthProvider(session, makeOidcConfig());
    await provider.refreshToken();

    expect(session.accessToken).toBe('refreshed-token');
    expect(session.refreshToken).toBe('rotated-refresh');
  });

  it('refreshToken keeps old refresh token when none returned', async () => {
    const session = makeSession();

    mockRefreshTokenGrant.mockResolvedValue({
      access_token: 'new-access',
      expires_in: 3600,
      claims: () => null,
    } as any);

    const provider = createAuthProvider(session, makeOidcConfig());
    await provider.refreshToken();

    expect(session.accessToken).toBe('new-access');
    expect(session.refreshToken).toBe('original-refresh-token'); // Not overwritten
  });

  it('refreshToken updates tokenExpiresAt', async () => {
    const session = makeSession();
    const before = Date.now();

    mockRefreshTokenGrant.mockResolvedValue({
      access_token: 'new',
      expires_in: 1800,
      claims: () => null,
    } as any);

    const provider = createAuthProvider(session, makeOidcConfig());
    await provider.refreshToken();

    expect(session.tokenExpiresAt).toBeGreaterThanOrEqual(before + 1800_000);
  });

  it('refreshToken propagates errors', async () => {
    const session = makeSession();

    mockRefreshTokenGrant.mockRejectedValue(new Error('Token expired'));

    const provider = createAuthProvider(session, makeOidcConfig());
    await expect(provider.refreshToken()).rejects.toThrow('Token expired');
  });
});
