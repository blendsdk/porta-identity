/** Atomic selective portability import orchestration. */

import { createHash } from 'node:crypto';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { getPool, runDatabaseTransaction } from '../lib/database.js';
import { registerPortabilityCleanup, type PortabilityWriteIds } from './cleanup.js';
import {
  writePortabilityApplication,
  writePortabilityClaimDefinition,
  writePortabilityModule,
  writePortabilityOrganization,
  writePortabilityPermission,
  writePortabilityRole,
  writePortabilityRolePermissions,
} from './import-repository.js';
import {
  writePortabilityClient,
  writePortabilityUser,
  writePortabilityUserClaimValue,
  writePortabilityUserRole,
} from './import-user-client-writers.js';
import { buildResolvedPortabilityPlan, type ResolvedPortabilityPlan } from './plan.js';
import { key, normalizedEmail, normalizedRbac, normalizedSlug } from './plan-support.js';
import {
  PortabilityError,
  type PortabilityAction,
  type PortabilityActor,
  type PortabilityCredential,
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
async function applyAuthorizationRecords(
  plan: ResolvedPortabilityPlan,
): Promise<PortabilityWriteIds> {
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
  const claimIds = new Map(
    snapshot.claimDefinitions.map((row) => [
      key(normalizedSlug(row.application_slug), row.claim_name),
      row.id,
    ]),
  );
  const userIds = new Map(
    snapshot.users.map((row) => [
      key(normalizedSlug(row.organization_slug), normalizedEmail(row.email)),
      row.id,
    ]),
  );
  const clientIds = new Map(snapshot.clients.map((row) => [row.client_id, row.id]));

  for (const record of manifest.organizations) {
    const naturalKey = { slug: record.slug };
    const action = plannedAction(plan, 'organizations', naturalKey);
    if (action === 'skipped') continue;
    const normalizedKey = normalizedSlug(record.slug);
    const id = await writePortabilityOrganization(
      record,
      organizationIds.get(normalizedKey) ?? null,
      new Set(
        snapshot.brandingAssets
          .filter((asset) => normalizedSlug(asset.organization_slug) === normalizedKey)
          .map((asset) => asset.asset_type),
      ),
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
    const id = await writePortabilityClaimDefinition(record, applicationId, destinationId);
    claimIds.set(key(appKey, record.claim_name), id);
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
  return { organizationIds, applicationIds, roleIds, claimIds, userIds, clientIds };
}

/**
 * Apply users, their listed relationships, and clients after parent identifiers resolve.
 *
 * @param plan - Valid plan and destination snapshot from this transaction
 * @param ids - Parent identifiers resolved while writing the authorization graph
 * @returns Planned result with any newly generated one-time client credentials
 */
async function applyUserAndClientRecords(
  plan: ResolvedPortabilityPlan,
  ids: PortabilityWriteIds,
): Promise<PortabilityResult> {
  const credentials: PortabilityCredential[] = [];

  for (const record of plan.manifest.users) {
    const naturalKey = { organization_slug: record.organization_slug, email: record.email };
    const action = plannedAction(plan, 'users', naturalKey);
    if (action === 'skipped') continue;
    const orgKey = normalizedSlug(record.organization_slug);
    const organizationId = ids.organizationIds.get(orgKey);
    if (organizationId === undefined) throw new Error('Resolved organization is missing');
    const userKey = key(orgKey, normalizedEmail(record.email));
    const id = await writePortabilityUser(record, organizationId, ids.userIds.get(userKey) ?? null);
    ids.userIds.set(userKey, id);
  }

  for (const record of plan.manifest.user_role_assignments) {
    const naturalKey = {
      organization_slug: record.organization_slug,
      email: record.email,
      application_slug: record.application_slug,
      role_slug: record.role_slug,
    };
    if (plannedAction(plan, 'user_role_assignments', naturalKey) === 'skipped') continue;
    const userId = ids.userIds.get(
      key(normalizedSlug(record.organization_slug), normalizedEmail(record.email)),
    );
    const roleId = ids.roleIds.get(
      key(normalizedSlug(record.application_slug), normalizedRbac(record.role_slug)),
    );
    if (userId === undefined || roleId === undefined)
      throw new Error('Resolved assignment parent is missing');
    await writePortabilityUserRole(userId, roleId);
  }

  for (const record of plan.manifest.user_claim_values) {
    const naturalKey = {
      organization_slug: record.organization_slug,
      email: record.email,
      application_slug: record.application_slug,
      claim_name: record.claim_name,
    };
    if (plannedAction(plan, 'user_claim_values', naturalKey) === 'skipped') continue;
    const userId = ids.userIds.get(
      key(normalizedSlug(record.organization_slug), normalizedEmail(record.email)),
    );
    const claimId = ids.claimIds.get(
      key(normalizedSlug(record.application_slug), record.claim_name),
    );
    if (userId === undefined || claimId === undefined)
      throw new Error('Resolved claim-value parent is missing');
    await writePortabilityUserClaimValue(userId, claimId, record.value);
  }

  for (const record of plan.manifest.clients) {
    const action = plannedAction(plan, 'clients', { client_id: record.client_id });
    if (action === 'skipped') continue;
    const organizationId = ids.organizationIds.get(normalizedSlug(record.organization_slug));
    const applicationId = ids.applicationIds.get(normalizedSlug(record.application_slug));
    if (organizationId === undefined || applicationId === undefined)
      throw new Error('Resolved client parent is missing');
    const written = await writePortabilityClient(
      record,
      organizationId,
      applicationId,
      ids.clientIds.get(record.client_id) ?? null,
    );
    ids.clientIds.set(record.client_id, written.id);
    if (written.credential !== undefined) credentials.push(written.credential);
  }

  return credentials.length === 0 ? plan.result : { ...plan.result, credentials };
}

/**
 * Validate and atomically apply one portability manifest.
 *
 * It applies every selected portable collection in dependency order, writes one content-free
 * audit row, and returns the safe result only after the transaction commits.
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
  try {
    return await runDatabaseTransaction(async () => {
      const plan = await buildResolvedPortabilityPlan(manifest, mode);
      if (plan.result.errors.length > 0) {
        throw new PortabilityError(
          409,
          'import_plan_rejected',
          'Import plan rejected',
          plan.result,
        );
      }
      const ids = await applyAuthorizationRecords(plan);
      const result = await applyUserAndClientRecords(plan, ids);
      await registerPortabilityCleanup(plan, ids);
      const auditOrganizationId =
        plan.manifest.scope.kind === 'organization'
          ? ids.organizationIds.get(normalizedSlug(plan.manifest.scope.organization_slug))
          : actor.controlPlaneOrganizationId;
      if (auditOrganizationId === undefined) {
        throw new Error('Resolved import organization is unavailable for audit ownership');
      }
      await writeAuditLogInTransaction(getPool(), {
        organizationId: auditOrganizationId,
        actorId: actor.userId,
        eventType: 'admin.import',
        eventCategory: 'admin',
        metadata: {
          manifest_version: plan.manifest.version,
          sha256_digest: createHash('sha256').update(JSON.stringify(plan.manifest)).digest('hex'),
          mode,
          categories: plan.manifest.categories,
          record_counts: plan.result.summary,
        },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    throw new PortabilityError(503, 'import_execution_failed', 'Import failed');
  }
}
