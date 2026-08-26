import type {
  AssuranceAllAggregateContract,
  AssuranceAllAggregateEvidence,
} from './assurance-all-aggregate-contract.js';

import { validateAggregateEvidence } from '../aggregate/index.js';

/** Exact fail-closed marker retained until the aggregate validator is implemented. */
export const assuranceAllAggregateCapabilityMissing = 'ASSURANCE_ALL_AGGREGATE_CAPABILITY_MISSING';

/**
 * Returns the stable aggregate validation seam.
 *
 * This specification-only checkpoint has no aggregate runtime or evidence authority.
 */
export function createAssuranceAllAggregateContract(): AssuranceAllAggregateContract {
  return {
    validate(evidence: unknown): AssuranceAllAggregateEvidence {
      return validateAggregateEvidence(evidence);
    },
  };
}
