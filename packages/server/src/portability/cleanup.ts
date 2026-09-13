/** Targeted cache and authority cleanup for committed portability imports. */

import { invalidateApplicationCache } from '../applications/cache.js';
import { invalidateClientCache } from '../clients/cache.js';
import { invalidateDefinitionsCache } from '../custom-claims/cache.js';
import { revokeAffectedAuthorityInTransaction } from '../lib/authority-revocation.js';
import { afterDatabaseCommit, runDatabaseTransaction } from '../lib/database.js';
import { registerAuthorityCleanup } from '../lib/deletion-cleanup.js';
import { invalidateOrganizationCache } from '../organizations/cache.js';
import { invalidateRoleCache, invalidateUserRbacCache } from '../rbac/cache.js';
import { invalidateUserCache } from '../users/cache.js';
import type { ResolvedPortabilityPlan } from './plan.js';
import { key, normalizedEmail, normalizedRbac, normalizedSlug } from './plan-support.js';
import type { PortabilityEntityType } from './types.js';

/** Destination identifiers resolved while applying the portable graph. */
export interface PortabilityWriteIds {
  /** Organization slug to destination UUID. */
  readonly organizationIds: Map<string, string>;
  /** Application slug to destination UUID. */
  readonly applicationIds: Map<string, string>;
  /** Application and role slug to destination UUID. */
  readonly roleIds: Map<string, string>;
  /** Application and claim name to destination UUID. */
  readonly claimIds: Map<string, string>;
  /** Organization and email to destination UUID. */
  readonly userIds: Map<string, string>;
  /** Public client ID to destination UUID. */
  readonly clientIds: Map<string, string>;
}

/**
 * Return whether one public result record was created or updated.
 *
 * @param plan - Completed write plan
 * @param entityType - Portable collection containing the record
 * @param encodedKey - JSON-encoded public natural key
 * @returns True when the record changed destination state
 */
function changed(
  plan: ResolvedPortabilityPlan,
  entityType: PortabilityEntityType,
  encodedKey: string,
): boolean {
  return plan.result.items.some(
    (item) =>
      item.entity_type === entityType &&
      JSON.stringify(item.natural_key) === encodedKey &&
      item.action !== 'skipped',
  );
}

/**
 * Register cache invalidation for every created or updated cached record.
 *
 * @param plan - Completed write plan
 * @param ids - Destination identifiers resolved by the writers
 */
async function registerCacheInvalidation(
  plan: ResolvedPortabilityPlan,
  ids: PortabilityWriteIds,
): Promise<void> {
  const rbacUserIds = new Set<string>();
  for (const record of plan.manifest.organizations) {
    if (!changed(plan, 'organizations', JSON.stringify({ slug: record.slug }))) continue;
    const id = ids.organizationIds.get(normalizedSlug(record.slug));
    if (id !== undefined) await invalidateOrganizationCache(record.slug, id);
  }
  for (const record of plan.manifest.applications) {
    if (!changed(plan, 'applications', JSON.stringify({ slug: record.slug }))) continue;
    const id = ids.applicationIds.get(normalizedSlug(record.slug));
    if (id !== undefined) await invalidateApplicationCache(record.slug, id);
  }
  for (const record of plan.manifest.roles) {
    const naturalKey = { application_slug: record.application_slug, slug: record.slug };
    if (!changed(plan, 'roles', JSON.stringify(naturalKey))) continue;
    const id = ids.roleIds.get(
      key(normalizedSlug(record.application_slug), normalizedRbac(record.slug)),
    );
    if (id !== undefined) await invalidateRoleCache(id);
  }
  for (const record of plan.manifest.claim_definitions) {
    const naturalKey = {
      application_slug: record.application_slug,
      claim_name: record.claim_name,
    };
    if (!changed(plan, 'claim_definitions', JSON.stringify(naturalKey))) continue;
    const applicationId = ids.applicationIds.get(normalizedSlug(record.application_slug));
    if (applicationId !== undefined) await invalidateDefinitionsCache(applicationId);
  }
  for (const record of plan.manifest.users) {
    const naturalKey = { organization_slug: record.organization_slug, email: record.email };
    if (!changed(plan, 'users', JSON.stringify(naturalKey))) continue;
    const id = ids.userIds.get(
      key(normalizedSlug(record.organization_slug), normalizedEmail(record.email)),
    );
    if (id !== undefined) await invalidateUserCache(id);
  }
  for (const record of plan.manifest.user_role_assignments) {
    const naturalKey = {
      organization_slug: record.organization_slug,
      email: record.email,
      application_slug: record.application_slug,
      role_slug: record.role_slug,
    };
    if (!changed(plan, 'user_role_assignments', JSON.stringify(naturalKey))) continue;
    const id = ids.userIds.get(
      key(normalizedSlug(record.organization_slug), normalizedEmail(record.email)),
    );
    if (id !== undefined) rbacUserIds.add(id);
  }
  for (const record of plan.manifest.role_permission_mappings) {
    const naturalKey = {
      application_slug: record.application_slug,
      role_slug: record.role_slug,
    };
    if (!changed(plan, 'role_permission_mappings', JSON.stringify(naturalKey))) continue;
    for (const assignment of plan.snapshot.userRoles) {
      if (
        normalizedSlug(assignment.application_slug) !== normalizedSlug(record.application_slug) ||
        normalizedRbac(assignment.role_slug) !== normalizedRbac(record.role_slug)
      ) {
        continue;
      }
      const id = ids.userIds.get(
        key(normalizedSlug(assignment.organization_slug), normalizedEmail(assignment.email)),
      );
      if (id !== undefined) rbacUserIds.add(id);
    }
  }
  for (const id of [...rbacUserIds].sort()) await invalidateUserRbacCache(id);
  for (const record of plan.manifest.clients) {
    if (!changed(plan, 'clients', JSON.stringify({ client_id: record.client_id }))) continue;
    const id = ids.clientIds.get(record.client_id);
    if (id !== undefined) await invalidateClientCache(record.client_id, id);
  }
}

/**
 * Find existing users whose import changes active authority to inactive.
 *
 * @param plan - Completed write plan and pre-write destination snapshot
 * @param ids - Destination identifiers resolved by the writers
 * @returns Sorted unique identifiers for users whose sessions must be revoked
 */
function deactivatedUserIds(
  plan: ResolvedPortabilityPlan,
  ids: PortabilityWriteIds,
): readonly string[] {
  const destinationUsers = new Map(
    plan.snapshot.users.map((row) => [
      key(normalizedSlug(row.organization_slug), normalizedEmail(row.email)),
      row,
    ]),
  );
  const affected = new Set<string>();
  for (const record of plan.manifest.users) {
    if (record.status !== 'inactive') continue;
    const userKey = key(normalizedSlug(record.organization_slug), normalizedEmail(record.email));
    const destination = destinationUsers.get(userKey);
    if (destination === undefined || destination.status === 'inactive') continue;
    const id = ids.userIds.get(userKey);
    if (id !== undefined) affected.add(id);
  }
  return [...affected].sort();
}

/**
 * Register exact cache invalidation and affected-user revocation for the commit boundary.
 *
 * The authority callback starts only after the import commits. Its short PostgreSQL transaction
 * revokes durable sessions and grant rows, then the existing cleanup helper schedules Redis work
 * without keeping a PostgreSQL transaction open for Redis.
 *
 * @param plan - Valid plan and destination snapshot used by the apply transaction
 * @param ids - Destination identifiers resolved by successful writes
 */
export async function registerPortabilityCleanup(
  plan: ResolvedPortabilityPlan,
  ids: PortabilityWriteIds,
): Promise<void> {
  await registerCacheInvalidation(plan, ids);
  const userIds = deactivatedUserIds(plan, ids);
  if (userIds.length === 0) return;

  await afterDatabaseCommit(async () => {
    await runDatabaseTransaction(async () => {
      const revoked = await revokeAffectedAuthorityInTransaction(userIds);
      await registerAuthorityCleanup({
        userIds,
        grantIds: revoked.grantIds,
        roleIds: [],
        revokeOidcState: true,
      });
    });
  });
}
