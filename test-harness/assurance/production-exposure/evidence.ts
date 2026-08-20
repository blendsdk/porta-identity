import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { readPublicRuntimeFixtureManifest } from '../../fixtures/fixture-runtime-files.js';
import type { ProductionExposureObservation } from '../tests/production-exposure-contract.js';
import type { ValidationExposureRawCase } from '../tests/validation-exposure-case-model.js';

const caseEvidenceSchema = z
  .object({
    caseId: z.string().regex(/^st(?:53|55|56)-[a-z0-9-]+$/u),
    outcome: z.enum(['passed', 'product-failure', 'incomplete', 'execution-failure']),
    expectedStatus: z.number().int().min(100).max(599),
    observedStatus: z.number().int().min(100).max(599).optional(),
    expectedBodyContract: z.string().min(1),
    observedBodyContract: z.string().min(1).optional(),
    failedControlObservations: z.array(z.string().min(1)),
    failedHeaderContracts: z.array(z.string().min(1)),
    failedStateObservations: z.array(z.string().min(1)),
    unobservedStateObservations: z.array(z.string().min(1)),
    observedProhibitedEffects: z.array(z.string().min(1)),
    unobservedProhibitedEffects: z.array(z.string().min(1)),
    recoveryPassed: z.boolean(),
    recoveryMode: z.enum(['none', 'dependency-only', 'porta-restart-required', 'failed']),
  })
  .strict();

const evidenceSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    profile: z.enum(['operational', 'production-security']),
    sourceCommit: z.string().regex(/^commit:[0-9a-f]{40}$/u),
    sourceTree: z.string().regex(/^tree:[0-9a-f]{40}$/u),
    assuranceToolDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    fixtureDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    correlatedLogCredit: z.literal(false),
    correlatedLogGap: z.literal('correlated-security-decision-event-unavailable'),
    cases: z.array(caseEvidenceSchema).min(1),
  })
  .strict();

/** Sanitized evidence for one live production-exposure case. */
export type ProductionExposureCaseEvidence = z.infer<typeof caseEvidenceSchema>;

/** Complete schema-validated live production-exposure evidence document. */
export type ProductionExposureEvidence = z.infer<typeof evidenceSchema>;

/** Parses an untrusted production-exposure artifact through the closed evidence schema. */
export function parseProductionExposureEvidence(value: unknown): ProductionExposureEvidence {
  return evidenceSchema.parse(value);
}

/** Chooses the collector exit without converting product failures into assertion failures. */
export function productionExposureCollectorExit(
  records: readonly ProductionExposureCaseEvidence[],
): 0 | 20 | 30 | 40 {
  if (records.some((record) => record.outcome === 'execution-failure')) return 30;
  if (records.some((record) => record.outcome === 'incomplete')) return 40;
  if (records.some((record) => record.outcome === 'product-failure')) return 20;
  return 0;
}

/** Converts one live observation into a closed, secret-free case record. */
export function productionExposureCaseEvidence(
  requirement: ValidationExposureRawCase,
  observation: ProductionExposureObservation,
): ProductionExposureCaseEvidence {
  const failedControlObservations =
    requirement.family === 'cors-policy'
      ? requirement.control.requiredObservations.filter(
          (name) => observation.control.headerContracts[name] !== true,
        )
      : [];
  const failedHeaderContracts = requirement.expected.headerContract.filter(
    (name) => observation.probe.headerContracts[name] !== true,
  );
  const failedStateObservations = requirement.independentStateObservations.filter(
    (name) => observation.independentStateObservations[name] === false,
  );
  const unobservedStateObservations = requirement.independentStateObservations.filter(
    (name) => observation.independentStateObservations[name] === 'unobserved',
  );
  const observedProhibitedEffects = requirement.prohibitedSideEffects.filter(
    (name) => observation.prohibitedSideEffects[name] === true,
  );
  const unobservedProhibitedEffects = requirement.prohibitedSideEffects.filter(
    (name) => observation.prohibitedSideEffects[name] === 'unobserved',
  );
  const productFailure =
    observation.control.status !== requirement.control.expectedStatus ||
    observation.probe.status !== requirement.expected.status ||
    observation.probe.bodyContract !== requirement.expected.bodyContract ||
    failedControlObservations.length > 0 ||
    failedHeaderContracts.length > 0 ||
    failedStateObservations.length > 0 ||
    observedProhibitedEffects.length > 0 ||
    observation.recoveryMode === 'porta-restart-required' ||
    !observation.recoveryPassed;
  const incomplete =
    unobservedStateObservations.length > 0 || unobservedProhibitedEffects.length > 0;
  return caseEvidenceSchema.parse({
    caseId: requirement.id,
    outcome: productFailure ? 'product-failure' : incomplete ? 'incomplete' : 'passed',
    expectedStatus: requirement.expected.status,
    observedStatus: observation.probe.status,
    expectedBodyContract: requirement.expected.bodyContract,
    observedBodyContract: observation.probe.bodyContract,
    failedControlObservations,
    failedHeaderContracts,
    failedStateObservations,
    unobservedStateObservations,
    observedProhibitedEffects,
    unobservedProhibitedEffects,
    recoveryPassed: observation.recoveryPassed,
    recoveryMode: observation.recoveryMode,
  });
}

/** Creates a sanitized record when the observer cannot complete one case. */
export function productionExposureExecutionFailure(
  requirement: ValidationExposureRawCase,
): ProductionExposureCaseEvidence {
  return caseEvidenceSchema.parse({
    caseId: requirement.id,
    outcome: 'execution-failure',
    expectedStatus: requirement.expected.status,
    expectedBodyContract: requirement.expected.bodyContract,
    failedControlObservations: [],
    failedHeaderContracts: [],
    failedStateObservations: [],
    unobservedStateObservations: [],
    observedProhibitedEffects: [],
    unobservedProhibitedEffects: [],
    recoveryPassed: false,
    recoveryMode: 'failed',
  });
}

/** Writes one validated mode-0600 evidence file and returns its repository-relative path. */
export function writeProductionExposureEvidence(
  records: readonly ProductionExposureCaseEvidence[],
): string {
  const runId = process.env.HARNESS_RUN_ID;
  const profile = process.env.HARNESS_PROFILE;
  const fixturePath = process.env.HARNESS_FIXTURE_MANIFEST;
  if (
    runId === undefined ||
    fixturePath === undefined ||
    (profile !== 'operational' && profile !== 'production-security')
  ) {
    throw new Error('production exposure evidence environment is incomplete');
  }
  const provenance = inspectFoundationProvenance(process.cwd());
  const fixture = readPublicRuntimeFixtureManifest(fixturePath);
  if (fixture.runId !== runId) throw new Error('production exposure fixture run mismatch');
  const evidence = evidenceSchema.parse({
    version: 1,
    runId,
    profile,
    sourceCommit: provenance.commitIdentity,
    sourceTree: provenance.treeIdentity,
    assuranceToolDigest: provenance.assuranceToolDigest,
    fixtureDigest: fixture.fixtureDigest,
    correlatedLogCredit: false,
    correlatedLogGap: 'correlated-security-decision-event-unavailable',
    cases: records,
  });
  const relativePath = `test-harness/.assurance-results/${runId}/production-exposure/${profile}/observation.json`;
  const path = resolve(process.cwd(), relativePath);
  const replacement = `${path}.${process.pid}.tmp`;
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
  rmSync(replacement, { force: true });
  writeFileSync(replacement, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  chmodSync(replacement, 0o600);
  renameSync(replacement, path);
  chmodSync(path, 0o600);
  return relativePath;
}
