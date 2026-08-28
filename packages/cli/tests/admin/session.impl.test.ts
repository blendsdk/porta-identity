/** Focused implementation edges for server-bound admin sessions. */

import { describe, expect, it, vi } from 'vitest';
import {
  fetchVerifiedUserInfo,
  validateAdminCapabilities,
  verifyStoredSession,
} from '../../src/admin/session-service.js';
import { normalizeServerOrigin } from '../../src/global-options.js';

const credentials = {
  server: 'https://porta.example.test',
  orgSlug: 'porta-admin',
  clientId: 'porta-cli',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  userInfo: { sub: 'subject-1', email: 'admin@example.test' },
};

describe('admin session implementation edges', () => {
  it('treats malformed authorization arrays as least-privileged values', () => {
    expect(validateAdminCapabilities(['porta-admin', 'bad\u0000role'], undefined)).toEqual({
      canReadOrganizations: false,
      canCreateOrganizations: false,
    });
    expect(
      validateAdminCapabilities(['porta-user-admin'], ['admin:org:read', 'bad\u0085permission']),
    ).toEqual({
      canReadOrganizations: false,
      canCreateOrganizations: false,
    });
  });

  it('accepts a valid permission beyond the shorter role-slug bound', () => {
    const longPermission = `custom:${'a'.repeat(100)}:read`;

    expect(longPermission.length).toBeGreaterThan(100);
    expect(validateAdminCapabilities([], ['admin:org:read', longPermission])).toEqual({
      canReadOrganizations: true,
      canCreateOrganizations: false,
    });
  });

  it('derives live capabilities without mutating the credential snapshot', async () => {
    const snapshot = structuredClone(credentials);
    const result = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials,
        fetch: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ...credentials.userInfo,
              permissions: ['admin:org:create'],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({
      status: 'authenticated',
      capabilities: { canReadOrganizations: false, canCreateOrganizations: true },
    });
    expect(credentials).toEqual(snapshot);
    expect('capabilities' in credentials).toBe(false);
  });

  it.each([
    'http://porta.example.test',
    'https://user:password@porta.example.test',
    'https://porta.example.test/path',
    'https://porta.example.test?query=yes',
  ])('rejects a non-origin server value: %s', (value) => {
    expect(() => normalizeServerOrigin(value)).toThrow();
  });

  it('canonicalizes host case and the default HTTPS port', () => {
    expect(normalizeServerOrigin('https://PORTA.example.test:443///').origin).toBe(
      'https://porta.example.test',
    );
  });

  it('classifies a non-authentication HTTP failure as unavailable', async () => {
    const result = await verifyStoredSession(
      {
        selectedServer: new URL(credentials.server),
        credentials,
        fetch: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
      },
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('propagates caller cancellation instead of converting it to unavailable', async () => {
    const controller = new AbortController();
    const request = fetchVerifiedUserInfo(
      {
        selectedServer: new URL(credentials.server),
        orgSlug: credentials.orgSlug,
        accessToken: credentials.accessToken,
        originalSubject: credentials.userInfo.sub,
        fetch: vi.fn(
          (_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }),
        ),
      },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
