import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

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
  readonly status: number | null;
  /** Stable ordered identifiers returned by the selected page or filter. */
  readonly orderedItemIdentities: readonly string[];
  /** Explicit total reported by the public surface, or null when that surface reports no total. */
  readonly observedTotal: number | null;
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
  /** Truthful aggregate classification; product incompatibilities remain admissible evidence. */
  readonly outcome: 'passed' | 'product-failure' | 'incomplete';
  /** Whether every returned identity satisfies the fixture-owned oracle. */
  readonly fixtureOracleSatisfied: boolean;
  /** Independently resolved identities expected in the client result. */
  readonly fixtureResolvedIdentities: readonly string[];
  /** Independently derived tenant/filter total, when the fixture can provide one. */
  readonly fixtureExpectedTotal: number | null;
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
    result: PackedP1ReadResult,
  ): Promise<{
    readonly satisfied: boolean;
    readonly resolvedIdentities: readonly string[];
    readonly expectedTotal: number | null;
  }>;
  /** Scans bounded client output without retaining protected values in evidence. */
  scanForbiddenOutput(
    requirement: PackedP1ReadJourneyRequirement,
    boundedOutput: string,
    result: PackedP1ReadResult,
    fixtureExpectedTotal: number | null,
  ): Promise<Readonly<Record<string, boolean>>>;
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
const localArchiveSpecifierSchema = z.string().regex(/^file:[A-Za-z0-9._-]+\.tgz$/u);
const compiledEntrypointSchema = z
  .string()
  .regex(/^@portaidentity\/(?:sdk|cli)\/dist\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.js$/u);
const resultSchema = z
  .object({
    result: z.enum(['allowed', 'forbidden', 'not-found', 'unexpected-error']),
    status: z.number().int().min(100).max(599).nullable(),
    orderedItemIdentities: z.array(z.string().min(1)),
    observedTotal: z.number().int().nonnegative().nullable(),
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
    outcome: z.enum(['passed', 'product-failure', 'incomplete']),
    fixtureOracleSatisfied: z.boolean(),
    fixtureResolvedIdentities: z.array(z.string().min(1)),
    fixtureExpectedTotal: z.number().int().nonnegative().nullable(),
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
        dependencySpecifiers: z.record(z.string(), localArchiveSpecifierSchema),
        compiledEntrypoints: z.array(compiledEntrypointSchema).min(2),
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
    !evidence.provenance.compiledEntrypoints.includes('@portaidentity/cli/dist/index.js') ||
    !evidence.provenance.compiledEntrypoints.some((path) =>
      path.startsWith('@portaidentity/sdk/dist/'),
    ) ||
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
  if (
    ['tenant-users-page', 'users-page-search', 'audit-filter', 'tenant-session-page'].includes(
      requirement.surface,
    ) &&
    journey.fixtureExpectedTotal === null
  ) {
    throw new Error('packed P1 tenant/filter cardinality oracle is absent');
  }
  const resultsMatch =
    JSON.stringify(journey.clientResult) === JSON.stringify(journey.independentRawResult);
  const identitiesMatch =
    JSON.stringify(journey.clientResult.orderedItemIdentities) ===
    JSON.stringify(journey.fixtureResolvedIdentities);
  const totalMatches =
    journey.fixtureExpectedTotal === null ||
    journey.clientResult.observedTotal === journey.fixtureExpectedTotal;
  const expectedOutcome =
    journey.clientResult.result === 'unexpected-error' &&
    journey.clientResult.status === null &&
    journey.independentRawResult.result === 'allowed'
      ? 'product-failure'
      : resultsMatch && journey.fixtureOracleSatisfied && identitiesMatch && totalMatches
        ? 'passed'
        : 'product-failure';
  if (journey.outcome !== expectedOutcome) {
    throw new Error('packed P1 journey outcome is not derived from independent observations');
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
    const fixture = await driver.verifyFixtureIdentities(requirement, client.result);
    const forbidden = await driver.scanForbiddenOutput(
      requirement,
      client.boundedOutput,
      client.result,
      fixture.expectedTotal,
    );
    const after = await driver.observeState();
    const resultsMatch = JSON.stringify(client.result) === JSON.stringify(independent);
    const identitiesMatch =
      JSON.stringify(client.result.orderedItemIdentities) ===
      JSON.stringify(fixture.resolvedIdentities);
    const outcome =
      client.result.result === 'unexpected-error' &&
      client.result.status === null &&
      independent.result === 'allowed'
        ? 'product-failure'
        : resultsMatch && fixture.satisfied && identitiesMatch
          ? 'passed'
          : 'product-failure';
    evidence.push({
      requirementId: requirement.id,
      client: requirement.client,
      clientResult: client.result,
      independentRawResult: independent,
      outcome,
      fixtureOracleSatisfied: fixture.satisfied,
      fixtureResolvedIdentities: fixture.resolvedIdentities,
      fixtureExpectedTotal: fixture.expectedTotal,
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
  if (!surfaces.distOnly) throw new Error('packed P1 surfaces are not compiled-only');
  const sdkEntrypoints = surfaces.resolvedSdkFiles.map((path) => {
    if (!path.startsWith('dist/')) throw new Error('packed P1 SDK entry is not compiled output');
    return `@portaidentity/sdk/${path}`;
  });
  return {
    nodeVersion: consumer.triplet.nodeVersion,
    nodeExecutableSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
    sourceRevision: consumer.triplet.sourceRevision,
    serverImageDigest: consumer.triplet.serverImageDigest,
    fixtureManifestDigest: consumer.triplet.fixtureIdentity,
    packageNames: ['@portaidentity/sdk', '@portaidentity/cli'],
    packageVersions: { '@portaidentity/sdk': sdk.version, '@portaidentity/cli': cli.version },
    archiveSha256: { '@portaidentity/sdk': sdk.sha256, '@portaidentity/cli': cli.sha256 },
    dependencySpecifiers: {
      '@portaidentity/sdk': `file:${basename(sdk.archivePath)}`,
      '@portaidentity/cli': `file:${basename(cli.archivePath)}`,
    },
    compiledEntrypoints: [...sdkEntrypoints, '@portaidentity/cli/dist/index.js'],
    resolvedContentDigestsMatchArchives: true,
    prohibitedResolutionObserved: false,
    primaryTreeUnchanged: true,
  };
}
