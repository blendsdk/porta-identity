/** Mutation-free normalization, dependency resolution, and import action planning. */

import { runDatabaseTransaction } from '../lib/database.js';
import { validateClaimValue } from '../custom-claims/validators.js';
import {
  readPortabilityImportSnapshot,
  type PortabilityImportSnapshot,
} from './import-repository.js';
import {
  addError,
  addItem,
  clientMutableValuesMatch,
  compareOutcomes,
  dependencyState,
  emptySummary,
  groupByKey,
  key,
  normalizedEmail,
  normalizedRbac,
  normalizedSlug,
  organizationMatches,
  parentError,
  recordAction,
  rejectDuplicates,
  sameValue,
  type PlanAccumulator,
  userMatches,
} from './plan-support.js';
import { portabilityManifestSchema, portabilityResultSchema } from './schema.js';
import type {
  PortabilityAction,
  PortabilityImportMode,
  PortabilityManifest,
  PortabilityResult,
  PortabilityResultErrorCode,
} from './types.js';

/** Internal resolved plan retained for the later atomic writer. */
export interface ResolvedPortabilityPlan {
  /** Strict normalized manifest used to build every action. */
  readonly manifest: PortabilityManifest;
  /** Destination snapshot containing private relationship identifiers. */
  readonly snapshot: PortabilityImportSnapshot;
  /** Safe public result from the same snapshot. */
  readonly result: PortabilityResult;
}

/**
 * Build the resolved plan using the current request-owned transaction.
 *
 * Apply uses this boundary so preview and mutation share the same normalization,
 * compatibility, and dependency checks.
 *
 * @param input - Manifest received by the service
 * @param mode - Requested preview or apply behavior
 * @returns Normalized manifest, private snapshot, and safe public result
 */
export async function buildResolvedPortabilityPlan(
  input: PortabilityManifest,
  mode: PortabilityImportMode,
): Promise<ResolvedPortabilityPlan> {
  const manifest = portabilityManifestSchema.parse(input);
  const snapshot = await readPortabilityImportSnapshot();
  const accumulator: PlanAccumulator = { items: [], errors: [], summary: emptySummary() };

  if (rejectDuplicates(manifest, accumulator)) {
    const result = portabilityResultSchema.parse({
      mode,
      summary: accumulator.summary,
      items: [],
      errors: accumulator.errors.sort(compareOutcomes),
    });
    return { manifest, snapshot, result };
  }

  const organizations = groupByKey(snapshot.organizations, (row) => normalizedSlug(row.slug));
  const brandingAssets = groupByKey(snapshot.brandingAssets, (row) =>
    normalizedSlug(row.organization_slug),
  );
  const applications = groupByKey(snapshot.applications, (row) => normalizedSlug(row.slug));
  const modules = groupByKey(snapshot.applicationModules, (row) =>
    key(normalizedSlug(row.application_slug), normalizedSlug(row.slug)),
  );
  const roles = groupByKey(snapshot.roles, (row) =>
    key(normalizedSlug(row.application_slug), normalizedRbac(row.slug)),
  );
  const permissions = groupByKey(snapshot.permissions, (row) =>
    key(normalizedSlug(row.application_slug), normalizedRbac(row.slug)),
  );
  const claims = groupByKey(snapshot.claimDefinitions, (row) =>
    key(normalizedSlug(row.application_slug), row.claim_name),
  );
  const users = groupByKey(snapshot.users, (row) =>
    key(normalizedSlug(row.organization_slug), normalizedEmail(row.email)),
  );
  const clients = groupByKey(snapshot.clients, (row) => row.client_id);

  const manifestOrganizations = new Set(
    manifest.organizations.map((row) => normalizedSlug(row.slug)),
  );
  const manifestApplications = new Set(
    manifest.applications.map((row) => normalizedSlug(row.slug)),
  );
  const manifestModules = new Set(
    manifest.application_modules.map((row) =>
      key(normalizedSlug(row.application_slug), normalizedSlug(row.slug)),
    ),
  );
  const manifestRoles = new Set(
    manifest.roles.map((row) =>
      key(normalizedSlug(row.application_slug), normalizedRbac(row.slug)),
    ),
  );
  const manifestPermissions = new Set(
    manifest.permissions.map((row) =>
      key(normalizedSlug(row.application_slug), normalizedRbac(row.slug)),
    ),
  );
  const manifestClaims = new Set(
    manifest.claim_definitions.map((row) =>
      key(normalizedSlug(row.application_slug), row.claim_name),
    ),
  );
  const manifestUsers = new Set(
    manifest.users.map((row) =>
      key(normalizedSlug(row.organization_slug), normalizedEmail(row.email)),
    ),
  );

  for (const source of manifest.organizations) {
    const naturalKey = { slug: source.slug };
    if (source.slug === 'porta-admin') {
      addError(accumulator, 'organizations', naturalKey, 'control_plane_record');
      continue;
    }
    const matches = organizations.get(normalizedSlug(source.slug));
    if ((matches?.length ?? 0) > 1) {
      addError(accumulator, 'organizations', naturalKey, 'ambiguous_dependency');
      continue;
    }
    const destination = matches?.[0];
    if (destination?.is_super_admin) {
      addError(accumulator, 'organizations', naturalKey, 'control_plane_record');
      continue;
    }
    addItem(
      accumulator,
      'organizations',
      recordAction(
        mode,
        destination !== undefined,
        destination !== undefined &&
          organizationMatches(
            source,
            destination,
            new Map(
              (brandingAssets.get(normalizedSlug(source.slug)) ?? []).map((asset) => [
                asset.asset_type,
                { content_type: asset.content_type, data: asset.data },
              ]),
            ),
          ),
      ),
      naturalKey,
    );
  }

  for (const source of manifest.applications) {
    const naturalKey = { slug: source.slug };
    if (source.slug === 'porta-admin') {
      addError(accumulator, 'applications', naturalKey, 'control_plane_record');
      continue;
    }
    const matches = applications.get(normalizedSlug(source.slug));
    if ((matches?.length ?? 0) > 1) {
      addError(accumulator, 'applications', naturalKey, 'ambiguous_dependency');
      continue;
    }
    const destination = matches?.[0];
    const same =
      destination !== undefined &&
      source.name === destination.name &&
      source.description === destination.description &&
      source.status === destination.status;
    addItem(
      accumulator,
      'applications',
      recordAction(mode, destination !== undefined, same),
      naturalKey,
    );
  }

  for (const source of manifest.application_modules) {
    const naturalKey = { application_slug: source.application_slug, slug: source.slug };
    const appKey = normalizedSlug(source.application_slug);
    const dependency = parentError(manifestApplications.has(appKey), applications.get(appKey));
    if (appKey === 'porta-admin')
      addError(accumulator, 'application_modules', naturalKey, 'control_plane_record');
    else if (dependency !== null)
      addError(accumulator, 'application_modules', naturalKey, dependency);
    else {
      const matches = modules.get(key(appKey, normalizedSlug(source.slug)));
      if ((matches?.length ?? 0) > 1) {
        addError(accumulator, 'application_modules', naturalKey, 'ambiguous_dependency');
        continue;
      }
      const destination = matches?.[0];
      const same =
        destination !== undefined &&
        source.name === destination.name &&
        source.description === destination.description &&
        source.status === destination.status;
      addItem(
        accumulator,
        'application_modules',
        recordAction(mode, destination !== undefined, same),
        naturalKey,
      );
    }
  }

  for (const source of manifest.roles) {
    const naturalKey = { application_slug: source.application_slug, slug: source.slug };
    const appKey = normalizedSlug(source.application_slug);
    const dependency = parentError(manifestApplications.has(appKey), applications.get(appKey));
    if (appKey === 'porta-admin')
      addError(accumulator, 'roles', naturalKey, 'control_plane_record');
    else if (dependency !== null) addError(accumulator, 'roles', naturalKey, dependency);
    else {
      const matches = roles.get(key(appKey, normalizedRbac(source.slug)));
      if ((matches?.length ?? 0) > 1) {
        addError(accumulator, 'roles', naturalKey, 'ambiguous_dependency');
        continue;
      }
      const destination = matches?.[0];
      const same =
        destination !== undefined &&
        source.name === destination.name &&
        source.description === destination.description;
      addItem(
        accumulator,
        'roles',
        recordAction(mode, destination !== undefined, same),
        naturalKey,
      );
    }
  }

  for (const source of manifest.permissions) {
    const naturalKey = { application_slug: source.application_slug, slug: source.slug };
    const appKey = normalizedSlug(source.application_slug);
    const dependency = parentError(manifestApplications.has(appKey), applications.get(appKey));
    if (appKey === 'porta-admin') {
      addError(accumulator, 'permissions', naturalKey, 'control_plane_record');
      continue;
    }
    if (dependency !== null) {
      addError(accumulator, 'permissions', naturalKey, dependency);
      continue;
    }
    if (source.module_slug !== null) {
      const moduleKey = key(appKey, normalizedSlug(source.module_slug));
      const moduleDependency = parentError(manifestModules.has(moduleKey), modules.get(moduleKey));
      if (moduleDependency !== null) {
        addError(accumulator, 'permissions', naturalKey, moduleDependency);
        continue;
      }
    }
    const matches = permissions.get(key(appKey, normalizedRbac(source.slug)));
    if ((matches?.length ?? 0) > 1) {
      addError(accumulator, 'permissions', naturalKey, 'ambiguous_dependency');
      continue;
    }
    const destination = matches?.[0];
    if (
      destination !== undefined &&
      normalizedSlug(destination.module_slug ?? '') !== normalizedSlug(source.module_slug ?? '')
    ) {
      addError(accumulator, 'permissions', naturalKey, 'incompatible_record');
      continue;
    }
    const same =
      destination !== undefined &&
      source.name === destination.name &&
      source.description === destination.description;
    addItem(
      accumulator,
      'permissions',
      recordAction(mode, destination !== undefined, same),
      naturalKey,
    );
  }

  for (const source of manifest.claim_definitions) {
    const naturalKey = { application_slug: source.application_slug, claim_name: source.claim_name };
    const appKey = normalizedSlug(source.application_slug);
    const dependency = parentError(manifestApplications.has(appKey), applications.get(appKey));
    if (appKey === 'porta-admin')
      addError(accumulator, 'claim_definitions', naturalKey, 'control_plane_record');
    else if (dependency !== null)
      addError(accumulator, 'claim_definitions', naturalKey, dependency);
    else {
      const matches = claims.get(key(appKey, source.claim_name));
      if ((matches?.length ?? 0) > 1) {
        addError(accumulator, 'claim_definitions', naturalKey, 'ambiguous_dependency');
        continue;
      }
      const destination = matches?.[0];
      if (destination !== undefined && destination.claim_type !== source.claim_type) {
        addError(accumulator, 'claim_definitions', naturalKey, 'incompatible_record');
        continue;
      }
      const same =
        destination !== undefined &&
        source.description === destination.description &&
        source.include_in_id_token === destination.include_in_id_token &&
        source.include_in_access_token === destination.include_in_access_token &&
        source.include_in_userinfo === destination.include_in_userinfo;
      addItem(
        accumulator,
        'claim_definitions',
        recordAction(mode, destination !== undefined, same),
        naturalKey,
      );
    }
  }

  const rolePermissionEdges = new Set(
    snapshot.rolePermissions.flatMap((row) =>
      row.permission_slugs.map((permissionSlug) =>
        key(
          normalizedSlug(row.application_slug),
          normalizedRbac(row.role_slug),
          normalizedRbac(permissionSlug),
        ),
      ),
    ),
  );
  for (const source of manifest.role_permission_mappings) {
    const naturalKey = { application_slug: source.application_slug, role_slug: source.role_slug };
    const appKey = normalizedSlug(source.application_slug);
    const roleKey = key(appKey, normalizedRbac(source.role_slug));
    let error: PortabilityResultErrorCode | null =
      appKey === 'porta-admin'
        ? 'control_plane_record'
        : parentError(manifestRoles.has(roleKey), roles.get(roleKey));
    for (const permissionSlug of source.permission_slugs) {
      if (error !== null) break;
      const permissionKey = key(appKey, normalizedRbac(permissionSlug));
      if (
        manifestPermissions.has(permissionKey) ||
        dependencyState(permissions.get(permissionKey)) === 'resolved'
      )
        continue;
      const elsewhere =
        manifest.permissions.some(
          (row) => normalizedRbac(row.slug) === normalizedRbac(permissionSlug),
        ) ||
        snapshot.permissions.some(
          (row) => normalizedRbac(row.slug) === normalizedRbac(permissionSlug),
        );
      error = elsewhere ? 'cross_scope_reference' : 'missing_dependency';
    }
    if (error !== null) {
      addError(accumulator, 'role_permission_mappings', naturalKey, error);
      continue;
    }
    const existingEdges = source.permission_slugs.filter((slug) =>
      rolePermissionEdges.has(key(appKey, normalizedRbac(source.role_slug), normalizedRbac(slug))),
    ).length;
    const action: PortabilityAction =
      existingEdges === source.permission_slugs.length
        ? 'skipped'
        : existingEdges === 0
          ? 'created'
          : 'updated';
    addItem(accumulator, 'role_permission_mappings', action, naturalKey);
  }

  for (const source of manifest.users) {
    const naturalKey = { organization_slug: source.organization_slug, email: source.email };
    const orgKey = normalizedSlug(source.organization_slug);
    const dependency = parentError(manifestOrganizations.has(orgKey), organizations.get(orgKey));
    if (orgKey === 'porta-admin')
      addError(accumulator, 'users', naturalKey, 'control_plane_record');
    else if (dependency !== null) addError(accumulator, 'users', naturalKey, dependency);
    else {
      const matches = users.get(key(orgKey, normalizedEmail(source.email)));
      if ((matches?.length ?? 0) > 1) {
        addError(accumulator, 'users', naturalKey, 'ambiguous_dependency');
        continue;
      }
      const destination = matches?.[0];
      addItem(
        accumulator,
        'users',
        recordAction(
          mode,
          destination !== undefined,
          destination !== undefined && userMatches(source, destination),
        ),
        naturalKey,
      );
    }
  }

  const userRoleEdges = new Set(
    snapshot.userRoles.map((row) =>
      key(
        normalizedSlug(row.organization_slug),
        normalizedEmail(row.email),
        normalizedSlug(row.application_slug),
        normalizedRbac(row.role_slug),
      ),
    ),
  );
  for (const source of manifest.user_role_assignments) {
    const naturalKey = {
      organization_slug: source.organization_slug,
      email: source.email,
      application_slug: source.application_slug,
      role_slug: source.role_slug,
    };
    const orgKey = normalizedSlug(source.organization_slug);
    const appKey = normalizedSlug(source.application_slug);
    const userKey = key(orgKey, normalizedEmail(source.email));
    const roleKey = key(appKey, normalizedRbac(source.role_slug));
    let error: PortabilityResultErrorCode | null = null;
    if (orgKey === 'porta-admin' || appKey === 'porta-admin') error = 'control_plane_record';
    else if (!manifestUsers.has(userKey) && dependencyState(users.get(userKey)) !== 'resolved') {
      const elsewhere =
        manifest.users.some(
          (row) => normalizedEmail(row.email) === normalizedEmail(source.email),
        ) ||
        snapshot.users.some((row) => normalizedEmail(row.email) === normalizedEmail(source.email));
      error = elsewhere ? 'cross_scope_reference' : 'missing_dependency';
    } else if (!manifestRoles.has(roleKey) && dependencyState(roles.get(roleKey)) !== 'resolved') {
      const elsewhere =
        manifest.roles.some(
          (row) => normalizedRbac(row.slug) === normalizedRbac(source.role_slug),
        ) ||
        snapshot.roles.some((row) => normalizedRbac(row.slug) === normalizedRbac(source.role_slug));
      error = elsewhere ? 'cross_scope_reference' : 'missing_dependency';
    }
    if (error !== null) addError(accumulator, 'user_role_assignments', naturalKey, error);
    else
      addItem(
        accumulator,
        'user_role_assignments',
        userRoleEdges.has(
          key(orgKey, normalizedEmail(source.email), appKey, normalizedRbac(source.role_slug)),
        )
          ? 'skipped'
          : 'created',
        naturalKey,
      );
  }

  const claimValues = groupByKey(snapshot.userClaimValues, (row) =>
    key(
      normalizedSlug(row.organization_slug),
      normalizedEmail(row.email),
      normalizedSlug(row.application_slug),
      row.claim_name,
    ),
  );
  for (const source of manifest.user_claim_values) {
    const naturalKey = {
      organization_slug: source.organization_slug,
      email: source.email,
      application_slug: source.application_slug,
      claim_name: source.claim_name,
    };
    const orgKey = normalizedSlug(source.organization_slug);
    const appKey = normalizedSlug(source.application_slug);
    const userKey = key(orgKey, normalizedEmail(source.email));
    const claimKey = key(appKey, source.claim_name);
    let error: PortabilityResultErrorCode | null = null;
    if (orgKey === 'porta-admin' || appKey === 'porta-admin') error = 'control_plane_record';
    else if (!manifestUsers.has(userKey) && dependencyState(users.get(userKey)) !== 'resolved')
      error = 'missing_dependency';
    else if (
      !manifestClaims.has(claimKey) &&
      dependencyState(claims.get(claimKey)) !== 'resolved'
    ) {
      const elsewhere =
        manifest.claim_definitions.some((row) => row.claim_name === source.claim_name) ||
        snapshot.claimDefinitions.some((row) => row.claim_name === source.claim_name);
      error = elsewhere ? 'cross_scope_reference' : 'missing_dependency';
    }
    const claimType =
      manifest.claim_definitions.find(
        (definition) =>
          normalizedSlug(definition.application_slug) === appKey &&
          definition.claim_name === source.claim_name,
      )?.claim_type ?? claims.get(claimKey)?.[0]?.claim_type;
    if (
      error === null &&
      (claimType === undefined || !validateClaimValue(claimType, source.value).valid)
    ) {
      error = 'invalid_record';
    }
    if (error !== null) addError(accumulator, 'user_claim_values', naturalKey, error);
    else {
      const matches = claimValues.get(
        key(orgKey, normalizedEmail(source.email), appKey, source.claim_name),
      );
      if ((matches?.length ?? 0) > 1) {
        addError(accumulator, 'user_claim_values', naturalKey, 'ambiguous_dependency');
        continue;
      }
      const destination = matches?.[0];
      addItem(
        accumulator,
        'user_claim_values',
        recordAction(
          mode,
          destination !== undefined,
          destination !== undefined && sameValue(source.value, destination.value),
        ),
        naturalKey,
      );
    }
  }

  for (const source of manifest.clients) {
    const naturalKey = { client_id: source.client_id };
    const orgKey = normalizedSlug(source.organization_slug);
    const appKey = normalizedSlug(source.application_slug);
    if (orgKey === 'porta-admin' || appKey === 'porta-admin') {
      addError(accumulator, 'clients', naturalKey, 'control_plane_record');
      continue;
    }
    const matches = clients.get(source.client_id);
    if ((matches?.length ?? 0) > 1) {
      addError(accumulator, 'clients', naturalKey, 'ambiguous_dependency');
      continue;
    }
    const destination = matches?.[0];
    if (
      destination !== undefined &&
      (normalizedSlug(destination.organization_slug) !== orgKey ||
        normalizedSlug(destination.application_slug) !== appKey)
    ) {
      addError(accumulator, 'clients', naturalKey, 'client_id_collision');
      continue;
    }
    if (destination === undefined) {
      const orgDependency = parentError(
        manifestOrganizations.has(orgKey),
        organizations.get(orgKey),
      );
      const appDependency = parentError(manifestApplications.has(appKey), applications.get(appKey));
      if (orgDependency !== null || appDependency !== null) {
        addError(
          accumulator,
          'clients',
          naturalKey,
          orgDependency ?? appDependency ?? 'missing_dependency',
        );
        continue;
      }
    }
    if (
      destination !== undefined &&
      (destination.client_type !== source.client_type ||
        destination.application_type !== source.application_type)
    ) {
      addError(accumulator, 'clients', naturalKey, 'incompatible_record');
      continue;
    }
    addItem(
      accumulator,
      'clients',
      recordAction(
        mode,
        destination !== undefined,
        destination !== undefined && clientMutableValuesMatch(source, destination),
      ),
      naturalKey,
      destination === undefined && source.client_type === 'confidential',
    );
  }

  const result = portabilityResultSchema.parse({
    mode,
    summary: accumulator.summary,
    items: accumulator.errors.length > 0 ? [] : accumulator.items.sort(compareOutcomes),
    errors: accumulator.errors.sort(compareOutcomes),
  });
  return { manifest, snapshot, result };
}

/**
 * Build a safe preview result without changing product, credential, or audit records.
 *
 * @param manifest - Complete manifest received from an import request
 * @param mode - Import behavior represented by the plan
 * @returns Ordered safe plan result
 * @example
 * const preview = await buildPortabilityPlan(manifest, 'dry-run');
 */
export async function buildPortabilityPlan(
  manifest: PortabilityManifest,
  mode: PortabilityImportMode,
): Promise<PortabilityResult> {
  return runDatabaseTransaction(
    async () => (await buildResolvedPortabilityPlan(manifest, mode)).result,
  );
}
