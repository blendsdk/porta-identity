/**
 * Dashboard Route
 *
 * GET / — Renders the main dashboard page.
 * Shows different content based on authentication state:
 *   - Unauthenticated: Welcome card with BFF vs SPA comparison
 *   - Authenticated: Token panels, action buttons, result panels
 *
 * Decodes JWTs from the session for display (no verification).
 */

import type Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { getActiveLoginMethodProfile } from '../config.js';
import { decodeJwt } from '../helpers/jwt.js';
import { render } from '../helpers/template.js';


/**
 * Register the dashboard route.
 *
 * @param router - Koa router instance
 * @param config - BFF configuration
 */
export function createDashboardRoutes(router: Router, config: BffConfig): void {

  router.get('/', (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey as string | undefined;
    const isAuthenticated = !!tokens?.access_token;

    // Decode tokens for display
    const idToken = tokens?.id_token ? decodeJwt(tokens.id_token as string) : null;
    const accessToken = tokens?.access_token ? decodeJwt(tokens.access_token as string) : null;

    // Extract user name from ID token claims
    const userName = idToken?.payload
      ? ((idToken.payload.name as string)
        ?? `${idToken.payload.given_name ?? ''} ${idToken.payload.family_name ?? ''}`.trim())
        || (idToken.payload.email as string)
        || (idToken.payload.sub as string)
      : 'Unknown';

    // Extract RBAC and custom claims from ID token for the authorization panel
    const roles = (idToken?.payload?.roles as string[]) ?? [];
    const permissions = (idToken?.payload?.permissions as string[]) ?? [];
    const customClaims = {
      department: idToken?.payload?.department as string | undefined,
      employee_id: idToken?.payload?.employee_id as string | undefined,
      cost_center: idToken?.payload?.cost_center as string | undefined,
      job_title: idToken?.payload?.job_title as string | undefined,
    };
    const hasAuthzData = roles.length > 0 || permissions.length > 0
      || Object.values(customClaims).some(Boolean);

    // Resolve org name
    const org = orgKey ? config.organizations[orgKey] : null;
    const orgName = org?.name ?? orgKey ?? 'Unknown';

    // Refresh token preview (first 20 chars — it's opaque, not a JWT)
    const refreshTokenRaw = tokens?.refresh_token as string | undefined;
    const refreshTokenPreview = refreshTokenRaw
      ? `${refreshTokenRaw.slice(0, 20)}…`
      : null;

    // Login-method panel data — mirrors GET /debug/login-methods so users can
    // see which demo client is active in the dashboard without hitting the
    // debug endpoint. Secrets are scrubbed before rendering.
    const active = getActiveLoginMethodProfile();
    const loginMethodProfiles = Object.entries(config.loginMethodClients ?? {}).map(
      ([key, v]) => ({
        key,
        label: v.label,
        orgKey: v.orgKey,
        clientId: v.clientId,
        loginMethods: v.loginMethods,
        active: active?.key === key,
      }),
    );
    const activeLoginMethod = active
      ? {
          key: active.key,
          label: active.config.label,
          orgKey: active.config.orgKey,
          clientId: active.config.clientId,
          loginMethods: active.config.loginMethods,
        }
      : null;

    const html = render('dashboard', {
      activePage: 'dashboard',
      isAuthenticated,
      userName,
      orgName,
      expiresAt: tokens?.expires_at,
      hasIdToken: !!tokens?.id_token,
      hasAccessToken: !!tokens?.access_token,
      hasRefreshToken: !!refreshTokenRaw,
      idToken,
      accessToken,
      refreshTokenPreview,
      // Authorization panel data (RBAC + custom claims from ID token)
      roles,
      permissions,
      customClaims,
      hasAuthzData,
      // Login-method demo panel
      activeLoginMethod,
      loginMethodProfiles,
      hasLoginMethodProfiles: loginMethodProfiles.length > 0,
      // Sidebar data
      scenarios: config.scenarios,
      organizations: config.organizations,
      portaUrl: config.portaUrl,
      mailhogUrl: config.mailhogUrl,
    });


    ctx.type = 'text/html';
    ctx.body = html;
  });
}
