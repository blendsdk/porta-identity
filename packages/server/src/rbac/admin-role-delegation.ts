/**
 * Canonical Admin role delegation checks.
 *
 * The direct user-role route and the invitation pre-assignment path must apply the same ceiling:
 * an actor may grant a canonical Admin role only when the actor already holds every permission that
 * role confers. Keeping this rule in one place prevents the invitation path from becoming a
 * delegation bypass while leaving ordinary application roles to their existing ownership checks.
 */

import { getApplicationBySlug } from '../applications/service.js';
import { getPermissionsForAdminRole } from '../lib/admin-permissions.js';
import { RoleDelegationError } from './errors.js';
import { findRoleById } from './role-service.js';

/** Canonical control-plane application slug. */
const ADMIN_APPLICATION_SLUG = 'porta-admin';

/**
 * Reject any canonical Admin role that exceeds the actor's live permission set.
 *
 * Role identifiers from other applications are ignored here; the caller's existing ownership and
 * application-boundary validation remains responsible for them. A missing canonical application is
 * treated as "no canonical roles to check", matching the direct user-role route.
 *
 * @param roleIds - Role identifiers from one validated assignment or invitation payload.
 * @param actorPermissions - Live permissions resolved for the acting administrator.
 * @throws RoleDelegationError when any canonical role grants a permission the actor lacks.
 * @example await requireCanonicalRoleDelegation(['role-id'], new Set(['admin:user:invite']));
 */
export async function requireCanonicalRoleDelegation(
  roleIds: readonly string[],
  actorPermissions: ReadonlySet<string>,
): Promise<void> {
  const adminApplication = await getApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (!adminApplication) return;
  for (const roleId of new Set(roleIds)) {
    const role = await findRoleById(adminApplication.id, roleId);
    if (!role || role.applicationId !== adminApplication.id) continue;
    if (
      getPermissionsForAdminRole(role.slug).some(
        (permission) => !actorPermissions.has(permission),
      )
    ) {
      throw new RoleDelegationError();
    }
  }
}
