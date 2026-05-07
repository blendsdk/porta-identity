/**
 * Authentication routes for the BFF server.
 *
 * Implements the OIDC Auth Code + PKCE login flow:
 *   GET /auth/login    — Generate PKCE, redirect to Porta
 *   GET /auth/callback — Exchange code for tokens, create session
 *   GET /auth/logout   — Revoke tokens, clear session, redirect to end_session
 *   GET /auth/me       — Return session/user info for the SPA
 *
 * @module routes/auth
 */

import { randomBytes } from 'node:crypto';
import Router from '@koa/router';
import * as oidcClient from 'openid-client';
import type { OidcConfig } from '../auth/oidc.js';
import { generatePkce, buildAuthorizationUrl } from '../auth/oidc.js';
import type { SessionStore } from '../session.js';
import { setSessionCookie, clearSessionCookie } from '../middleware/session.js';
import { GUI_VERSION } from '../version.js';

/** Dependencies for auth route creation. */
export interface AuthRouteDeps {
  /** Resolved OIDC configuration. */
  oidcConfig: OidcConfig;
  /** In-memory session store. */
  sessionStore: SessionStore;
  /** Porta server URL (for display in /auth/me). */
  serverUrl: string;
  /** BFF listen port (for redirect URI). */
  port: number;
}

/**
 * Create the auth router with login, callback, logout, and me endpoints.
 *
 * @param deps - Injected dependencies.
 * @returns Koa router with auth routes mounted.
 */
export function createAuthRoutes(deps: AuthRouteDeps): Router {
  const { oidcConfig, sessionStore, serverUrl } = deps;
  const router = new Router();

  /**
   * GET /auth/login — Initiate OIDC login.
   *
   * Generates PKCE challenge, stores verifier in a temporary session,
   * and redirects the browser to Porta's authorization endpoint.
   */
  router.get('/auth/login', async (ctx) => {
    // Generate PKCE pair
    const { codeVerifier, codeChallenge } = await generatePkce();

    // Generate random state for CSRF prevention
    const state = randomBytes(32).toString('hex');

    // Store PKCE verifier and state in a temporary session
    // (no tokens yet — these are populated after callback)
    const tempSessionId = sessionStore.create({
      accessToken: '',
      refreshToken: '',
      idToken: '',
      tokenExpiresAt: 0,
      user: { sub: '', name: '', email: '' },
      pkceCodeVerifier: codeVerifier,
      state,
    });

    // Set session cookie so we can retrieve the verifier in /auth/callback
    setSessionCookie(ctx, tempSessionId);
    ctx.state.sessionId = tempSessionId;

    // Build authorization URL and redirect
    const authUrl = buildAuthorizationUrl(oidcConfig, codeChallenge, state);
    ctx.redirect(authUrl);
  });

  /**
   * GET /auth/callback — OIDC authorization code callback.
   *
   * Exchanges the authorization code for tokens using PKCE,
   * creates a full session, and redirects to the SPA root.
   */
  router.get('/auth/callback', async (ctx) => {
    // Retrieve the temporary session with PKCE verifier
    const session = ctx.state.session;
    if (!session?.pkceCodeVerifier || !session?.state) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid callback state — please try logging in again' };
      return;
    }

    // Verify state parameter matches
    const returnedState = ctx.query.state as string | undefined;
    if (returnedState !== session.state) {
      ctx.status = 400;
      ctx.body = { error: 'State mismatch — possible CSRF attack' };
      return;
    }

    // Check for error response from the OIDC provider
    const error = ctx.query.error as string | undefined;
    if (error) {
      const desc = ctx.query.error_description as string | undefined;
      ctx.redirect(`/auth/login?error=${encodeURIComponent(desc || error)}`);
      return;
    }

    try {
      // Exchange the authorization code for tokens.
      // When behind a proxy (e.g., Vite dev server), ctx.href reflects the
      // internal BFF host/port, not the public-facing URL. We construct the
      // callback URL from the registered redirect_uri + actual query params
      // so it matches what openid-client expects.
      const callbackUrl = new URL(`${oidcConfig.redirectUri}${ctx.search}`);
      const tokenSet = await oidcClient.authorizationCodeGrant(
        oidcConfig.config,
        callbackUrl,
        {
          pkceCodeVerifier: session.pkceCodeVerifier,
          expectedState: session.state,
        },
      );

      // Extract user claims from the ID token
      const claims = tokenSet.claims();
      const user = {
        sub: claims?.sub ?? '',
        name: (claims?.name as string) ?? '',
        email: (claims?.email as string) ?? '',
      };

      // Delete the temporary session
      if (ctx.state.sessionId) {
        sessionStore.delete(ctx.state.sessionId);
      }

      // Create a full session with tokens
      const newSessionId = sessionStore.create({
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token ?? '',
        idToken: tokenSet.id_token ?? '',
        tokenExpiresAt: Date.now() + (tokenSet.expires_in ?? 3600) * 1000,
        user,
      });

      // Set the new session cookie
      setSessionCookie(ctx, newSessionId);
      ctx.state.sessionId = newSessionId;

      // Redirect to SPA root
      ctx.redirect('/');
    } catch (err) {
      // Token exchange failed — redirect to login with error
      const msg = err instanceof Error ? err.message : 'Token exchange failed';
      ctx.redirect(`/auth/login?error=${encodeURIComponent(msg)}`);
    }
  });

  /**
   * GET /auth/logout — OIDC logout.
   *
   * 1. Best-effort token revocation (refresh token)
   * 2. Clear the in-memory session and session cookie
   * 3. Redirect to Porta's end_session_endpoint
   */
  router.get('/auth/logout', async (ctx) => {
    const session = ctx.state.session;

    if (session) {
      // Best-effort token revocation (fire-and-forget)
      if (session.refreshToken) {
        try {
          await oidcClient.tokenRevocation(
            oidcConfig.config,
            session.refreshToken,
          );
        } catch {
          // Revocation failure is non-fatal — continue with logout
        }
      }

      // Clear the session
      if (ctx.state.sessionId) {
        sessionStore.delete(ctx.state.sessionId);
      }
    }

    // Clear the session cookie
    clearSessionCookie(ctx);

    // Build end_session URL for RP-Initiated Logout
    const serverConf = oidcConfig.config.serverMetadata();
    const endSessionEndpoint = serverConf.end_session_endpoint;

    if (endSessionEndpoint && session?.idToken) {
      const endSessionUrl = new URL(endSessionEndpoint);
      endSessionUrl.searchParams.set('id_token_hint', session.idToken);
      endSessionUrl.searchParams.set(
        'post_logout_redirect_uri',
        oidcConfig.postLogoutRedirectUri,
      );
      ctx.redirect(endSessionUrl.href);
    } else {
      // Fallback: just redirect to login
      ctx.redirect('/auth/login');
    }
  });

  /**
   * GET /auth/me — Session info endpoint.
   *
   * Returns user info and server details for the SPA's useAuth hook.
   * Returns 401 if no active session.
   */
  router.get('/auth/me', async (ctx) => {
    const session = ctx.state.session;

    if (!session || !session.user.sub) {
      ctx.status = 401;
      ctx.body = { authenticated: false };
      return;
    }

    ctx.body = {
      authenticated: true,
      user: session.user,
      server: serverUrl,
      version: GUI_VERSION,
    };
  });

  return router;
}
