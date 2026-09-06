import { afterDatabaseCommit } from './database.js';

/** Immutable identifiers needed to remove stale cache state after a committed deletion. */
export interface DeletionCleanupDescriptor {
  readonly resource:
    'organization' | 'application' | 'module' | 'client' | 'role' | 'permission' | 'claim' | 'user';
  readonly targetId: string;
  readonly targetSlug?: string;
  readonly parentId?: string;
  readonly userIds: readonly string[];
  readonly clientIds: readonly string[];
  readonly publicClientIds: readonly string[];
  readonly grantIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly permissionIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly applicationIds: readonly string[];
}

/**
 * Register immutable cleanup input on the current transaction's post-commit boundary.
 * The callback intentionally performs no external work; cache cleanup is attached separately.
 *
 * @param descriptor - Identifiers captured before the database cascade.
 */
export async function registerDeletionCleanup(
  descriptor: DeletionCleanupDescriptor,
): Promise<void> {
  const immutable = Object.freeze({
    ...descriptor,
    userIds: Object.freeze([...descriptor.userIds]),
    clientIds: Object.freeze([...descriptor.clientIds]),
    publicClientIds: Object.freeze([...descriptor.publicClientIds]),
    grantIds: Object.freeze([...descriptor.grantIds]),
    roleIds: Object.freeze([...descriptor.roleIds]),
    permissionIds: Object.freeze([...descriptor.permissionIds]),
    claimIds: Object.freeze([...descriptor.claimIds]),
    applicationIds: Object.freeze([...descriptor.applicationIds]),
  });
  await afterDatabaseCommit(async () => {
    void immutable;
  });
}
