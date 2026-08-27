/**
 * Security specifications for CLI authorization and ID-token acceptance.
 *
 * Keys and tokens are generated for each test run. No private key or token is
 * stored in the repository or written to diagnostic output.
 */

import { describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import { createServer } from 'node:net';

const issuer = 'https://porta.example.test/porta-admin';
const clientId = 'porta-cli';
const nonce = 'request-bound-nonce';

interface SigningFixture {
  readonly privateKey: KeyLike;
  readonly jwks: { readonly keys: readonly JWK[] };
}

/** Creates an ephemeral ES256 signing fixture. */
async function createSigningFixture(): Promise<SigningFixture> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  return {
    privateKey,
    jwks: { keys: [{ ...publicJwk, alg: 'ES256', kid: 'spec-key', use: 'sig' }] },
  };
}

/** Signs one ID token while allowing a scenario to replace individual claims. */
async function signIdToken(
  fixture: SigningFixture,
  overrides: Record<string, unknown> = {},
  algorithm = 'ES256',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer,
    aud: clientId,
    sub: 'subject-1',
    nonce,
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: algorithm, kid: 'spec-key' })
    .sign(fixture.privateKey);
}

/** Loads the verifier only inside a test so every missing capability is reported by name. */
async function loadVerifier() {
  return import('../../src/auth/id-token-verifier.js');
}

describe('CLI OIDC identity validation', () => {
  it('should accept a valid ES256 token when issuer audience time nonce and subject match', async () => {
    const fixture = await createSigningFixture();
    const token = await signIdToken(fixture);
    const { verifyCliIdToken } = await loadVerifier();

    await expect(
      verifyCliIdToken({ token, issuer, clientId, nonce, jwks: fixture.jwks }),
    ).resolves.toMatchObject({ sub: 'subject-1' });
  });

  it('should reject identity generically when the algorithm or signature is not trusted', async () => {
    const trusted = await createSigningFixture();
    const untrusted = await createSigningFixture();
    const wrongSignature = await signIdToken(untrusted);
    const { verifyCliIdToken } = await loadVerifier();

    await expect(
      verifyCliIdToken({
        token: wrongSignature,
        issuer,
        clientId,
        nonce,
        jwks: trusted.jwks,
      }),
    ).rejects.toThrow('Authentication failed');
  });

  it('should reject identity before acceptance when the signed issuer is different', async () => {
    const fixture = await createSigningFixture();
    const token = await signIdToken(fixture, { iss: 'https://other.example.test/porta-admin' });
    const { verifyCliIdToken } = await loadVerifier();

    await expect(
      verifyCliIdToken({ token, issuer, clientId, nonce, jwks: fixture.jwks }),
    ).rejects.toThrow('Authentication failed');
  });

  it('should reject identity when audience or authorized party is inconsistent', async () => {
    const fixture = await createSigningFixture();
    const wrongAudience = await signIdToken(fixture, { aud: 'another-client' });
    const missingAuthorizedParty = await signIdToken(fixture, {
      aud: [clientId, 'another-client'],
      azp: undefined,
    });
    const wrongAuthorizedParty = await signIdToken(fixture, {
      aud: [clientId, 'another-client'],
      azp: 'another-client',
    });
    const { verifyCliIdToken } = await loadVerifier();

    for (const token of [wrongAudience, missingAuthorizedParty, wrongAuthorizedParty]) {
      await expect(
        verifyCliIdToken({ token, issuer, clientId, nonce, jwks: fixture.jwks }),
      ).rejects.toThrow('Authentication failed');
    }
  });

  it('should reject invalid time nonce or subject claims and accept sixty seconds of future iat skew', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const fixture = await createSigningFixture();
    const now = Math.floor(Date.now() / 1000);
    const invalidClaims = [
      { exp: now - 1 },
      { iat: 'now' },
      { iat: now + 61 },
      { nonce: 'wrong-nonce' },
      { nonce: undefined },
      { sub: '' },
      { sub: undefined },
    ];
    const { verifyCliIdToken } = await loadVerifier();

    for (const claims of invalidClaims) {
      const token = await signIdToken(fixture, claims);
      await expect(
        verifyCliIdToken({ token, issuer, clientId, nonce, jwks: fixture.jwks }),
      ).rejects.toThrow('Authentication failed');
    }

    const withinSkew = await signIdToken(fixture, { iat: now + 60 });
    await expect(
      verifyCliIdToken({ token: withinSkew, issuer, clientId, nonce, jwks: fixture.jwks }),
    ).resolves.toMatchObject({ sub: 'subject-1' });
    vi.useRealTimers();
  });

  it('should retain the original display identity when a refresh token lacks safe matching context', async () => {
    const fixture = await createSigningFixture();
    const originalToken = await signIdToken(fixture, {
      email: 'original@example.test',
      name: 'Original Admin',
    });
    const changedSubject = await signIdToken(fixture, {
      sub: 'subject-2',
      email: 'attacker@example.test',
      name: 'Replacement',
    });
    const { verifyCliIdToken, updateDisplayIdentityFromRefresh } = await loadVerifier();
    const original = await verifyCliIdToken({
      token: originalToken,
      issuer,
      clientId,
      nonce,
      jwks: fixture.jwks,
    });

    await expect(
      updateDisplayIdentityFromRefresh({
        original,
        originalSubject: 'subject-1',
        token: changedSubject,
        validationContext: { issuer, clientId, nonce, jwks: fixture.jwks },
      }),
    ).resolves.toEqual(original);
    await expect(
      updateDisplayIdentityFromRefresh({
        original,
        originalSubject: 'subject-1',
        token: undefined,
        validationContext: undefined,
      }),
    ).resolves.toEqual(original);
  });
});

describe('CLI login coordinator', () => {
  it('should bind fresh state PKCE S256 and nonce to a matching callback', async () => {
    const { createAuthorizationRequest, validateAuthorizationCallback } =
      await import('../../src/auth/login-coordinator.js');

    const first = await createAuthorizationRequest({ issuer, clientId });
    const second = await createAuthorizationRequest({ issuer, clientId });

    expect(first.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(first.url.searchParams.get('state')).toBeTruthy();
    expect(first.url.searchParams.get('nonce')).toBeTruthy();
    expect(first.url.searchParams.get('state')).not.toBe(second.url.searchParams.get('state'));
    expect(first.url.searchParams.get('nonce')).not.toBe(second.url.searchParams.get('nonce'));
    expect(() =>
      validateAuthorizationCallback('http://127.0.0.1:11111/callback?code=code&state=wrong', first),
    ).toThrow('Authentication failed');
  });

  it('should present the same authorization URL and use one manual callback reader when browser opening fails', async () => {
    const { authenticateCliSession } = await import('../../src/auth/login-coordinator.js');
    const presented: URL[] = [];
    const requestManualCallback = vi
      .fn()
      .mockResolvedValue('http://127.0.0.1:11111/callback?code=code&state=state');
    const openBrowser = vi.fn().mockRejectedValue(new Error('browser unavailable'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ issuer, clientId, orgSlug: 'porta-admin' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await authenticateCliSession(
      { server: new URL('https://porta.example.test'), openBrowser },
      {
        presentAuthorizationUrl: async (url: URL) => {
          presented.push(url);
        },
        requestManualCallback,
        confirmCredentialReplacement: vi.fn().mockResolvedValue(true),
      },
      { signal: new AbortController().signal },
    ).catch(() => undefined);

    expect(openBrowser).toHaveBeenCalledOnce();
    expect(presented).toHaveLength(1);
    expect(presented[0]?.toString()).toBe(openBrowser.mock.calls[0]?.[0].toString());
    expect(requestManualCallback).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('should return typed cancellation without persistence when the operation is already cancelled', async () => {
    const { authenticateCliSession } = await import('../../src/auth/login-coordinator.js');
    const controller = new AbortController();
    const persistCredentials = vi.fn();
    controller.abort();

    await expect(
      authenticateCliSession(
        { server: new URL('https://porta.example.test'), persistCredentials },
        {
          presentAuthorizationUrl: vi.fn(),
          requestManualCallback: vi.fn(),
          confirmCredentialReplacement: vi.fn(),
        },
        { signal: controller.signal },
      ),
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(persistCredentials).not.toHaveBeenCalled();
  });

  it.each(['discovery', 'jwks', 'token', 'userinfo'] as const)(
    'should propagate the operation signal to the active %s request',
    async (stage) => {
      const controller = new AbortController();
      const observedSignals: AbortSignal[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
          if (init?.signal) {
            observedSignals.push(init.signal);
          }
          return new Promise<Response>((_resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('Request did not receive the operation signal')),
              50,
            );
            init?.signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timeout);
                reject(new DOMException('The operation was aborted', 'AbortError'));
              },
              { once: true },
            );
          });
        }),
      );

      let operation: Promise<unknown>;
      if (stage === 'discovery') {
        const { fetchAdminMetadata } = await import('../../src/auth/metadata.js');
        operation = fetchAdminMetadata('https://porta.example.test', {
          signal: controller.signal,
        });
      } else if (stage === 'jwks') {
        const { fetchIssuerJwks } = await import('../../src/auth/id-token-verifier.js');
        operation = fetchIssuerJwks('https://porta.example.test/porta-admin/jwks', {
          signal: controller.signal,
        });
      } else if (stage === 'token') {
        const { exchangeAuthorizationCode } = await import('../../src/auth/browser-flow.js');
        operation = exchangeAuthorizationCode(
          {
            tokenEndpoint: 'https://porta.example.test/porta-admin/token',
            clientId,
            code: 'authorization-code',
            codeVerifier: 'pkce-verifier',
            redirectUri: 'http://127.0.0.1:11111/callback',
          },
          { signal: controller.signal },
        );
      } else {
        const { fetchVerifiedUserInfo } = await import('../../src/admin/session-service.js');
        operation = fetchVerifiedUserInfo(
          {
            selectedServer: new URL('https://porta.example.test'),
            orgSlug: 'porta-admin',
            accessToken: 'access-token',
            originalSubject: 'subject-1',
          },
          { signal: controller.signal },
        );
      }

      controller.abort();
      await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      expect(observedSignals).toEqual([controller.signal]);
      vi.unstubAllGlobals();
    },
  );

  it('should close callback acceptance and return cancellation when callback waiting is aborted', async () => {
    const { authenticateCliSession } = await import('../../src/auth/login-coordinator.js');
    const controller = new AbortController();
    const browserOpened = Promise.withResolvers<void>();
    let callbackPort = 0;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ issuer, clientId, orgSlug: 'porta-admin' })),
        ),
    );
    const waiting = authenticateCliSession(
      {
        server: new URL('https://porta.example.test'),
        openBrowser: async (url) => {
          const redirectUri = new URL(url.searchParams.get('redirect_uri') ?? '');
          callbackPort = Number(redirectUri.port);
          browserOpened.resolve();
        },
      },
      {
        presentAuthorizationUrl: vi.fn(),
        requestManualCallback: vi.fn(),
        confirmCredentialReplacement: vi.fn(),
      },
      { signal: controller.signal },
    );
    await browserOpened.promise;
    controller.abort();

    await expect(waiting).resolves.toEqual({ status: 'cancelled' });
    const replacement = createServer();
    await new Promise<void>((resolveListen, reject) => {
      replacement.once('error', reject);
      replacement.listen(callbackPort, '127.0.0.1', resolveListen);
    });
    await new Promise<void>((resolveClose) => replacement.close(() => resolveClose()));
    vi.unstubAllGlobals();
  });
});
