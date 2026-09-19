/** Strict portability-manifest preview and import operations. */

import type { HttpTransport } from '../transport/types.js';
import type {
  PortabilityActionCounts,
  PortabilityEntityType,
  PortabilityImportMode,
  PortabilityManifest,
  PortabilityNaturalKey,
  PortabilityResult,
} from '../types/index.js';
import { PortaConflictError } from '../errors/index.js';
import { isRecord, unwrapData } from './helpers.js';

/** Entity discriminators accepted in the public result contract. */
const ENTITY_TYPES = [
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
] as const satisfies readonly PortabilityEntityType[];

/** Closed action and count keys shared by every result group. */
const ACTIONS = ['created', 'updated', 'skipped', 'rejected'] as const;
/** Safe rejection codes that may cross the public API boundary. */
const ERROR_CODES = [
  'invalid_record',
  'duplicate_natural_key',
  'missing_dependency',
  'ambiguous_dependency',
  'incompatible_record',
  'cross_scope_reference',
  'control_plane_record',
  'client_id_collision',
] as const;

/** Return whether an object has exactly the named own keys. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

/** Return whether a value is one closed portability entity discriminator. */
function isEntityType(value: unknown): value is PortabilityEntityType {
  return typeof value === 'string' && ENTITY_TYPES.some((candidate) => candidate === value);
}

/** Return whether a value contains one entity's exact public natural-key fields. */
function isNaturalKey(
  entityType: PortabilityEntityType,
  value: unknown,
): value is PortabilityNaturalKey {
  if (!isRecord(value)) return false;
  const expectedKeys: Readonly<Record<PortabilityEntityType, readonly string[]>> = {
    organizations: ['slug'],
    applications: ['slug'],
    application_modules: ['application_slug', 'slug'],
    roles: ['application_slug', 'slug'],
    permissions: ['application_slug', 'slug'],
    claim_definitions: ['application_slug', 'claim_name'],
    role_permission_mappings: ['application_slug', 'role_slug'],
    users: ['organization_slug', 'email'],
    user_role_assignments: ['organization_slug', 'email', 'application_slug', 'role_slug'],
    user_claim_values: ['organization_slug', 'email', 'application_slug', 'claim_name'],
    clients: ['client_id'],
  };
  return (
    hasExactKeys(value, expectedKeys[entityType]) &&
    Object.values(value).every((field) => typeof field === 'string')
  );
}

/** Return whether a value is one exact non-negative result count group. */
function isActionCounts(value: unknown): value is PortabilityActionCounts {
  return (
    isRecord(value) &&
    hasExactKeys(value, ACTIONS) &&
    ACTIONS.every((key) => Number.isInteger(value[key]) && Number(value[key]) >= 0)
  );
}

/** Validate the closed summary object shared by preview and apply results. */
function isSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ENTITY_TYPES) &&
    ENTITY_TYPES.every((entityType) => isActionCounts(value[entityType]))
  );
}

/** Validate one ordered record outcome without accepting internal fields. */
function isResultItem(value: unknown): boolean {
  if (!isRecord(value) || !isEntityType(value.entity_type)) return false;
  const keys =
    value.credential_will_be_generated === undefined
      ? ['entity_type', 'action', 'natural_key']
      : ['entity_type', 'action', 'natural_key', 'credential_will_be_generated'];
  return (
    hasExactKeys(value, keys) &&
    typeof value.action === 'string' &&
    ACTIONS.some((action) => action === value.action) &&
    isNaturalKey(value.entity_type, value.natural_key) &&
    (value.credential_will_be_generated === undefined ||
      typeof value.credential_will_be_generated === 'boolean')
  );
}

/** Validate one bounded safe rejection without accepting diagnostic details. */
function isResultError(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['entity_type', 'natural_key', 'code']) &&
    isEntityType(value.entity_type) &&
    isNaturalKey(value.entity_type, value.natural_key) &&
    typeof value.code === 'string' &&
    ERROR_CODES.some((code) => code === value.code)
  );
}

/** Validate one committed one-time confidential-client credential. */
function isCredential(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['client_id', 'label', 'secret', 'expires_at']) &&
    typeof value.client_id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.secret === 'string' &&
    typeof value.expires_at === 'string'
  );
}

/** Validate a result for the exact operation mode requested by the caller. */
function isPortabilityResult(
  value: unknown,
  mode: PortabilityImportMode,
): value is PortabilityResult {
  if (!isRecord(value) || value.mode !== mode) return false;
  const hasCredentials = Object.hasOwn(value, 'credentials');
  const expectedKeys = hasCredentials
    ? ['mode', 'summary', 'items', 'errors', 'credentials']
    : ['mode', 'summary', 'items', 'errors'];
  return (
    hasExactKeys(value, expectedKeys) &&
    isSummary(value.summary) &&
    Array.isArray(value.items) &&
    value.items.every(isResultItem) &&
    Array.isArray(value.errors) &&
    value.errors.length <= 100 &&
    value.errors.every(isResultError) &&
    (mode === 'dry-run'
      ? !hasCredentials
      : !hasCredentials ||
        (Array.isArray(value.credentials) && value.credentials.every(isCredential)))
  );
}

/** Return an exact rejected-plan result or preserve normal SDK error handling. */
function rejectedPlanResult(
  error: unknown,
  mode: PortabilityImportMode,
): PortabilityResult | undefined {
  if (!(error instanceof PortaConflictError) || !isRecord(error.body)) return undefined;
  const body = error.body;
  return hasExactKeys(body, ['error', 'code', 'result']) &&
    body.error === 'Import plan rejected' &&
    body.code === 'import_plan_rejected' &&
    isPortabilityResult(body.result, mode)
    ? body.result
    : undefined;
}

/** Send one strict import request and preserve only validated rejected plans. */
async function importManifest(
  transport: HttpTransport,
  manifest: PortabilityManifest,
  mode: PortabilityImportMode,
): Promise<PortabilityResult> {
  try {
    const response = await transport.request({
      method: 'POST',
      path: '/import',
      body: { manifest, mode },
    });
    return unwrapData<PortabilityResult>(response.body);
  } catch (error) {
    const rejected = rejectedPlanResult(error, mode);
    if (rejected) return rejected;
    throw error;
  }
}

/** Strict manifest preview and apply operations. */
export interface ImportsDomain {
  /** Build a mutation-free import plan. */
  preview(manifest: PortabilityManifest): Promise<PortabilityResult>;
  /** Apply one validated manifest using the selected existing-record policy. */
  apply(
    manifest: PortabilityManifest,
    mode: 'keep-existing' | 'update-existing',
  ): Promise<PortabilityResult>;
}

/** Create the import operations backed by one shared HTTP transport. */
export function createImportsDomain(transport: HttpTransport): ImportsDomain {
  return {
    async preview(manifest) {
      return importManifest(transport, manifest, 'dry-run');
    },
    async apply(manifest, mode) {
      return importManifest(transport, manifest, mode);
    },
  };
}
