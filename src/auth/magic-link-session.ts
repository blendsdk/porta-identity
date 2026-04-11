/**
 * Magic link session management — signed cookie + Redis backing store.
 *
 * When a user clicks a magic link, we validate the token, authenticate the
 * user, and create a short-lived session in Redis. A `_ml_session` cookie
 * holds the opaque session token. The login handler detects this cookie
 * and either completes the OIDC flow (same browser) or shows a success
 * page (different browser).
 *
 * Properties:
 *   - **Opaque token** — random 32-byte hex string, no data to decode/forge
 *   - **Single-use** — Redis key deleted after first consumption
 *   - **Short-lived** — 5-minute TTL in Redis
 *   - **HttpOnly cookie** — prevents JavaScript access (XSS-safe)
 *   - **SameSite=Lax** — blocks cross-site POST but allows navigational GET
 *
 * @example
 *   // In magic link handler (after token validation):
 *   await createMagicLinkSession(ctx, redis, {
 *     userId: user.id,
 *     interactionUid: 'abc123',
 *     organizationId: org.id,
 *   });
 *   ctx.redirect(`/interaction/${interactionUid}`);
 *
 *   // In login handler (detecting session):
 *   const session = await consumeMagicLinkSession(ctx, redis);
 *   if (session) { /* complete OIDC flow or show success page *\/ }
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
    secure: process.env.NODE_ENV === 'production',
    maxAge: ML_SESSION_TTL * 1000, // milliseconds
    overwrite: true,
  });

  logger.debug(
    { interactionUid: data.interactionUid, userId: data.userId },
    'Created magic link session',
  );
}

// ---------------------------------------------------------------------------
// Consumption
// ---------------------------------------------------------------------------

/**
 * Consume a magic link session — read and delete in one atomic operation.
 *
 * Reads the `_ml_session` cookie, looks up the session in Redis, deletes
 * the Redis key (single-use), and clears the cookie. Returns the session
 * data if valid, or null if expired/missing/invalid.
 *
 * @param ctx - Koa context (for cookie reading/clearing)
 * @returns Session data if valid, null otherwise
 */
export async function consumeMagicLinkSession(
  ctx: Context,
): Promise<MagicLinkSessionData | null> {
  const token = ctx.cookies.get(ML_SESSION_COOKIE);
  if (!token) return null;

  const redis = getRedis();
  const key = `${ML_SESSION_PREFIX}${token}`;

  // Atomic get-and-delete: read the value then delete
  const raw = await redis.get(key);
  if (!raw) {
    // Session expired or already consumed
    clearMagicLinkSessionCookie(ctx);
    return null;
  }

  // Delete immediately — single-use enforcement
  await redis.del(key);

  // Clear the cookie
  clearMagicLinkSessionCookie(ctx);

  try {
    const data = JSON.parse(raw) as MagicLinkSessionData;

    // Validate required fields
    if (!data.userId || !data.interactionUid || !data.organizationId) {
      logger.warn({ data }, 'Invalid magic link session data — missing required fields');
      return null;
    }

    logger.debug(
      { interactionUid: data.interactionUid, userId: data.userId },
      'Consumed magic link session',
    );

    return data;
  } catch (parseError) {
    logger.warn({ parseError }, 'Failed to parse magic link session data');
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
