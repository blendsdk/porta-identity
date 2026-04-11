/**
 * Magic link session management — cookie + Redis backing store.
 *
 * Provides two mechanisms for completing magic link authentication:
 *
 * **1. Pre-auth flow (cross-browser safe — preferred):**
 * When the magic link is clicked, we store a pre-auth session in Redis and
 * set a `_ml_preauth` cookie. The user is redirected to the original OIDC
 * authorization URL (reconstructed from stored auth context). The provider
 * creates a new interaction, and `showLogin()` detects the pre-auth cookie
 * to auto-complete the login. Works on ANY browser/device.
 *
 * **2. Legacy session flow (same-browser only — backward compat):**
 * The `_ml_session` cookie approach is retained for backward compatibility
 * with magic links generated before the pre-auth flow was implemented.
 *
 * **Auth context storage:**
 * When a magic link is sent, the original OIDC authorization parameters
 * (client_id, redirect_uri, scope, state, nonce, code_challenge, etc.)
 * are stored in Redis keyed by interaction UID. This allows the magic link
 * handler to reconstruct the original authorization URL on any browser.
 *
 * Properties:
 *   - **Opaque tokens** — random 32-byte hex strings, no data to decode/forge
 *   - **Single-use** — Redis keys deleted after first consumption
 *   - **Short-lived** — 5-minute TTL in Redis
 *   - **HttpOnly cookies** — prevents JavaScript access (XSS-safe)
 *   - **SameSite=Lax** — blocks cross-site POST but allows navigational GET
 *
 * @example
 *   // Storing auth context when sending magic link:
 *   await storeMagicLinkAuthContext(interaction.uid, { clientId, redirectUri, ... });
 *
 *   // In magic link handler (after token validation):
 *   const authCtx = await getMagicLinkAuthContext(interactionUid);
 *   await createMagicLinkPreAuth(ctx, { userId: user.id, organizationId: org.id });
 *   // → redirect to reconstructed auth URL (via HTML page with spinner)
 *
 *   // In login handler (detecting pre-auth):
 *   const preAuth = await consumeMagicLinkPreAuth(ctx);
 *   if (preAuth) { interactionFinished(ctx, { login: { accountId: preAuth.userId } }); }
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

// ===========================================================================
// Pre-auth flow (cross-browser safe)
// ===========================================================================

// ---------------------------------------------------------------------------
// Constants — Pre-auth
// ---------------------------------------------------------------------------

/** Cookie name for magic link pre-auth token */
const ML_PREAUTH_COOKIE = '_ml_preauth';

/** Redis key prefix for magic link pre-auth sessions */
const ML_PREAUTH_PREFIX = 'ml_preauth:';

/** Pre-auth TTL in seconds (5 minutes) */
const ML_PREAUTH_TTL = 300;

/** Redis key prefix for original OIDC authorization context */
const ML_AUTH_CONTEXT_PREFIX = 'ml_auth_ctx:';

/** Auth context TTL in seconds (20 minutes — must exceed magic link token TTL) */
const ML_AUTH_CONTEXT_TTL = 1200;

// ---------------------------------------------------------------------------
// Types — Pre-auth
// ---------------------------------------------------------------------------

/**
 * Original OIDC authorization request parameters.
 *
 * Stored in Redis when a magic link is sent so the original authorization
 * request can be reconstructed on any browser/device when the link is clicked.
 * All fields are optional because different clients may use different subsets.
 */
export interface MagicLinkAuthContext {
  /** OIDC client_id from the original authorization request */
  clientId: string;
  /** Redirect URI from the original authorization request */
  redirectUri: string;
  /** Requested scopes (space-separated) */
  scope: string;
  /** Client-provided state parameter (opaque, must be preserved exactly) */
  state?: string;
  /** Client-provided nonce for ID token binding */
  nonce?: string;
  /** PKCE code_challenge from the original request */
  codeChallenge?: string;
  /** PKCE code_challenge_method (usually 'S256') */
  codeChallengeMethod?: string;
  /** Response type (usually 'code') */
  responseType: string;
  /** Organization slug for URL construction */
  orgSlug: string;
}

/**
 * Data stored in a magic link pre-auth session.
 *
 * Created when a magic link is verified. The `_ml_preauth` cookie references
 * this data in Redis. Consumed by the interaction login handler to
 * auto-complete the OIDC login without showing the login page.
 */
export interface MagicLinkPreAuthData {
  /** Authenticated user ID */
  userId: string;
  /** Organization ID (for audit logging) */
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Auth Context Storage
// ---------------------------------------------------------------------------

/**
 * Store the original OIDC authorization parameters in Redis.
 *
 * Called when a magic link is sent during an OIDC interaction. The stored
 * context allows the magic link handler to reconstruct the original
 * authorization URL on any browser/device.
 *
 * @param interactionUid - OIDC interaction UID (used as key)
 * @param context - Original authorization parameters to preserve
 */
export async function storeMagicLinkAuthContext(
  interactionUid: string,
  context: MagicLinkAuthContext,
): Promise<void> {
  const redis = getRedis();
  const key = `${ML_AUTH_CONTEXT_PREFIX}${interactionUid}`;

  await redis.set(key, JSON.stringify(context), 'EX', ML_AUTH_CONTEXT_TTL);

  logger.debug(
    { interactionUid, clientId: context.clientId },
    'Stored magic link auth context',
  );
}

/**
 * Retrieve and delete the stored OIDC authorization context.
 *
 * Called when a magic link is verified. Returns the original authorization
 * parameters so the handler can redirect to the authorization endpoint
 * with the exact same parameters the client originally sent.
 *
 * Single-use: the Redis key is deleted after retrieval.
 *
 * @param interactionUid - OIDC interaction UID
 * @returns Auth context if found, null if expired/missing
 */
export async function getMagicLinkAuthContext(
  interactionUid: string,
): Promise<MagicLinkAuthContext | null> {
  const redis = getRedis();
  const key = `${ML_AUTH_CONTEXT_PREFIX}${interactionUid}`;

  const raw = await redis.get(key);
  if (!raw) return null;

  // Delete after retrieval — single-use
  await redis.del(key);

  try {
    const context = JSON.parse(raw) as MagicLinkAuthContext;

    // Validate required fields
    if (!context.clientId || !context.redirectUri || !context.orgSlug) {
      logger.warn({ context }, 'Invalid magic link auth context — missing required fields');
      return null;
    }

    logger.debug(
      { interactionUid, clientId: context.clientId },
      'Retrieved magic link auth context',
    );

    return context;
  } catch (parseError) {
    logger.warn({ parseError }, 'Failed to parse magic link auth context');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pre-auth Creation
// ---------------------------------------------------------------------------

/**
 * Create a magic link pre-auth session in Redis and set the `_ml_preauth` cookie.
 *
 * Called when a magic link is verified. The pre-auth token is stored in Redis
 * and referenced by an HttpOnly cookie. When the user is redirected to the
 * OIDC authorization endpoint (new interaction), `showLogin()` detects this
 * cookie and auto-completes the login.
 *
 * The cookie is set on a 200 response (HTML redirect page with spinner),
 * NOT on a 302 redirect — this avoids Safari ITP issues where cookies set
 * during 302 redirects may be stripped.
 *
 * @param ctx - Koa context (for cookie setting)
 * @param data - Pre-auth data (userId, organizationId)
 */
export async function createMagicLinkPreAuth(
  ctx: Context,
  data: MagicLinkPreAuthData,
): Promise<void> {
  const redis = getRedis();
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const key = `${ML_PREAUTH_PREFIX}${token}`;

  // Store pre-auth data in Redis with TTL
  await redis.set(key, JSON.stringify(data), 'EX', ML_PREAUTH_TTL);

  // Set the cookie — HttpOnly, SameSite=Lax, path=/
  ctx.cookies.set(ML_PREAUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ML_PREAUTH_TTL * 1000,
    overwrite: true,
  });

  logger.debug(
    { userId: data.userId },
    'Created magic link pre-auth session',
  );
}

// ---------------------------------------------------------------------------
// Pre-auth Consumption
// ---------------------------------------------------------------------------

/**
 * Consume a magic link pre-auth session — read and delete atomically.
 *
 * Called by `showLogin()` in the interaction handler. If a valid `_ml_preauth`
 * cookie is found, the pre-auth data is returned and both the Redis key and
 * cookie are cleared (single-use enforcement).
 *
 * @param ctx - Koa context (for cookie reading/clearing)
 * @returns Pre-auth data if valid, null otherwise
 */
export async function consumeMagicLinkPreAuth(
  ctx: Context,
): Promise<MagicLinkPreAuthData | null> {
  const token = ctx.cookies.get(ML_PREAUTH_COOKIE);
  if (!token) return null;

  const redis = getRedis();
  const key = `${ML_PREAUTH_PREFIX}${token}`;

  const raw = await redis.get(key);
  if (!raw) {
    clearMagicLinkPreAuthCookie(ctx);
    return null;
  }

  // Delete immediately — single-use enforcement
  await redis.del(key);
  clearMagicLinkPreAuthCookie(ctx);

  try {
    const data = JSON.parse(raw) as MagicLinkPreAuthData;

    if (!data.userId || !data.organizationId) {
      logger.warn({ data }, 'Invalid magic link pre-auth data — missing required fields');
      return null;
    }

    logger.debug(
      { userId: data.userId },
      'Consumed magic link pre-auth session',
    );

    return data;
  } catch (parseError) {
    logger.warn({ parseError }, 'Failed to parse magic link pre-auth data');
    return null;
  }
}

/**
 * Check if a magic link pre-auth cookie is present (without consuming it).
 *
 * @param ctx - Koa context
 * @returns true if the `_ml_preauth` cookie exists
 */
export function hasMagicLinkPreAuth(ctx: Context): boolean {
  return !!ctx.cookies.get(ML_PREAUTH_COOKIE);
}

/**
 * Clear the magic link pre-auth cookie.
 *
 * @param ctx - Koa context
 */
function clearMagicLinkPreAuthCookie(ctx: Context): void {
  ctx.cookies.set(ML_PREAUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    overwrite: true,
  });
}

// ---------------------------------------------------------------------------
// Auth URL Builder
// ---------------------------------------------------------------------------

/**
 * Reconstruct the original OIDC authorization URL from stored auth context.
 *
 * Builds a URL to the OIDC authorization endpoint with the exact same
 * parameters the client originally sent. This preserves the client's state,
 * PKCE code_challenge, nonce, and all other authorization parameters.
 *
 * @param issuerBaseUrl - The issuer base URL (e.g., 'http://localhost:3000')
 * @param context - Stored authorization context
 * @returns Full authorization URL string
 */
export function buildAuthorizationUrl(
  issuerBaseUrl: string,
  context: MagicLinkAuthContext,
): string {
  const params = new URLSearchParams();

  params.set('client_id', context.clientId);
  params.set('redirect_uri', context.redirectUri);
  params.set('response_type', context.responseType);
  params.set('scope', context.scope);

  // Preserve optional client-provided parameters exactly as-is
  if (context.state) params.set('state', context.state);
  if (context.nonce) params.set('nonce', context.nonce);
  if (context.codeChallenge) params.set('code_challenge', context.codeChallenge);
  if (context.codeChallengeMethod) params.set('code_challenge_method', context.codeChallengeMethod);

  return `${issuerBaseUrl}/${context.orgSlug}/auth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Redirect Page Renderer
// ---------------------------------------------------------------------------

/**
 * Render a standalone HTML redirect page with a ripple spinner animation.
 *
 * Uses an HTML page with JavaScript `location.href` instead of a 302 redirect.
 * This avoids Safari ITP issues where cookies set during 302 redirect chains
 * may be stripped. The cookie is set on this 200 response, and the JavaScript
 * redirect ensures the browser navigates to the target URL with the cookie.
 *
 * @param ctx - Koa context
 * @param redirectUrl - Target URL to redirect to
 */
export function renderRedirectPage(ctx: Context, redirectUrl: string): void {
  // Escape the URL to prevent XSS in the script tag
  const safeUrl = redirectUrl.replace(/"/g, '&quot;').replace(/</g, '&lt;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signing you in…</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, -apple-system, sans-serif; }
    .redirect-container { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; color: #6b7280; }
    .redirect-container p { margin-top: 24px; font-size: 14px; }
    .lds-ripple, .lds-ripple div { box-sizing: border-box; }
    .lds-ripple { display: inline-block; position: relative; width: 80px; height: 80px; }
    .lds-ripple div { position: absolute; border: 4px solid currentColor; opacity: 1; border-radius: 50%; animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite; }
    .lds-ripple div:nth-child(2) { animation-delay: -0.5s; }
    @keyframes lds-ripple {
      0% { top: 36px; left: 36px; width: 8px; height: 8px; opacity: 0; }
      4.9% { top: 36px; left: 36px; width: 8px; height: 8px; opacity: 0; }
      5% { top: 36px; left: 36px; width: 8px; height: 8px; opacity: 1; }
      100% { top: 0; left: 0; width: 80px; height: 80px; opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="redirect-container">
    <div class="lds-ripple"><div></div><div></div></div>
    <p>Signing you in&hellip;</p>
  </div>
  <script>window.location.href = "${safeUrl}";</script>
</body>
</html>`;

  ctx.status = 200;
  ctx.type = 'text/html';
  ctx.body = html;
}
