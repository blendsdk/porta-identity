/**
 * Canonical Admin authority ceiling for credential and factor management.
 *
 * Role assignment already prevents an administrator from granting authority they do not hold.
 * Password and second-factor recovery are equivalent authority changes, so the same ceiling must
 * apply before one administrator can replace another administrator's credentials. Ordinary users
 * carry no canonical Admin permissions and remain manageable under the caller's route permission.
 */

import { findApplicationBySlug } from '../applications/repository.js';
import { getPermissionsForAdminRole } from '../lib/admin-permissions.js';
import { AdminAuthorityCeilingError } from './errors.js';
import { getUserRolesForAuthority } from './user-role-service.js';

/** Canonical control-plane application slug. */
const ADMIN_APPLICATION_SLUG = 'porta-admin';

/**
 * Resolve one user's live canonical Admin permissions.
 *
 * A missing canonical application yields an empty set: the caller is not treated as holding
 * control-plane authority merely because its configuration is incomplete.
 *
 * @param userId - User whose current role assignments are authoritative.
 * @returns Effective canonical permissions.
 */
export async function getCanonicalAdminPermissions(userId: string): Promise<Set<string>> {
  const application = await findApplicationBySlug(ADMIN_APPLICATION_SLUG);
  if (!application) return new Set();
  const roles = await getUserRolesForAuthority(userId);
  const permissions = new Set<string>();
  for (const role of roles) {
    if (role.applicationId !== application.id) continue;
    for (const permission of getPermissionsForAdminRole(role.slug)) permissions.add(permission);
  }
  return permissions;
}

/**
 * Reject credential or factor management of a target who holds authority the actor lacks.
 *
 * The check is a subset rule over current canonical permissions. It runs before the mutation, so a
 * role change between check and write cannot grant a stronger target after admission; the write
 * itself remains scoped to the selected user. Self-management is left to the caller's existing
 * authorization, and targets with no canonical Admin permissions are unaffected.
 *
 * @param actorId - Authenticated administrator performing the mutation.
 * @param targetUserId - User whose password, email state, or factors are being changed.
 * @throws AdminAuthorityCeilingError when the target exceeds the actor's canonical authority.
 * @example await requireActorMayManageUser(admin.id, selectedUser.id);
 */
export async function requireActorMayManageUser(
  actorId: string,
  targetUserId: string,
): Promise<void> {
  if (actorId === targetUserId) return;
  const targetPermissions = await getCanonicalAdminPermissions(targetUserId);
  if (targetPermissions.size === 0) return;

  const actorPermissions = await getCanonicalAdminPermissions(actorId);
  for (const permission of targetPermissions) {
    if (!actorPermissions.has(permission)) throw new AdminAuthorityCeilingError();
  }
}
