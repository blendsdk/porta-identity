import type { StabilityCampaignContract, StabilityCommand } from './stability-campaign-contract.js';
import { createStabilitySeeds, resolveStabilityCandidate } from '../stability/registry.js';
import { evaluateStabilitySequence } from '../stability/reducer.js';

/** Returns the live stability implementation once the campaign capability is installed. */
export function createStabilityCampaignContract(): StabilityCampaignContract {
  return Object.freeze({
    candidate(command: StabilityCommand, seedSet: string) {
      const candidate = resolveStabilityCandidate(command, seedSet);
      return Object.freeze({
        command: candidate.command,
        candidateId: candidate.candidateId,
        selector: candidate.selector,
        qualificationScope: candidate.qualificationScope,
      });
    },
    seeds: createStabilitySeeds,
    evaluate: evaluateStabilitySequence,
  });
}
