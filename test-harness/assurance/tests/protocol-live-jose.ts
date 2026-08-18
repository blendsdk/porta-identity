import { createPublicKey, verify } from 'node:crypto';

import { z } from 'zod';

import type { ProtocolFactValue } from './oidc-token-cases-contract.js';

const jwtHeaderSchema = z
  .object({
    alg: z.string().min(1),
    kid: z.string().min(1),
    jku: z.string().url().optional(),
    x5u: z.string().url().optional(),
    jwk: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const jwtPayloadSchema = z
  .object({
    iss: z.string().min(1),
    aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    sub: z.string().min(1),
    nonce: z.string().min(1).optional(),
    exp: z.number().int(),
    nbf: z.number().int().optional(),
  })
  .passthrough();

const publicJwkSchema = z
  .object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    kid: z.string().min(1),
    x: z.string().min(1),
    y: z.string().min(1),
  })
  .passthrough();

/** Exact independent expectations used to verify one issued ID token. */
export interface IndependentIdTokenExpectation {
  /** Trusted issuer discovered from the selected tenant. */
  readonly issuer: string;
  /** Client identifier that must be present in the audience. */
  readonly audience: string;
  /** Synthetic fixture subject that completed the authorization. */
  readonly subject: string;
  /** Client-generated nonce sent on the authorization request. */
  readonly nonce?: string;
  /** Current epoch time used for deterministic lifetime checks. */
  readonly now: number;
}

/** Public facts produced without importing Porta token-verification helpers. */
export interface IndependentIdTokenFacts {
  /** Whether every required signature and claim check succeeded. */
  readonly accepted: boolean;
  /** Closed public facts consumed by the immutable protocol specification. */
  readonly facts: Readonly<Record<string, ProtocolFactValue>>;
}

/** Decodes one base64url JSON segment with a bounded schema. */
function decodeSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]{1,16384}$/u.test(segment)) throw new Error('invalid JWT segment');
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/** Returns whether one audience claim contains the exact expected client. */
function audienceMatches(audience: string | readonly string[], expected: string): boolean {
  return typeof audience === 'string' ? audience === expected : audience.includes(expected);
}

/** Verifies one bounded ES256 signature and converts malformed signatures into rejection. */
function signatureMatches(
  signingInput: string,
  encodedSignature: string,
  key: z.infer<typeof publicJwkSchema>,
): boolean {
  try {
    return verify(
      'sha256',
      Buffer.from(signingInput),
      { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(encodedSignature, 'base64url'),
    );
  } catch {
    return false;
  }
}

/**
 * Verifies one ID token with Node cryptography and an explicitly trusted JWKS document.
 *
 * Remote key-location headers are rejected before key selection. The verifier never follows a
 * `jku` or `x5u` URL and never trusts an embedded JWK.
 */
export function verifyIndependentIdToken(
  token: string,
  jwks: unknown,
  expectation: IndependentIdTokenExpectation,
): IndependentIdTokenFacts {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('ID token does not have three JWT segments');
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    throw new Error('ID token segments are incomplete');
  }
  const header = jwtHeaderSchema.parse(decodeSegment(encodedHeader));
  const payload = jwtPayloadSchema.parse(decodeSegment(encodedPayload));
  const keys = z.object({ keys: z.array(publicJwkSchema) }).parse(jwks).keys;
  const trustedKeys = keys.filter((candidate) => candidate.kid === header.kid);
  const remoteKeyHeaderAbsent =
    header.jku === undefined && header.x5u === undefined && header.jwk === undefined;
  const key = trustedKeys.length === 1 && remoteKeyHeaderAbsent ? trustedKeys[0] : undefined;
  const algValid = header.alg === 'ES256';
  const signatureValid =
    key !== undefined &&
    algValid &&
    signatureMatches(`${encodedHeader}.${encodedPayload}`, encodedSignature, key);
  const issExact = payload.iss === expectation.issuer;
  const audExact = audienceMatches(payload.aud, expectation.audience);
  const subExact = payload.sub === expectation.subject;
  const nonceExact =
    expectation.nonce === undefined
      ? payload.nonce === undefined
      : payload.nonce === expectation.nonce;
  const expValid = payload.exp > expectation.now;
  const nbfValid = payload.nbf === undefined || payload.nbf <= expectation.now;
  const accepted =
    algValid &&
    remoteKeyHeaderAbsent &&
    signatureValid &&
    issExact &&
    audExact &&
    subExact &&
    nonceExact &&
    expValid &&
    nbfValid;
  const facts = Object.freeze({
    result: accepted ? 'accepted' : 'rejected',
    alg: header.alg,
    curve: key?.crv ?? null,
    kidTrusted: key !== undefined,
    issExact,
    audExact,
    subExact,
    nonceExact,
    expValid,
    nbfValid,
    signatureValid,
  });
  return Object.freeze({ accepted, facts });
}

/** Rejects an opaque access token at an RP boundary without attempting JWT decoding. */
export function rejectOpaqueTokenAtRelyingParty(): Readonly<Record<string, ProtocolFactValue>> {
  return Object.freeze({
    result: 'rejected',
    opaqueJwtParseAttempted: false,
    sessionCreated: false,
  });
}
