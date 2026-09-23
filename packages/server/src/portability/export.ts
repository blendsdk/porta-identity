/** Selective portability export service boundary. */

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { getPool } from '../lib/database.js';
import { portabilityManifestSchema } from './schema.js';
import {
  attachOrganizationBrandingAssets,
  readApplicationExportSelection,
  readAuthorizationExportGraph,
  readClientExportRecords,
  readOrganizationExportScope,
  readUserExportGraph,
} from './repository.js';
import {
  PortabilityError,
  type ExportManifestRequest,
  type PortabilityActor,
  type PortabilityManifest,
} from './types.js';

/** Maximum UTF-8 manifest size accepted by the matching import boundary. */
const MAXIMUM_MANIFEST_BYTES = 64 * 1024 * 1024;

/** Manifest and safe attachment name produced by one export snapshot. */
export interface PortabilityExport {
  /** Complete validated portability manifest. */
  readonly manifest: PortabilityManifest;
  /** Safe basename returned in Content-Disposition. */
  readonly filename: string;
}

/** Build non-sensitive per-collection counts for the export audit event. */
function recordCounts(manifest: PortabilityManifest): Readonly<Record<string, number>> {
  return {
    organizations: manifest.organizations.length,
    applications: manifest.applications.length,
    application_modules: manifest.application_modules.length,
    roles: manifest.roles.length,
    permissions: manifest.permissions.length,
    claim_definitions: manifest.claim_definitions.length,
    role_permission_mappings: manifest.role_permission_mappings.length,
    users: manifest.users.length,
    user_role_assignments: manifest.user_role_assignments.length,
    user_claim_values: manifest.user_claim_values.length,
    clients: manifest.clients.length,
  };
}

/** Roll back without replacing the original export failure. */
async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Releasing the failed connection handles cleanup; the original failure remains authoritative.
  }
}

/**
 * Export the selected portable graph.
 *
 * @param request - Validated export selection
 * @param actor - Authenticated audit actor
 * @returns Exported manifest and attachment name
 */
export async function exportPortabilityManifest(
  request: ExportManifestRequest,
  actor: PortabilityActor,
): Promise<PortabilityExport> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const organizationScope = await readOrganizationExportScope(
      client,
      request.scope,
      actor.controlPlaneOrganizationId,
    );
    const selectsApplicationData = request.categories.some(
      (category) => category !== 'organizations',
    );
    const applicationSelection = selectsApplicationData
      ? await readApplicationExportSelection(client, request.application_selection)
      : { applicationIds: [], applications: [] };
    const includesAuthorization = request.categories.includes('applications_authorization');
    const authorization = includesAuthorization
      ? await readAuthorizationExportGraph(client, applicationSelection.applicationIds)
      : {
          applicationModules: [],
          roles: [],
          permissions: [],
          claimDefinitions: [],
          rolePermissionMappings: [],
        };
    const organizations = request.categories.includes('organizations')
      ? await attachOrganizationBrandingAssets(
          client,
          organizationScope.organizations,
          organizationScope.organizationIds,
        )
      : [];
    const userGraph = request.categories.includes('users_assignments')
      ? await readUserExportGraph(
          client,
          organizationScope.organizationIds,
          applicationSelection.applicationIds,
        )
      : { users: [], userRoleAssignments: [], userClaimValues: [] };
    const clients = request.categories.includes('oidc_clients')
      ? await readClientExportRecords(
          client,
          organizationScope.organizationIds,
          applicationSelection.applicationIds,
        )
      : [];
    const exportedAt = new Date().toISOString();
    const manifest = portabilityManifestSchema.parse({
      version: '1.0',
      exported_at: exportedAt,
      scope: request.scope,
      categories: [...request.categories].sort(),
      application_selection: {
        all_applications: request.application_selection.all_applications,
        application_slugs: [...request.application_selection.application_slugs].sort(),
      },
      organizations,
      applications: includesAuthorization ? applicationSelection.applications : [],
      application_modules: authorization.applicationModules,
      roles: authorization.roles,
      permissions: authorization.permissions,
      claim_definitions: authorization.claimDefinitions,
      role_permission_mappings: authorization.rolePermissionMappings,
      users: userGraph.users,
      user_role_assignments: userGraph.userRoleAssignments,
      user_claim_values: userGraph.userClaimValues,
      clients,
    });
    const serialized = JSON.stringify(manifest);
    if (Buffer.byteLength(serialized, 'utf8') > MAXIMUM_MANIFEST_BYTES) {
      throw new PortabilityError(413, 'export_manifest_too_large', 'Export manifest is too large');
    }
    await writeAuditLogInTransaction(client, {
      organizationId:
        request.scope.kind === 'organization'
          ? organizationScope.organizationIds[0]
          : actor.controlPlaneOrganizationId,
      actorId: actor.userId,
      eventType: 'admin.export',
      eventCategory: 'admin',
      metadata: {
        manifest_version: manifest.version,
        sha256_digest: createHash('sha256').update(serialized).digest('hex'),
        mode: request.scope.kind,
        categories: manifest.categories,
        record_counts: recordCounts(manifest),
      },
    });
    await client.query('COMMIT');
    return {
      manifest,
      filename: `porta-manifest-${exportedAt.replace(/[:.]/g, '-')}.json`,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}
