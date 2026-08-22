import { z } from 'zod';

import {
  packedAdminDataForbiddenOutputClasses,
  packedAdminDataRequirements,
} from '../tests/packed-admin-data-requirements.js';

import type {
  PackedAdminDataEvidence,
  PackedAdminDataJourneyEvidence,
  PackedAdminDataRequirement,
  PackedAdminDataResult,
} from '../tests/packed-admin-data-contract.js';

/** Driver that separates packed-client execution from raw and state observations. */
export interface PackedAdminDataDriver {
  /** Captures a digest of protected administrative state. */
  observeState(): Promise<string>;
  /** Executes one locally packed SDK or CLI journey. */
  executeClient(requirement: PackedAdminDataRequirement): Promise<{
    /** Sanitized result derived from the actual client response. */
    readonly result: PackedAdminDataResult;
    /** Bounded transient output scanned before deletion. */
    readonly boundedOutput: string;
    /** CLI-only isolated-home evidence. */
    readonly cliIsolation?: PackedAdminDataJourneyEvidence['cliIsolation'];
  }>;
  /** Executes the equivalent request through raw HTTP. */
  executeIndependentRaw(requirement: PackedAdminDataRequirement): Promise<PackedAdminDataResult>;
  /** Scans transient output against runtime-only protected canaries. */
  scanForbiddenOutput(boundedOutput: string): Promise<Readonly<Record<string, boolean>>>;
}

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const resultSchema = z
  .object({
    outcome: z.enum(['allowed', 'rejected', 'unexpected-error']),
    status: z.number().int().min(100).max(599).nullable(),
    bodyDigest: digestSchema,
    recordCount: z.number().int().nonnegative().nullable(),
    publicFieldDigest: digestSchema,
  })
  .strict();
const provenanceSchema = z
  .object({
    nodeVersion: z.string().regex(/^v22\./u),
    nodeExecutableSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    serverImageDigest: digestSchema,
    fixtureManifestDigest: digestSchema,
    packageNames: z.tuple([z.literal('@portaidentity/sdk'), z.literal('@portaidentity/cli')]),
    packageVersions: z.record(z.string(), z.string().min(1)),
    archiveSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
    dependencySpecifiers: z.record(z.string(), z.string().regex(/^file:[A-Za-z0-9._-]+\.tgz$/u)),
    compiledEntrypoints: z.array(z.string().min(1)).min(2),
    resolvedContentDigestsMatchArchives: z.literal(true),
    prohibitedResolutionObserved: z.literal(false),
    primaryTreeUnchanged: z.literal(true),
  })
  .strict();
const forbiddenSchema = z
  .object(
    Object.fromEntries(packedAdminDataForbiddenOutputClasses.map((key) => [key, z.boolean()])),
  )
  .strict();
const journeySchema = z
  .object({
    requirementId: z.string().min(1),
    client: z.enum(['sdk', 'cli']),
    clientResult: resultSchema,
    independentRawResult: resultSchema,
    outcome: z.enum(['passed', 'product-failure', 'incomplete']),
    stateDigestBefore: digestSchema,
    stateDigestAfter: digestSchema,
    forbiddenOutputObserved: forbiddenSchema,
    cliIsolation: z
      .object({
        temporaryHomeMode: z.number().int(),
        temporaryHomeRemoved: z.boolean(),
        callerCredentialFingerprintUnchanged: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
const evidenceSchema = z
  .object({
    version: z.literal(1),
    provenance: provenanceSchema,
    journeys: z.array(journeySchema),
    cleanup: z
      .object({
        terminalOutcome: z.enum(['success', 'failure', 'timeout', 'sigint', 'sigterm']),
        callerCredentialFingerprintUnchanged: z.boolean(),
        temporaryHomesRemoved: z.boolean(),
        consumerRemoved: z.boolean(),
        residuePaths: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

/** Validates exact journey identity, independent equivalence, nonmutation, and cleanup. */
export function validatePackedAdminDataEvidence(value: unknown): PackedAdminDataEvidence {
  const evidence = evidenceSchema.parse(value);
  if (evidence.journeys.length !== packedAdminDataRequirements.length) {
    throw new Error('packed administrative-data journey matrix is incomplete');
  }
  for (const requirement of packedAdminDataRequirements) {
    const matches = evidence.journeys.filter(
      ({ requirementId }) => requirementId === requirement.id,
    );
    if (matches.length !== 1 || matches[0]?.client !== requirement.client) {
      throw new Error('packed administrative-data journey identity is not unique');
    }
    validateJourney(matches[0], requirement);
  }
  if (
    evidence.cleanup.terminalOutcome !== 'success' ||
    !evidence.cleanup.callerCredentialFingerprintUnchanged ||
    !evidence.cleanup.temporaryHomesRemoved ||
    !evidence.cleanup.consumerRemoved ||
    evidence.cleanup.residuePaths.length !== 0
  ) {
    throw new Error('packed administrative-data cleanup is incomplete');
  }
  return evidence;
}

/** Collects each journey in a fixed order with independent before/after observations. */
export async function collectPackedAdminDataJourneys(
  driver: PackedAdminDataDriver,
): Promise<readonly PackedAdminDataJourneyEvidence[]> {
  const evidence: PackedAdminDataJourneyEvidence[] = [];
  for (const requirement of packedAdminDataRequirements) {
    const before = await driver.observeState();
    const client = await driver.executeClient(requirement);
    const raw = await driver.executeIndependentRaw(requirement);
    const forbidden = await driver.scanForbiddenOutput(client.boundedOutput);
    const after = await driver.observeState();
    const expectedResult = requirement.expectedOutcome;
    const observationsMatch = JSON.stringify(client.result) === JSON.stringify(raw);
    const forbiddenObserved = Object.values(forbidden).some(Boolean);
    const passed =
      client.result.outcome === expectedResult &&
      observationsMatch &&
      before === after &&
      !forbiddenObserved;
    evidence.push({
      requirementId: requirement.id,
      client: requirement.client,
      clientResult: client.result,
      independentRawResult: raw,
      outcome: passed ? 'passed' : 'product-failure',
      stateDigestBefore: before,
      stateDigestAfter: after,
      forbiddenOutputObserved: forbidden,
      ...(client.cliIsolation === undefined ? {} : { cliIsolation: client.cliIsolation }),
    });
  }
  return evidence;
}

/** Enforces one journey's derived conclusion and client-specific isolation facts. */
function validateJourney(
  journey: z.infer<typeof journeySchema>,
  requirement: PackedAdminDataRequirement,
): void {
  const passed =
    journey.clientResult.outcome === requirement.expectedOutcome &&
    JSON.stringify(journey.clientResult) === JSON.stringify(journey.independentRawResult) &&
    journey.stateDigestBefore === journey.stateDigestAfter &&
    !Object.values(journey.forbiddenOutputObserved).some(Boolean);
  if (journey.outcome !== (passed ? 'passed' : 'product-failure')) {
    throw new Error('packed administrative-data outcome is not derived from observations');
  }
  if (requirement.client === 'cli') {
    if (
      journey.cliIsolation?.temporaryHomeMode !== 0o700 ||
      !journey.cliIsolation.temporaryHomeRemoved ||
      !journey.cliIsolation.callerCredentialFingerprintUnchanged
    ) {
      throw new Error('packed administrative-data CLI isolation is incomplete');
    }
  } else if (journey.cliIsolation !== undefined) {
    throw new Error('packed administrative-data SDK journey cannot claim CLI isolation');
  }
}
