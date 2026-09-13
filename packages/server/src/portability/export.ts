/** Selective portability export service boundary. */

import { getPool } from '../lib/database.js';
import {
  attachOrganizationBrandingAssets,
  readApplicationExportSelection,
  readAuthorizationExportGraph,
  readClientExportRecords,
  readOrganizationExportScope,
  readUserExportGraph,
} from './repository.js';
import type { ExportManifestRequest, PortabilityActor, PortabilityManifest } from './types.js';

/** Manifest and safe attachment name produced by one export snapshot. */
export interface PortabilityExport {
  /** Complete validated portability manifest. */
  readonly manifest: PortabilityManifest;
  /** Safe basename returned in Content-Disposition. */
  readonly filename: string;
}

/**
 * Export the selected portable graph.
 *
 * This boundary fails closed until its complete transaction-backed engine is available.
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
    const manifest: PortabilityManifest = {
      version: '1.0',
      exported_at: exportedAt,
      scope: request.scope,
      categories: request.categories,
      application_selection: request.application_selection,
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
    };
    return {
      manifest,
      filename: `porta-manifest-${exportedAt.replace(/[:.]/g, '-')}.json`,
    };
  } finally {
    client.release();
  }
}
