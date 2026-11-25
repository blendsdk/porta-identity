/**
 * Device ID-token verification specifications.
 *
 * The device flow has no OIDC nonce because the provider does not copy one to
 * the DeviceCode. The device verifier must still enforce signature, issuer,
 * audience, time and subject, and the authorization-code verifier must keep
 * requiring its nonce.
 */

import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';

const issuer = 'https://porta.example.test/acme';
const clientId = 'porta-cli';

interface SigningFixture {
  readonly privateKey: KeyLike;
  readonly jwks: { readonly keys: readonly JWK[] };
}

/** Create one ephemeral ES256 signing fixture. */
async function createSigningFixture(): Promise<SigningFixture> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  return {
    privateKey,
    jwks: { keys: [{ ...publicJwk, alg: 'ES256', kid: 'device-key', use: 'sig' }] },
  };
}

/** Sign one device ID token; the nonce is absent unless an override supplies it. */
async function signDeviceToken(
  fixture: SigningFixture,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer,
    aud: clientId,
    sub: 'subject-1',
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'device-key' })
    .sign(fixture.privateKey);
}

/** Load the verifier only inside a test. */
async function loadVerifier() {
  return import('../../src/auth/id-token-verifier.js');
}

describe('device ID-token verification', () => {
  it('accepts a valid token without a nonce', async () => {
    const fixture = await createSigningFixture();
    const token = await signDeviceToken(fixture);
    const { verifyDeviceIdToken } = await loadVerifier();

    await expect(
      verifyDeviceIdToken({ token, issuer, clientId, jwks: fixture.jwks }),
    ).resolves.toMatchObject({ sub: 'subject-1' });
  });

  it('accepts a token even if a nonce happens to be present', async () => {
    const fixture = await createSigningFixture();
    const token = await signDeviceToken(fixture, { nonce: 'supplied-nonce' });
    const { verifyDeviceIdToken } = await loadVerifier();

    await expect(
      verifyDeviceIdToken({ token, issuer, clientId, jwks: fixture.jwks }),
    ).resolves.toMatchObject({ sub: 'subject-1' });
  });

  it('rejects a wrong signature, issuer or audience', async () => {
    const trusted = await createSigningFixture();
    const untrusted = await createSigningFixture();
    const { verifyDeviceIdToken } = await loadVerifier();

    await expect(
      verifyDeviceIdToken({
        token: await signDeviceToken(untrusted),
        issuer,
        clientId,
        jwks: trusted.jwks,
      }),
    ).rejects.toThrow('Authentication failed');
    await expect(
      verifyDeviceIdToken({
        token: await signDeviceToken(trusted, { iss: 'https://evil.example/acme' }),
        issuer,
        clientId,
        jwks: trusted.jwks,
      }),
    ).rejects.toThrow('Authentication failed');
    await expect(
      verifyDeviceIdToken({
        token: await signDeviceToken(trusted, { aud: 'other-client' }),
        issuer,
        clientId,
        jwks: trusted.jwks,
      }),
    ).rejects.toThrow('Authentication failed');
  });

  it('rejects expired tokens, future iat and a missing or terminal subject', async () => {
    const fixture = await createSigningFixture();
    const now = Math.floor(Date.now() / 1000);
    const { verifyDeviceIdToken } = await loadVerifier();

    for (const overrides of [
      { exp: now - 1 },
      { iat: now + 120 },
      { sub: undefined },
      { sub: 'bad\u001bname' },
    ]) {
      await expect(
        verifyDeviceIdToken({
          token: await signDeviceToken(fixture, overrides),
          issuer,
          clientId,
          jwks: fixture.jwks,
        }),
      ).rejects.toThrow('Authentication failed');
    }
  });

  it('enforces azp for multiple audiences', async () => {
    const fixture = await createSigningFixture();
    const { verifyDeviceIdToken } = await loadVerifier();

    await expect(
      verifyDeviceIdToken({
        token: await signDeviceToken(fixture, { aud: [clientId, 'other-client'] }),
        issuer,
        clientId,
        jwks: fixture.jwks,
      }),
    ).rejects.toThrow('Authentication failed');

    await expect(
      verifyDeviceIdToken({
        token: await signDeviceToken(fixture, {
          aud: [clientId, 'other-client'],
          azp: clientId,
        }),
        issuer,
        clientId,
        jwks: fixture.jwks,
      }),
    ).resolves.toMatchObject({ sub: 'subject-1' });
  });

  it('keeps the authorization-code verifier nonce-required', async () => {
    const fixture = await createSigningFixture();
    const tokenWithoutNonce = await signDeviceToken(fixture);
    const tokenWithNonce = await signDeviceToken(fixture, { nonce: 'request-nonce' });
    const { verifyCliIdToken } = await loadVerifier();

    await expect(
      verifyCliIdToken({
        token: tokenWithoutNonce,
        issuer,
        clientId,
        nonce: 'request-nonce',
        jwks: fixture.jwks,
      }),
    ).rejects.toThrow('Authentication failed');
    await expect(
      verifyCliIdToken({
        token: tokenWithNonce,
        issuer,
        clientId,
        nonce: 'request-nonce',
        jwks: fixture.jwks,
      }),
    ).resolves.toMatchObject({ sub: 'subject-1' });
  });
});
