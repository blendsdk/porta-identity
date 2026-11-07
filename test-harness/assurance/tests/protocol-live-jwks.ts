/**
 * Content-based JWKS identity helpers for the live protocol observer.
 *
 * Key identities use RFC 7638 SHA-256 thumbprints when the JWK material is present. The `kid` is
 * only a fallback, because a key ID is publisher-chosen and is not a content identity.
 */

import { createHash } from 'node:crypto';

/** Returns true for a plain object, never an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Builds one canonical RFC 7638 thumbprint input for a supported key type. */
function canonicalJwk(key: Record<string, unknown>): string | undefined {
  if (
    key.kty === 'EC' &&
    typeof key.crv === 'string' &&
    typeof key.x === 'string' &&
    typeof key.y === 'string'
  ) {
    return JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y });
  }
  if (key.kty === 'RSA' && typeof key.e === 'string' && typeof key.n === 'string') {
    return JSON.stringify({ e: key.e, kty: key.kty, n: key.n });
  }
  if (key.kty === 'OKP' && typeof key.crv === 'string' && typeof key.x === 'string') {
    return JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x });
  }
  return undefined;
}

/**
 * Returns one stable content identity for a JWK.
 *
 * @param key - Untrusted JWK object.
 * @returns `thumbprint:<sha256>` or a bounded `kid:<value>` fallback.
 * @example jwkIdentity({ kty: 'EC', crv: 'P-256', x: '...', y: '...' });
 */
export function jwkIdentity(key: Record<string, unknown>): string | undefined {
  const canonical = canonicalJwk(key);
  if (canonical !== undefined) {
    return `thumbprint:${createHash('sha256').update(canonical).digest('base64url')}`;
  }
  if (typeof key.kid === 'string' && key.kid.length > 0) return `kid:${key.kid}`;
  return undefined;
}

/**
 * Extracts sorted, unique content identities from one JWKS document.
 *
 * @param document - Untrusted JWKS JSON.
 * @returns Stable key identities.
 * @throws Error when the document is not a JWKS object with a key array.
 * @example jwksIdentities({ keys: [{ kty: 'EC', ... }] });
 */
export function jwksIdentities(document: unknown): readonly string[] {
  if (!isRecord(document) || !Array.isArray(document.keys)) {
    throw new Error('protocol JWKS document is malformed');
  }
  const identities = document.keys.flatMap((key) =>
    isRecord(key) ? (jwkIdentity(key) ?? []) : [],
  );
  return Object.freeze([...new Set(identities)].sort());
}

/** Returns whether two key-identity sets have no shared content. */
export function keySetsDistinct(first: readonly string[], second: readonly string[]): boolean {
  return !first.some((identity) => second.includes(identity));
}
