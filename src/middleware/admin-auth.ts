/**
 * Admin API authentication and authorization middleware.
 *
 * Validates Bearer access tokens against Porta's own OIDC provider
 * using opaque token lookup (provider.AccessToken.find()). Verifies
 * the user belongs to the super-admin organization and has the
 * porta-admin role. Sets ctx.state.adminUser for downstream handlers
 * and audit logging.
 *
 * This middleware replaces the old requireSuperAdmin() that checked
 * ctx.state.organization.isSuperAdmin (which required tenant-resolver
 * context and was always undefined for /api/admin/* routes).
 *
 * Authentication flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Validate opaque access token via OIDC provider lookup
 *   3. Resolve super-admin organization
 *   4. Look up user — must be active
 *   5. Verify user belongs to the super-admin organization
 *   6. Verify user has the porta-admin role
 *   7. Set ctx.state.adminUser and proceed
 *
 * Response codes:
 *   401 — Missing/invalid Bearer token, expired, revoked, unknown user
 *   403 — Valid token but user not in admin org or lacks admin role
 *   500 — System not initialized (provider not set, no super-admin org)
 */

import type { Middleware } from 'koa';
import type Provider from 'oidc-provider';
import type { Organization } from '../organizations/types.js';
import { findUserForOidc } from '../users/service.js';
import { findSuperAdminOrganization } from '../organizations/repository.js';
import { getUserRoles } from '../rbac/user-role-service.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// OIDC provider reference — set at startup via setAdminAuthProvider()
// ---------------------------------------------------------------------------

let _provider: Provider | null = null;

/**
 * Set the OIDC provider instance used for opaque access token validation.
 * Must be called once at startup before any admin API requests are handled.
 *
 * The provider's AccessToken.find() method is used to look up opaque tokens
 * from the token store (Redis for short-lived tokens).
 */
export function setAdminAuthProvider(provider: Provider): void {
  _provider = provider;
}

// ---------------------------------------------------------------------------
// Admin user identity — set on ctx.state.adminUser after authentication
// ---------------------------------------------------------------------------

/**
 * Authenticated admin user identity.
 *
 * Populated by requireAdminAuth() middleware and available to all
 * downstream route handlers via ctx.state.adminUser. Contains the
 * user's ID, email, organization, and assigned role slugs.
 */
export interface AdminUser {
  /** User UUID from access token accountId */
  id: string;
  /** User email address */
  email: string;
  /** Super-admin organization UUID */
  organizationId: string;
  /** Assigned role slugs (e.g., ['porta-admin']) */
  roles: string[];
}

// ---------------------------------------------------------------------------
// Koa state type augmentation
// ---------------------------------------------------------------------------

/**
 * Extend Koa's default state to include the adminUser property.
 * This provides type safety for route handlers accessing ctx.state.adminUser.
 */
declare module 'koa' {
  interface DefaultState {
    /** Tenant organization — set by tenant-resolver middleware on /:orgSlug/* routes */
    organization?: Organization;
    /** Authenticated admin identity — set by requireAdminAuth middleware on /api/admin/* routes */
    adminUser?: AdminUser;
  }
}

// ---------------------------------------------------------------------------
// Admin auth middleware factory
// ---------------------------------------------------------------------------

/** The slug of the admin role created by `porta init` */
const ADMIN_ROLE_SLUG = 'porta-admin';

/**
 * Create middleware that requires admin authentication and authorization.
 *
 * Validates the Bearer access token in the Authorization header by looking
 * it up via the OIDC provider's opaque token store, then verifies the user
 * is an active member of the super-admin organization with the porta-admin role.
 *
 * On success, sets ctx.state.adminUser with the authenticated identity.
 * On failure, responds with 401 (unauthenticated) or 403 (unauthorized).
 *
 * @returns Koa middleware
 */
export function requireAdminAuth(): Middleware {
  return async (ctx, next) => {
    // -----------------------------------------------------------------
    // Step 1: Extract Bearer token from Authorization header
    // -----------------------------------------------------------------
    const authHeader = ctx.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = {
        error: 'Authentication required',
        message: 'Missing or invalid Authorization header',
      };
      return;
    }
    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // -----------------------------------------------------------------
    // Step 2: Validate opaque access token via OIDC provider
    // -----------------------------------------------------------------
    // Timing analysis (Phase K audit):
    // Token validation uses DB/Redis lookups via provider.AccessToken.find(),
    // which have inherent timing variability from network I/O. All auth
    // failure paths return the same 401 status and generic error message
    // ("Token validation failed"), preventing error-message enumeration.
    // Constant-time string comparison is not needed here because we never
    // compare secret material directly — the opaque token is used as a
    // lookup key, not compared against a stored value.
    // -----------------------------------------------------------------
    // The OIDC provider issues opaque access tokens (not JWTs). We look
    // them up directly in the token store using provider.AccessToken.find().
    // This handles expiry (Redis TTL), revocation, and format validation
    // in a single call — no need for JWT signature verification or issuer
    // checks since the provider is the authoritative token store.
    if (!_provider) {
      logger.error('Admin auth: OIDC provider not initialized');
      ctx.status = 500;
      ctx.body = { error: 'Server configuration error' };
      return;
    }

    let userId: string;
    try {
      const accessToken = await _provider.AccessToken.find(token);
      if (!accessToken || !accessToken.accountId) {
        logger.debug('Admin auth: access token not found or missing accountId');
        ctx.status = 401;
        ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
        return;
      }
      userId = accessToken.accountId;
    } catch (err) {
      // Intentionally vague error message — don't reveal internal details.
      // Log the real error server-side for debugging.
      logger.debug({ err }, 'Admin auth: access token lookup failed');
      ctx.status = 401;
      ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
      return;
    }

    // -----------------------------------------------------------------
    // Step 3: Resolve super-admin organization
    // -----------------------------------------------------------------
    // Cached in-memory (60s TTL) so this is fast after first call.
    const superAdminOrg = await findSuperAdminOrganization();
    if (!superAdminOrg) {
      // System not initialized — porta init has not been run
      logger.error('Admin auth: super-admin organization not found — run porta init');
      ctx.status = 500;
      ctx.body = { error: 'Server configuration error' };
      return;
    }

    // -----------------------------------------------------------------
    // Step 4: Look up user — must be active
    // -----------------------------------------------------------------
    // findUserForOidc returns null for non-existent or non-active users
    const user = await findUserForOidc(userId);
    if (!user) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid token', message: 'User not found or not active' };
      return;
    }

    // -----------------------------------------------------------------
    // Step 5: Verify user belongs to the super-admin organization
    // -----------------------------------------------------------------
    if (user.organizationId !== superAdminOrg.id) {
      ctx.status = 403;
      ctx.body = {
        error: 'Forbidden',
        message: 'Admin access requires membership in the admin organization',
      };
      return;
    }

    // -----------------------------------------------------------------
    // Step 6: Verify user has the porta-admin role
    // -----------------------------------------------------------------
    const userRoles = await getUserRoles(userId);
    const hasAdminRole = userRoles.some((role) => role.slug === ADMIN_ROLE_SLUG);

    if (!hasAdminRole) {
      ctx.status = 403;
      ctx.body = { error: 'Forbidden', message: 'Admin role required' };
      return;
    }

    // -----------------------------------------------------------------
    // Step 7: Set admin user context and proceed to route handler
    // -----------------------------------------------------------------
    ctx.state.adminUser = {
      id: userId,
      email: user.email,
      organizationId: user.organizationId,
      roles: userRoles.map((r) => r.slug),
    } satisfies AdminUser;

    await next();
  };
}
