import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { rejectOpaqueTokenAtRelyingParty, verifyIndependentIdToken } from './protocol-live-jose.js';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function tokenFixture(
  headerOverrides: Readonly<Record<string, unknown>> = {},
  payloadOverrides: Readonly<Record<string, unknown>> = {},
) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = 'fixture-key';
  const header = { alg: 'ES256', kid, ...headerOverrides };
  const payload = {
    iss: 'https://issuer.example/alpha',
    aud: 'client-a',
    sub: 'user-a',
    nonce: 'nonce-a',
    exp: 2_000,
    nbf: 900,
    ...payloadOverrides,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    token: `${signingInput}.${signature.toString('base64url')}`,
    jwks: { keys: [{ ...jwk, kid }] },
  };
}

test('should verify ES256 P-256 ID tokens against only the trusted JWKS', () => {
  const fixture = tokenFixture();
  const result = verifyIndependentIdToken(fixture.token, fixture.jwks, {
    issuer: 'https://issuer.example/alpha',
    audience: 'client-a',
    subject: 'user-a',
    nonce: 'nonce-a',
    now: 1_000,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.facts.signatureValid, true);
  assert.equal(result.facts.kidTrusted, true);
});

test('should reject attacker key-location headers without fetching them', () => {
  for (const header of [
    { jku: 'https://attacker.invalid/jwks' },
    { x5u: 'https://attacker.invalid/certificate' },
    { jwk: { kty: 'EC' } },
  ]) {
    const fixture = tokenFixture(header);
    const result = verifyIndependentIdToken(fixture.token, fixture.jwks, {
      issuer: 'https://issuer.example/alpha',
      audience: 'client-a',
      subject: 'user-a',
      nonce: 'nonce-a',
      now: 1_000,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.facts.result, 'rejected');
    assert.equal(result.facts.kidTrusted, false);
  }
});

test('should reject opaque access tokens without attempting JWT parsing', () => {
  assert.deepEqual(rejectOpaqueTokenAtRelyingParty(), {
    result: 'rejected',
    opaqueJwtParseAttempted: false,
    sessionCreated: false,
  });
});

test('should reject claim, lifetime, key, and signature substitutions independently', () => {
  const expectation = {
    issuer: 'https://issuer.example/alpha',
    audience: 'client-a',
    subject: 'user-a',
    nonce: 'nonce-a',
    now: 1_000,
  } as const;
  const rejected = [
    tokenFixture({}, { iss: 'https://issuer.example/bravo' }),
    tokenFixture({}, { aud: 'client-b' }),
    tokenFixture({}, { sub: 'user-b' }),
    tokenFixture({}, { nonce: 'nonce-b' }),
    tokenFixture({}, { exp: 999 }),
    tokenFixture({}, { nbf: 1_001 }),
    tokenFixture({ kid: 'unknown-key' }),
    tokenFixture({ alg: 'HS256' }),
  ];
  for (const fixture of rejected) {
    const result = verifyIndependentIdToken(fixture.token, fixture.jwks, expectation);
    assert.equal(result.accepted, false);
    assert.equal(result.facts.result, 'rejected');
  }

  const corrupted = tokenFixture();
  const segments = corrupted.token.split('.');
  assert.equal(segments.length, 3);
  const signature = segments[2];
  assert.ok(signature);
  const changed = signature.startsWith('A') ? 'B' : 'A';
  const corruptToken = `${segments[0]}.${segments[1]}.${changed}${signature.slice(1)}`;
  assert.equal(verifyIndependentIdToken(corruptToken, corrupted.jwks, expectation).accepted, false);
});

test('should reject malformed token and JWKS envelopes before verification', () => {
  const expectation = {
    issuer: 'https://issuer.example/alpha',
    audience: 'client-a',
    subject: 'user-a',
    nonce: 'nonce-a',
    now: 1_000,
  } as const;
  assert.throws(
    () => verifyIndependentIdToken('opaque-value', { keys: [] }, expectation),
    /three JWT segments/,
  );
  const fixture = tokenFixture();
  assert.throws(
    () => verifyIndependentIdToken(fixture.token, { keys: 'invalid' }, expectation),
    /invalid_type|expected array/i,
  );
});
