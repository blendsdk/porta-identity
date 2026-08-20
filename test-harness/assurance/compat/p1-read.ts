import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { z } from 'zod';

import type { PreparedPackedConsumer, PackedSurfaceResult } from './model.js';
import type { PackedCliSdkResolution } from './resolution.js';

/** Public client used by one supported packed P1 read. */
export type PackedP1ReadClient = 'sdk' | 'cli';

/** Closed read-only operation supported by the packed P1 adjunct. */
export type PackedP1ReadSurface =
  | 'tenant-users-page'
  | 'users-page-search'
  | 'audit-filter'
  | 'signing-key-list'
  | 'tenant-session-page'
  | 'configuration-list';

/** Exact executable requirement for one packed P1 read. */
export interface PackedP1ReadJourneyRequirement {
  /** Stable identifier bound to the immutable journey catalog. */
  readonly id: string;
  /** Locally packed public client that executes the read. */
  readonly client: PackedP1ReadClient;
  /** Public administrative read surface selected by the journey. */
  readonly surface: PackedP1ReadSurface;
}

/** Sanitized result shared by the packed client and independent raw observer. */
export interface PackedP1ReadResult {
  /** Public outcome classified from the actual response. */
  readonly result: 'allowed' | 'forbidden' | 'not-found' | 'unexpected-error';
  /** Actual HTTP status represented by the observation. */
  readonly status: number;
  /** Stable ordered identifiers returned by the selected page or filter. */
  readonly orderedItemIdentities: readonly string[];
  /** SHA-256 digest of pagination and filter metadata. */
  readonly pageOrFilterMetadataDigest: string;
  /** SHA-256 digest of the bounded public fields. */
  readonly publicFieldDigest: string;
}

/** One fully observed packed P1 read. */
export interface PackedP1ReadJourneyEvidence {
  /** Stable requirement executed by this journey. */
  readonly requirementId: string;
  /** Public client that produced the client-side result. */
  readonly client: PackedP1ReadClient;
  /** Result observed through the locally packed public client. */
  readonly clientResult: PackedP1ReadResult;
  /** Result observed independently through raw HTTP. */
  readonly independentRawResult: PackedP1ReadResult;
  /** Whether every returned identity satisfies the fixture-owned oracle. */
  readonly fixtureOracleSatisfied: boolean;
  /** Independently resolved identities expected in the client result. */
  readonly fixtureResolvedIdentities: readonly string[];
  /** Protected-state fingerprints captured before the read. */
  readonly stateFingerprintsBefore: Readonly<Record<string, string>>;
  /** Protected-state fingerprints captured after the read. */
  readonly stateFingerprintsAfter: Readonly<Record<string, string>>;
  /** Closed forbidden-output classes and whether each was observed. */
  readonly forbiddenOutputObserved: Readonly<Record<string, boolean>>;
  /** CLI-only temporary-home and caller-credential isolation facts. */
  readonly cliIsolation?: {
    /** Exact owner-only mode of the temporary home. */
    readonly temporaryHomeMode: number;
    /** Whether the temporary home was absent after execution. */
    readonly temporaryHomeRemoved: boolean;
    /** Whether the caller's real credential fingerprint stayed unchanged. */
    readonly callerCredentialFingerprintUnchanged: boolean;
  };
}

/** Driver that keeps packed-client output separate from every independent oracle. */
export interface PackedP1ReadJourneyDriver {
  /** Captures all protected-state fingerprints before or after one read. */
  observeState(): Promise<Readonly<Record<string, string>>>;
  /** Executes the exact read through the locally packed SDK or CLI. */
  executeClient(requirement: PackedP1ReadJourneyRequirement): Promise<{
    /** Sanitized result derived from the packed client response. */
    readonly result: PackedP1ReadResult;
    /** Bounded transient output scanned before it is discarded. */
    readonly boundedOutput: string;
    /** CLI-only credential-isolation facts. */
    readonly cliIsolation?: PackedP1ReadJourneyEvidence['cliIsolation'];
  }>;
  /** Repeats the same read independently through raw HTTP. */
  executeIndependentRaw(requirement: PackedP1ReadJourneyRequirement): Promise<PackedP1ReadResult>;
  /** Resolves the selected result identities against deterministic fixture state. */
  verifyFixtureIdentities(
    requirement: PackedP1ReadJourneyRequirement,
    identities: readonly string[],
  ): Promise<{ readonly satisfied: boolean; readonly resolvedIdentities: readonly string[] }>;
  /** Scans bounded client output without retaining protected values in evidence. */
  scanForbiddenOutput(boundedOutput: string): Promise<Readonly<Record<string, boolean>>>;
}

/** Complete protected-state fingerprint vocabulary shared by every journey. */
const stateKeys = [
  'target-row-digests',
  'target-cardinality',
  'session-lifecycle-digests',
  'signing-key-lifecycle-digests',
  'configuration-version-digests',
] as const;
/** Complete forbidden-output vocabulary scanned before transient output is discarded. */
const forbiddenOutputKeys = [
  'opaque-access-or-refresh-token',
  'session-cookie-or-credential',
  'protected-configuration-value',
  'private-signing-key-material',
  'foreign-tenant-identity-or-count',
] as const;

/** Frozen six-journey matrix used by the live runner and checked by immutable specifications. */
export const packedP1ReadJourneyRequirements: readonly PackedP1ReadJourneyRequirement[] =
  Object.freeze([
    { id: 'packed-sdk-tenant-users-pagination', client: 'sdk', surface: 'tenant-users-page' },
    { id: 'packed-cli-user-pagination-search', client: 'cli', surface: 'users-page-search' },
    { id: 'packed-cli-audit-filtering', client: 'cli', surface: 'audit-filter' },
    { id: 'packed-sdk-signing-key-list', client: 'sdk', surface: 'signing-key-list' },
    {
      id: 'packed-sdk-filtered-session-pagination',
      client: 'sdk',
      surface: 'tenant-session-page',
    },
    { id: 'packed-cli-configuration-list', client: 'cli', surface: 'configuration-list' },
  ]);

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const bareDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const resultSchema = z
  .object({
    result: z.enum(['allowed', 'forbidden', 'not-found', 'unexpected-error']),
    status: z.number().int(),
    orderedItemIdentities: z.array(z.string().min(1)),
    pageOrFilterMetadataDigest: digestSchema,
    publicFieldDigest: digestSchema,
  })
  .strict();
const stateSchema = z
  .object(Object.fromEntries(stateKeys.map((key) => [key, z.string().min(1)])))
  .strict();
const forbiddenOutputSchema = z
  .object(Object.fromEntries(forbiddenOutputKeys.map((key) => [key, z.boolean()])))
  .strict();
const cliIsolationSchema = z
  .object({
    temporaryHomeMode: z.number().int(),
    temporaryHomeRemoved: z.boolean(),
    callerCredentialFingerprintUnchanged: z.boolean(),
  })
  .strict();
const journeySchema = z
  .object({
    requirementId: z.string().min(1),
    client: z.enum(['sdk', 'cli']),
    clientResult: resultSchema,
    independentRawResult: resultSchema,
    fixtureOracleSatisfied: z.boolean(),
    fixtureResolvedIdentities: z.array(z.string().min(1)),
    stateFingerprintsBefore: stateSchema,
    stateFingerprintsAfter: stateSchema,
    forbiddenOutputObserved: forbiddenOutputSchema,
    cliIsolation: cliIsolationSchema.optional(),
  })
  .strict();
const evidenceSchema = z
  .object({
    version: z.literal(1),
    provenance: z
      .object({
        nodeVersion: z.string().regex(/^v22\./u),
        nodeExecutableSha256: bareDigestSchema,
        sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
        serverImageDigest: digestSchema,
        fixtureManifestDigest: digestSchema,
        packageNames: z.array(z.enum(['@portaidentity/sdk', '@portaidentity/cli'])),
        packageVersions: z.record(z.string(), z.string().min(1)),
        archiveSha256: z.record(z.string(), bareDigestSchema),
        dependencySpecifiers: z.record(z.string(), z.string().min(1)),
        compiledEntrypoints: z.array(z.string().min(1)),
        resolvedContentDigestsMatchArchives: z.boolean(),
        prohibitedResolutionObserved: z.boolean(),
        primaryTreeUnchanged: z.boolean(),
      })
      .strict(),
    journeys: z.array(journeySchema),
    cleanup: z
      .object({
        terminalOutcome: z.enum(['success', 'failure', 'timeout', 'sigint', 'sigterm']),
        callerCredentialFingerprintUnchanged: z.boolean(),
        temporaryCredentialsRemoved: z.boolean(),
        temporaryHomesRemoved: z.boolean(),
        consumerRemoved: z.boolean(),
        cacheRemoved: z.boolean(),
        evidenceSecretsRemoved: z.boolean(),
        residuePaths: z.array(z.string().min(1)),
      })
      .strict(),
    correlatedLogEvidenceCollected: z.boolean(),
  })
  .strict();

/** Validates provenance, independent equivalence, nonmutation, redaction, and cleanup. */
export function validatePackedP1ReadEvidence(value: unknown): z.infer<typeof evidenceSchema> {
  const evidence = evidenceSchema.parse(value);
  const expectedPackages = ['@portaidentity/sdk', '@portaidentity/cli'];
  if (JSON.stringify(evidence.provenance.packageNames) !== JSON.stringify(expectedPackages)) {
    throw new Error('packed P1 package identity differs from the exact local pair');
  }
  for (const field of ['packageVersions', 'archiveSha256', 'dependencySpecifiers'] as const) {
    if (
      JSON.stringify(Object.keys(evidence.provenance[field]).sort()) !==
      JSON.stringify([...expectedPackages].sort())
    ) {
      throw new Error('packed P1 package provenance is incomplete');
    }
  }
  if (
    evidence.provenance.compiledEntrypoints.some((path) => !path.includes('/dist/')) ||
    !evidence.provenance.resolvedContentDigestsMatchArchives ||
    evidence.provenance.prohibitedResolutionObserved ||
    !evidence.provenance.primaryTreeUnchanged
  ) {
    throw new Error('packed P1 package resolution is not admitted');
  }
  if (evidence.journeys.length !== packedP1ReadJourneyRequirements.length) {
    throw new Error('packed P1 journey matrix is incomplete');
  }
  for (const requirement of packedP1ReadJourneyRequirements) {
    const matches = evidence.journeys.filter((entry) => entry.requirementId === requirement.id);
    if (matches.length !== 1 || matches[0]?.client !== requirement.client) {
      throw new Error('packed P1 journey identity is not unique');
    }
    validateJourney(matches[0], requirement);
  }
  if (
    evidence.cleanup.terminalOutcome !== 'success' ||
    !evidence.cleanup.callerCredentialFingerprintUnchanged ||
    !evidence.cleanup.temporaryCredentialsRemoved ||
    !evidence.cleanup.temporaryHomesRemoved ||
    !evidence.cleanup.consumerRemoved ||
    !evidence.cleanup.cacheRemoved ||
    !evidence.cleanup.evidenceSecretsRemoved ||
    evidence.cleanup.residuePaths.length !== 0
  ) {
    throw new Error('packed P1 cleanup residue or incomplete cleanup was observed');
  }
  if (evidence.correlatedLogEvidenceCollected) {
    throw new Error('packed P1 evidence cannot claim correlated log credit');
  }
  return evidence;
}

/** Validates one packed read against its independent result and protected state. */
function validateJourney(
  journey: z.infer<typeof journeySchema>,
  requirement: PackedP1ReadJourneyRequirement,
): void {
  if (JSON.stringify(journey.clientResult) !== JSON.stringify(journey.independentRawResult)) {
    throw new Error('packed P1 client result differs from independent raw observation');
  }
  if (
    !journey.fixtureOracleSatisfied ||
    JSON.stringify(journey.clientResult.orderedItemIdentities) !==
      JSON.stringify(journey.fixtureResolvedIdentities)
  ) {
    throw new Error('packed P1 fixture identity oracle failed');
  }
  if (
    JSON.stringify(journey.stateFingerprintsBefore) !==
    JSON.stringify(journey.stateFingerprintsAfter)
  ) {
    throw new Error('packed P1 protected state changed during a read');
  }
  if (
    Object.values(journey.stateFingerprintsBefore).some(
      (value) => !digestSchema.safeParse(value).success,
    )
  ) {
    throw new Error('packed P1 state fingerprint is invalid');
  }
  if (Object.values(journey.forbiddenOutputObserved).some(Boolean)) {
    throw new Error('packed P1 forbidden output was observed');
  }
  if (requirement.client === 'cli') {
    if (
      journey.cliIsolation === undefined ||
      journey.cliIsolation.temporaryHomeMode !== 0o700 ||
      !journey.cliIsolation.temporaryHomeRemoved ||
      !journey.cliIsolation.callerCredentialFingerprintUnchanged
    ) {
      throw new Error('packed P1 CLI isolation is incomplete');
    }
  } else if (journey.cliIsolation !== undefined) {
    throw new Error('packed P1 SDK journey cannot carry CLI isolation evidence');
  }
}

/** Collects six live journeys while preserving separate client and independent observations. */
export async function collectPackedP1ReadJourneys(
  driver: PackedP1ReadJourneyDriver,
): Promise<readonly PackedP1ReadJourneyEvidence[]> {
  const evidence: PackedP1ReadJourneyEvidence[] = [];
  for (const requirement of packedP1ReadJourneyRequirements) {
    const before = await driver.observeState();
    const client = await driver.executeClient(requirement);
    const independent = await driver.executeIndependentRaw(requirement);
    const fixture = await driver.verifyFixtureIdentities(
      requirement,
      client.result.orderedItemIdentities,
    );
    const forbidden = await driver.scanForbiddenOutput(client.boundedOutput);
    const after = await driver.observeState();
    evidence.push({
      requirementId: requirement.id,
      client: requirement.client,
      clientResult: client.result,
      independentRawResult: independent,
      fixtureOracleSatisfied: fixture.satisfied,
      fixtureResolvedIdentities: fixture.resolvedIdentities,
      stateFingerprintsBefore: before,
      stateFingerprintsAfter: after,
      forbiddenOutputObserved: forbidden,
      ...(client.cliIsolation === undefined ? {} : { cliIsolation: client.cliIsolation }),
    });
  }
  return evidence;
}

/** Derives immutable package and runtime provenance from the prepared local consumer. */
export function createPackedP1ReadProvenance(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
  resolution: PackedCliSdkResolution,
): z.infer<typeof evidenceSchema>['provenance'] {
  const sdk = consumer.archives.find((archive) => archive.name === '@portaidentity/sdk');
  const cli = consumer.archives.find((archive) => archive.name === '@portaidentity/cli');
  if (sdk === undefined || cli === undefined || consumer.archives.length !== 2) {
    throw new Error('packed P1 archives are incomplete');
  }
  if (resolution.resolvedContentSha256 !== sdk.contentSha256) {
    throw new Error('packed P1 CLI does not resolve the prepared SDK archive');
  }
  return {
    nodeVersion: consumer.triplet.nodeVersion,
    nodeExecutableSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
    sourceRevision: consumer.triplet.sourceRevision,
    serverImageDigest: consumer.triplet.serverImageDigest,
    fixtureManifestDigest: consumer.triplet.fixtureIdentity,
    packageNames: ['@portaidentity/sdk', '@portaidentity/cli'],
    packageVersions: { '@portaidentity/sdk': sdk.version, '@portaidentity/cli': cli.version },
    archiveSha256: { '@portaidentity/sdk': sdk.sha256, '@portaidentity/cli': cli.sha256 },
    dependencySpecifiers: consumer.dependencies,
    compiledEntrypoints: [...surfaces.resolvedSdkFiles, surfaces.cliBinPath],
    resolvedContentDigestsMatchArchives: true,
    prohibitedResolutionObserved: false,
    primaryTreeUnchanged: true,
  };
}
