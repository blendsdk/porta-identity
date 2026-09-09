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
 *
 * Claims flow:
 * 1. buildUserClaims(user, scopes) → standard OIDC claims (sub, name, email...)
 * 2. buildRoleClaims(userId, appId) → application-owned role slugs
 * 3. buildPermissionClaims(userId, appId) → application-owned permission slugs
 * 4. buildCustomClaims(userId, appId, tokenType) → custom per-app claims
 *
 * The applicationId for custom claims is resolved from the OIDC client
 * context. If unavailable (e.g., no client context), custom claims are
 * skipped gracefully.
 *
 * @see users/service.ts — User lookup for OIDC
 * @see users/claims.ts — Standard OIDC claims builder
 * @see rbac/user-role-service.ts — RBAC claims builders
 * @see custom-claims/service.ts — Custom claims builder
 */

import { z } from 'zod';
import { findUserForOidc } from '../users/service.js';
import { buildUserClaims } from '../users/claims.js';
import { buildRoleClaims, buildPermissionClaims } from '../rbac/user-role-service.js';
import { buildCustomClaims } from '../custom-claims/service.js';
import { logger } from '../lib/logger.js';
import type { TokenType } from '../custom-claims/types.js';
/** Accepts only database-style UUIDs at the provider metadata trust boundary. */
const applicationIdSchema = z.string().uuid();

/** Private provider metadata key carrying the client application's database identity. */
const INTERNAL_APPLICATION_ID = 'urn:porta:internal_application_id';

/** OIDC Account object — returned by findAccount, used by the provider */
export interface OidcAccount {
  /** The subject identifier (user UUID) */
  accountId: string;
  /**
   * Return OIDC claims for the user.
   * @param use - Token type ('id_token' or 'userinfo')
   * @param scope - Granted scopes (space-separated)
   * @returns Object with OIDC Standard Claims + RBAC + custom claims
   */
  claims: (use: string, scope: string) => Promise<Record<string, unknown>>;
}

/**
 * Find an OIDC account by subject identifier (user ID).
 *
 * Delegates to the user service's findUserForOidc which returns
 * active users only. Returns an account object with a claims() method
 * that builds scope-filtered OIDC Standard Claims merged with RBAC
 * role/permission claims and per-application custom claims.
 *
 * @param ctx - Koa context with OIDC extensions (used to resolve client/app context)
 * @param sub - The subject identifier (user UUID)
 * @returns Account object with claims() method, or undefined if not found
 */
export async function findAccount(ctx: unknown, sub: string): Promise<OidcAccount | undefined> {
  try {
    const user = await findUserForOidc(sub);
    if (!user) return undefined;

    return {
      accountId: user.id,
      /**
       * Return claims for the user including standard OIDC claims,
       * RBAC roles/permissions, and per-application custom claims.
       *
       * Standard claims are filtered by scopes (OpenID Connect Core §5.4).
       * RBAC claims (roles, permissions) are always included as arrays.
       * Custom claims are filtered by token type inclusion flags.
       */
      async claims(use: string, scope: string) {
        // Parse space-separated scope string into array
        const scopes = scope ? scope.split(' ') : [];

        // 1. Standard OIDC claims (scope-filtered)
        const standardClaims = buildUserClaims(user, scopes);

        // Resolve the application once so every application-owned claim uses the same boundary.
        const applicationId = resolveApplicationId(ctx);

        // Missing client context must not fall back to a union of authority from every application.
        const [roles, permissions] = applicationId
          ? await Promise.all([
              buildRoleClaims(user.id, applicationId),
              buildPermissionClaims(user.id, applicationId),
            ])
          : [[], []];

        // 3. Custom claims (per-application, filtered by token type)
        let customClaims: Record<string, unknown> = {};
        if (applicationId) {
          // Map OIDC 'use' parameter to our TokenType
          const tokenType = mapUseToTokenType(use);
          customClaims = await buildCustomClaims(user.id, applicationId, tokenType);
        }

        // Merge all claims — standard first, then RBAC arrays, then custom
        return {
          ...standardClaims,
          roles,
          permissions,
          ...customClaims,
        };
      },
    };
  } catch (error) {
    logger.error({ sub, error }, 'Failed to look up OIDC account');
    return undefined;
  }
}

/**
 * Resolve the applicationId from the OIDC context.
 *
 * The OIDC provider passes the Koa context which includes the client object at
 * `ctx.oidc.client`. Only a valid UUID from Porta's internal metadata is accepted.
 * Missing or malformed metadata returns null so authority fails closed.
 *
 * @param ctx - Koa context with OIDC extensions
 * @returns Application UUID or null if not resolvable
 */
function resolveApplicationId(ctx: unknown): string | null {
  if (typeof ctx !== 'object' || ctx === null) return null;
  const oidc = Reflect.get(ctx, 'oidc');
  if (typeof oidc !== 'object' || oidc === null) return null;
  const client = Reflect.get(oidc, 'client');
  if (typeof client !== 'object' || client === null) return null;

  const parsed = applicationIdSchema.safeParse(Reflect.get(client, INTERNAL_APPLICATION_ID));
  return parsed.success ? parsed.data : null;
}

/**
 * Map the OIDC 'use' parameter to our TokenType enum.
 *
 * The OIDC provider passes 'id_token', 'userinfo', or occasionally
 * other values. We map them to our TokenType for custom claims filtering.
 *
 * @param use - Token type from OIDC provider
 * @returns Mapped TokenType
 */
function mapUseToTokenType(use: string): TokenType {
  switch (use) {
    case 'id_token':
      return 'id_token';
    case 'userinfo':
      return 'userinfo';
    default:
      // Default to access_token for introspection and other uses
      return 'access_token';
  }
}
