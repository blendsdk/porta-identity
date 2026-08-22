/** Stable marker used while production-backed administrative-data observations are unavailable. */
export const ADMINISTRATIVE_DATA_CAPABILITY_MISSING = 'ADMINISTRATIVE_DATA_CAPABILITY_MISSING';

/** Closed bulk targets exposed by the administration API. */
export const BULK_ENTITY_TYPES = ['organization', 'user'] as const;

/** Closed import execution modes. */
export const IMPORT_MODES = ['merge', 'overwrite', 'dry-run'] as const;

/** Closed export entity catalog. */
export const EXPORT_ENTITY_TYPES = ['organizations', 'users', 'clients', 'roles', 'audit'] as const;

/** Bulk entity accepted by the public boundary. */
export type BulkEntityType = (typeof BULK_ENTITY_TYPES)[number];
/** Import mode accepted by the public boundary. */
export type ImportMode = (typeof IMPORT_MODES)[number];
/** Export entity accepted by the public boundary. */
export type ExportEntityType = (typeof EXPORT_ENTITY_TYPES)[number];
/** Supported export serialization. */
export type ExportFormat = 'csv' | 'json';

/** JSON scalar used by manifests and public responses. */
export type JsonPrimitive = boolean | number | string | null;
/** JSON object with string keys. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
/** Recursive JSON value accepted by the public driver. */
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

/** Immutable requirement-derived administrative data contract. */
export interface AdministrativeDataOracle {
  /** Exact behavioral areas owned by this specification. */
  readonly specificationCases: readonly [
    'bulk-validation',
    'bulk-results',
    'bulk-stop',
    'import-modes',
    'import-rejection',
    'export-scope',
    'export-bound',
    'export-safety',
  ];
  /** Whole-request and per-item bulk rules. */
  readonly bulk: {
    /** Maximum identifiers accepted in one validated request. */
    readonly maximumItems: 100;
    /** Maximum accepted reason length. */
    readonly maximumReasonCharacters: 500;
    /** Closed action catalogs for each bulk target. */
    readonly actions: {
      /** Organization status actions retained by the published API. */
      readonly organization: readonly ['activate', 'suspend', 'archive'];
      /** User status actions retained by the published API. */
      readonly user: readonly ['activate', 'deactivate', 'suspend', 'lock', 'unlock'];
    };
    /** Published ordered partial-result envelope. */
    readonly envelopeFields: readonly ['total', 'succeeded', 'failed', 'results'];
    /** Shared code which conceals whether a user exists outside the requested tenant. */
    readonly concealedItemCode: 'not_found_or_not_authorized';
    /** Code assigned to every item not reached after an infrastructure stop. */
    readonly stoppedItemCode: 'not_attempted';
  };
  /** Import validation, planning, mutation, and disclosure rules. */
  readonly import: {
    /** Only manifest version accepted by the compatibility-preserving endpoint. */
    readonly manifestVersion: '1.0';
    /** Closed import modes. */
    readonly modes: typeof IMPORT_MODES;
    /** Secret-equivalent field names rejected anywhere in a manifest. */
    readonly prohibitedFieldNames: readonly string[];
    /** Presentation and configuration fields which overwrite may change. */
    readonly mutableFields: Readonly<Record<string, readonly string[]>>;
    /** Boolean-only dry-run indication used instead of generating a credential. */
    readonly dryRunCredentialField: 'credentialWillBeGenerated';
  };
  /** Export authorization, scope, field, and serialization rules. */
  readonly export: {
    /** Closed export entity catalog. */
    readonly entities: typeof EXPORT_ENTITY_TYPES;
    /** Permission required in addition to the selected entity read permission. */
    readonly dedicatedPermission: 'admin:export:read';
    /** Entity-specific read permission paired with dedicated export authority. */
    readonly entityPermissions: Readonly<Record<ExportEntityType, string>>;
    /** Exact public fields retained by each export entity. */
    readonly fieldAllowlists: Readonly<Record<ExportEntityType, readonly string[]>>;
    /** Largest export that may be returned. */
    readonly maximumRows: 10_000;
    /** Stable code returned instead of a partial oversized export. */
    readonly overflowCode: 'export_too_large';
    /** Spreadsheet formula prefixes neutralized after optional whitespace. */
    readonly formulaPrefixes: readonly ['=', '+', '-', '@'];
    /** Raw audit properties which may never cross the export boundary. */
    readonly forbiddenAuditFields: readonly string[];
  };
}

/** Frozen oracle which prevents implementation changes from redefining the public contract. */
export const ADMINISTRATIVE_DATA_ORACLE = Object.freeze({
  specificationCases: [
    'bulk-validation',
    'bulk-results',
    'bulk-stop',
    'import-modes',
    'import-rejection',
    'export-scope',
    'export-bound',
    'export-safety',
  ],
  bulk: {
    maximumItems: 100,
    maximumReasonCharacters: 500,
    actions: {
      organization: ['activate', 'suspend', 'archive'],
      user: ['activate', 'deactivate', 'suspend', 'lock', 'unlock'],
    },
    envelopeFields: ['total', 'succeeded', 'failed', 'results'],
    concealedItemCode: 'not_found_or_not_authorized',
    stoppedItemCode: 'not_attempted',
  },
  import: {
    manifestVersion: '1.0',
    modes: IMPORT_MODES,
    prohibitedFieldNames: [
      'password',
      'password_plaintext',
      'password_hash',
      'client_secret',
      'secret_plaintext',
      'secret_hash',
      'signing_key',
      'private_key',
      'session',
      'token',
      'recovery_code',
      'totp_secret',
      'audit',
    ],
    // Published manifests admit more input fields than overwrite may safely change. This catalog
    // intentionally retains only presentation and non-authority configuration fields.
    mutableFields: {
      organization: [
        'name',
        'default_locale',
        'branding_primary_color',
        'branding_company_name',
        'branding_custom_css',
        'branding_logo_url',
        'branding_favicon_url',
      ],
      application: ['name', 'description'],
      client: ['client_name'],
      role: ['name', 'description'],
      permission: ['name', 'description'],
      claim_definition: ['name', 'description'],
      application_module: ['name', 'description'],
      user: ['given_name', 'family_name', 'locale'],
    },
    dryRunCredentialField: 'credentialWillBeGenerated',
  },
  export: {
    entities: EXPORT_ENTITY_TYPES,
    dedicatedPermission: 'admin:export:read',
    entityPermissions: {
      organizations: 'org:read',
      users: 'user:read',
      clients: 'client:read',
      roles: 'role:read',
      audit: 'audit:read',
    },
    // User columns are the exact published API list. The other public entity exports retain their
    // shipped server column catalogs, while audit replaces raw metadata with mapped safe details.
    fieldAllowlists: {
      organizations: [
        'id',
        'name',
        'slug',
        'status',
        'is_super_admin',
        'default_locale',
        'created_at',
        'updated_at',
      ],
      users: [
        'id',
        'email',
        'status',
        'given_name',
        'family_name',
        'nickname',
        'locale',
        'email_verified',
        'phone_number',
        'created_at',
        'updated_at',
        'last_login_at',
        'login_count',
      ],
      clients: [
        'id',
        'client_id',
        'client_name',
        'client_type',
        'status',
        'application_type',
        'grant_types',
        'redirect_uris',
        'created_at',
        'updated_at',
      ],
      roles: ['id', 'name', 'slug', 'description', 'created_at'],
      audit: ['id', 'event_type', 'event_category', 'actor_id', 'created_at', 'safe_details'],
    },
    maximumRows: 10_000,
    overflowCode: 'export_too_large',
    formulaPrefixes: ['=', '+', '-', '@'],
    forbiddenAuditFields: ['metadata', 'ip_address', 'user_agent', 'description', 'body', 'error'],
  },
} as const satisfies AdministrativeDataOracle);

/** Test-owned tenant, entity, and canary values used by public actions and independent observers. */
export interface AdministrativeDataFixture {
  /** Identifier of the tenant authorized by the arranged actor. */
  readonly alphaOrganizationId: string;
  /** Natural organization key authorized by the arranged actor. */
  readonly alphaOrganizationSlug: string;
  /** Existing display name used to plan a presentation-only overwrite. */
  readonly alphaOrganizationName: string;
  /** Identifier of a tenant outside the arranged actor's authority. */
  readonly bravoOrganizationId: string;
  /** Natural organization key outside the arranged actor's authority. */
  readonly bravoOrganizationSlug: string;
  /** Application inside the authorized tenant. */
  readonly alphaApplicationId: string;
  /** Natural application key inside the authorized tenant. */
  readonly alphaApplicationSlug: string;
  /** Application inside the foreign tenant. */
  readonly bravoApplicationId: string;
  /** Natural application key inside the foreign tenant. */
  readonly bravoApplicationSlug: string;
  /** Two mutable users inside the authorized tenant. */
  readonly alphaUserIds: readonly [string, string];
  /** Existing user inside the foreign tenant. */
  readonly bravoUserId: string;
  /** Valid UUID which does not identify a user. */
  readonly missingUserId: string;
  /** Existing tenant-qualified confidential-client key. */
  readonly existingClientNaturalKey: string;
  /** Missing tenant-qualified confidential-client key. */
  readonly newClientNaturalKey: string;
  /** Actor recorded by durable administrative audits. */
  readonly actorId: string;
  /** Raw infrastructure message forbidden from public output. */
  readonly dependencyErrorCanary: string;
  /** Secret-equivalent value forbidden from persistence and output. */
  readonly secretCanary: string;
  /** Private raw audit value forbidden from every retained surface. */
  readonly auditPrivateCanary: string;
  /** Values beginning with each spreadsheet formula prefix after optional whitespace. */
  readonly formulaCanaries: readonly string[];
}

/** Public bulk action result without implementation-specific error objects. */
export interface BulkActionOutcome {
  /** Whether whole-request validation admitted the request. */
  readonly accepted: boolean;
  /** Number of requested items. */
  readonly total: number;
  /** Number of independently committed items. */
  readonly succeeded: number;
  /** Number of rejected or unattempted items. */
  readonly failed: number;
  /** Ordered public item outcomes. */
  readonly results: readonly {
    /** Submitted opaque identifier. */
    readonly id: string;
    /** Closed outcome classification. */
    readonly outcome: string;
    /** Closed failure code, or null after a committed transition. */
    readonly code: string | null;
  }[];
  /** Server-created reference for an infrastructure stop. */
  readonly correlationId: string | null;
  /** Minimal whole-request error. */
  readonly publicError: string | null;
  /** Top-level response fields in serialization order. */
  readonly responseFields: readonly string[];
}

/** Planned or committed import entity reported by the public response. */
export interface ImportEntityOutcome {
  /** Closed entity category. */
  readonly entityType: string;
  /** Tenant-qualified natural key without a database-generated identifier. */
  readonly naturalKey: string;
  /** Mutable fields the planner intends or committed. */
  readonly changedFields: readonly string[];
  /** Boolean-only dry-run credential intent. */
  readonly credentialWillBeGenerated?: boolean;
  /** Real committed identifier, which must be absent from dry-run creates. */
  readonly publicIdentifier?: string;
}

/** Public import result with optional errors so success can prove their absence. */
export interface ImportActionOutcome {
  /** Whether planning and execution completed successfully. */
  readonly accepted: boolean;
  /** Created or planned-create entities. */
  readonly created: readonly ImportEntityOutcome[];
  /** Updated or planned-update entities. */
  readonly updated: readonly ImportEntityOutcome[];
  /** Intentional existing-entity skips. */
  readonly skipped: readonly ImportEntityOutcome[];
  /** Once-only credentials returned after a successful commit. */
  readonly credentials: readonly Readonly<Record<string, JsonValue>>[];
  /** Sanitized failures, absent from every successful result. */
  readonly errors?: readonly Readonly<Record<string, JsonValue>>[];
  /** Minimal public request error. */
  readonly publicError: string | null;
}

/** Public export result plus source scopes observed independently from serialized rows. */
export interface ExportActionOutcome {
  /** Whether authorization, scope, bound, and serialization checks succeeded. */
  readonly accepted: boolean;
  /** Stable public failure code, or null after success. */
  readonly code: string | null;
  /** Exported count, withheld on every rejection. */
  readonly rowCount: number | null;
  /** Parsed public rows for allowlist checks. */
  readonly rows: readonly Readonly<Record<string, JsonValue>>[];
  /** Source tenant identities observed outside the response. */
  readonly sourceOrganizationIds: readonly string[];
  /** Source application identities observed outside the response. */
  readonly sourceApplicationIds: readonly string[];
  /** Raw CSV body when CSV was requested. */
  readonly csv: string | null;
  /** RFC-parsed CSV cells from the raw body. */
  readonly csvCells: readonly string[];
  /** Whether any export content body was returned. */
  readonly responseBodyPresent: boolean;
}

/** Durable entity snapshot used to compare effects without trusting response claims. */
export interface AdministrativeEntityObservation {
  readonly entityType: string;
  readonly id: string;
  readonly naturalKey: string;
  readonly organizationId: string | null;
  readonly parentId: string | null;
  readonly fields: Readonly<Record<string, JsonValue>>;
  readonly credentialFingerprint: string | null;
}

/** Privacy-safe audit observation captured directly from durable storage. */
export interface AdministrativeAuditObservation {
  readonly eventType: string;
  readonly actorId: string;
  readonly mode: string | null;
  readonly manifestVersion: string | null;
  readonly manifestDigest: string | null;
  readonly aggregateCounts: Readonly<Record<string, number>>;
  readonly contentValues: readonly string[];
}

/** Independently observed database and side-effect state. */
export interface AdministrativeDataObservation {
  readonly entities: readonly AdministrativeEntityObservation[];
  readonly audits: readonly AdministrativeAuditObservation[];
  readonly mailDeliveries: number;
  readonly cacheMutations: number;
  readonly generatedSecrets: number;
  readonly operationalOutput: readonly string[];
}

/** Public-action driver backed by product routes and independently owned observers. */
export interface AdministrativeDataSpecDriver {
  /** Restore isolated Alpha and Bravo tenants and return their opaque fixture identifiers. */
  reset(): Promise<AdministrativeDataFixture>;
  /** Submit an untrusted bulk request through the public validation and authorization boundary. */
  submitBulk(entityType: BulkEntityType, request: JsonValue): Promise<BulkActionOutcome>;
  /** Fail the next bulk dependency access after the requested number of item commits. */
  failBulkDependencyAfter(committedItems: number): Promise<void>;
  /** Submit an untrusted manifest through the public import boundary. */
  submitImport(
    mode: ImportMode,
    manifest: JsonValue,
    scope?: { readonly organizationId: string },
  ): Promise<ImportActionOutcome>;
  /** Fail import execution when the named natural key reaches the mutation boundary. */
  failImportAt(naturalKey: string): Promise<void>;
  /** Arrange a storage-level collision which whole-manifest planning must reject. */
  arrangeImportCollision(naturalKey: string): Promise<void>;
  /** Submit an export request with explicitly arranged authority and scope. */
  submitExport(input: {
    readonly entityType: ExportEntityType;
    readonly format: ExportFormat;
    readonly permissions: readonly string[];
    readonly organizationId?: string;
    readonly applicationId?: string;
    readonly startDate?: string;
    readonly endDate?: string;
  }): Promise<ExportActionOutcome>;
  /** Arrange the exact row cardinality returned by the next export query. */
  arrangeExportRows(entityType: ExportEntityType, count: number): Promise<void>;
  /** Arrange formula canaries and private audit material in owned persistence. */
  arrangeExportSafetyCanaries(): Promise<void>;
  /** Read durable state and external effects independently from public responses. */
  observe(): Promise<AdministrativeDataObservation>;
  /** Release resources owned by the driver. */
  dispose(): Promise<void>;
}

/** Available capability admitted only when public actions and owned observers are connected. */
export interface LiveAdministrativeDataCapability {
  /** Discriminator admitting behavioral specification execution. */
  readonly available: true;
  /** Evidence boundary which excludes test-owned behavior simulations. */
  readonly evidenceBoundary: 'public-actions-and-owned-observers';
  /** Create one isolated public-action driver. */
  createDriver(): Promise<AdministrativeDataSpecDriver>;
}

/** Fail-closed capability used until a truthful product-backed driver exists. */
export interface UnavailableAdministrativeDataCapability {
  /** Discriminator preventing accidental behavioral credit. */
  readonly available: false;
  /** Stable required-mode failure marker. */
  readonly reason: typeof ADMINISTRATIVE_DATA_CAPABILITY_MISSING;
}

/** Closed capability union consumed by the immutable specification. */
export type AdministrativeDataCapability =
  LiveAdministrativeDataCapability | UnavailableAdministrativeDataCapability;
