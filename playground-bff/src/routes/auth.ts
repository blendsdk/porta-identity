/**
 * Auth Routes
 *
 * Handles the OIDC Authorization Code + PKCE flow server-side:
 *   - GET  /auth/login    — Start auth flow (redirect to Porta)
 *   - GET  /auth/callback — Exchange code for tokens (store in session)
 *   - POST /auth/logout   — Destroy session, redirect to Porta end_session
 *
 * The BFF pattern keeps all tokens server-side in Redis sessions.
 * The browser only receives an HttpOnly session cookie.
 */

import type Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { getOidcConfig, buildAuthUrl, exchangeCode, buildEndSessionUrl } from '../oidc.js';

/**
 * Register authentication routes on the router.
 *
 * @param router - Koa router instance
 * @param config - BFF configuration with org/client details
 */
export function createAuthRoutes(router: Router, config: BffConfig): void {

  /**
   * GET /auth/login
   *
   * Start the OIDC Authorization Code + PKCE flow.
   * Accepts either ?scenario=normalLogin or ?org=no2fa to select
   * which organization (and thus which client) to authenticate against.
   *
   * Stores PKCE code_verifier, state, and nonce in the session
   * so they can be verified in the callback.
   */
  router.get('/auth/login', async (ctx) => {
    const scenarioKey = ctx.query.scenario as string | undefined;
    const orgKey = (ctx.query.org as string | undefined) ?? 'no2fa';

    // Resolve org from scenario or direct org param
    const scenario = scenarioKey ? config.scenarios[scenarioKey] : null;
    const resolvedOrgKey = scenario?.orgKey ?? orgKey;
    const org = config.organizations[resolvedOrgKey];

    if (!org) {
      ctx.status = 400;
      ctx.body = `Unknown organization: ${resolvedOrgKey}`;
      return;
    }

    try {
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const { url, codeVerifier, state, nonce } = await buildAuthUrl(
        oidcConfig,
        `${config.bffUrl}/auth/callback`,
        'openid profile email offline_access',
      );

      // Store PKCE + state in session for callback verification
      ctx.session!.oidc = {
        codeVerifier,
        state,
        nonce,
        orgKey: resolvedOrgKey,
        scenarioKey: scenarioKey ?? null,
      };

      ctx.redirect(url.toString());
    } catch (err) {
      console.error('Login redirect failed:', err);
      ctx.status = 502;
      ctx.body = 'Failed to connect to Porta. Is it running?';
    }
  });

  /**
   * GET /auth/callback
   *
   * Receives the authorization code from Porta after the user authenticates.
   * Exchanges the code for tokens using the PKCE verifier from the session.
   * Stores tokens server-side in the session and redirects to the dashboard.
   */
  router.get('/auth/callback', async (ctx) => {
    const oidcSession = ctx.session?.oidc;

    if (!oidcSession?.codeVerifier || !oidcSession?.state || !oidcSession?.orgKey) {
      ctx.status = 400;
      ctx.body = 'No pending authentication flow. Start from /auth/login.';
      return;
    }

    const { codeVerifier, state, nonce, orgKey } = oidcSession;
    const org = config.organizations[orgKey];

    if (!org) {
      ctx.status = 400;
      ctx.body = `Unknown organization: ${orgKey}`;
      return;
    }

    try {
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const currentUrl = new URL(ctx.href);
      const tokenResponse = await exchangeCode(oidcConfig, currentUrl, {
        codeVerifier,
        state,
        nonce,
      });

      // Store tokens in session — these never leave the server
      ctx.session!.tokens = {
        access_token: tokenResponse.access_token,
        id_token: tokenResponse.id_token,
        refresh_token: tokenResponse.refresh_token,
        token_type: tokenResponse.token_type,
        expires_at: tokenResponse.expires_in
          ? Date.now() + tokenResponse.expires_in * 1000
          : undefined,
      };
      ctx.session!.orgKey = orgKey;

      // Clean up PKCE state — no longer needed after successful exchange
      delete ctx.session!.oidc;

      ctx.redirect('/');
    } catch (err) {
      console.error('Token exchange failed:', err);
      // Clean up failed auth state
      delete ctx.session!.oidc;
      ctx.status = 400;
      ctx.body = `Token exchange failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  });

  /**
   * POST /auth/logout
   *
   * Destroys the session (removes tokens from Redis) and redirects
   * to Porta's end_session endpoint for RP-Initiated Logout.
   * If no id_token is available, just redirects to the dashboard.
   */
  router.post('/auth/logout', async (ctx) => {
    const orgKey = ctx.session?.orgKey ?? 'no2fa';
    const idToken = ctx.session?.tokens?.id_token as string | undefined;
    const org = config.organizations[orgKey];

    // Destroy session first — tokens are gone from Redis
    ctx.session = null;

    if (idToken && org) {
      try {
        const oidcConfig = await getOidcConfig(config.portaUrl, org);
        const endSessionUrl = buildEndSessionUrl(oidcConfig, idToken, config.bffUrl);
        ctx.redirect(endSessionUrl.toString());
        return;
      } catch (err) {
        console.error('End session URL build failed:', err);
        // Fall through to simple redirect
      }
    }

    ctx.redirect('/');
  });
}
