/**
 * Session cookie middleware for the BFF server.
 *
 * Reads the session ID from the `porta-gui-session` cookie, looks up
 * the session in the in-memory store, and attaches it to `ctx.state.session`.
 * On response, writes the session cookie if a session was created during
 * the request (e.g., after OIDC callback).
 *
 * Cookie configuration per RD-30 §Session & Cookie Management:
 * - HttpOnly: true (JavaScript cannot access)
 * - SameSite: Lax (allows cookie on OIDC callback redirect — a safe top-level GET)
 * - Secure: false (HTTP localhost — Secure cookies don't work on plain HTTP)
 * - Path: /
 * - Max-Age: 3600 (1 hour)
 *
 * @module middleware/session
 */

import type { Context, Next } from 'koa';
import type { SessionStore, SessionData } from '../session.js';

/** Cookie name for the session identifier. */
export const SESSION_COOKIE_NAME = 'porta-gui-session';

/** Cookie max-age in seconds (1 hour). */
const COOKIE_MAX_AGE_SECONDS = 3600;

/** Augment Koa context state to include session data. */
declare module 'koa' {
  interface DefaultState {
    session?: SessionData;
    sessionId?: string;
  }
}

/**
 * Create session cookie middleware that reads/writes session state.
 *
 * @param store - The in-memory session store instance.
 */
export function sessionMiddleware(
  store: SessionStore,
): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    // Read session ID from cookie
    const sessionId = parseCookie(ctx.headers.cookie, SESSION_COOKIE_NAME);

    if (sessionId) {
      const session = store.get(sessionId);
      if (session) {
        ctx.state.session = session;
        ctx.state.sessionId = sessionId;
      }
      // If session not found (expired or invalid), cookie remains but session is undefined
      // — downstream handlers will treat this as unauthenticated
    }

    await next();

    // If a new session ID was set during the request (e.g., after callback),
    // write the session cookie on the response
    if (ctx.state.sessionId && ctx.state.sessionId !== sessionId) {
      setSessionCookie(ctx, ctx.state.sessionId);
    }
  };
}

/**
 * Set the session cookie on the response.
 * Called after creating a new session (OIDC callback).
 *
 * @param ctx - Koa context.
 * @param sessionId - The session ID to store in the cookie.
 */
export function setSessionCookie(ctx: Context, sessionId: string): void {
  ctx.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax', // Lax required for OIDC — callback is a cross-site redirect (GET)
    secure: false, // HTTP localhost — Secure flag not applicable
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS * 1000, // Koa expects milliseconds
    overwrite: true,
  });
}

/**
 * Clear the session cookie (used during logout).
 *
 * @param ctx - Koa context.
 */
export function clearSessionCookie(ctx: Context): void {
  ctx.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0, // Expire immediately
    overwrite: true,
  });
}

/**
 * Parse a specific cookie value from a raw Cookie header string.
 * Avoids pulling in a dependency for simple cookie parsing.
 *
 * @param cookieHeader - Raw `Cookie` header value.
 * @param name - Cookie name to find.
 * @returns The cookie value, or undefined if not found.
 */
function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  const prefix = `${name}=`;
  const parts = cookieHeader.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.substring(prefix.length);
    }
  }

  return undefined;
}
