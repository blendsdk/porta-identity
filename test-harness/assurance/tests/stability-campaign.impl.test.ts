import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyStabilityAttempt } from '../stability/campaign.js';
import {
  createStabilitySeeds,
  isStabilityCommand,
  registeredStabilityCandidates,
  registeredStabilitySeedSet,
  resolveStabilityCandidate,
} from '../stability/registry.js';
import { evaluateStabilitySequence } from '../stability/reducer.js';
import type { ManagedChildOutcome } from '../scripts/managed-child.js';

/** Creates a complete managed-child result for table-driven terminal tests. */
function outcome(overrides: Partial<ManagedChildOutcome> = {}): ManagedChildOutcome {
  return {
    code: 0,
    signal: null,
    forwardedSignal: null,
    timedOut: false,
    setupFailed: false,
    cleanupFailed: false,
    stdout: '',
    stderr: '',
    outputTruncated: false,
    ...overrides,
  };
}

test('should expose five exact code-owned stability candidates', () => {
  assert.deepEqual(Object.keys(registeredStabilityCandidates), [
    'test',
    'harness',
    'coverage',
    'fault',
    'compat',
  ]);
  for (const [command, candidate] of Object.entries(registeredStabilityCandidates)) {
    assert.equal(isStabilityCommand(command), true);
    assert.equal(
      resolveStabilityCandidate(candidate.command, registeredStabilitySeedSet),
      candidate,
    );
    assert.match(candidate.testFile, /^test-harness\/assurance\/tests\/[a-z0-9.-]+\.test\.ts$/u);
  }
  assert.equal(isStabilityCommand('all'), false);
});

test('should create a stable nontrivial permutation of 125 unique seeds', () => {
  const seeds = createStabilitySeeds(registeredStabilitySeedSet);
  assert.equal(seeds.length, 125);
  assert.equal(new Set(seeds).size, 125);
  assert.deepEqual(seeds, createStabilitySeeds(registeredStabilitySeedSet));
  assert.notDeepEqual(seeds, [...seeds].sort());
});

test('should apply cleanup signal timeout setup and candidate precedence', () => {
  assert.deepEqual(classifyStabilityAttempt(outcome({ cleanupFailed: true, code: 1 })), {
    classification: 'incomplete',
    failureOwner: 'cleanup',
    stopCampaign: true,
  });
  assert.deepEqual(classifyStabilityAttempt(outcome({ forwardedSignal: 'SIGINT', code: 130 })), {
    classification: 'cancelled',
    failureOwner: 'signal',
    stopCampaign: true,
  });
  assert.deepEqual(classifyStabilityAttempt(outcome({ timedOut: true, code: null })), {
    classification: 'incomplete',
    failureOwner: 'timeout',
    stopCampaign: false,
  });
  assert.deepEqual(classifyStabilityAttempt(outcome({ setupFailed: true, code: null })), {
    classification: 'invalid',
    failureOwner: 'campaign-setup',
    stopCampaign: false,
  });
  assert.deepEqual(classifyStabilityAttempt(outcome({ code: 1 })), {
    classification: 'flaky',
    failureOwner: 'candidate-test',
    stopCampaign: false,
  });
  assert.deepEqual(classifyStabilityAttempt(outcome()), {
    classification: 'completed',
    failureOwner: 'none',
    stopCampaign: false,
  });
});

test('should reject repeated seeds, incorrect ordinals, and attempts beyond the cap', () => {
  assert.throws(
    () =>
      evaluateStabilitySequence([
        { ordinal: 1, seed: 'seed-001', classification: 'completed' },
        { ordinal: 2, seed: 'seed-001', classification: 'completed' },
      ]),
    /seed is invalid or repeated/i,
  );
  assert.throws(
    () =>
      evaluateStabilitySequence([{ ordinal: 2, seed: 'seed-001', classification: 'completed' }]),
    /ordinals are not exact/i,
  );
  assert.throws(
    () =>
      evaluateStabilitySequence(
        Array.from({ length: 126 }, (_, index) => ({
          ordinal: index + 1,
          seed: `seed-${String(index + 1).padStart(3, '0')}`,
          classification: 'completed' as const,
        })),
      ),
    /attempt cap exceeded/i,
  );
});
