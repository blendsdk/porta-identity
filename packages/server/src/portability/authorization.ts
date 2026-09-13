/** Closed authorization rules for manifest export, preview, and apply. */

import type { Context, Middleware } from 'koa';
import {
  ADMIN_PERMISSIONS,
  SUPER_ADMIN_ROLE_SLUG,
  type AdminPermission,
} from '../lib/admin-permissions.js';
import { requirePermission } from '../middleware/require-permission.js';
import { recordSecurityDecision } from '../security/decision-context.js';
import type { PortabilityCategory } from './types.js';

/** Portability operation whose base permission and category matrix are evaluated. */
type PortabilityOperation = 'export' | 'import';

/** Category-specific permissions added to the operation's base permission. */
const CATEGORY_PERMISSIONS: Readonly<
  Record<PortabilityCategory, Readonly<Record<PortabilityOperation, readonly AdminPermission[]>>>
> = {
  organizations: {
    export: [ADMIN_PERMISSIONS.ORG_READ],
    import: [
      ADMIN_PERMISSIONS.ORG_CREATE,
      ADMIN_PERMISSIONS.ORG_UPDATE,
      ADMIN_PERMISSIONS.ORG_SUSPEND,
    ],
  },
  applications_authorization: {
    export: [
      ADMIN_PERMISSIONS.APP_READ,
      ADMIN_PERMISSIONS.ROLE_READ,
      ADMIN_PERMISSIONS.PERMISSION_READ,
      ADMIN_PERMISSIONS.CLAIM_READ,
    ],
    import: [
      ADMIN_PERMISSIONS.APP_CREATE,
      ADMIN_PERMISSIONS.APP_UPDATE,
      ADMIN_PERMISSIONS.ROLE_CREATE,
      ADMIN_PERMISSIONS.ROLE_UPDATE,
      ADMIN_PERMISSIONS.PERMISSION_CREATE,
      ADMIN_PERMISSIONS.PERMISSION_UPDATE,
      ADMIN_PERMISSIONS.CLAIM_CREATE,
      ADMIN_PERMISSIONS.CLAIM_UPDATE,
    ],
  },
  users_assignments: {
    export: [
      ADMIN_PERMISSIONS.USER_READ,
      ADMIN_PERMISSIONS.ROLE_READ,
      ADMIN_PERMISSIONS.CLAIM_READ,
    ],
    import: [
      ADMIN_PERMISSIONS.USER_CREATE,
      ADMIN_PERMISSIONS.USER_UPDATE,
      ADMIN_PERMISSIONS.USER_LIFECYCLE,
      ADMIN_PERMISSIONS.ROLE_ASSIGN,
      ADMIN_PERMISSIONS.CLAIM_UPDATE,
    ],
  },
  oidc_clients: {
    export: [ADMIN_PERMISSIONS.CLIENT_READ, ADMIN_PERMISSIONS.APP_READ],
    import: [ADMIN_PERMISSIONS.CLIENT_CREATE, ADMIN_PERMISSIONS.CLIENT_UPDATE],
  },
};

/** Return the base permission for a portability operation. */
function basePermission(operation: PortabilityOperation): AdminPermission {
  return operation === 'export' ? ADMIN_PERMISSIONS.EXPORT_READ : ADMIN_PERMISSIONS.IMPORT_WRITE;
}

/** Return whether a value is a plain object that can be inspected safely. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the already-validated scope from an operation request body. */
function hasEnvironmentScope(body: unknown, operation: PortabilityOperation): boolean {
  if (!isRecord(body)) return false;
  const scope =
    operation === 'export' ? body.scope : isRecord(body.manifest) ? body.manifest.scope : undefined;
  return isRecord(scope) && scope.kind === 'environment';
}

/** Write the fixed validation response used when categories are unavailable. */
function rejectUnavailableCategories(context: Context, operation: PortabilityOperation): void {
  context.status = 400;
  context.body =
    operation === 'export'
      ? { error: 'Invalid export request', code: 'export_request_invalid' }
      : { error: 'Invalid import manifest', code: 'import_manifest_invalid' };
}

/**
 * Calculate the de-duplicated closed permission union for selected categories.
 *
 * The operation's base permission is always first. Remaining permissions retain category-matrix
 * order so audit and test output stays deterministic.
 *
 * @param operation - Export or import operation
 * @param categories - Validated selected categories
 * @returns Exact permissions required for the request
 */
export function requiredPortabilityPermissions(
  operation: PortabilityOperation,
  categories: readonly PortabilityCategory[],
): readonly AdminPermission[] {
  const permissions = new Set<AdminPermission>([basePermission(operation)]);
  for (const category of categories) {
    for (const permission of CATEGORY_PERMISSIONS[category][operation]) permissions.add(permission);
  }
  return [...permissions];
}

/**
 * Require every permission selected by a portability request and exact environment authority.
 *
 * This middleware runs after strict request parsing. Import routes separately enforce the base
 * import permission before their larger route-local body parser.
 *
 * @param operation - Export or import operation
 * @param readCategories - Reads validated categories from the route context
 * @returns Koa middleware enforcing the closed permission boundary
 */
export function requirePortabilityAuthorization(
  operation: PortabilityOperation,
  readCategories: (context: Context) => readonly PortabilityCategory[] | undefined,
): Middleware {
  return async (context, next) => {
    const categories = readCategories(context);
    if (categories === undefined) {
      rejectUnavailableCategories(context, operation);
      return;
    }

    const permissionMiddleware = requirePermission(
      ...requiredPortabilityPermissions(operation, categories),
    );
    await permissionMiddleware(context, async () => {
      if (
        hasEnvironmentScope(context.request.body, operation) &&
        !context.state.adminUser?.roles.includes(SUPER_ADMIN_ROLE_SLUG)
      ) {
        recordSecurityDecision(context, {
          decisionPoint: 'permission',
          reasonCode: 'permission-required',
          outcome: 'deny',
        });
        context.status = 403;
        context.body = {
          error: 'Forbidden',
          message: 'The requested operation is not permitted',
        };
        return;
      }
      await next();
    });
  };
}
