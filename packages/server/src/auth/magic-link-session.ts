/**
 * Magic link session management — cookie + Redis backing store.
 *
 * When a magic link is clicked, the handler creates a `_ml_session` cookie
 * backed by a Redis key containing the authenticated user's ID, the OIDC
 * interaction UID, and the organization ID. The user is then redirected to
 * `/interaction/:uid` where `showLogin()` detects the session cookie and
 * either:
 *   - **Same browser**: completes the OIDC flow via `interactionFinished()`
 *   - **Different browser**: shows a "return to original browser" success page
 *
 * Properties:
 *   - **Opaque tokens** — random 32-byte hex strings, no data to decode/forge
 *   - **Single-use** — Redis keys deleted after first consumption
 *   - **Short-lived** — 5-minute TTL in Redis
 *   - **HttpOnly cookies** — prevents JavaScript access (XSS-safe)
 *   - **SameSite=Lax** — blocks cross-site POST but allows navigational GET
 *
 * @example
 *   // In magic link handler (after token validation):
 *   await createMagicLinkSession(ctx, { userId, interactionUid, organizationId });
 *   ctx.redirect(`/interaction/${interactionUid}`);
 *
 *   // In login handler (detecting session):
 *   const session = await consumeMagicLinkSession(ctx, { organizationId, interactionUid });
 *   if (session) { interactionFinished(ctx, { login: { accountId: session.userId } }); }
 */

import crypto from 'node:crypto';
import type { Context } from 'koa';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cookie name for magic link session token */
const ML_SESSION_COOKIE = '_ml_session';

/** Redis key prefix for magic link sessions */
const ML_SESSION_PREFIX = 'ml_session:';

/** Session TTL in seconds (5 minutes) */
const ML_SESSION_TTL = 300;

/** Session token length in bytes (32 bytes = 64 hex chars) */
const SESSION_TOKEN_BYTES = 32;

/**
 * Atomically compare continuation authority and consume exactly one matching Redis value.
 *
 * Mismatches deliberately preserve the key so the legitimate tenant and interaction can retry.
 * Invalid stored data is not returned and remains bounded by the original five-minute TTL.
 */
const CONSUME_MATCHING_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return -2
end
local interactionOrganizationId = redis.call('GET', KEYS[2])
if not interactionOrganizationId or interactionOrganizationId ~= ARGV[1] then
  return 0
end
local decoded, session = pcall(cjson.decode, raw)
if not decoded or type(session) ~= 'table' then
  return -1
end
if type(session.userId) ~= 'string' or session.userId == '' or
   type(session.interactionUid) ~= 'string' or session.interactionUid == '' or
   type(session.organizationId) ~= 'string' or session.organizationId == '' then
  return -1
end
if session.organizationId ~= ARGV[1] or session.interactionUid ~= ARGV[2] then
  return 0
end
redis.call('DEL', KEYS[1])
return raw
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data stored in a magic link session */
export interface MagicLinkSessionData {
  /** Authenticated user ID */
  userId: string;
  /** OIDC interaction UID (for flow completion) */
  interactionUid: string;
  /** Organization ID (for branding on success page) */
  organizationId: string;
}

/** Independently derived authority required to consume one continuation. */
export interface MagicLinkSessionAuthority {
  /** Organization recorded by the validated OIDC interaction. */
  readonly organizationId: string;
  /** Exact interaction identifier selected by the public route. */
  readonly interactionUid: string;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Create a magic link session in Redis and set the `_ml_session` cookie.
 *
 * Generates a random session token, stores session data in Redis with a
 * 5-minute TTL, and sets the token as an HttpOnly cookie.
 *
 * @param ctx - Koa context (for cookie setting)
 * @param data - Session data to store (userId, interactionUid, organizationId)
 */
export async function createMagicLinkSession(
  ctx: Context,
  data: MagicLinkSessionData,
): Promise<void> {
  const redis = getRedis();
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const key = `${ML_SESSION_PREFIX}${token}`;

  // Store session data in Redis with TTL
  await redis.set(key, JSON.stringify(data), 'EX', ML_SESSION_TTL);

  // Set the cookie — HttpOnly, SameSite=Lax, path=/
  ctx.cookies.set(ML_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: ctx.secure,
    maxAge: ML_SESSION_TTL * 1000, // milliseconds
    overwrite: true,
  });

  logger.debug('Created tenant-bound magic link session');
}

// ---------------------------------------------------------------------------
// Consumption
// ---------------------------------------------------------------------------

/**
 * Consume a magic link session — read and delete in one atomic operation.
 *
 * Reads the `_ml_session` cookie and asks Redis to compare the stored tenant and interaction before
 * deleting the key. The Lua operation makes the compare-and-delete decision single-use under
 * concurrency. A mismatch preserves both the Redis value and cookie for one legitimate retry.
 *
 * @param ctx - Koa context (for cookie reading/clearing)
 * @param authority - Tenant and interaction independently derived from the live OIDC interaction.
 * @returns Session data if valid, null otherwise
 */
export async function consumeMagicLinkSession(
  ctx: Context,
  authority: MagicLinkSessionAuthority,
): Promise<MagicLinkSessionData | null> {
  const token = ctx.cookies.get(ML_SESSION_COOKIE);
  if (!token) return null;
  if (!authority.organizationId || !authority.interactionUid) return null;

  const redis = getRedis();
  const key = `${ML_SESSION_PREFIX}${token}`;
  const interactionAuthorityKey = `interaction:org:${authority.interactionUid}`;
  const result = await redis.eval(
    CONSUME_MATCHING_SESSION_SCRIPT,
    2,
    key,
    interactionAuthorityKey,
    authority.organizationId,
    authority.interactionUid,
  );
  if (result === 0) return null;
  if (typeof result !== 'string') {
    clearMagicLinkSessionCookie(ctx);
    return null;
  }
  clearMagicLinkSessionCookie(ctx);

  try {
    const parsed: unknown = JSON.parse(result);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof Reflect.get(parsed, 'userId') !== 'string' ||
      typeof Reflect.get(parsed, 'interactionUid') !== 'string' ||
      typeof Reflect.get(parsed, 'organizationId') !== 'string'
    ) {
      logger.warn('Invalid magic link session data');
      return null;
    }
    const data: MagicLinkSessionData = {
      userId: Reflect.get(parsed, 'userId'),
      interactionUid: Reflect.get(parsed, 'interactionUid'),
      organizationId: Reflect.get(parsed, 'organizationId'),
    };
    logger.debug('Consumed tenant-bound magic link session');
    return data;
  } catch {
    logger.warn('Failed to parse magic link session data');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a magic link session cookie is present (without consuming it).
 * Use this for quick checks before committing to the session flow.
 *
 * @param ctx - Koa context
 * @returns true if the `_ml_session` cookie exists
 */
export function hasMagicLinkSession(ctx: Context): boolean {
  return !!ctx.cookies.get(ML_SESSION_COOKIE);
}

/**
 * Clear the magic link session cookie.
 *
 * @param ctx - Koa context
 */
export function clearMagicLinkSessionCookie(ctx: Context): void {
  ctx.cookies.set(ML_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    overwrite: true,
  });
}
