import {
  validatePackedProtocolEvidence as validateEvidence,
  type PackedProtocolEvidence,
} from '../compat/protocol.js';

/**
 * Stable specification seam for packed protocol evidence validation.
 *
 * Immutable specifications depend on this narrow seam so live orchestration can evolve without
 * changing the public behavior the evidence must prove.
 */
export function validatePackedProtocolEvidence(value: unknown): PackedProtocolEvidence {
  return validateEvidence(value);
}
