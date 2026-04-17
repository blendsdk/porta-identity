/**
 * M2M (Machine-to-Machine) Demo Routes
 *
 * Demonstrates the client_credentials grant — no user interaction needed.
 * The BFF server authenticates directly with Porta using its M2M client.
 *
 *   GET  /m2m             — Render M2M demo page
 *   POST /m2m/token       — Request a client_credentials token
 *   POST /m2m/introspect  — Introspect the M2M token
 *   POST /m2m/revoke      — Revoke the M2M token
 */

import type Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { clientCredentialsGrant, getM2mConfig, introspectToken, revokeToken } from '../oidc.js';
import { decodeJwt } from '../helpers/jwt.js';
import { render } from '../helpers/template.js';

/**
 * Register M2M demo routes on the router.
 *
 * @param router - Koa router instance
 * @param config - BFF configuration
 */
export function createM2mRoutes(router: Router, config: BffConfig): void {

  /** GET /m2m — Render M2M demo page */
  router.get('/m2m', (ctx) => {
    const html = render('m2m', {
      activePage: 'm2m',
      m2mClientId: config.m2m.clientId,
      m2mOrgSlug: config.m2m.orgSlug,
      // Sidebar data
      scenarios: config.scenarios,
      organizations: config.organizations,
      portaUrl: config.portaUrl,
      mailhogUrl: config.mailhogUrl,
    });
    ctx.type = 'text/html';
    ctx.body = html;
  });

  /** POST /m2m/token — Request a client_credentials token */
  router.post('/m2m/token', async (ctx) => {
    try {
      const response = await clientCredentialsGrant(config.portaUrl, config.m2m);
      const decoded = response.access_token ? decodeJwt(response.access_token) : null;

      // Store in session for introspect/revoke
      ctx.session!.m2mToken = response.access_token;

      ctx.body = {
        success: true,
        data: {
          access_token: response.access_token,
          token_type: response.token_type,
          expires_in: response.expires_in,
          decoded,
        },
      };
    } catch (err) {
      ctx.status = 502;
      ctx.body = { error: `Client credentials grant failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  });

  /** POST /m2m/introspect — Introspect the M2M token */
  router.post('/m2m/introspect', async (ctx) => {
    const token = ctx.session?.m2mToken as string | undefined;
    if (!token) {
      ctx.status = 400;
      ctx.body = { error: 'No M2M token. Request one first.' };
      return;
    }

    try {
      const m2mConfig = getM2mConfig(config.portaUrl, config.m2m);
      if (!m2mConfig) {
        ctx.status = 500;
        ctx.body = { error: 'M2M config not discovered yet' };
        return;
      }
      const introspection = await introspectToken(m2mConfig, token);
      ctx.body = { success: true, data: introspection };
    } catch (err) {
      ctx.status = 502;
      ctx.body = { error: `Introspection failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  });

  /** POST /m2m/revoke — Revoke the M2M token */
  router.post('/m2m/revoke', async (ctx) => {
    const token = ctx.session?.m2mToken as string | undefined;
    if (!token) {
      ctx.status = 400;
      ctx.body = { error: 'No M2M token to revoke.' };
      return;
    }

    try {
      const m2mConfig = getM2mConfig(config.portaUrl, config.m2m);
      if (!m2mConfig) {
        ctx.status = 500;
        ctx.body = { error: 'M2M config not discovered yet' };
        return;
      }
      await revokeToken(m2mConfig, token);
      delete ctx.session!.m2mToken;
      ctx.body = { success: true, message: 'Token revoked' };
    } catch (err) {
      ctx.status = 502;
      ctx.body = { error: `Revocation failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  });
}
