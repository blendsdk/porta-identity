/**
 * API Routes
 *
 * Server-side AJAX endpoints called by the dashboard's client-side JS.
 * All operations happen server-side — the browser never sees tokens.
 *
 *   POST /api/me         — Fetch UserInfo from Porta
 *   POST /api/refresh     — Refresh tokens using refresh_token grant
 *   POST /api/introspect  — Introspect the access token at Porta
 *   POST /api/tokens      — Return decoded tokens from session (for display)
 */

import type Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { getOidcConfig, fetchUserInfo, refreshTokens, introspectToken } from '../oidc.js';
import { decodeJwt } from '../helpers/jwt.js';

/**
 * Register API routes on the router.
 *
 * @param router - Koa router instance
 * @param config - BFF configuration
 */
export function createApiRoutes(router: Router, config: BffConfig): void {

  /** POST /api/me — Fetch UserInfo claims from Porta */
  router.post('/api/me', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey as string | undefined;

    if (!tokens?.access_token || !orgKey) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }

    try {
      const org = config.organizations[orgKey];
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const userInfo = await fetchUserInfo(oidcConfig, tokens.access_token as string);
      ctx.body = { success: true, data: userInfo };
    } catch (err) {
      ctx.status = 502;
      ctx.body = { error: `UserInfo request failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  });

  /** POST /api/refresh — Refresh tokens using refresh_token grant */
  router.post('/api/refresh', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey as string | undefined;

    if (!tokens?.refresh_token || !orgKey) {
      ctx.status = 401;
      ctx.body = { error: 'No refresh token available' };
      return;
    }

    try {
      const org = config.organizations[orgKey];
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const response = await refreshTokens(oidcConfig, tokens.refresh_token as string);

      // Update session with new tokens
      ctx.session!.tokens = {
        access_token: response.access_token,
        id_token: response.id_token ?? tokens.id_token,
        refresh_token: response.refresh_token ?? tokens.refresh_token,
        token_type: response.token_type,
        expires_at: response.expires_in
          ? Date.now() + response.expires_in * 1000
          : undefined,
      };

      // Decode new tokens for the response
      const idToken = response.id_token ? decodeJwt(response.id_token) : null;
      const accessToken = response.access_token ? decodeJwt(response.access_token) : null;

      ctx.body = {
        success: true,
        data: {
          idToken,
          accessToken,
          expiresAt: ctx.session!.tokens.expires_at,
        },
      };
    } catch (err) {
      ctx.status = 502;
      ctx.body = { error: `Token refresh failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  });

  /** POST /api/introspect — Introspect the access token */
  router.post('/api/introspect', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey as string | undefined;

    if (!tokens?.access_token || !orgKey) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }

    try {
      const org = config.organizations[orgKey];
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const introspection = await introspectToken(oidcConfig, tokens.access_token as string);
      ctx.body = { success: true, data: introspection };
    } catch (err) {
      ctx.status = 502;
      ctx.body = { error: `Introspection failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  });

  /** POST /api/tokens — Return decoded tokens from session */
  router.post('/api/tokens', (ctx) => {
    const tokens = ctx.session?.tokens;

    if (!tokens?.access_token) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }

    ctx.body = {
      success: true,
      data: {
        idToken: tokens.id_token ? decodeJwt(tokens.id_token as string) : null,
        accessToken: tokens.access_token ? decodeJwt(tokens.access_token as string) : null,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expires_at,
      },
    };
  });
}
