import { humanAuthForbiddenLogFields } from './human-auth-slice-profile-model.js';

import type {
  HumanAuthPublicResponse,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

/** Required privacy-safe fields shared by human-authentication rejection events. */
export const humanAuthRequiredLogFields = [
  'synthetic-correlation-id',
  'event-class',
  'public-method',
  'public-outcome-class',
] as const;

/** Sensitive fields forbidden from human-authentication evidence. */
export const humanAuthForbiddenCaseLogFields = humanAuthForbiddenLogFields;

/** Exposure locations forbidden for every secret authentication artifact. */
export const authenticationArtifactExposureEffects = [
  'artifact-in-wrong-mailbox',
  'artifact-in-public-response',
  'artifact-in-redirect',
  'artifact-in-log',
  'artifact-in-audit-event',
  'artifact-in-trace',
  'artifact-in-report',
  'artifact-in-referrer',
  'artifact-in-browser-history',
  'artifact-in-retained-evidence',
] as const;

/** Independent observation rule shared by the immutable functional cases. */
export const humanAuthIndependenceRule =
  'observe public responses and independently fingerprint protected state before and after each probe without importing Porta authentication helpers';

/** Creates a deterministic requirements-rig response while permitting live concrete values. */
export function functionalResponse(equivalenceClass: string): HumanAuthPublicResponse {
  return Object.freeze({
    status: `${equivalenceClass}:status`,
    bodySchemaDigest: `${equivalenceClass}:body-schema`,
    securityHeadersDigest: `${equivalenceClass}:security-headers`,
  });
}

/** Freezes one declarative case step without executing product behavior. */
export function humanAuthStep(value: HumanAuthStepRequirement): HumanAuthStepRequirement {
  return Object.freeze(value);
}
