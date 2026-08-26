import { validatePackedP1ReadEvidence as validateRuntimeEvidence } from '../compat/p1-read.js';

import type { PackedP1ReadEvidence } from './p1-packed-read-contract.js';

/** Stable specification seam for the packed P1 evidence validator. */
export function validatePackedP1ReadEvidence(evidence: unknown): PackedP1ReadEvidence {
  return validateRuntimeEvidence(evidence);
}
