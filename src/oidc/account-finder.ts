/**
 * Account finder for node-oidc-provider.
 *
 * Maps user records from the database to OIDC account objects with a
 * claims() method. The provider calls findAccount when it needs user
 * information for ID tokens, userinfo endpoint responses, etc.
 *
 * This implementation delegates to the user service for lookup and
 * the claims builder for scope-based claims mapping. The user must
 * be active to be returned — non-active users get undefined (no account).
 */

import { findUserForOidc } from '../users/service.js';
import { buildUserClaims } from '../users/claims.js';
import { logger } from '../lib/logger.js';

/** OIDC Account object — returned by findAccount, used by the provider */
export interface OidcAccount {
  /** The subject identifier (user UUID) */
  accountId: string;
  /**
   * Return OIDC claims for the user.
   * @param use - Token type ('id_token' or 'userinfo')
   * @param scope - Granted scopes (space-separated)
   * @returns Object with OIDC Standard Claims
   */
  claims: (use: string, scope: string) => Promise<Record<string, unknown>>;
}

/**
 * Find an OIDC account by subject identifier (user ID).
 *
 * Delegates to the user service's findUserForOidc which returns
 * active users only. Returns an account object with a claims() method
 * that builds scope-filtered OIDC Standard Claims from the user profile.
 *
 * @param _ctx - Koa context with OIDC extensions (unused)
 * @param sub - The subject identifier (user UUID)
 * @returns Account object with claims() method, or undefined if not found
 */
export async function findAccount(
  _ctx: unknown,
  sub: string,
): Promise<OidcAccount | undefined> {
  try {
    const user = await findUserForOidc(sub);
    if (!user) return undefined;

    return {
      accountId: user.id,
      /**
       * Return OIDC Standard Claims for the user.
       * Claims are filtered based on the granted scopes following
       * OpenID Connect Core 1.0, §5.4.
       */
      async claims(_use: string, scope: string) {
        // Parse space-separated scope string into array
        const scopes = scope ? scope.split(' ') : [];
        return buildUserClaims(user, scopes);
      },
    };
  } catch (error) {
    logger.error({ sub, error }, 'Failed to look up OIDC account');
    return undefined;
  }
}
