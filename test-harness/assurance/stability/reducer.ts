import type {
  StabilityAttemptInput,
  StabilitySequenceResult,
} from '../tests/stability-campaign-contract.js';
import { stabilityMaximumAttempts, stabilityRequiredConsecutive } from './registry.js';

/** Reduces one complete visible attempt list into the frozen qualification state. */
export function evaluateStabilitySequence(
  attempts: readonly StabilityAttemptInput[],
): StabilitySequenceResult {
  if (attempts.length > stabilityMaximumAttempts) {
    throw new Error('stability attempt cap exceeded');
  }
  const observedSeeds = new Set<string>();
  let current = 0;
  let longest = 0;
  let resets = 0;
  let flakeObserved = false;
  for (const [index, attempt] of attempts.entries()) {
    if (attempt.ordinal !== index + 1) throw new Error('stability attempt ordinals are not exact');
    if (!/^seed-[0-9]{3}$/u.test(attempt.seed) || observedSeeds.has(attempt.seed)) {
      throw new Error('stability attempt seed is invalid or repeated');
    }
    observedSeeds.add(attempt.seed);
    if (attempt.classification === 'completed') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
      resets += 1;
      if (attempt.classification === 'flaky') flakeObserved = true;
    }
  }
  return Object.freeze({
    qualified: current >= stabilityRequiredConsecutive && !flakeObserved,
    longestConsecutiveCompleted: longest,
    finalConsecutiveCompleted: current,
    sequenceResetCount: resets,
    flakeObserved,
  });
}
