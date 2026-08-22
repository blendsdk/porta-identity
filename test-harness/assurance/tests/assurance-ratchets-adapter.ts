import type { AssuranceRatchetsContract } from './assurance-ratchets-contract.js';
import { createAssuranceRatchets } from '../ratchets/index.js';

/** Returns the local ratchet implementation once its capability is installed. */
export function createAssuranceRatchetsContract(): AssuranceRatchetsContract {
  return createAssuranceRatchets(process.cwd());
}
