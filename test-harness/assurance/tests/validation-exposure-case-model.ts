/** Version of the independently authored validation and exposure catalog. */
export const validationExposureCatalogVersion = 1 as const;

/** Stable requirement revision shared by every case and profile. */
export const validationExposureRequirementVersion = '2026-08-20' as const;

/** Immutable specification sentinels owned by the validation and exposure slice. */
export type ValidationExposureSentinelId = 'ST-52' | 'ST-53' | 'ST-54' | 'ST-55' | 'ST-56';

/** Approved assurance claim associated with the validation and exposure slice. */
export type ValidationExposureClaimId = 'CLAIM-R5-02' | 'CLAIM-R5-08' | 'CLAIM-R5-10';

/** Harness profile in which a requirement can produce evidence. */
export type ValidationExposureExecutionProfile = 'operational' | 'production-security';

/** Closed semantic families represented by the immutable raw-input catalog. */
export type ValidationExposureFamily =
  | 'sql-injection'
  | 'header-crlf'
  | 'xss-template'
  | 'prototype-pollution'
  | 'command-injection'
  | 'path-traversal'
  | 'redirect-manipulation'
  | 'slug-tenant-substitution'
  | 'forwarded-host'
  | 'forwarded-proto'
  | 'forwarded-client-ip'
  | 'unsupported-method'
  | 'malformed-json'
  | 'oversized-input'
  | 'encoding-casing'
  | 'cors-policy'
  | 'https-cookie-security-headers'
  | 'database-error-exposure'
  | 'cache-error-exposure'
  | 'mail-error-exposure';

/** Public result classes broad enough for a later live adapter to report defects truthfully. */
export type ValidationExposureResult =
  | 'accepted-control'
  | 'accepted-generic-response'
  | 'validation-rejected'
  | 'not-found'
  | 'method-not-allowed'
  | 'payload-too-large'
  | 'cors-denied'
  | 'dependency-unavailable'
  | 'unexpected-success'
  | 'unexpected-error';

/** One version-qualified authority selected before Porta behavior is observed. */
export interface ValidationExposureReference {
  readonly id: string;
  readonly authority: 'RD-05' | 'test-assurance testing strategy' | 'OWASP ASVS';
  readonly version: string;
  readonly sectionOrControl: string;
}

/** Raw request material that must bypass normalizing SDK and browser clients. */
export interface RawRequestRequirement {
  readonly transport: 'raw-http';
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly bodyByteLength?: number | 'configured-limit-plus-one';
  readonly clientNormalization: 'forbidden';
}

/** Successful request proving that the varied handler is reachable before a negative probe. */
export interface ValidationExposureControl {
  readonly id: string;
  readonly request: RawRequestRequirement;
  readonly proxyTrust: 'not-applicable' | 'trusted' | 'untrusted';
  readonly expectedResult: 'accepted-control';
  readonly expectedStatus: number;
  readonly requiredObservations: readonly string[];
}

/** Exact externally visible rejection required for one negative probe. */
export interface ValidationExposureExpectedOutcome {
  readonly result: ValidationExposureResult;
  readonly status: number;
  readonly bodyContract: string;
  readonly headerContract: readonly string[];
}

/** Complete immutable raw probe derived from the approved requirement oracle. */
export interface ValidationExposureRawCase {
  readonly schemaVersion: 1;
  readonly requirementVersion: typeof validationExposureRequirementVersion;
  readonly id: string;
  readonly sentinelId: ValidationExposureSentinelId;
  readonly claimIds: readonly ValidationExposureClaimId[];
  readonly family: ValidationExposureFamily;
  readonly executionProfiles: readonly ValidationExposureExecutionProfile[];
  readonly proxyTrust: 'not-applicable' | 'trusted' | 'untrusted';
  readonly harnessArrangement:
    | 'none'
    | 'real-oidc-interaction'
    | 'owned-database-unavailable'
    | 'owned-cache-unavailable'
    | 'owned-mail-unavailable-with-acquired-csrf-browser';
  readonly actor: string;
  readonly asset: string;
  readonly entryPoint: string;
  readonly trustBoundary: string;
  readonly abuseCase: string;
  readonly control: ValidationExposureControl;
  readonly request: RawRequestRequirement;
  readonly expected: ValidationExposureExpectedOutcome;
  readonly independentStateObservations: readonly string[];
  readonly prohibitedSideEffects: readonly string[];
  readonly requiredLogFields: readonly string[];
  readonly forbiddenLogFields: readonly string[];
  readonly recoveryExpectations: readonly string[];
  readonly referenceIds: readonly string[];
  readonly evidenceStatus: 'specification-only';
}

/** Complete threat profile used to reject incomplete risk-slice catalogs. */
export interface ValidationExposureSliceProfile {
  readonly schemaVersion: 1;
  readonly profileVersion: typeof validationExposureRequirementVersion;
  readonly sentinelId: ValidationExposureSentinelId;
  readonly actors: readonly string[];
  readonly assets: readonly string[];
  readonly entryPoints: readonly string[];
  readonly trustBoundaries: readonly string[];
  readonly abuseCases: readonly string[];
  readonly exactRejections: readonly string[];
  readonly prohibitedSideEffects: readonly string[];
  readonly privacySafeRequiredLogFields: readonly string[];
  readonly privacyForbiddenLogFields: readonly string[];
  readonly recoveryExpectations: readonly string[];
  readonly referenceIds: readonly string[];
}

/** Fields that must never appear in public errors, retained evidence, or security logs. */
export const validationExposureForbiddenFields = Object.freeze([
  'password',
  'client-secret',
  'session-cookie',
  'authorization-code',
  'access-token',
  'refresh-token',
  'id-token',
  'database-connection-string',
  'redis-connection-string',
  'smtp-credentials',
  'stack-trace',
  'sql-text',
  'filesystem-path',
  'infrastructure-address',
  'package-or-product-version',
]);

/** Non-sensitive fields required to correlate every rejected raw probe. */
export const validationExposureRequiredLogFields = Object.freeze([
  'synthetic-correlation-id',
  'event-class',
  'public-method',
  'public-route-class',
  'public-outcome-class',
]);
