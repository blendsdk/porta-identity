/**
 * Observable session specifications for server-bound CLI administration.
 */

import { describe, expect, it, vi } from 'vitest';

const credentials = {
  server: 'https://porta-a.example.test/',
  orgSlug: 'porta-admin',
  clientId: 'porta-cli',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  originalSubject: 'subject-1',
  userInfo: { sub: 'subject-1', email: 'old@example.test', name: 'Old Name' },
};

/** Produces a JSON response for the injected remote boundary. */
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('stored CLI session verification', () => {
  it('should refuse bearer construction when normalized selected and credential origins differ', async () => {
    const { verifyStoredSession } = await import('../../src/admin/session-service.js');
    const createBearerClient = vi.fn();
    const fetch = vi.fn();

    const result = await verifyStoredSession(
      {
        selectedServer: new URL('https://porta-b.example.test'),
        credentials,
        createBearerClient,
        fetch,
      },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({ status: 'unauthenticated' });
    expect(createBearerClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should preserve the old profile byte-for-byte when cross-origin replacement is declined', async () => {
    const { confirmCredentialReplacement } = await import('../../src/admin/session-service.js');
    const originalBytes = JSON.stringify(credentials, null, 2);
    const persist = vi.fn();
    const confirm = vi.fn().mockResolvedValue(false);

    const result = await confirmCredentialReplacement({
      current: { server: new URL(credentials.server), serialized: originalBytes },
      replacement: {
        server: new URL('https://porta-b.example.test'),
        serialized: '{"fully":"validated"}',
      },
      confirm,
      persist,
    });

    expect(confirm).toHaveBeenCalledWith(
      new URL('https://porta-a.example.test'),
      new URL('https://porta-b.example.test'),
    );
    expect(result).toMatchObject({ status: 'cancelled', preserved: originalBytes });
    expect(persist).not.toHaveBeenCalled();
  });

  it('should permit persistence only after approving a fully validated cross-origin replacement', async () => {
    const { confirmCredentialReplacement } = await import('../../src/admin/session-service.js');
    const persist = vi.fn();
    const replacementBytes = '{"fully":"validated"}';

    const result = await confirmCredentialReplacement({
      current: { server: new URL(credentials.server), serialized: JSON.stringify(credentials) },
      replacement: {
        server: new URL('https://porta-b.example.test'),
        serialized: replacementBytes,
        validated: true,
      },
      confirm: vi.fn().mockResolvedValue(true),
      persist,
    });

    expect(result).toMatchObject({ status: 'replaced' });
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(replacementBytes);
  });

  it('should authenticate only subject-matched schema-valid UserInfo and allowlisted display fields', async () => {
    const { verifyStoredSession } = await import('../../src/admin/session-service.js');
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        sub: 'subject-1',
        email: 'verified@example.test',
        name: 'Verified Admin',
        token: 'must-not-cross-the-boundary',
        nested: { internal: true },
      }),
    );

    const result = await verifyStoredSession(
      {
        selectedServer: new URL('https://PORTA-A.example.test:443'),
        credentials,
        fetch,
      },
      { signal: new AbortController().signal },
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://porta-a.example.test/porta-admin/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
    expect(result).toEqual({
      status: 'authenticated',
      identity: {
        sub: 'subject-1',
        email: 'verified@example.test',
        name: 'Verified Admin',
      },
    });
  });

  it.each([{}, { sub: '' }, { sub: 'different-subject', email: 'attacker@example.test' }])(
    'should reject missing or mismatched UserInfo subject before display',
    async (userInfo) => {
      const { verifyStoredSession } = await import('../../src/admin/session-service.js');
      const result = await verifyStoredSession(
        {
          selectedServer: new URL(credentials.server),
          credentials,
          fetch: vi.fn().mockResolvedValue(jsonResponse(userInfo)),
        },
        { signal: new AbortController().signal },
      );

      expect(result).not.toMatchObject({ status: 'authenticated' });
      expect(JSON.stringify(result)).not.toContain('attacker@example.test');
    },
  );

  it('should become unauthenticated when live verification returns 401', async () => {
    const { verifyStoredSession } = await import('../../src/admin/session-service.js');
    const result = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials,
        fetch: vi.fn().mockResolvedValue(jsonResponse({}, 401)),
      },
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({
      status: 'unauthenticated',
      actions: ['authenticate', 'retry', 'quit'],
    });
  });

  it('should become unauthenticated when refresh is determinately rejected', async () => {
    const { verifyStoredSession } = await import('../../src/admin/session-service.js');
    const refreshRejection = Object.assign(new Error('refresh rejected'), {
      code: 'REFRESH_REJECTED',
    });
    const result = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials: { ...credentials, expiresAt: '2000-01-01T00:00:00.000Z' },
        getAccessToken: vi.fn().mockRejectedValue(refreshRejection),
        fetch: vi.fn(),
      },
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({
      status: 'unauthenticated',
      actions: ['authenticate', 'retry', 'quit'],
    });
  });

  it('should classify network failure as unavailable and invalid local state as configuration failure', async () => {
    const { verifyStoredSession } = await import('../../src/admin/session-service.js');
    const unavailable = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials,
        fetch: vi.fn().mockRejectedValue(new TypeError('network unavailable')),
      },
      { signal: new AbortController().signal },
    );
    const invalidLocal = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials: { ...credentials, server: 'not a URL' },
        fetch: vi.fn(),
      },
      { signal: new AbortController().signal },
    );

    expect(unavailable).toMatchObject({ status: 'unavailable' });
    expect(invalidLocal).toMatchObject({ status: 'configuration-failure' });
  });

  it('should retain authenticated identity when an administration request returns 403', async () => {
    const { classifyAdminResponse } = await import('../../src/admin/session-service.js');
    const authenticated = {
      status: 'authenticated' as const,
      identity: { sub: 'subject-1', email: 'verified@example.test', name: 'Admin' },
    };

    expect(classifyAdminResponse(authenticated, new Response('', { status: 403 }))).toEqual({
      status: 'unauthorized',
      identity: authenticated.identity,
    });
  });
});

describe('live administration capabilities', () => {
  it('should enable only organization reading for the exact read permission', async () => {
    // An exact organization-read permission enables listing and switching without granting creation.
    const { validateAdminCapabilities } = await import('../../src/admin/session-service.js');

    expect(validateAdminCapabilities([], ['admin:org:read'])).toEqual({
      canReadOrganizations: true,
      canCreateOrganizations: false,
    });
  });

  it('should enable only organization creation for the exact create permission', async () => {
    // An exact organization-create permission must not implicitly grant organization reading or switching.
    const { validateAdminCapabilities } = await import('../../src/admin/session-service.js');

    expect(validateAdminCapabilities([], ['admin:org:create'])).toEqual({
      canReadOrganizations: false,
      canCreateOrganizations: true,
    });
  });

  it.each([undefined, { unexpected: 'shape' }])(
    'should grant both organization capabilities for a valid Porta administrator role',
    async (permissions) => {
      // A separately valid Porta administrator role grants both actions even when permissions are absent or malformed.
      const { validateAdminCapabilities } = await import('../../src/admin/session-service.js');

      expect(validateAdminCapabilities(['porta-admin'], permissions)).toEqual({
        canReadOrganizations: true,
        canCreateOrganizations: true,
      });
    },
  );

  it('should preserve valid read capability when roles are malformed', async () => {
    // A malformed roles value cannot cancel a separately valid organization-read permission.
    const { validateAdminCapabilities } = await import('../../src/admin/session-service.js');

    expect(validateAdminCapabilities({ unexpected: 'shape' }, ['admin:org:read'])).toEqual({
      canReadOrganizations: true,
      canCreateOrganizations: false,
    });
  });

  it.each([
    ['non-string role', [{ value: 'porta-admin' }], []],
    ['non-string permission', [], [{ value: 'admin:org:create' }]],
    ['overlong role', [`porta-admin${'x'.repeat(257)}`], []],
    ['overlong permission', [], [`admin:org:create${'x'.repeat(257)}`]],
    ['ASCII control in role', ['porta\u0000-admin'], []],
    ['ASCII control in permission', [], ['admin:org:\u0000create']],
    ['C1 control in role', ['porta\u0085-admin'], []],
    ['C1 control in permission', [], ['admin:org:\u0085create']],
  ])('should reject and discard a %s entry', async (_label, roles, permissions) => {
    // Invalid authorization entries neither grant an action nor survive in the validated capability result.
    const { validateAdminCapabilities } = await import('../../src/admin/session-service.js');

    const capabilities = validateAdminCapabilities(roles, permissions);

    expect(capabilities).toEqual({
      canReadOrganizations: false,
      canCreateOrganizations: false,
    });
    expect(JSON.stringify(capabilities)).not.toContain('admin:org');
    expect(JSON.stringify(capabilities)).not.toContain('porta-admin');
  });

  it('should expose live capabilities without adding them to stored credentials', async () => {
    // Live UserInfo supplies ephemeral capability booleans while persisted credentials keep only existing identity data.
    const { verifyStoredSession } = await import('../../src/admin/session-service.js');
    const storedBeforeVerification = structuredClone(credentials);

    const result = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials,
        fetch: vi.fn().mockResolvedValue(
          jsonResponse({
            sub: 'subject-1',
            email: 'verified@example.test',
            name: 'Verified Admin',
            permissions: ['admin:org:read'],
          }),
        ),
      },
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({
      status: 'authenticated',
      identity: {
        sub: 'subject-1',
        email: 'verified@example.test',
        name: 'Verified Admin',
      },
      capabilities: {
        canReadOrganizations: true,
        canCreateOrganizations: false,
      },
    });
    expect(credentials).toEqual(storedBeforeVerification);
    expect('capabilities' in credentials).toBe(false);
  });
});
