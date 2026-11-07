/** Focused behavior specs for content-based JWKS identity. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { jwkIdentity, jwksIdentities, keySetsDistinct } from './protocol-live-jwks.js';

/** Minimal EC JWK used by the identity cases. */
function ecJwk(x: string, kid = 'key-a'): Record<string, unknown> {
  return { kty: 'EC', crv: 'P-256', x, y: 'y-value', kid };
}

test('uses an RFC 7638 thumbprint rather than a publisher-chosen kid', () => {
  const first = jwkIdentity(ecJwk('x-first', 'same-kid'));
  const second = jwkIdentity(ecJwk('x-second', 'same-kid'));

  assert.match(first ?? '', /^thumbprint:/);
  assert.notEqual(first, second);
});

test('identifies the same key material identically across documents', () => {
  const first = jwksIdentities({ keys: [ecJwk('x-first')] });
  const second = jwksIdentities({ keys: [ecJwk('x-first')] });

  assert.deepEqual(first, second);
  assert.equal(keySetsDistinct(first, second), false);
});

test('keeps distinct key material distinct', () => {
  const first = jwksIdentities({ keys: [ecJwk('x-first')] });
  const second = jwksIdentities({ keys: [ecJwk('x-second')] });

  assert.equal(keySetsDistinct(first, second), true);
});

test('falls back to a bounded kid when no supported key material exists', () => {
  assert.equal(jwkIdentity({ kty: 'unknown', kid: 'fallback-kid' }), 'kid:fallback-kid');
  assert.equal(jwkIdentity({ kid: '' }), undefined);
});

test('rejects a malformed JWKS document', () => {
  assert.throws(() => jwksIdentities({ keys: 'not-an-array' }), /malformed/);
  assert.throws(() => jwksIdentities(null), /malformed/);
});
