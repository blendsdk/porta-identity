/**
 * Token management and AuthProvider factory for the BFF server.
 *
 * Creates an `AuthProvider` compatible with `@portaidentity/sdk` transport.
 * The AuthProvider's `refreshToken()` uses `openid-client` to perform a
 * refresh_token grant and updates the session with new tokens.
 *
 * @module auth/token-manager
 */

import * as oidcClient from 'openid-client';
import type { OidcConfig } from './oidc.js';
import type { SessionData } from '../session.js';

/** AuthProvider interface matching @portaidentity/sdk's expected shape. */
export interface AuthProvider {
  /** Returns the current access token. */
  getToken: () => Promise<string>;
  /** Refreshes the access token and returns the new one. */
  refreshToken: () => Promise<string>;
}

/**
 * Create an AuthProvider for SDK transport using the session's tokens.
 *
 * The `getToken()` method returns the current access token from the session.
 * The `refreshToken()` method uses openid-client to perform a refresh_token
 * grant, updates the session data in-place, and returns the new access token.
 *
 * @param session - The current user's session data (mutated on refresh).
 * @param oidcConfig - Resolved OIDC configuration for the refresh grant.
 * @returns AuthProvider compatible with SDK transport.
 */
export function createAuthProvider(
  session: SessionData,
  oidcConfig: OidcConfig,
): AuthProvider {
  return {
    getToken: async () => session.accessToken,

    refreshToken: async (): Promise<string> => {
      // Use openid-client to perform a refresh_token grant
      const tokenSet = await oidcClient.refreshTokenGrant(
        oidcConfig.config,
        session.refreshToken,
      );

      // Update session with new tokens
      session.accessToken = tokenSet.access_token;
      if (tokenSet.refresh_token) {
        session.refreshToken = tokenSet.refresh_token;
      }
      session.tokenExpiresAt =
        Date.now() + (tokenSet.expires_in ?? 3600) * 1000;

      return session.accessToken;
    },
  };
}
