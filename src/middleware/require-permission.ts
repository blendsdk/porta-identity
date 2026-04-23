/**
 * Permission-based authorization middleware for admin API routes.
 *
 * Works downstream of requireAdminAuth() — checks that ctx.state.adminUser
 * has the required permission(s) before allowing the request to proceed.
 *
 * Usage:
 * ```typescript
 * import { requirePermission } from '../middleware/require-permission.js';
 *
 * router.post('/organizations', requirePermission('org:create'), createOrgHandler);
 * router.get('/organizations', requirePermission('org:read'), listOrgsHandler);
 * ```
 *
 * @module middleware/require-permission
 */

import type { Middleware } from 'koa';
import { hasPermissions } from '../lib/admin-permissions.js';

/**
 * Create middleware that requires specific admin permission(s).
 *
 * Must be used after requireAdminAuth() in the middleware chain.
 * Checks ctx.state.adminUser.permissions for the required permission(s).
 *
 * @param requiredPermissions - One or more permission slugs (e.g., 'org:create')
 * @returns Koa middleware that checks for the required permission(s)
 */
export function requirePermission(...requiredPermissions: string[]): Middleware {
  return async (ctx, next) => {
    const adminUser = ctx.state.adminUser;

    // Safety check: requireAdminAuth() must have run first
    if (!adminUser) {
      ctx.status = 401;
      ctx.body = {
        error: 'Authentication required',
        message: 'Admin authentication middleware must be applied first',
      };
      return;
    }

    // Check if the user has all required permissions
    if (!hasPermissions([...adminUser.permissions], requiredPermissions)) {
      ctx.status = 403;
      ctx.body = {
        error: 'Forbidden',
        message: `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      };
      return;
    }

    await next();
  };
}
