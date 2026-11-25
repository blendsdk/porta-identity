/**
 * Fixed rate limits for the device authorization flow.
 *
 * Three independent surfaces have their own budgets:
 *
 * - Device authorization: a client plus address may start a limited number of
 *   flows, and one address has a larger aggregate budget so rotating client
 *   identifiers cannot open unlimited counters.
 * - User-code verification: an address plus provider session may submit a
 *   limited number of codes, and the address has an aggregate budget. The
 *   signed session cookie is the primary identifier; the address is the
 *   fallback when no session exists.
 * - Device token polling: the hard counters are incremented before the soft
 *   interval check, so a client that polls too quickly still consumes its
 *   budget. The generic token limiter exempts an exact device-grant request.
 *
 * No limit is a system setting. The accepted Redis failure policy is
 * fail-open with a warning, matching the existing authentication limiter.
 */

import type { Context, Middleware } from 'koa';
import type Provider from 'oidc-provider';
import { checkRateLimit } from '../auth/rate-limiter.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import { getRedis } from '../lib/redis.js';
import { relativeOidcRoute, resolveOrganizationId } from '../oidc/org-resolution.js';
import { renderDeviceRateLimitedPage } from '../oidc/device-pages.js';
import { presentedClientId, TOKEN_IP_RATE_LIMIT } from './token-rate-limiter.js';
import {
  buildDeviceAuthorizationIpKey,
  buildDeviceAuthorizationKey,
  buildDevicePollIpKey,
  buildDevicePollKey,
  buildPollIntervalKey,
  buildUserCodeIpKey,
  buildUserCodeKey,
  DEVICE_AUTHORIZATION_IP_RATE_LIMIT,
  DEVICE_AUTHORIZATION_RATE_LIMIT,
  DEVICE_POLL_INTERVAL_SECONDS,
  DEVICE_POLL_INTERVAL_TOLERANCE_SECONDS,
  DEVICE_POLL_MARKER_TTL_SECONDS,
  DEVICE_TOKEN_IP_RATE_LIMIT,
  DEVICE_TOKEN_RATE_LIMIT,
  DEVICE_USER_CODE_IP_RATE_LIMIT,
  DEVICE_USER_CODE_RATE_LIMIT,
  isBoundedDeviceCode,
  isDeviceGrantBody,
} from './device-rate-limit-keys.js';

export {
  buildDeviceAuthorizationIpKey,
  buildDeviceAuthorizationKey,
  buildDevicePollIpKey,
  buildDevicePollKey,
  buildPollIntervalKey,
  buildUserCodeIpKey,
  buildUserCodeKey,
  DEVICE_AUTHORIZATION_IP_RATE_LIMIT,
  DEVICE_AUTHORIZATION_RATE_LIMIT,
  DEVICE_POLL_INTERVAL_SECONDS,
  DEVICE_POLL_INTERVAL_TOLERANCE_SECONDS,
  DEVICE_TOKEN_IP_RATE_LIMIT,
  DEVICE_TOKEN_RATE_LIMIT,
  DEVICE_USER_CODE_IP_RATE_LIMIT,
  DEVICE_USER_CODE_RATE_LIMIT,
} from './device-rate-limit-keys.js';

/** Maximum presented client identifier length used in a key. */
const MAX_CLIENT_ID_LENGTH = 255;

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Set the informational rate-limit headers for one budget. */
function setBudgetHeaders(ctx: Context, limit: number, remaining: number): void {
  ctx.set('X-RateLimit-Limit', String(limit));
  ctx.set('X-RateLimit-Remaining', String(remaining));
}

/** Re-emit the request origin for a browser-readable early denial. */
function applyCorsOrigin(ctx: Context): void {
  const origin = ctx.headers.origin;
  if (origin !== undefined) {
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Vary', 'Origin');
  }
}

/** Send the OAuth-shaped 429 response used by the device authorization and token endpoints. */
function denyJson(ctx: Context, retryAfter: number, description: string): void {
  applyCorsOrigin(ctx);
  ctx.status = 429;
  ctx.set('Retry-After', String(retryAfter));
  ctx.set('Cache-Control', 'no-store');
  ctx.set('Pragma', 'no-cache');
  ctx.body = {
    error: 'rate_limit_exceeded',
    error_description: description,
    retry_after: retryAfter,
  };
}

/** Store a last-poll timestamp atomically and report whether the interval has elapsed. */
async function consumePollInterval(deviceCode: string, clientId: string): Promise<boolean> {
  const key = buildPollIntervalKey(clientId, deviceCode);
  const minimumMilliseconds =
    (DEVICE_POLL_INTERVAL_SECONDS - DEVICE_POLL_INTERVAL_TOLERANCE_SECONDS) * 1000;
  const script = `
    local last = redis.call('GET', KEYS[1])
    local now = tonumber(ARGV[1])
    if last and (now - tonumber(last)) < tonumber(ARGV[2]) then
      return 0
    end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
    return 1
  `;
  try {
    const result: unknown = await getRedis().eval(
      script,
      1,
      key,
      String(Date.now()),
      String(minimumMilliseconds),
      String(DEVICE_POLL_MARKER_TTL_SECONDS),
    );
    return Number(result) === 1;
  } catch (error) {
    // Fail-open matches the accepted Redis policy; the hard counters still bound the request.
    logger.warn({ err: error }, 'Device poll interval check failed');
    return true;
  }
}

/** Write one rate-limit audit row per key and fixed window. */
async function auditRateLimitOnce(
  eventType: 'rate_limit.device_code' | 'rate_limit.device_user_code',
  key: string,
  windowSeconds: number,
  organizationId: string | undefined,
  metadata: Record<string, unknown>,
  ip: string,
): Promise<void> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds);
  const marker = `audit:device-rate-limit:${eventType}:${key}:${windowStart}`;
  let first = true;
  try {
    first = (await getRedis().set(marker, '1', 'EX', windowSeconds, 'NX')) === 'OK';
  } catch (error) {
    logger.warn({ err: error }, 'Device rate-limit audit marker unavailable');
  }
  if (!first) return;

  try {
    await writeAuditLog({
      organizationId,
      eventType,
      eventCategory: 'security',
      description: 'Device authorization rate limit exceeded',
      metadata,
      ipAddress: ip,
    });
  } catch (error) {
    logger.warn({ err: error, eventType }, 'Device rate-limit audit write failed');
  }
}

/**
 * Limit device authorization requests by client plus address and by address.
 *
 * @returns Koa middleware mounted before the client-tenant binding
 */
export function deviceAuthorizationRateLimiter(): Middleware {
  return async function deviceAuthorizationRateLimiterMiddleware(ctx, next) {
    if (ctx.method !== 'POST' || relativeOidcRoute(ctx) !== '/device/auth') {
      return next();
    }

    const organizationId = resolveOrganizationId(ctx.state.organization);
    if (organizationId === undefined) return next();

    const ip = ctx.ip;
    const clientId = presentedClientId(ctx).slice(0, MAX_CLIENT_ID_LENGTH);
    const aggregate = await checkRateLimit(
      buildDeviceAuthorizationIpKey(ip),
      DEVICE_AUTHORIZATION_IP_RATE_LIMIT,
    );
    if (!aggregate.allowed) {
      await auditRateLimitOnce(
        'rate_limit.device_code',
        buildDeviceAuthorizationIpKey(ip),
        DEVICE_AUTHORIZATION_IP_RATE_LIMIT.windowSeconds,
        organizationId,
        { clientId, ip },
        ip,
      );
      denyJson(ctx, aggregate.retryAfter, 'Too many device authorization requests. Please try again later.');
      return;
    }

    const primary = await checkRateLimit(
      buildDeviceAuthorizationKey(organizationId, ip, clientId),
      DEVICE_AUTHORIZATION_RATE_LIMIT,
    );
    setBudgetHeaders(ctx, DEVICE_AUTHORIZATION_RATE_LIMIT.max, primary.remaining);
    if (!primary.allowed) {
      await auditRateLimitOnce(
        'rate_limit.device_code',
        buildDeviceAuthorizationKey(organizationId, ip, clientId),
        DEVICE_AUTHORIZATION_RATE_LIMIT.windowSeconds,
        organizationId,
        { clientId, ip },
        ip,
      );
      denyJson(ctx, primary.retryAfter, 'Too many device authorization requests. Please try again later.');
      return;
    }

    return next();
  };
}

/**
 * Limit device token polling by client plus address, by address and by the advertised interval.
 *
 * @returns Koa middleware mounted before the generic token limiter's device exemption
 */
export function deviceTokenRateLimiter(): Middleware {
  return async function deviceTokenRateLimiterMiddleware(ctx, next) {
    if (ctx.method !== 'POST' || relativeOidcRoute(ctx) !== '/token') return next();

    const body = isRecord(ctx.request.body) ? ctx.request.body : undefined;
    if (!isDeviceGrantBody(body)) return next();

    const organizationId = resolveOrganizationId(ctx.state.organization);
    if (organizationId === undefined) return next();
    const clientId = presentedClientId(ctx).slice(0, MAX_CLIENT_ID_LENGTH);
    const deviceCode = body?.['device_code'];

    // Hard counters run before the soft interval so rapid polling still spends its budget.
    const aggregate = await checkRateLimit(
      buildDevicePollIpKey(ctx.ip),
      DEVICE_TOKEN_IP_RATE_LIMIT,
    );
    if (!aggregate.allowed) {
      await auditRateLimitOnce(
        'rate_limit.device_code',
        buildDevicePollIpKey(ctx.ip),
        DEVICE_TOKEN_IP_RATE_LIMIT.windowSeconds,
        organizationId,
        { clientId, ip: ctx.ip },
        ctx.ip,
      );
      denyJson(ctx, aggregate.retryAfter, 'Too many device token requests. Please try again later.');
      return;
    }

    const primary = await checkRateLimit(
      buildDevicePollKey(clientId, ctx.ip),
      DEVICE_TOKEN_RATE_LIMIT,
    );
    setBudgetHeaders(ctx, DEVICE_TOKEN_RATE_LIMIT.max, primary.remaining);
    if (!primary.allowed) {
      await auditRateLimitOnce(
        'rate_limit.device_code',
        buildDevicePollKey(clientId, ctx.ip),
        DEVICE_TOKEN_RATE_LIMIT.windowSeconds,
        organizationId,
        { clientId, ip: ctx.ip },
        ctx.ip,
      );
      denyJson(ctx, primary.retryAfter, 'Too many device token requests. Please try again later.');
      return;
    }

    // A missing or overlong code has already spent the hard budgets; the provider will reject it.
    if (!isBoundedDeviceCode(deviceCode)) return next();

    const intervalElapsed = await consumePollInterval(deviceCode, clientId);
    if (!intervalElapsed) {
      applyCorsOrigin(ctx);
      ctx.status = 400;
      ctx.set('Cache-Control', 'no-store');
      ctx.set('Pragma', 'no-cache');
      ctx.body = {
        error: 'slow_down',
        error_description: 'Polling too quickly. Increase the polling interval.',
      };
      return;
    }

    return next();
  };
}

/**
 * Resolve the provider session UID from the signed session cookie.
 *
 * @param provider - Configured provider used to look up the session model
 * @param ctx - Request context carrying the signed cookie
 * @returns The session UID, or undefined when no valid session is present
 */
async function resolveSessionUid(provider: Provider, ctx: Context): Promise<string | undefined> {
  try {
    const cookieId = ctx.cookies.get(provider.cookieName('session'), { signed: true });
    if (cookieId === undefined) return undefined;
    const session = await provider.Session.find(cookieId);
    return typeof session?.uid === 'string' && session.uid.length > 0 ? session.uid : undefined;
  } catch (error) {
    logger.warn({ err: error }, 'Device user-code session lookup failed');
    return undefined;
  }
}

/**
 * Increment only the per-address user-code budget for a malformed body.
 *
 * The body parser rejected the request before a session or a submitted code
 * could be resolved, but the address must still spend its aggregate budget.
 * The parser error remains the response.
 *
 * @param ctx - Request context at the parser error boundary
 */
export async function countMalformedDeviceBody(ctx: Context): Promise<void> {
  if (ctx.method !== 'POST') return;
  const route = relativeOidcRoute(ctx);
  if (route === '/device') {
    await checkRateLimit(buildUserCodeIpKey(ctx.ip), DEVICE_USER_CODE_IP_RATE_LIMIT);
    return;
  }
  if (route === '/device/auth') {
    await checkRateLimit(buildDeviceAuthorizationIpKey(ctx.ip), DEVICE_AUTHORIZATION_IP_RATE_LIMIT);
    return;
  }
  if (route === '/token') {
    // The parser rejected the body before the generic limiter could extract a client identifier,
    // so only the address aggregate can be charged.
    await checkRateLimit(`ratelimit:token:ip:${ctx.ip}`, TOKEN_IP_RATE_LIMIT);
  }
}

/**
 * Limit user-code verification by session plus address and by address.
 *
 * @param provider - Configured provider used to resolve the signed session UID
 * @returns Koa middleware mounted before the device tenant binding
 */
export function deviceUserCodeRateLimiter(provider: Provider): Middleware {
  return async function deviceUserCodeRateLimiterMiddleware(ctx, next) {
    const route = relativeOidcRoute(ctx);
    if (route !== '/device') return next();
    if (ctx.method !== 'GET' && ctx.method !== 'POST') return next();
    if (ctx.method === 'GET' && ctx.query.user_code === undefined) return next();

    const organizationId = resolveOrganizationId(ctx.state.organization);
    if (organizationId === undefined) return next();

    const ip = ctx.ip;
    const sessionUid = await resolveSessionUid(provider, ctx);

    const aggregate = await checkRateLimit(
      buildUserCodeIpKey(ip),
      DEVICE_USER_CODE_IP_RATE_LIMIT,
    );
    if (!aggregate.allowed) {
      await auditRateLimitOnce(
        'rate_limit.device_user_code',
        buildUserCodeIpKey(ip),
        DEVICE_USER_CODE_IP_RATE_LIMIT.windowSeconds,
        organizationId,
        { ip },
        ip,
      );
      ctx.status = 429;
      setBudgetHeaders(ctx, DEVICE_USER_CODE_RATE_LIMIT.max, 0);
      await renderDeviceRateLimitedPage(ctx, aggregate.retryAfter);
      return;
    }

    const primary = await checkRateLimit(
      buildUserCodeKey(organizationId, ip, sessionUid),
      DEVICE_USER_CODE_RATE_LIMIT,
    );
    setBudgetHeaders(ctx, DEVICE_USER_CODE_RATE_LIMIT.max, primary.remaining);
    if (!primary.allowed) {
      await auditRateLimitOnce(
        'rate_limit.device_user_code',
        buildUserCodeKey(organizationId, ip, sessionUid),
        DEVICE_USER_CODE_RATE_LIMIT.windowSeconds,
        organizationId,
        { ip },
        ip,
      );
      ctx.status = 429;
      setBudgetHeaders(ctx, DEVICE_USER_CODE_RATE_LIMIT.max, 0);
      await renderDeviceRateLimitedPage(ctx, primary.retryAfter);
      return;
    }

    return next();
  };
}
