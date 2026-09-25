/**
 * Pure helpers for the live delivered-artifact observation adapter.
 *
 * They classify a public artifact response, count durable state transitions,
 * check issued-value unpredictability, and assemble one requirement-ordered
 * case observation. They never contact a service and never fabricate facts.
 */

import type {
  HumanAuthCaseObservation,
  HumanAuthCaseRequirement,
  HumanAuthStepObservation,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

/** Closed observed outcome vocabulary for a delivered-artifact request. */
export type ArtifactResult =
  'accepted' | 'invalid-artifact' | 'expired-artifact' | 'throttled' | 'generic-response';

/** Response markers extracted from one public artifact request. */
export interface ArtifactResponseSignal {
  readonly status: number | null;
  readonly redirectLocation: string | null;
  readonly acceptedPage: boolean;
  readonly expiredPage: boolean;
  readonly genericPage: boolean;
}

/** Minimum base64url length accepted as cryptographically unpredictable (256 bits). */
const MIN_UNPREDICTABLE_LENGTH = 32;

/** Base64url and hex alphabets both match this allowlist. */
const UNPREDICTABLE_ALPHABET = /^[A-Za-z0-9_-]+$/u;

/**
 * Classify one public artifact response into the closed result vocabulary.
 *
 * Throttling wins over page markers, then the expired page, then acceptance,
 * then a generic issuance page; anything else is an invalid artifact.
 *
 * @param signal - Status and page markers observed at the public boundary.
 * @returns The classified artifact result.
 */
export function classifyArtifactResponse(signal: ArtifactResponseSignal): ArtifactResult {
  if (signal.status === 429) return 'throttled';
  if (signal.expiredPage) return 'expired-artifact';
  if (signal.acceptedPage) return 'accepted';
  if (signal.genericPage) return 'generic-response';
  return 'invalid-artifact';
}

/**
 * Count the durable state keys whose digest changed between two snapshots.
 *
 * @param before - Fingerprint of the protected state before the step.
 * @param after - Fingerprint of the protected state after the step.
 * @returns The number of keys that changed (added, removed, or modified).
 */
export function countDurableEffects(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): number {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let changed = 0;
  for (const key of keys) {
    if (before[key] !== after[key]) changed += 1;
  }
  return changed;
}

/**
 * Report whether issued values are distinct and cryptographically unpredictable.
 *
 * @param values - The delivered artifact values, in issuance order.
 * @returns True only when at least two distinct values meet the entropy shape.
 */
export function issuedValuesAreUnpredictable(values: readonly string[]): boolean {
  if (values.length < 2) return false;
  if (new Set(values).size !== values.length) return false;
  return values.every(
    (value) => value.length >= MIN_UNPREDICTABLE_LENGTH && UNPREDICTABLE_ALPHABET.test(value),
  );
}

/**
 * Assemble one case observation in requirement order.
 *
 * Every declared step must have an observation, and no undeclared observation
 * may be present; both violations fail closed so a partial or mixed result can
 * never be presented as complete evidence.
 *
 * @param requirement - The immutable case requirement.
 * @param observationsByStepId - Observed steps keyed by their declared id.
 * @returns The assembled, frozen case observation.
 */
export function assembleRecoveryCaseObservation(
  requirement: HumanAuthCaseRequirement,
  observationsByStepId: ReadonlyMap<string, HumanAuthStepObservation>,
): HumanAuthCaseObservation {
  const declared = new Set<string>();
  const collect = (steps: readonly HumanAuthStepRequirement[]): HumanAuthStepObservation[] =>
    steps.map((step) => {
      declared.add(step.id);
      const observation = observationsByStepId.get(step.id);
      if (observation === undefined) {
        throw new Error('HUMAN_AUTH_RECOVERY_OBSERVATION_MISSING');
      }
      return observation;
    });

  const controls = collect(requirement.controls);
  const probes = collect(requirement.probes);
  for (const id of observationsByStepId.keys()) {
    if (!declared.has(id)) {
      throw new Error('HUMAN_AUTH_RECOVERY_OBSERVATION_UNDECLARED');
    }
  }

  return Object.freeze({ sentinelId: requirement.sentinelId, controls, probes });
}
