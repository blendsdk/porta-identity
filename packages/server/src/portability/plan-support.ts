/** Small deterministic helpers shared by portability planning steps. */

import type { ImportClientRow, ImportOrganizationRow, ImportUserRow } from './import-repository.js';
import type {
  PortabilityAction,
  PortabilityActionCounts,
  PortabilityEntityType,
  PortabilityImportMode,
  PortabilityManifest,
  PortabilityNaturalKey,
  PortabilityResultError,
  PortabilityResultErrorCode,
  PortabilityResultItem,
} from './types.js';

/** Entity groups in their required parent-before-child order. */
export const entityOrder: readonly PortabilityEntityType[] = [
  'organizations',
  'applications',
  'application_modules',
  'roles',
  'permissions',
  'claim_definitions',
  'role_permission_mappings',
  'users',
  'user_role_assignments',
  'user_claim_values',
  'clients',
];

/** Mutable accumulator used only while assembling a safe result. */
export interface PlanAccumulator {
  readonly items: PortabilityResultItem[];
  readonly errors: PortabilityResultError[];
  readonly summary: Record<PortabilityEntityType, PortabilityActionCounts>;
}

/** @returns Zeroed action counts for every fixed entity group. */
export function emptySummary(): Record<PortabilityEntityType, PortabilityActionCounts> {
  return Object.fromEntries(
    entityOrder.map((entityType) => [
      entityType,
      { created: 0, updated: 0, skipped: 0, rejected: 0 },
    ]),
  ) as Record<PortabilityEntityType, PortabilityActionCounts>;
}

/**
 * @param parts - Normalized natural-key components
 * @returns Components joined with an unambiguous internal separator
 */
export function key(...parts: readonly string[]): string {
  return parts.join('\u001f');
}

/**
 * @param value - Stored or validated slug
 * @returns Lowercase trimmed slug used only for matching
 */
export function normalizedSlug(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * @param value - External RBAC claim value
 * @returns Trimmed value with case and inner content preserved
 */
export function normalizedRbac(value: string): string {
  return value.trim();
}

/**
 * @param value - User email identity
 * @returns Trimmed lowercase identity used for matching
 */
export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * @param left - First normalized portable value
 * @param right - Second normalized portable value
 * @returns Whether both values serialize identically
 */
export function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * @param rows - Destination or manifest records
 * @param selectKey - Normalized key selector
 * @returns Every row grouped without discarding ambiguous matches
 */
export function groupByKey<Row>(
  rows: readonly Row[],
  selectKey: (row: Row) => string,
): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const rowKey = selectKey(row);
    grouped.set(rowKey, [...(grouped.get(rowKey) ?? []), row]);
  }
  return grouped;
}

/**
 * @param matches - Destination rows sharing a normalized key
 * @returns Fixed cardinality state used by dependency validation
 */
export function dependencyState<Row>(
  matches: readonly Row[] | undefined,
): 'resolved' | 'missing' | 'ambiguous' {
  if (matches === undefined || matches.length === 0) return 'missing';
  return matches.length === 1 ? 'resolved' : 'ambiguous';
}

/**
 * Add an action and increment its group count.
 *
 * @param accumulator - Result being assembled
 * @param entityType - Manifest collection
 * @param action - Planned action
 * @param naturalKey - Safe public identity
 * @param credentialWillBeGenerated - Whether a new confidential client needs one secret
 */
export function addItem(
  accumulator: PlanAccumulator,
  entityType: PortabilityEntityType,
  action: PortabilityAction,
  naturalKey: PortabilityNaturalKey,
  credentialWillBeGenerated = false,
): void {
  accumulator.summary[entityType] = {
    ...accumulator.summary[entityType],
    [action]: accumulator.summary[entityType][action] + 1,
  };
  accumulator.items.push({
    entity_type: entityType,
    action,
    natural_key: naturalKey,
    ...(credentialWillBeGenerated ? { credential_will_be_generated: true } : {}),
  });
}

/**
 * Add one bounded public error while retaining the complete rejected count.
 *
 * @param accumulator - Result being assembled
 * @param entityType - Rejected manifest collection
 * @param naturalKey - Safe public identity
 * @param code - Fixed non-reflective rejection code
 */
export function addError(
  accumulator: PlanAccumulator,
  entityType: PortabilityEntityType,
  naturalKey: PortabilityNaturalKey,
  code: PortabilityResultErrorCode,
): void {
  accumulator.summary[entityType] = {
    ...accumulator.summary[entityType],
    rejected: accumulator.summary[entityType].rejected + 1,
  };
  if (accumulator.errors.length < 100)
    accumulator.errors.push({ entity_type: entityType, natural_key: naturalKey, code });
}

/**
 * @param mode - Preview or apply behavior
 * @param exists - Whether one compatible destination record exists
 * @param mutableValuesMatch - Whether all portable mutable values already match
 * @returns Create, update, or skip action
 */
export function recordAction(
  mode: PortabilityImportMode,
  exists: boolean,
  mutableValuesMatch: boolean,
): PortabilityAction {
  if (!exists) return 'created';
  if (mode === 'keep-existing' || mutableValuesMatch) return 'skipped';
  return 'updated';
}

/**
 * @param left - First safe result outcome
 * @param right - Second safe result outcome
 * @returns Stable dependency-order comparison
 */
export function compareOutcomes(
  left: Pick<PortabilityResultItem, 'entity_type' | 'natural_key'>,
  right: Pick<PortabilityResultItem, 'entity_type' | 'natural_key'>,
): number {
  const groupOrder = entityOrder.indexOf(left.entity_type) - entityOrder.indexOf(right.entity_type);
  if (groupOrder !== 0) return groupOrder;
  const leftKey = Object.values(left.natural_key).join('\u001f');
  const rightKey = Object.values(right.natural_key).join('\u001f');
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

/** Return public natural keys for all manifest collections. */
function manifestNaturalKeys(
  manifest: PortabilityManifest,
): Record<PortabilityEntityType, readonly PortabilityNaturalKey[]> {
  return {
    organizations: manifest.organizations.map(({ slug }) => ({ slug })),
    applications: manifest.applications.map(({ slug }) => ({ slug })),
    application_modules: manifest.application_modules.map(({ application_slug, slug }) => ({
      application_slug,
      slug,
    })),
    roles: manifest.roles.map(({ application_slug, slug }) => ({ application_slug, slug })),
    permissions: manifest.permissions.map(({ application_slug, slug }) => ({
      application_slug,
      slug,
    })),
    claim_definitions: manifest.claim_definitions.map(({ application_slug, claim_name }) => ({
      application_slug,
      claim_name,
    })),
    role_permission_mappings: manifest.role_permission_mappings.map(
      ({ application_slug, role_slug }) => ({ application_slug, role_slug }),
    ),
    users: manifest.users.map(({ organization_slug, email }) => ({ organization_slug, email })),
    user_role_assignments: manifest.user_role_assignments.map(
      ({ organization_slug, email, application_slug, role_slug }) => ({
        organization_slug,
        email,
        application_slug,
        role_slug,
      }),
    ),
    user_claim_values: manifest.user_claim_values.map(
      ({ organization_slug, email, application_slug, claim_name }) => ({
        organization_slug,
        email,
        application_slug,
        claim_name,
      }),
    ),
    clients: manifest.clients.map(({ client_id }) => ({ client_id })),
  };
}

/**
 * @param manifest - Strict normalized manifest
 * @param accumulator - Result being assembled
 * @returns Whether at least one duplicate was rejected
 */
export function rejectDuplicates(
  manifest: PortabilityManifest,
  accumulator: PlanAccumulator,
): boolean {
  let foundDuplicate = false;
  const keysByType = manifestNaturalKeys(manifest);
  for (const entityType of entityOrder) {
    const grouped = groupByKey(keysByType[entityType], (naturalKey) =>
      Object.values(naturalKey).join('\u001f'),
    );
    for (const matches of grouped.values()) {
      if (matches.length < 2) continue;
      foundDuplicate = true;
      for (const naturalKey of matches)
        addError(accumulator, entityType, naturalKey, 'duplicate_natural_key');
    }
  }
  return foundDuplicate;
}

/**
 * @param source - Portable organization fields
 * @param destination - Existing destination organization
 * @param destinationAssets - Existing validated image bytes by branding slot
 * @returns Whether every mutable organization field and asset matches
 */
export function organizationMatches(
  source: PortabilityManifest['organizations'][number],
  destination: ImportOrganizationRow,
  destinationAssets: ReadonlyMap<
    'logo' | 'favicon',
    { readonly content_type: string; readonly data: Buffer }
  >,
): boolean {
  const logo = destinationAssets.get('logo');
  const favicon = destinationAssets.get('favicon');
  const logoMatches =
    source.branding.logo_asset === null
      ? logo === undefined
      : logo?.content_type === source.branding.logo_asset.media_type &&
        logo.data.toString('base64') === source.branding.logo_asset.content_base64;
  const faviconMatches =
    source.branding.favicon_asset === null
      ? favicon === undefined
      : favicon?.content_type === source.branding.favicon_asset.media_type &&
        favicon.data.toString('base64') === source.branding.favicon_asset.content_base64;
  return (
    source.name === destination.name &&
    source.status === destination.status &&
    source.default_locale === destination.default_locale &&
    sameValue(source.default_login_methods, destination.default_login_methods) &&
    source.two_factor_policy === destination.two_factor_policy &&
    source.branding.logo_url === destination.branding_logo_url &&
    source.branding.favicon_url === destination.branding_favicon_url &&
    source.branding.primary_color === destination.branding_primary_color &&
    source.branding.company_name === destination.branding_company_name &&
    source.branding.custom_css === destination.branding_custom_css &&
    logoMatches &&
    faviconMatches
  );
}

/**
 * @param source - Portable user profile
 * @param destination - Existing destination user
 * @returns Whether portable fields match while ignoring authentication and lock state
 */
export function userMatches(
  source: PortabilityManifest['users'][number],
  destination: ImportUserRow,
): boolean {
  const { id: _id, organization_id: _organizationId, ...portableDestination } = destination;
  return sameValue(source, { ...portableDestination, email: normalizedEmail(destination.email) });
}

/**
 * @param source - Portable OIDC client
 * @param destination - Existing destination client
 * @returns Whether every mutable protocol and lifecycle field matches
 */
export function clientMutableValuesMatch(
  source: PortabilityManifest['clients'][number],
  destination: ImportClientRow,
): boolean {
  return (
    source.name === destination.name &&
    source.status === destination.status &&
    sameValue(source.grant_types, destination.grant_types) &&
    sameValue(source.response_types, destination.response_types) &&
    source.scope === destination.scope &&
    sameValue(source.login_methods, destination.login_methods) &&
    source.token_endpoint_auth_method === destination.token_endpoint_auth_method &&
    sameValue(source.redirect_uris, destination.redirect_uris) &&
    sameValue(source.post_logout_redirect_uris, destination.post_logout_redirect_uris) &&
    sameValue(source.allowed_origins, destination.allowed_origins) &&
    source.require_pkce === destination.require_pkce
  );
}

/**
 * @param manifestHasParent - Whether the manifest creates or matches the parent itself
 * @param matches - Destination rows sharing the normalized parent key
 * @returns Fixed safe error, or null when the parent resolves
 */
export function parentError<Row>(
  manifestHasParent: boolean,
  matches: readonly Row[] | undefined,
): PortabilityResultErrorCode | null {
  if (manifestHasParent) return null;
  const state = dependencyState(matches);
  if (state === 'resolved') return null;
  return state === 'ambiguous' ? 'ambiguous_dependency' : 'missing_dependency';
}
