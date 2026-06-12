/**
 * prompt=login session-reset middleware.
 *
 * Fixes the "Something went wrong" dead-end on browser re-login (Bug #1).
 *
 * Root cause: a stale `_session` cookie from a previous login survives into a
 * new `prompt=login` authorization flow. The provider rotates the session id
 * during resume, so the interaction's recorded session uid no longer matches
 * the live session uid → node-oidc-provider throws `SessionNotFound` and the
 * user sees a terminal error. (Confirmed: the Redis Session record is present
 * during the failure — this is NOT a Redis durability problem.)
 *
 * Fix: on an initial GET/POST authorize request whose `prompt` parameter
 * contains `login`, clear the `_session` + `_session.sig` cookies BEFORE the
 * provider runs. With no stale cookie, the provider mints a fresh session and
 * there is no uid mismatch. The stale Redis Session record is left to expire on
 * its own via TTL (AR-2, revised) — clearing the cookie is what fixes the bug.
 *
 * Design notes:
 * - Only acts when `prompt` contains the `login` value (AR-3). Normal SSO /
 *   session-reuse logins are unaffected (AR-5).
 * - Reads `prompt` from the query string. The CLI and standard browser RP flows
 *   use GET authorize with `prompt` in the query, so this covers the real flow
 *   without consuming the POST body stream the provider needs (PF-005).
 * - Cookie clearing is signing-free: we expire both `_session` and
 *   `_session.sig` explicitly. The outer Koa app does not set `app.keys`, so we
 *   must NOT rely on Koa's signed-cookie API here (PF-001/PF-002).
 *
 * @module middleware/prompt-login-reset
 */

import type { Middleware } from 'koa';
import type Provider from 'oidc-provider';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { writeAuditLog } from '../lib/audit-log.js';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Does the OIDC `prompt` parameter request a forced login?
 *
 * Per OIDC Core §3.1.2.1, `prompt` is a space-delimited list of values.
 * Returns true only when `login` is one of those values (exact token match —
 * not a substring, so `logins` or `login_hint` values do not match).
 *
 * @param prompt - The raw `prompt` parameter value (or undefined)
 * @returns true if `login` is present among the space-delimited values
 */
export function promptHasLogin(prompt: string | undefined | null): boolean {
  if (!prompt) return false;
  return prompt.split(' ').filter(Boolean).includes('login');
}

/**
 * Is this request the INITIAL org-scoped authorize endpoint?
 *
 * Matches `GET`/`POST` `/{orgSlug}/auth` (with optional trailing slash) but
 * NOT the resume route `/{orgSlug}/auth/{uid}` and not other OIDC endpoints
 * (`/token`, `/jwks`, etc.). The resume route must be excluded because the
 * session-mismatch happens there — we reset on the *initial* authorize so the
 * interaction binds to a fresh session.
 *
 * @param method - HTTP method
 * @param path - Request path (outer Koa path, includes the org slug)
 * @returns true if this is the initial authorize endpoint
 */
export function isInitialAuthorize(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'POST') return false;
  // ^/{slug}/auth or /{slug}/auth/ — exactly one path segment before /auth,
  // and nothing (or only a trailing slash) after.
  return /^\/[^/]+\/auth\/?$/.test(path);
}

// ---------------------------------------------------------------------------
// Cookie clearing (signing-free, shared)
// ---------------------------------------------------------------------------

/**
 * Clear the OIDC session cookie pair (`_session` + `_session.sig`).
 *
 * Expires BOTH cookie names at path `/` with attributes matching how the
 * provider wrote them (httpOnly, sameSite=lax, secure per issuer scheme). This
 * is intentionally signing-free: it sets each cookie to an expired value
 * directly, so it works regardless of whether `app.keys` is configured on the
 * Koa app (the outer Porta app does not set it). (PF-001/PF-002, AR-2)
 *
 * @param ctx - Koa context (outer app context or provider ctx — both work)
 * @param sessionCookieName - The provider's session cookie name (e.g. `_session`)
 */
export function clearSessionCookies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  sessionCookieName: string,
): void {
  const secure = config.issuerBaseUrl.startsWith('https://');
  const opts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    // Do NOT use signed: true — the outer app has no app.keys.
    signed: false,
    // Expire immediately.
    expires: new Date(0),
    maxAge: 0,
  };

  // Clear the main cookie and its signature companion explicitly.
  ctx.cookies.set(sessionCookieName, null, opts);
  ctx.cookies.set(`${sessionCookieName}.sig`, null, opts);
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create the prompt=login session-reset middleware.
 *
 * Mounted in `src/server.ts` BEFORE the `/:orgSlug/*` OIDC router so it runs on
 * the outer Koa context before the provider processes the authorize request.
 *
 * @param provider - OIDC provider instance (used only for the session cookie name)
 * @returns Koa middleware
 */
export function promptLoginReset(provider: Provider): Middleware {
  // Resolve the session cookie name once (e.g. '_session'). `cookieName` is a
  // runtime method on the provider that is not present in the TypeScript types,
  // so we access it via a narrow cast and fall back to the provider default
  // (`_session`) if it is unavailable.
  const providerWithCookieName = provider as unknown as {
    cookieName?: (type: string) => string;
  };
  const sessionCookieName =
    typeof providerWithCookieName.cookieName === 'function'
      ? providerWithCookieName.cookieName('session')
      : '_session';

  return async (ctx, next) => {
    if (!isInitialAuthorize(ctx.method, ctx.path)) {
      return next();
    }

    const prompt = ctx.query.prompt;
    const promptValue = Array.isArray(prompt) ? prompt.join(' ') : prompt;

    if (!promptHasLogin(promptValue)) {
      return next();
    }

    // Force a clean slate: clear the (possibly stale) session cookie pair so the
    // provider mints a fresh session and resume cannot hit a uid mismatch.
    clearSessionCookies(ctx, sessionCookieName);

    logger.info(
      { path: ctx.path },
      'prompt=login: cleared session cookies for forced re-authentication',
    );

    // Best-effort audit (no sensitive data). Fire-and-forget pattern matches
    // writeAuditLog's own contract (it never throws).
    writeAuditLog({
      eventType: 'auth.prompt_login.session_reset',
      eventCategory: 'authentication',
      description: 'Session cookies cleared on prompt=login (forced re-authentication)',
      ipAddress: ctx.ip,
    });

    return next();
  };
}
