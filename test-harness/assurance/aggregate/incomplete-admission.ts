import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { productionExposureCaseIdsByProfile } from '../production-exposure/admission.js';
import { parseProductionExposureEvidence } from '../production-exposure/evidence.js';
import type { AssuranceAllInvocationRegistration } from '../tests/assurance-all-aggregate-contract.js';
import {
  aggregateKnownIncompleteCollectors,
  type AggregateKnownIncompleteCollectorRegistration,
} from './registry.js';

/** Clean source identities that an admitted incomplete artifact must preserve. */
export interface AggregateIncompleteProvenance {
  readonly commitIdentity: string;
  readonly treeIdentity: string;
  readonly assuranceToolDigest: string;
}

/** Inputs needed to admit one incomplete child without weakening other exit-40 handling. */
export interface AggregateIncompleteAdmissionInput {
  readonly repositoryRoot: string;
  readonly invocation: AssuranceAllInvocationRegistration;
  readonly artifactReference: string | null;
  readonly provenance: AggregateIncompleteProvenance;
  readonly cleanupComplete: boolean;
}

/** Compares two ordered string collections without accepting missing or additional values. */
function exactStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/** Locates the one closed continuation registration for an aggregate invocation. */
function registrationFor(
  invocation: AssuranceAllInvocationRegistration,
): AggregateKnownIncompleteCollectorRegistration | undefined {
  return aggregateKnownIncompleteCollectors.find(
    (candidate) =>
      candidate.invocationId === invocation.id && candidate.profile === invocation.profile,
  );
}

/**
 * Admits only the exact known forwarding-context observer gap.
 *
 * Returning false leaves exit 40 terminal. The function never turns incomplete evidence into a
 * pass; it only proves that continuing later independent collectors is safe and already governed.
 */
export function admitKnownIncompleteCollector(input: AggregateIncompleteAdmissionInput): boolean {
  const registration = registrationFor(input.invocation);
  if (registration === undefined || input.artifactReference === null || !input.cleanupComplete) {
    return false;
  }
  const match =
    /^test-harness\/\.assurance-results\/([0-9a-f-]{36})\/production-exposure\/(operational|production-security)\/observation\.json$/u.exec(
      input.artifactReference,
    );
  if (match === null || match[2] !== registration.profile) return false;

  try {
    const resultsRoot = realpathSync(
      resolve(input.repositoryRoot, 'test-harness/.assurance-results'),
    );
    const absolute = resolve(input.repositoryRoot, input.artifactReference);
    if (lstatSync(absolute).isSymbolicLink()) return false;
    const canonical = realpathSync(absolute);
    if (!canonical.startsWith(`${resultsRoot}/`) || !statSync(canonical).isFile()) return false;
    if ((statSync(canonical).mode & 0o077) !== 0) return false;

    const parsed: unknown = JSON.parse(readFileSync(canonical, 'utf8'));
    const evidence = parseProductionExposureEvidence(parsed);
    if (
      evidence.runId !== match[1] ||
      evidence.profile !== registration.profile ||
      evidence.sourceCommit !== input.provenance.commitIdentity ||
      evidence.sourceTree !== input.provenance.treeIdentity ||
      evidence.assuranceToolDigest !== input.provenance.assuranceToolDigest
    ) {
      return false;
    }
    if (
      !exactStrings(
        evidence.cases.map((entry) => entry.caseId),
        productionExposureCaseIdsByProfile[registration.profile],
      ) ||
      evidence.cases.some((entry) => entry.outcome === 'execution-failure')
    ) {
      return false;
    }

    const incompleteCases = evidence.cases.filter((entry) => entry.outcome === 'incomplete');
    if (
      !exactStrings(
        incompleteCases.map((entry) => entry.caseId),
        Object.keys(registration.incompleteCases),
      )
    ) {
      return false;
    }
    return incompleteCases.every((entry) => {
      const expected = registration.incompleteCases[entry.caseId];
      return (
        expected !== undefined &&
        exactStrings(entry.unobservedStateObservations, expected.unobservedStateObservations) &&
        exactStrings(entry.unobservedProhibitedEffects, expected.unobservedProhibitedEffects) &&
        entry.failedControlObservations.length === 0 &&
        entry.failedHeaderContracts.length === 0 &&
        entry.failedStateObservations.length === 0 &&
        entry.observedProhibitedEffects.length === 0 &&
        entry.recoveryPassed &&
        entry.recoveryMode === 'none'
      );
    });
  } catch {
    return false;
  }
}
