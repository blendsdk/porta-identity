/**
 * Account finder for node-oidc-provider.
 *
 * Maps user records from the database to OIDC account objects with a
 * claims() method. The provider calls findAccount when it needs user
 * information for ID tokens, userinfo endpoint responses, etc.
 *
 * In RD-03 this is a minimal stub with basic OIDC Standard Claims.
 * Full claims mapping with custom claims and RBAC is implemented in RD-06/RD-08.
 */

import { getPool } from '../lib/database.js';
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
 * Queries the users table for an active user matching the given sub.
 * Returns an account object with a claims() method that provides
 * OIDC Standard Claims based on the user's profile data.
 *
 * @param _ctx - Koa context with OIDC extensions (unused in stub)
 * @param sub - The subject identifier (user UUID)
 * @returns Account object with claims() method, or undefined if not found
 */
export async function findAccount(
  _ctx: unknown,
  sub: string,
): Promise<OidcAccount | undefined> {
  const pool = getPool();

  try {
    const result = await pool.query<{
      id: string;
      email: string;
      email_verified: boolean;
      given_name: string | null;
      family_name: string | null;
      phone_number: string | null;
      phone_number_verified: boolean;
    }>(
      `SELECT id, email, email_verified, given_name, family_name,
              phone_number, phone_number_verified
       FROM users
       WHERE id = $1 AND status = 'active'`,
      [sub],
    );

    if (result.rows.length === 0) return undefined;

    const user = result.rows[0];

    return {
      accountId: user.id,
      /**
       * Return OIDC Standard Claims for the user.
       * The claims returned depend on the granted scopes.
       * Full scope-based filtering is implemented in RD-06.
       */
      async claims(_use: string, _scope: string) {
        return {
          sub: user.id,
          email: user.email,
          email_verified: user.email_verified,
          // Build full name from parts — undefined if both parts are null
          name: [user.given_name, user.family_name].filter(Boolean).join(' ') || undefined,
          given_name: user.given_name ?? undefined,
          family_name: user.family_name ?? undefined,
          phone_number: user.phone_number ?? undefined,
          phone_number_verified: user.phone_number_verified,
        };
      },
    };
  } catch (error) {
    logger.error({ sub, error }, 'Failed to look up OIDC account');
    return undefined;
  }
}
