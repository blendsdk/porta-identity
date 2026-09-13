/** Atomic selective portability import orchestration. */

import { runDatabaseTransaction } from '../lib/database.js';
import {
  writePortabilityApplication,
  writePortabilityClaimDefinition,
  writePortabilityModule,
  writePortabilityOrganization,
  writePortabilityPermission,
  writePortabilityRole,
  writePortabilityRolePermissions,
} from './import-repository.js';
import { buildResolvedPortabilityPlan, type ResolvedPortabilityPlan } from './plan.js';
import { key, normalizedRbac, normalizedSlug } from './plan-support.js';
import {
  PortabilityError,
  type PortabilityAction,
  type PortabilityActor,
  type PortabilityEntityType,
  type PortabilityImportMode,
  type PortabilityManifest,
  type PortabilityNaturalKey,
  type PortabilityResult,
} from './types.js';

/**
 * @param plan - Valid resolved plan
 * @param entityType - Manifest collection
 * @param naturalKey - Exact public record identity
 * @returns Planned action for the record
 */
function plannedAction(
  plan: ResolvedPortabilityPlan,
  entityType: PortabilityEntityType,
  naturalKey: PortabilityNaturalKey,
): PortabilityAction {
  const encoded = JSON.stringify(naturalKey);
  const item = plan.result.items.find(
    (candidate) =>
      candidate.entity_type === entityType && JSON.stringify(candidate.natural_key) === encoded,
  );
  if (item === undefined) throw new Error('Portability plan is missing a write action');
  return item.action;
}

/**
 * @param rows - Existing destination records
 * @param selectKey - Normalized natural-key selector
 * @param naturalKey - Normalized key to find
 * @returns Existing private identifier, or null when absent
 */
function existingId<Row extends { readonly id: string }>(
  rows: readonly Row[],
  selectKey: (row: Row) => string,
  naturalKey: string,
): string | null {
  return rows.find((row) => selectKey(row) === naturalKey)?.id ?? null;
}

/**
 * Apply organization and application-authorization records in dependency order.
 *
 * @param plan - Valid plan and destination snapshot from this transaction
 */
async function applyAuthorizationRecords(plan: ResolvedPortabilityPlan): Promise<void> {
  const { manifest, snapshot } = plan;
  const organizationIds = new Map(
    snapshot.organizations.map((row) => [normalizedSlug(row.slug), row.id]),
  );
  const applicationIds = new Map(
    snapshot.applications.map((row) => [normalizedSlug(row.slug), row.id]),
  );
  const moduleIds = new Map(
    snapshot.applicationModules.map((row) => [
      key(normalizedSlug(row.application_slug), normalizedSlug(row.slug)),
      row.id,
    ]),
  );
  const roleIds = new Map(
    snapshot.roles.map((row) => [
      key(normalizedSlug(row.application_slug), normalizedRbac(row.slug)),
      row.id,
    ]),
  );
  const permissionIds = new Map(
    snapshot.permissions.map((row) => [
      key(normalizedSlug(row.application_slug), normalizedRbac(row.slug)),
      row.id,
    ]),
  );

  for (const record of manifest.organizations) {
    const naturalKey = { slug: record.slug };
    const action = plannedAction(plan, 'organizations', naturalKey);
    if (action === 'skipped') continue;
    const normalizedKey = normalizedSlug(record.slug);
    const id = await writePortabilityOrganization(
      record,
      organizationIds.get(normalizedKey) ?? null,
    );
    organizationIds.set(normalizedKey, id);
  }

  for (const record of manifest.applications) {
    const naturalKey = { slug: record.slug };
    const action = plannedAction(plan, 'applications', naturalKey);
    if (action === 'skipped') continue;
    const normalizedKey = normalizedSlug(record.slug);
    const id = await writePortabilityApplication(record, applicationIds.get(normalizedKey) ?? null);
    applicationIds.set(normalizedKey, id);
  }

  for (const record of manifest.application_modules) {
    const naturalKey = { application_slug: record.application_slug, slug: record.slug };
    const action = plannedAction(plan, 'application_modules', naturalKey);
    if (action === 'skipped') continue;
    const applicationId = applicationIds.get(normalizedSlug(record.application_slug));
    if (applicationId === undefined) throw new Error('Resolved application is missing');
    const normalizedKey = key(normalizedSlug(record.application_slug), normalizedSlug(record.slug));
    const id = await writePortabilityModule(
      record,
      applicationId,
      moduleIds.get(normalizedKey) ?? null,
    );
    moduleIds.set(normalizedKey, id);
  }

  for (const record of manifest.roles) {
    const naturalKey = { application_slug: record.application_slug, slug: record.slug };
    const action = plannedAction(plan, 'roles', naturalKey);
    if (action === 'skipped') continue;
    const applicationId = applicationIds.get(normalizedSlug(record.application_slug));
    if (applicationId === undefined) throw new Error('Resolved application is missing');
    const normalizedKey = key(normalizedSlug(record.application_slug), normalizedRbac(record.slug));
    const id = await writePortabilityRole(
      record,
      applicationId,
      roleIds.get(normalizedKey) ?? null,
    );
    roleIds.set(normalizedKey, id);
  }

  for (const record of manifest.permissions) {
    const naturalKey = { application_slug: record.application_slug, slug: record.slug };
    const action = plannedAction(plan, 'permissions', naturalKey);
    if (action === 'skipped') continue;
    const appKey = normalizedSlug(record.application_slug);
    const applicationId = applicationIds.get(appKey);
    if (applicationId === undefined) throw new Error('Resolved application is missing');
    const moduleId =
      record.module_slug === null
        ? null
        : (moduleIds.get(key(appKey, normalizedSlug(record.module_slug))) ?? null);
    if (record.module_slug !== null && moduleId === null) {
      throw new Error('Resolved application module is missing');
    }
    const normalizedKey = key(appKey, normalizedRbac(record.slug));
    const id = await writePortabilityPermission(
      record,
      applicationId,
      moduleId,
      permissionIds.get(normalizedKey) ?? null,
    );
    permissionIds.set(normalizedKey, id);
  }

  for (const record of manifest.claim_definitions) {
    const naturalKey = { application_slug: record.application_slug, claim_name: record.claim_name };
    const action = plannedAction(plan, 'claim_definitions', naturalKey);
    if (action === 'skipped') continue;
    const appKey = normalizedSlug(record.application_slug);
    const applicationId = applicationIds.get(appKey);
    if (applicationId === undefined) throw new Error('Resolved application is missing');
    const destinationId = existingId(
      snapshot.claimDefinitions,
      (row) => key(normalizedSlug(row.application_slug), row.claim_name),
      key(appKey, record.claim_name),
    );
    await writePortabilityClaimDefinition(record, applicationId, destinationId);
  }

  for (const record of manifest.role_permission_mappings) {
    const naturalKey = { application_slug: record.application_slug, role_slug: record.role_slug };
    const action = plannedAction(plan, 'role_permission_mappings', naturalKey);
    if (action === 'skipped') continue;
    const appKey = normalizedSlug(record.application_slug);
    const roleId = roleIds.get(key(appKey, normalizedRbac(record.role_slug)));
    if (roleId === undefined) throw new Error('Resolved role is missing');
    const mappedPermissionIds = record.permission_slugs.map((slug) => {
      const permissionId = permissionIds.get(key(appKey, normalizedRbac(slug)));
      if (permissionId === undefined) throw new Error('Resolved permission is missing');
      return permissionId;
    });
    await writePortabilityRolePermissions(roleId, mappedPermissionIds);
  }
}

/**
 * Validate and atomically apply one portability manifest.
 *
 * It applies the currently supported organization and application-authorization collections in
 * dependency order and returns the safe plan result from the same transaction snapshot.
 *
 * @param manifest - Complete manifest received from an import request
 * @param mode - Keep-existing or update-existing behavior
 * @param actor - Authenticated actor retained for the transaction audit
 * @returns Ordered committed result
 */
export async function applyPortabilityManifest(
  manifest: PortabilityManifest,
  mode: Exclude<PortabilityImportMode, 'dry-run'>,
  actor: PortabilityActor,
): Promise<PortabilityResult> {
  return runDatabaseTransaction(async () => {
    void actor;
    const plan = await buildResolvedPortabilityPlan(manifest, mode);
    if (plan.result.errors.length > 0) {
      throw new PortabilityError(409, 'import_plan_rejected', 'Import plan rejected', plan.result);
    }
    await applyAuthorizationRecords(plan);
    return plan.result;
  });
}
