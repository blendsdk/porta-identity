/**
 * Admin API authentication and authorization middleware.
 *
 * Validates Bearer JWT tokens against Porta's own ES256 signing keys,
 * verifies the user belongs to the super-admin organization and has
 * the porta-admin role. Sets ctx.state.adminUser for downstream
 * handlers and audit logging.
 *
 * This middleware replaces the old requireSuperAdmin() that checked
 * ctx.state.organization.isSuperAdmin (which required tenant-resolver
 * context and was always undefined for /api/admin/* routes).
 *
 * Authentication flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Validate JWT signature + expiry using Porta's own signing keys
 *   3. Verify issuer matches the super-admin organization
 *   4. Look up user — must be active
 *   5. Verify user belongs to the super-admin organization
 *   6. Verify user has the porta-admin role
 *   7. Set ctx.state.adminUser and proceed
 *
 * Response codes:
 *   401 — Missing or invalid Bearer token, expired, bad signature, unknown user
 *   403 — Valid token but user not in admin org or lacks admin role
 *   500 — System not initialized (no super-admin org or no signing keys)
 */

import type { Middleware } from 'koa';
import type { Organization } from '../organizations/types.js';
import * as jose from 'jose';
import { config } from '../config/index.js';
import { getActiveJwks } from '../lib/signing-keys.js';
import { findUserForOidc } from '../users/service.js';
import { findSuperAdminOrganization } from '../organizations/repository.js';
import { getUserRoles } from '../rbac/user-role-service.js';
import { logger } from '../lib/logger.js';

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
  /** User UUID from JWT sub claim */
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
 * Validates the Bearer JWT token in the Authorization header against
 * Porta's own ES256 signing keys, then verifies the user is an active
 * member of the super-admin organization with the porta-admin role.
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
    // Step 2: Load signing keys and resolve super-admin org for issuer
    // -----------------------------------------------------------------
    // Both are cached in-memory (60s TTL) so this is fast after first call.
    const [jwks, superAdminOrg] = await Promise.all([
      getActiveJwks(),
      findSuperAdminOrganization(),
    ]);

    if (!superAdminOrg) {
      // System not initialized — porta init has not been run
      logger.error('Admin auth: super-admin organization not found — run porta init');
      ctx.status = 500;
      ctx.body = { error: 'Server configuration error' };
      return;
    }

    if (!jwks.keys.length) {
      // No signing keys available — should not happen after startup
      logger.error('Admin auth: no signing keys available');
      ctx.status = 500;
      ctx.body = { error: 'Server configuration error' };
      return;
    }

    // -----------------------------------------------------------------
    // Step 3: Validate JWT signature, expiry, and issuer
    // -----------------------------------------------------------------
    // Use jose.createLocalJWKSet for in-process verification — no HTTP
    // call to a JWKS endpoint, guaranteed in sync with Porta's own keys.
    const keySet = jose.createLocalJWKSet(jwks as jose.JSONWebKeySet);
    const expectedIssuer = `${config.issuerBaseUrl}/${superAdminOrg.slug}`;

    let payload: jose.JWTPayload;
    try {
      const result = await jose.jwtVerify(token, keySet, {
        issuer: expectedIssuer,
        clockTolerance: 30, // 30 seconds tolerance for clock drift
      });
      payload = result.payload;
    } catch (err) {
      // Intentionally vague error message — don't reveal whether the token
      // was expired, had a bad signature, or wrong issuer. Log details
      // server-side for debugging.
      logger.debug({ err }, 'Admin auth: JWT verification failed');
      ctx.status = 401;
      ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
      return;
    }

    // -----------------------------------------------------------------
    // Step 4: Extract subject claim and look up user
    // -----------------------------------------------------------------
    const userId = payload.sub;
    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid token', message: 'Token missing subject claim' };
      return;
    }

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
