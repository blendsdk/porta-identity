/**
 * Fixed device authorization limits and Redis key builders.
 *
 * The limiter middleware and the approval success hook must derive identical
 * keys: the hook resets the primary user-code budget that the middleware
 * incremented. Keeping the formats in one module prevents a silent mismatch
 * that would leave a spent budget in place.
 *
 * All identifiers are hashed before they become part of a key. Keys appear in
 * Redis diagnostics, so raw IP addresses, session identifiers and device codes
 * must not be stored there.
 */

import { createHash } from 'node:crypto';
import type { RateLimitConfig } from '../auth/rate-limiter.js';
import { DEVICE_CODE_GRANT } from '../clients/validators.js';

/** Maximum opaque device code length accepted by the device token limiter. */
export const MAX_DEVICE_CODE_LENGTH = 4096;

/** Device authorization requests per client and address. */
export const DEVICE_AUTHORIZATION_RATE_LIMIT: RateLimitConfig = {
  max: 10,
  windowSeconds: 300,
};

/** Device authorization requests per address, independent of the client identifier. */
export const DEVICE_AUTHORIZATION_IP_RATE_LIMIT: RateLimitConfig = {
  max: 30,
  windowSeconds: 300,
};

/** User-code submissions per address and session. */
export const DEVICE_USER_CODE_RATE_LIMIT: RateLimitConfig = {
  max: 10,
  windowSeconds: 600,
};

/** User-code submissions per address, independent of the session. */
export const DEVICE_USER_CODE_IP_RATE_LIMIT: RateLimitConfig = {
  max: 30,
  windowSeconds: 600,
};

/** Device token polls per client. */
export const DEVICE_TOKEN_RATE_LIMIT: RateLimitConfig = {
  max: 180,
  windowSeconds: 900,
};

/** Device token polls per address. */
export const DEVICE_TOKEN_IP_RATE_LIMIT: RateLimitConfig = {
  max: 600,
  windowSeconds: 300,
};

/** Advertised and enforced device polling interval. */
export const DEVICE_POLL_INTERVAL_SECONDS = 5;

/** Scheduling tolerance applied to the soft polling interval. */
export const DEVICE_POLL_INTERVAL_TOLERANCE_SECONDS = 1;

/** Retention of the last-poll marker; longer than one code lifetime. */
export const DEVICE_POLL_MARKER_TTL_SECONDS = 1500;

/** Return true only for a non-empty, bounded opaque device code. */
export function isBoundedDeviceCode(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_DEVICE_CODE_LENGTH;
}

/**
 * Recognize an exact device-grant token request for hard-counter accounting.
 *
 * The device code is intentionally not required here: a missing or overlong code is still a
 * device-grant request and must spend the per-address and per-client budgets even though the
 * provider will reject it. The soft interval only applies to a bounded code.
 *
 * @param body - Parsed token request body
 * @returns True when `grant_type` is exactly the device grant and not a duplicate array
 */
export function isDeviceGrantBody(body: Record<string, unknown> | undefined): boolean {
  return body?.['grant_type'] === DEVICE_CODE_GRANT;
}

/** Short helper that produces a stable 16-character hexadecimal digest. */
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Build the primary device-authorization key.
 *
 * @param organizationId - Resolved organization identifier
 * @param ip - Address that initiated the request
 * @param clientId - Presented public client identifier
 * @returns Privacy-safe Redis key
 */
export function buildDeviceAuthorizationKey(
  organizationId: string,
  ip: string,
  clientId: string,
): string {
  return `ratelimit:device-auth:${organizationId}:${digest(`${ip}|${clientId}`)}`;
}

/**
 * Build the per-address device-authorization key.
 *
 * @param ip - Address that initiated the request
 * @returns Privacy-safe Redis key
 */
export function buildDeviceAuthorizationIpKey(ip: string): string {
  return `ratelimit:device-auth:ip:${digest(ip)}`;
}

/**
 * Build the primary user-code key.
 *
 * When no provider session exists, the address is the fallback identifier. The
 * approval hook resolves the same identifier from the signed session cookie.
 *
 * @param organizationId - Resolved organization identifier
 * @param ip - Address that submitted the code
 * @param sessionUid - Provider session UID, when one exists
 * @returns Privacy-safe Redis key
 */
export function buildUserCodeKey(
  organizationId: string,
  ip: string,
  sessionUid: string | undefined,
): string {
  return `ratelimit:device-user-code:${organizationId}:${digest(`${ip}|${sessionUid ?? ip}`)}`;
}

/**
 * Build the per-address user-code key.
 *
 * @param ip - Address that submitted the code
 * @returns Privacy-safe Redis key
 */
export function buildUserCodeIpKey(ip: string): string {
  return `ratelimit:device-user-code:ip:${digest(ip)}`;
}

/**
 * Build the soft polling-interval marker key.
 *
 * @param clientId - Authenticated public client identifier
 * @param deviceCode - Opaque device code from the token request
 * @returns Privacy-safe Redis key
 */
export function buildPollIntervalKey(clientId: string, deviceCode: string): string {
  return `ratelimit:device-poll-last:${clientId}:${digest(deviceCode)}`;
}

/**
 * Build the primary device-poll key.
 *
 * @param clientId - Authenticated public client identifier
 * @param ip - Address that is polling
 * @returns Privacy-safe Redis key
 */
export function buildDevicePollKey(clientId: string, ip: string): string {
  // The `client` segment prevents a client literally named "ip" from sharing the aggregate key.
  return `ratelimit:device-poll:client:${clientId}:${digest(ip)}`;
}

/**
 * Build the per-address device-poll key.
 *
 * @param ip - Address that is polling
 * @returns Privacy-safe Redis key
 */
export function buildDevicePollIpKey(ip: string): string {
  return `ratelimit:device-poll:ip:${digest(ip)}`;
}
