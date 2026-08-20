/** Version of the independently authored packed P1 read catalog. */
export const packedP1ReadCatalogVersion = 1 as const;

/** Exact public client used by a packed read journey. */
export type PackedP1ReadClient = 'sdk' | 'cli';

/** Closed read-only surface approved for the packed P1 adjunct. */
export type PackedP1ReadSurface =
  | 'tenant-users-page'
  | 'users-page-search'
  | 'audit-filter'
  | 'signing-key-list'
  | 'tenant-session-page'
  | 'configuration-list';

/** One independently authored packed-client read requirement. */
export interface PackedP1ReadRequirement {
  /** Requirement schema version. */
  readonly schemaVersion: 1;
  /** Immutable requirement revision. */
  readonly requirementVersion: '2026-08-20';
  /** Stable journey identifier. */
  readonly id: string;
  /** Locally packed public client that must execute the read. */
  readonly client: PackedP1ReadClient;
  /** Exact read-only administrative surface. */
  readonly surface: PackedP1ReadSurface;
  /** Closed operation discriminator excluding mutations. */
  readonly operation: 'read';
  /** Deterministic administrative actor used by the journey. */
  readonly actor: 'admin-full' | 'admin-limited';
  /** Exact permission required by the public surface. */
  readonly requiredPermission: string;
  /** Human-readable public client invocation contract. */
  readonly clientInvocation: string;
  /** Independent raw HTTP request matching the client operation. */
  readonly independentRawRequest: string;
  /** Runtime fixture ownership and masking facts the result must satisfy. */
  readonly fixtureOracleRequirements: readonly string[];
  /** Exact client/raw result fields compared for equality. */
  readonly exactComparisonFields: readonly string[];
  /** Protected-state families fingerprinted before and after the read. */
  readonly stateFingerprintKeys: readonly string[];
  /** Closed sensitive or foreign output classes that must remain absent. */
  readonly forbiddenOutputClasses: readonly string[];
  /** Provenance facts required before any journey is admitted. */
  readonly provenanceRequirements: readonly string[];
  /** Cleanup facts required for the actual terminal outcome. */
  readonly cleanupRequirements: readonly string[];
  /** Explicit prohibition on claiming unavailable correlated decision logs. */
  readonly correlatedLogCredit: 'forbidden';
  /** This catalog defines the oracle but is not live evidence. */
  readonly evidenceStatus: 'specification-only';
}

const comparisonFields = [
  'ordered-item-identities',
  'page-or-filter-metadata',
  'public-field-digests',
] as const;
const stateFingerprintKeys = [
  'target-row-digests',
  'target-cardinality',
  'session-lifecycle-digests',
  'signing-key-lifecycle-digests',
  'configuration-version-digests',
] as const;
const forbiddenOutputClasses = [
  'opaque-access-or-refresh-token',
  'session-cookie-or-credential',
  'protected-configuration-value',
  'private-signing-key-material',
  'foreign-tenant-identity-or-count',
] as const;
const provenanceRequirements = [
  'package-name-exact',
  'package-version-equals-built-workspace-manifest',
  'archive-sha256-exact',
  'archive-file-dependency-exact',
  'compiled-entrypoint-loaded-from-dist',
  'resolved-content-digest-equals-locally-packed-archive',
  'registry-workspace-source-alias-and-symlink-resolution-rejected',
  'node-version-and-executable-digest-exact',
  'source-revision-exact',
  'server-image-digest-exact',
  'fixture-manifest-digest-exact',
  'primary-tree-unchanged',
] as const;
const cleanupRequirements = [
  'fresh-ignored-consumer-outside-every-workspace',
  'fresh-install-cache',
  'caller-credential-fingerprint-after-equals-before',
  'temporary-credentials-removed',
  'temporary-home-removed-when-applicable',
  'consumer-cache-evidence-and-artifact-residue-zero',
  'exactly-one-actual-terminal-outcome-recorded',
  'actual-run-owned-resources-cleaned',
] as const;

/** Compact authoring shape expanded into the complete immutable requirement contract. */
interface JourneyDefinition {
  readonly id: string;
  readonly client: PackedP1ReadClient;
  readonly surface: PackedP1ReadSurface;
  readonly actor: PackedP1ReadRequirement['actor'];
  readonly permission: string;
  readonly invocation: string;
  readonly rawRequest: string;
  readonly fixtureOracleRequirements: readonly string[];
}

const journeys: readonly JourneyDefinition[] = [
  {
    id: 'packed-sdk-tenant-users-pagination',
    client: 'sdk',
    surface: 'tenant-users-page',
    actor: 'admin-limited',
    permission: 'admin:user:read',
    invocation:
      'sdk.users.list(alphaOrgId, { cursor: alphaCursor, pageSize: 2, search: alphaMarker })',
    rawRequest:
      'GET /api/admin/organizations/{alphaOrgId}/users?cursor={alphaCursor}&pageSize=2&search={alphaMarker}',
    fixtureOracleRequirements: [
      'retained-alias:alpha-user-active',
      'all-resolved-user-organization-ids-equal-alpha',
    ],
  },
  {
    id: 'packed-cli-user-pagination-search',
    client: 'cli',
    surface: 'users-page-search',
    actor: 'admin-limited',
    permission: 'admin:user:read',
    invocation: 'porta user list --org {alphaOrgId} --page 1 --page-size 2 --search {alphaMarker}',
    rawRequest:
      'GET /api/admin/organizations/{alphaOrgId}/users?page=1&pageSize=2&search={alphaMarker}',
    fixtureOracleRequirements: [
      'retained-alias:alpha-user-active',
      'all-resolved-user-organization-ids-equal-alpha',
    ],
  },
  {
    id: 'packed-cli-audit-filtering',
    client: 'cli',
    surface: 'audit-filter',
    actor: 'admin-limited',
    permission: 'admin:audit:read',
    invocation: 'porta audit list --org {alphaOrgId} --event {syntheticEventType}',
    rawRequest: 'GET /api/admin/audit?org={alphaOrgId}&event={syntheticEventType}',
    fixtureOracleRequirements: [
      'runtime-resolved-seeded-audit-event-identities',
      'all-resolved-audit-organization-ids-equal-alpha',
    ],
  },
  {
    id: 'packed-sdk-signing-key-list',
    client: 'sdk',
    surface: 'signing-key-list',
    actor: 'admin-limited',
    permission: 'admin:key:read',
    invocation: 'sdk.keys.list()',
    rawRequest: 'GET /api/admin/keys',
    fixtureOracleRequirements: [
      'runtime-resolved-public-signing-key-identities',
      'private-signing-key-fields-absent',
    ],
  },
  {
    id: 'packed-sdk-filtered-session-pagination',
    client: 'sdk',
    surface: 'tenant-session-page',
    actor: 'admin-limited',
    permission: 'admin:session:read',
    invocation: 'sdk.sessions.list({ userId: alphaUserId, page: 1, pageSize: 2 })',
    rawRequest: 'GET /api/admin/sessions?userId={alphaUserId}&page=1&pageSize=2',
    fixtureOracleRequirements: [
      'retained-alias:alpha-user-active',
      'all-resolved-session-user-ids-equal-alpha-user-active',
    ],
  },
  {
    id: 'packed-cli-configuration-list',
    client: 'cli',
    surface: 'configuration-list',
    actor: 'admin-limited',
    permission: 'admin:config:read',
    invocation: 'porta config list',
    rawRequest: 'GET /api/admin/config',
    fixtureOracleRequirements: [
      'runtime-resolved-configuration-key-identities',
      'all-sensitive-configuration-values-masked',
    ],
  },
];

/** Exact six-journey read-only packed SDK and CLI matrix. */
export const packedP1ReadRequirements: readonly PackedP1ReadRequirement[] = journeys.map(
  (journey) => ({
    schemaVersion: 1,
    requirementVersion: '2026-08-20',
    id: journey.id,
    client: journey.client,
    surface: journey.surface,
    operation: 'read',
    actor: journey.actor,
    requiredPermission: journey.permission,
    clientInvocation: journey.invocation,
    independentRawRequest: journey.rawRequest,
    fixtureOracleRequirements: journey.fixtureOracleRequirements,
    exactComparisonFields: comparisonFields,
    stateFingerprintKeys,
    forbiddenOutputClasses,
    provenanceRequirements,
    cleanupRequirements,
    correlatedLogCredit: 'forbidden',
    evidenceStatus: 'specification-only',
  }),
);
