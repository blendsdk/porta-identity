/** Focused implementation edges for OIDC verification and cancellation. */

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { fetchIssuerJwks, verifyCliIdToken } from '../../src/auth/id-token-verifier.js';
import { authenticateCliSession } from '../../src/auth/login-coordinator.js';

const issuer = 'https://porta.example.test/porta-admin';
const clientId = 'porta-cli';
const nonce = 'nonce';

/** Creates one valid signed token and matching public key set. */
async function signedToken(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    iss: issuer,
    aud: clientId,
    sub: 'subject-1',
    nonce,
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
    .sign(privateKey);
  return { token, jwks: { keys: [{ ...publicJwk, kid: 'key-1', alg: 'ES256' }] } };
}

describe('OIDC validation implementation edges', () => {
  it('rejects a token that is not valid yet', async () => {
    const fixture = await signedToken({ nbf: Math.floor(Date.now() / 1000) + 120 });
    await expect(verifyCliIdToken({ ...fixture, issuer, clientId, nonce })).rejects.toThrow(
      'Authentication failed',
    );
  });

  it('omits non-string optional display claims', async () => {
    const fixture = await signedToken({ email: 42, name: { unsafe: true } });
    await expect(verifyCliIdToken({ ...fixture, issuer, clientId, nonce })).resolves.toEqual({
      sub: 'subject-1',
      email: undefined,
      name: undefined,
    });
  });

  it('rejects malformed key-set responses without exposing their body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ internal: 'do not expose' }), { status: 200 }),
        ),
    );
    await expect(
      fetchIssuerJwks(`${issuer}/jwks`, { signal: new AbortController().signal }),
    ).rejects.toThrow('Authentication failed');
    vi.unstubAllGlobals();
  });

  it('propagates cancellation through JWKS retrieval', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      ),
    );
    const request = fetchIssuerJwks(`${issuer}/jwks`, { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    vi.unstubAllGlobals();
  });

  it('uses live UserInfo and keeps persistence outcomes definite after persistence starts', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    let authorizationUrl: URL | undefined;
    const persistenceStarted = Promise.withResolvers<void>();
    const releasePersistence = Promise.withResolvers<void>();
    const persistCredentials = vi.fn(async () => {
      persistenceStarted.resolve();
      await releasePersistence.promise;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/api/admin/metadata')) {
        return new Response(JSON.stringify({ issuer, clientId, orgSlug: 'porta-admin' }));
      }
      if (url.endsWith('/token')) {
        const now = Math.floor(Date.now() / 1000);
        const token = await new SignJWT({
          iss: issuer,
          aud: clientId,
          sub: 'subject-1',
          email: 'id-token@example.test',
          nonce: authorizationUrl?.searchParams.get('nonce'),
          iat: now,
          exp: now + 300,
        })
          .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
          .sign(privateKey);
        return new Response(
          JSON.stringify({ access_token: 'access-token', id_token: token, expires_in: 300 }),
        );
      }
      if (url.endsWith('/jwks')) {
        return new Response(
          JSON.stringify({ keys: [{ ...publicJwk, kid: 'key-1', alg: 'ES256' }] }),
        );
      }
      expect(url).toBe('https://porta.example.test/porta-admin/me');
      return new Response(
        JSON.stringify({
          sub: 'subject-1',
          email: 'live@example.test',
          name: 'Live Admin',
          secret: 'ignored',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const operation = authenticateCliSession(
      {
        server: new URL('https://porta.example.test'),
        noBrowser: true,
        persistCredentials,
      },
      {
        presentAuthorizationUrl: async (url) => {
          authorizationUrl = url;
        },
        requestManualCallback: async () =>
          `http://127.0.0.1:11111/callback?code=code&state=${authorizationUrl?.searchParams.get('state') ?? ''}`,
        confirmCredentialReplacement: vi.fn().mockResolvedValue(true),
      },
      { signal: controller.signal },
    );
    await persistenceStarted.promise;
    controller.abort();
    releasePersistence.resolve();
    const result = await operation;

    expect(result).toMatchObject({
      status: 'authenticated',
      identity: { sub: 'subject-1', email: 'live@example.test', name: 'Live Admin' },
      credentials: { userInfo: { sub: 'subject-1', email: 'live@example.test' } },
    });
    expect(persistCredentials).toHaveBeenCalledOnce();

    authorizationUrl = undefined;
    const failingController = new AbortController();
    await expect(
      authenticateCliSession(
        {
          server: new URL('https://porta.example.test'),
          noBrowser: true,
          persistCredentials: async () => {
            failingController.abort();
            throw new Error('disk path must remain private');
          },
        },
        {
          presentAuthorizationUrl: async (url) => {
            authorizationUrl = url;
          },
          requestManualCallback: async () =>
            `http://127.0.0.1:11111/callback?code=code&state=${authorizationUrl?.searchParams.get('state') ?? ''}`,
          confirmCredentialReplacement: vi.fn().mockResolvedValue(true),
        },
        { signal: failingController.signal },
      ),
    ).rejects.toThrow('Unable to save credentials.');
    vi.unstubAllGlobals();
  });

  it('cancels a pending manual interaction without persistence', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ issuer, clientId, orgSlug: 'porta-admin' })),
        ),
    );
    const controller = new AbortController();
    const callbackRequested = Promise.withResolvers<void>();
    const persistCredentials = vi.fn();
    const operation = authenticateCliSession(
      {
        server: new URL('https://porta.example.test'),
        noBrowser: true,
        persistCredentials,
      },
      {
        presentAuthorizationUrl: async () => undefined,
        requestManualCallback: async () => {
          callbackRequested.resolve();
          return new Promise<string>(() => undefined);
        },
        confirmCredentialReplacement: vi.fn(),
      },
      { signal: controller.signal },
    );
    await callbackRequested.promise;
    controller.abort();

    await expect(operation).resolves.toEqual({ status: 'cancelled' });
    expect(persistCredentials).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
