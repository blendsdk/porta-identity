/** Secure OIDC ID-token verification for interactive CLI authentication. */

import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import type { CliAuthOperationOptions, VerifiedIdentity } from './types.js';

/** Detects ASCII and C1 controls that can alter terminal presentation. */
function containsTerminalControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Inputs that bind an ID token to one authorization request. */
export interface VerifyCliIdTokenRequest {
  /** Compact ID token returned by the issuer. */
  readonly token: string;
  /** Exact discovered issuer URL. */
  readonly issuer: string;
  /** Public CLI client identifier. */
  readonly clientId: string;
  /** Unpredictable nonce sent in the matching authorization request. */
  readonly nonce: string;
  /** Issuer key set obtained from trusted discovery metadata. */
  readonly jwks: JSONWebKeySet;
}

/** Optional context required to authenticate a refreshed ID token. */
export type IdTokenValidationContext = Omit<VerifyCliIdTokenRequest, 'token'>;

/** Inputs for retaining or safely updating display identity after refresh. */
export interface RefreshIdentityRequest {
  /** Previously authenticated identity. */
  readonly original: VerifiedIdentity;
  /** Immutable subject established by the original login. */
  readonly originalSubject: string;
  /** Optional ID token returned by refresh. */
  readonly token?: string;
  /** Original validation context, when still available. */
  readonly validationContext?: IdTokenValidationContext;
}

/** Returns an allowlisted optional string claim. */
function optionalString(payload: JWTPayload, claim: 'email' | 'name'): string | undefined {
  const value = payload[claim];
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !containsTerminalControl(value)
    ? value
    : undefined;
}

/** Verifies signature, issuer, audience, time, nonce, and subject. */
export async function verifyCliIdToken(
  request: VerifyCliIdTokenRequest,
): Promise<VerifiedIdentity> {
  try {
    const verificationTime = Math.floor(Date.now() / 1000);
    const protectedHeader = decodeProtectedHeader(request.token);
    if (protectedHeader.alg !== 'ES256') throw new Error('Unexpected signing algorithm');

    const { payload } = await jwtVerify(request.token, createLocalJWKSet(request.jwks), {
      algorithms: ['ES256'],
      audience: request.clientId,
      issuer: request.issuer,
    });
    if (
      typeof payload.iat !== 'number' ||
      payload.iat > verificationTime + 60 ||
      typeof payload.exp !== 'number' ||
      payload.exp <= verificationTime ||
      payload.nonce !== request.nonce ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 255 ||
      containsTerminalControl(payload.sub)
    ) {
      throw new Error('Invalid required claims');
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (
      !audiences.includes(request.clientId) ||
      (audiences.length > 1 && payload.azp !== request.clientId) ||
      (payload.azp !== undefined && payload.azp !== request.clientId)
    ) {
      throw new Error('Invalid audience binding');
    }
    return {
      sub: payload.sub,
      email: optionalString(payload, 'email'),
      name: optionalString(payload, 'name'),
    };
  } catch {
    throw new Error('Authentication failed');
  }
}

/** Fetches and minimally validates an issuer JWKS with caller-owned cancellation. */
export async function fetchIssuerJwks(
  endpoint: string,
  options: CliAuthOperationOptions,
): Promise<JSONWebKeySet> {
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Authentication failed', { cause: error });
  }
  if (!response.ok) throw new Error('Authentication failed');
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('Authentication failed');
  }
  if (!value || typeof value !== 'object' || !('keys' in value) || !Array.isArray(value.keys)) {
    throw new Error('Authentication failed');
  }
  return { keys: value.keys };
}

/**
 * Accepts refreshed display claims only when the original verification context
 * is available and the immutable subject remains unchanged.
 */
export async function updateDisplayIdentityFromRefresh(
  request: RefreshIdentityRequest,
): Promise<VerifiedIdentity> {
  if (!request.token || !request.validationContext) return request.original;
  try {
    const refreshed = await verifyCliIdToken({
      ...request.validationContext,
      token: request.token,
    });
    return refreshed.sub === request.originalSubject ? refreshed : request.original;
  } catch {
    return request.original;
  }
}
