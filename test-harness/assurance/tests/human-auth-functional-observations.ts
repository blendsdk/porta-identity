import type {
  HumanAuthFunctionalCaseObservation,
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalStepObservation,
} from './human-auth-functional-contract.js';

/**
 * Builds one case result exclusively from supplied live step observations.
 *
 * The requirements object contributes only the closed step identifiers and order. Response and
 * state values always come from the live observer map, so an implementation mismatch remains
 * visible to the immutable specification.
 *
 * @param requirement - Closed case catalog used to validate completeness and ordering.
 * @param runId - Active owner-fenced harness run identifier.
 * @param observations - Concrete observations keyed by exact step identifier.
 * @returns A complete secret-free case observation.
 * @throws When an expected observation is absent or an undeclared observation is supplied.
 */
export function assembleFunctionalCaseObservation(
  requirement: HumanAuthFunctionalCaseRequirement,
  runId: string,
  observations: ReadonlyMap<string, HumanAuthFunctionalStepObservation>,
): HumanAuthFunctionalCaseObservation {
  const expectedIds = [...requirement.controls, ...requirement.negatives].map((entry) => entry.id);
  if (observations.size !== expectedIds.length || expectedIds.some((id) => !observations.has(id))) {
    throw new Error('functional human-auth live observations are incomplete or undeclared');
  }
  const read = (id: string): HumanAuthFunctionalStepObservation => {
    const observation = observations.get(id);
    if (observation === undefined) {
      throw new Error('functional human-auth live observation is missing');
    }
    return observation;
  };
  return Object.freeze({
    sentinelId: requirement.sentinelId,
    runId,
    controls: Object.freeze(requirement.controls.map((entry) => read(entry.id))),
    negatives: Object.freeze(requirement.negatives.map((entry) => read(entry.id))),
    rawSecretsRetained: false,
  });
}

/** Creates one response value from concrete public-boundary observations. */
export function observedFunctionalResponse(
  status: number | 'redirect' | null,
  bodySchemaId: string | null,
  headerSetId: string | null,
): HumanAuthFunctionalStepObservation['response'] {
  return Object.freeze({ status, bodySchemaId, headerSetId });
}

/** Creates one concrete public-state value without consulting the requirements catalog. */
export function observedFunctionalState(
  id: string,
  channel: HumanAuthFunctionalStepObservation['publicState'][number]['channel'],
  observed: Readonly<Record<string, string | number | boolean | null>>,
): HumanAuthFunctionalStepObservation['publicState'][number] {
  return Object.freeze({ id, channel, observed: Object.freeze(observed) });
}

/** Creates one complete concrete step observation. */
export function observedFunctionalStep(
  id: string,
  response: HumanAuthFunctionalStepObservation['response'],
  publicState: HumanAuthFunctionalStepObservation['publicState'],
): HumanAuthFunctionalStepObservation {
  return Object.freeze({ id, response, publicState: Object.freeze(publicState) });
}

/**
 * Digests normalized public text without retaining the response body.
 *
 * Whitespace is the only discarded dimension. Submitted identities and every visible error word
 * remain in the digest, so enumeration comparisons fail if Porta discloses different content.
 */
export function functionalBodyFingerprint(body: string): string {
  const normalized = body.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`;
}

/**
 * Digests the bounded public header contract while excluding volatile cookies and locations.
 *
 * Header names are normalized and sorted before hashing so transport ordering cannot affect the
 * result. Values remain exact because an identity-dependent security header is observable leakage.
 */
export function functionalHeaderFingerprint(headers: Readonly<Record<string, string>>): string {
  const allowed = new Set([
    'cache-control',
    'content-security-policy',
    'content-type',
    'referrer-policy',
    'retry-after',
    'x-content-type-options',
  ]);
  const normalized = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .filter(([name]) => allowed.has(name))
    .sort(([left], [right]) => left.localeCompare(right));
  return `sha256:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
}
import { createHash } from 'node:crypto';
