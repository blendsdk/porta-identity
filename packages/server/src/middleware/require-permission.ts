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

import type { Context, Middleware } from 'koa';
import { hasPermissions } from '../lib/admin-permissions.js';
import { recordSecurityDecision, recordSecurityReference } from '../security/decision-context.js';

/**
 * Route parameter names, in priority order, that identify the target of an
 * administrative action. The most specific identifier wins so the recorded
 * digest names the acted-on resource rather than a generic container.
 */
const TARGET_PARAMETER_KEYS = ['userId', 'id', 'key', 'type', 'organizationId'] as const;

/**
 * Resolve the target identifier for a denied administrative action.
 *
 * Entity routes expose the acted-on resource id in a route parameter. List and
 * collection routes have none, so the actor's organization is the acted-on
 * scope. The value is always protected before it reaches any event.
 *
 * @param ctx - Request context carrying the matched route parameters.
 * @returns A raw identifier for privacy-preserving protection, or `undefined`.
 */
function denialTargetIdentifier(ctx: Context): string | undefined {
  const params = Reflect.get(ctx, 'params') as Record<string, unknown> | undefined;
  if (params !== undefined) {
    for (const key of TARGET_PARAMETER_KEYS) {
      const value = params[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  const organizationId = ctx.state.adminUser?.organizationId;
  return typeof organizationId === 'string' && organizationId.length > 0
    ? organizationId
    : undefined;
}

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
      recordSecurityDecision(ctx, {
        decisionPoint: 'authentication',
        reasonCode: 'authentication-required',
        outcome: 'deny',
      });
      ctx.status = 401;
      ctx.body = {
        error: 'Authentication required',
        message: 'Admin authentication middleware must be applied first',
      };
      return;
    }

    // Check if the user has all required permissions
    if (!hasPermissions([...adminUser.permissions], requiredPermissions)) {
      recordSecurityDecision(ctx, {
        decisionPoint: 'permission',
        reasonCode: 'permission-required',
        outcome: 'deny',
        detail: { permissions: requiredPermissions },
      });
      const target = denialTargetIdentifier(ctx);
      if (target !== undefined) {
        recordSecurityReference(ctx, 'resource', target);
      }
      ctx.status = 403;
      ctx.body = {
        error: 'Forbidden',
        message: 'The requested operation is not permitted',
      };
      return;
    }

    await next();
  };
}
