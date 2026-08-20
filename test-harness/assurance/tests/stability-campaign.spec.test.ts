import assert from 'node:assert/strict';
import test from 'node:test';

import { createStabilityCampaignContract } from './stability-campaign-adapter.js';
import {
  maximumCampaignAttempts,
  requiredConsecutiveExecutions,
  stabilityCandidateSelectors,
  stabilityCommands,
  stabilityEvidenceRequirements,
  stabilityResetExample,
  stabilitySeedSetId,
} from './stability-campaign-requirements.js';

// The registered campaign is deliberately bounded to one representative protocol candidate per
// subsystem. Passing it never promotes a command or claims that a live Porta stack ran 100 times.
test('should register one bounded protocol candidate for every supported command', () => {
  const contract = createStabilityCampaignContract();
  for (const command of stabilityCommands) {
    assert.deepEqual(contract.candidate(command, stabilitySeedSetId), {
      command,
      candidateId: `${command}-protocol-v1`,
      selector: stabilityCandidateSelectors[command],
      qualificationScope: stabilityEvidenceRequirements.qualificationScope,
    });
  }
  assert.throws(
    () => contract.candidate('test', 'unregistered-set'),
    /stability seed set is not registered/i,
  );
});

// Seed order is fixed before execution, contains no duplicate identities, and supplies enough
// inputs to make all visible retries independently attributable.
test('should expose one deterministic shuffled seed order for the complete attempt cap', () => {
  const contract = createStabilityCampaignContract();
  const first = contract.seeds(stabilitySeedSetId);
  const second = contract.seeds(stabilitySeedSetId);

  assert.deepEqual(first, second);
  assert.equal(first.length, maximumCampaignAttempts);
  assert.equal(new Set(first).size, maximumCampaignAttempts);
  assert.notDeepEqual(first, [...first].sort());
  assert.match(first[0] ?? '', /^seed-[0-9]{3}$/u);
});

// Invalid, incomplete, cancelled, and flaky attempts all reset the active clean sequence. A flake
// remains disqualifying even if a later sequence becomes long enough.
test('should reset the visible sequence for every non-clean attempt', () => {
  const result = createStabilityCampaignContract().evaluate(stabilityResetExample);

  assert.deepEqual(result, {
    qualified: false,
    longestConsecutiveCompleted: 1,
    finalConsecutiveCompleted: 0,
    sequenceResetCount: 4,
    flakeObserved: true,
  });
});

// Exactly 100 clean attempts qualify; fewer attempts and any hidden retry cannot be interpreted as
// equivalent evidence.
test('should require exactly the complete zero-flake consecutive threshold', () => {
  const contract = createStabilityCampaignContract();
  const seeds = contract.seeds(stabilitySeedSetId);
  const completed = seeds.slice(0, requiredConsecutiveExecutions).map((seed, index) => ({
    ordinal: index + 1,
    seed,
    classification: 'completed' as const,
  }));

  assert.equal(contract.evaluate(completed.slice(0, -1)).qualified, false);
  assert.deepEqual(contract.evaluate(completed), {
    qualified: true,
    longestConsecutiveCompleted: requiredConsecutiveExecutions,
    finalConsecutiveCompleted: requiredConsecutiveExecutions,
    sequenceResetCount: 0,
    flakeObserved: false,
  });
});

// The command contract freezes the evidence, deadline, cleanup, and promotion boundaries rather
// than deriving them from a successful implementation run.
test('should freeze bounded owner-only evidence without promotion authority', () => {
  assert.deepEqual(stabilityEvidenceRequirements, {
    artifactMode: 0o600,
    artifactAtomic: true,
    attemptDeadlineMilliseconds: 420_000,
    qualificationScope: 'assurance-protocol-candidate',
    noHiddenRetry: true,
    primaryTreeUnchanged: true,
    zeroOwnedResidue: true,
    promotionAuthorized: false,
  });
});
