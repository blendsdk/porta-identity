/** Stable packed administrative-data capability marker used by the specification seam. */
export const PACKED_ADMIN_DATA_CAPABILITY_MISSING = 'PACKED_ADMIN_DATA_CAPABILITY_MISSING';

/** Supported locally packed client families. */
export type PackedAdminDataClient = 'sdk' | 'cli';

/** Closed non-destructive administrative-data journeys. */
export type PackedAdminDataSurface =
  'bulk-duplicate-rejection' | 'import-dry-run' | 'export-users-json';

/** One immutable packed-client journey requirement. */
export interface PackedAdminDataRequirement {
  /** Stable journey identity. */
  readonly id: string;
  /** Locally packed client used for the request. */
  readonly client: PackedAdminDataClient;
  /** Public administrative surface under observation. */
  readonly surface: PackedAdminDataSurface;
  /** Expected public outcome. */
  readonly expectedOutcome: 'allowed' | 'rejected';
  /** Exact public status required by the journey contract. */
  readonly expectedStatus: 200 | 400;
  /** Whether the journey must leave protected state unchanged. */
  readonly requiresNonmutation: true;
}

/** Sanitized result observed through a packed client or raw HTTP. */
export interface PackedAdminDataResult {
  /** Public outcome derived from the actual response. */
  readonly outcome: 'allowed' | 'rejected' | 'unexpected-error';
  /** Actual HTTP status, or null when a client failed before receiving a response. */
  readonly status: number | null;
  /** Digest of the normalized public response. */
  readonly bodyDigest: string;
  /** Number of public result records when the response is a collection. */
  readonly recordCount: number | null;
  /** Digest of the exact public field catalog. */
  readonly publicFieldDigest: string;
}

/** One packed journey with independent response and state observations. */
export interface PackedAdminDataJourneyEvidence {
  /** Stable requirement identity. */
  readonly requirementId: string;
  /** Packed client used by the journey. */
  readonly client: PackedAdminDataClient;
  /** Result produced by the packed client. */
  readonly clientResult: PackedAdminDataResult;
  /** Result produced independently through raw HTTP. */
  readonly independentRawResult: PackedAdminDataResult;
  /** Honest journey conclusion. */
  readonly outcome: 'passed' | 'product-failure' | 'incomplete';
  /** Protected-state digest captured before the request. */
  readonly stateDigestBefore: string;
  /** Protected-state digest captured after the request. */
  readonly stateDigestAfter: string;
  /** Closed protected-output classes observed transiently. */
  readonly forbiddenOutputObserved: Readonly<Record<string, boolean>>;
  /** CLI-only credential isolation evidence. */
  readonly cliIsolation?: {
    /** Exact owner-only temporary-home mode. */
    readonly temporaryHomeMode: number;
    /** Whether the temporary home was removed. */
    readonly temporaryHomeRemoved: boolean;
    /** Whether caller credentials remained byte-identical. */
    readonly callerCredentialFingerprintUnchanged: boolean;
  };
}

/** Complete sanitized packed administrative-data evidence. */
export interface PackedAdminDataEvidence {
  /** Evidence schema version. */
  readonly version: 1;
  /** Exact local package and active-runtime provenance. */
  readonly provenance: Readonly<Record<string, unknown>>;
  /** One evidence item for each immutable journey. */
  readonly journeys: readonly PackedAdminDataJourneyEvidence[];
  /** Exact terminal cleanup facts. */
  readonly cleanup: {
    /** Actual command terminal outcome. */
    readonly terminalOutcome: 'success' | 'failure' | 'timeout' | 'sigint' | 'sigterm';
    /** Whether the caller credential file stayed unchanged. */
    readonly callerCredentialFingerprintUnchanged: boolean;
    /** Whether all temporary homes were removed. */
    readonly temporaryHomesRemoved: boolean;
    /** Whether the packed consumer and cache were removed. */
    readonly consumerRemoved: boolean;
    /** Sanitized residue classes. */
    readonly residuePaths: readonly string[];
  };
}

/** Stable validator seam implemented by the packed compatibility runtime. */
export interface PackedAdminDataCapability {
  /** Whether production-backed validation is connected. */
  readonly available: boolean;
  /** Validates complete evidence without manufacturing observations. */
  validate(value: unknown): PackedAdminDataEvidence;
}
