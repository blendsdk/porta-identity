/**
 * Debug Routes (dev-only)
 *
 * Exposes the BFF's login-method state for the dashboard panel and for
 * `scripts/playground-bff-smoke.sh`. Unlike the session-aware dashboard,
 * these endpoints return JSON so they can be probed without a browser.
 *
 * Endpoints:
 *   GET /debug/login-methods — returns the active profile and all profiles
 *   GET /debug/health        — lightweight readiness signal (profile-aware)
 *
 * The routes are mounted unconditionally because the entire BFF playground
 * is a local development tool. They MUST NOT be ported to a production
 * service without adding authentication.
 */

import type Router from '@koa/router';
import type { BffConfig, LoginMethodClientConfig } from '../config.js';
import { getActiveLoginMethodProfile } from '../config.js';

/**
 * Register the debug routes on the given router.
 *
 * @param router - Koa router instance
 * @param config - Loaded BFF configuration
 */
export function createDebugRoutes(router: Router, config: BffConfig): void {

  /**
   * GET /debug/login-methods
   *
   * Returns the full login-method profile catalog plus the currently active
   * profile (selected via `BFF_CLIENT_PROFILE`). The response is consumed by
   * the dashboard panel and by `playground-bff-smoke.sh` to verify that the
   * profile override took effect.
   */
  router.get('/debug/login-methods', (ctx) => {
    const active = getActiveLoginMethodProfile();
    const profiles = config.loginMethodClients ?? {};

    ctx.type = 'application/json';
    ctx.body = {
      active: active
        ? {
            key: active.key,
            label: active.config.label,
            orgKey: active.config.orgKey,
            clientId: active.config.clientId,
            loginMethods: active.config.loginMethods,
          }
        : null,
      // Redact secrets — only expose the fields the dashboard needs. Never
      // return `clientSecret` even from a debug endpoint to avoid leaking
      // credentials into HAR files, logs, or curl output during smoke tests.
      profiles: Object.fromEntries(
        Object.entries(profiles).map(([key, value]) => [
          key,
          buildProfileView(key, value, active?.key ?? null),
        ]),
      ),
    };
  });
}

/**
 * Build the public view of a profile — excludes `clientSecret` and flags the
 * active profile. Kept separate from the route handler so it can be reused
 * by future debug endpoints.
 */
function buildProfileView(
  key: string,
  profile: LoginMethodClientConfig,
  activeKey: string | null,
): Record<string, unknown> {
  return {
    key,
    label: profile.label,
    orgKey: profile.orgKey,
    clientId: profile.clientId,
    loginMethods: profile.loginMethods,
    active: activeKey === key,
  };
}
