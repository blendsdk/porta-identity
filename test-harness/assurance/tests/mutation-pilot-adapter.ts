import type { MutationPilotContract } from './mutation-pilot-contract.js';
import {
  isRegisteredMutationPilotTarget,
  registeredMutationPilotCapability,
} from '../mutation/index.js';

/**
 * Creates the bounded mutation-pilot capability.
 *
 * The declaration is supplied by the production assurance registry rather than by requirement
 * fixtures. Live execution remains a separate clean-revision command and is never synthesized by
 * this adapter.
 */
export function createMutationPilotContract(): MutationPilotContract {
  return Object.freeze({
    describe: () => registeredMutationPilotCapability,
    acceptsTarget: isRegisteredMutationPilotTarget,
  });
}
