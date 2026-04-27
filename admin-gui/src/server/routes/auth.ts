import Router from '@koa/router';
import type { BffConfig } from '../config.js';
import type { OidcConfig } from '../oidc.js';
import type { Logger } from 'pino';
import { buildAuthUrl, exchangeCode } from '../oidc.js';
import type { SessionData } from '../session.js';
import type { SessionInfo } from '../../shared/types.js';
import { getCsrfToken } from '../middleware/csrf.js';

/**
 * Create auth routes for OIDC login/callback/logout flow.
 *
 * Routes:
 * - GET  /auth/login    — Redirect to Porta's OIDC authorization endpoint
 * - GET  /auth/callback — Handle OIDC callback, exchange code, create session
 * - POST /auth/logout   — Destroy session, redirect to Porta's end-session
 * - GET  /auth/me       — Return current session info (user, roles, environment)
 *
 * @param config - BFF configuration
 * @param oidcConfig - Discovered OIDC configuration
 * @param logger - Pino logger
 * @returns Koa router for auth routes
 */
export function createAuthRouter(
  config: BffConfig,
  oidcConfig: OidcConfig,
  logger: Logger,
): Router {
  const router = new Router({ prefix: '/auth' });

  /**
   * GET /auth/login — Initiate OIDC login flow
   *
   * Generates PKCE challenge, stores code_verifier in session,
   * then redirects the browser to Porta's authorization endpoint.
   */
  router.get('/login', async (ctx) => {
    const { authUrl, codeVerifier, state } = await buildAuthUrl(oidcConfig, config);

    // Store PKCE verifier and state in session (temporary, used by callback)
    ctx.session!.codeVerifier = codeVerifier;
    ctx.session!.authState = state;

    logger.debug('Initiating OIDC login flow');
    ctx.redirect(authUrl);
  });

  /**
   * GET /auth/callback — Handle OIDC authorization callback
   *
   * Exchanges the authorization code for tokens, extracts user info
   * from the ID token, and creates the server-side session.
   */
  router.get('/callback', async (ctx) => {
    const codeVerifier = ctx.session?.codeVerifier as string | undefined;
    const expectedState = ctx.session?.authState as string | undefined;

    if (!codeVerifier || !expectedState) {
      logger.warn('Auth callback without PKCE verifier or state in session');
      ctx.redirect('/auth/login');
      return;
    }

    try {
      // Exchange authorization code for tokens.
      // IMPORTANT: Use the public URL (e.g. localhost:4002) to construct the callback URL,
      // not ctx.request.href (which is the BFF's internal URL, e.g. localhost:4003).
      // In dev, Vite proxies /auth/* to the BFF with changeOrigin: true, so
      // ctx.request.href would have the BFF's port, causing a redirect_uri mismatch
      // with the value Porta stored during the authorization request.
      const callbackUrl = new URL(ctx.request.url, config.publicUrl);
      const tokens = await exchangeCode(oidcConfig, config, callbackUrl, codeVerifier, expectedState);

      // Extract user claims from ID token (TokenEndpointResponseHelpers.claims())
      const claims = tokens.claims();
      if (!claims) {
        throw new Error('No claims in ID token');
      }

      const sub = (claims.sub as string) || '';
      const email = (claims.email as string) || '';
      const name = (claims.name as string) || email;
      const roles = (claims.roles as string[]) || [];
      const orgId = (claims.org_id as string) || '';

      if (!sub) {
        throw new Error('No subject claim in ID token');
      }

      // Build session data — tokens stored server-side only, never exposed to browser
      const sessionData: SessionData = {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        tokenExpiry: Date.now() + (tokens.expires_in || 900) * 1000,
        user: {
          id: sub,
          email,
          name,
          roles,
          orgId,
        },
        loginAt: Date.now(),
        lastActivity: Date.now(),
      };

      // Clear temporary auth data, store session
      delete ctx.session!.codeVerifier;
      delete ctx.session!.authState;
      Object.assign(ctx.session!, sessionData);

      logger.info({ userId: sessionData.user.id }, 'User authenticated successfully');
      ctx.redirect('/');
    } catch (err) {
      logger.error({ err }, 'OIDC callback failed');
      ctx.status = 401;
      ctx.body = { error: 'Authentication failed' };
    }
  });

  /**
   * POST /auth/logout — End the admin session
   *
   * Destroys the server-side session and redirects to Porta's
   * end-session endpoint (which handles OIDC logout).
   */
  router.post('/logout', async (ctx) => {
    const userId = (ctx.session as unknown as SessionData)?.user?.id;
    logger.info({ userId }, 'User logging out');

    // Build end-session URL (if Porta supports it)
    const postLogoutRedirect = config.publicUrl;
    let redirectUrl = postLogoutRedirect;

    if (oidcConfig.endSessionEndpoint) {
      const endSessionUrl = new URL(oidcConfig.endSessionEndpoint);
      endSessionUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
      redirectUrl = endSessionUrl.toString();
    }

    // Destroy the session
    ctx.session = null;

    ctx.redirect(redirectUrl);
  });

  /**
   * GET /auth/me — Return current session info
   *
   * Returns the authenticated user's info and environment metadata.
   * Includes the CSRF token so the SPA can use it for state-changing requests.
   * Tokens are NEVER included in the response.
   */
  router.get('/me', async (ctx) => {
    const sess = ctx.session as unknown as SessionData | undefined;
    const isAuthenticated = !!(sess?.user && sess?.accessToken);

    const response: SessionInfo & { csrfToken?: string } = {
      authenticated: isAuthenticated,
      user: isAuthenticated
        ? {
            id: sess!.user.id,
            email: sess!.user.email,
            name: sess!.user.name,
            roles: sess!.user.roles,
            orgId: sess!.user.orgId,
          }
        : null,
      environment: {
        environment: config.nodeEnv,
        version: process.env.npm_package_version || 'unknown',
      },
      csrfToken: getCsrfToken(ctx.session as Record<string, unknown> | undefined),
    };

    ctx.body = response;
  });

  return router;
}
