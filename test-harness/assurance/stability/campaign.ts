import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

import type {
  StabilityAttemptClassification,
  StabilityCommand,
} from '../tests/stability-campaign-contract.js';
import { digestRepositoryFile, inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { runManagedChild, type ManagedChildOutcome } from '../scripts/managed-child.js';
import type {
  StabilityAttemptEvidence,
  StabilityCampaignArtifact,
  StabilityCampaignResult,
  StabilityFailureOwner,
} from './model.js';
import {
  createStabilitySeeds,
  resolveStabilityCandidate,
  stabilityAttemptDeadlineMilliseconds,
  stabilityMaximumAttempts,
  stabilityRequiredConsecutive,
} from './registry.js';
import { evaluateStabilitySequence } from './reducer.js';

/** Converts one managed child outcome into the stable attempt taxonomy. */
export function classifyStabilityAttempt(outcome: ManagedChildOutcome): {
  readonly classification: StabilityAttemptClassification;
  readonly failureOwner: StabilityFailureOwner;
  readonly stopCampaign: boolean;
} {
  if (outcome.cleanupFailed) {
    return { classification: 'incomplete', failureOwner: 'cleanup', stopCampaign: true };
  }
  if (outcome.forwardedSignal !== null) {
    return { classification: 'cancelled', failureOwner: 'signal', stopCampaign: true };
  }
  if (outcome.timedOut) {
    return { classification: 'incomplete', failureOwner: 'timeout', stopCampaign: false };
  }
  if (outcome.setupFailed || outcome.outputTruncated || outcome.code === null) {
    return { classification: 'invalid', failureOwner: 'campaign-setup', stopCampaign: false };
  }
  if (outcome.code === 0) {
    return { classification: 'completed', failureOwner: 'none', stopCampaign: false };
  }
  return { classification: 'flaky', failureOwner: 'candidate-test', stopCampaign: false };
}

/** Calculates a nearest-rank percentile from one nonempty runtime list. */
function percentile(values: readonly number[], percentage: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentage / 100) * ordered.length) - 1);
  return ordered[index]!;
}

/** Writes one JSON value through an owner-only atomic replacement. */
function writeAtomicArtifact(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Chooses the stable campaign exit after all cleanup and provenance checks. */
function campaignExit(
  attempts: readonly StabilityAttemptEvidence[],
  qualified: boolean,
  primaryTreeUnchanged: boolean,
): number {
  if (attempts.some((attempt) => attempt.failureOwner === 'cleanup')) return 60;
  if (attempts.some((attempt) => attempt.failureOwner === 'signal')) {
    const signalAttempt = attempts.find((attempt) => attempt.failureOwner === 'signal');
    return signalAttempt?.exitCode === 130 ? 130 : 143;
  }
  if (attempts.some((attempt) => attempt.failureOwner === 'timeout')) return 70;
  if (!primaryTreeUnchanged) return 50;
  if (attempts.some((attempt) => attempt.classification === 'flaky')) return 21;
  if (!qualified) return 50;
  return 0;
}

/** Executes one clean, shell-free, visible stability campaign and publishes sanitized evidence. */
export async function runStabilityCampaign(
  repositoryRoot: string,
  command: StabilityCommand,
  seedSet: string,
): Promise<StabilityCampaignResult> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const candidate = resolveStabilityCandidate(command, seedSet);
  const candidatePath = resolve(canonicalRoot, candidate.testFile);
  if (!lstatSync(candidatePath).isFile() || !candidatePath.startsWith(`${canonicalRoot}/`)) {
    throw new Error('stability candidate path is unavailable');
  }
  const before = inspectFoundationProvenance(canonicalRoot);
  const dependencyLockDigest = digestRepositoryFile(resolve(canonicalRoot, 'yarn.lock'));
  const seeds = createStabilitySeeds(seedSet);
  const attempts: StabilityAttemptEvidence[] = [];

  for (const seed of seeds) {
    const started = performance.now();
    const outcome = await runManagedChild(
      process.execPath,
      ['--import', 'tsx', '--test', candidate.testFile],
      {
        cwd: canonicalRoot,
        env: { ...process.env, PORTA_ASSURANCE_STABILITY_SEED: seed },
        stdio: 'ignore',
        timeoutMilliseconds: stabilityAttemptDeadlineMilliseconds,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      },
    );
    const classified = classifyStabilityAttempt(outcome);
    const evidence: StabilityAttemptEvidence = {
      ordinal: attempts.length + 1,
      seed,
      classification: classified.classification,
      failureOwner: classified.failureOwner,
      ...(outcome.code === null ? {} : { exitCode: outcome.code }),
      durationMilliseconds: Math.max(0, Math.round(performance.now() - started)),
    };
    attempts.push(Object.freeze(evidence));
    const sequence = evaluateStabilitySequence(attempts);
    if (
      classified.stopCampaign ||
      sequence.finalConsecutiveCompleted >= stabilityRequiredConsecutive
    ) {
      break;
    }
  }

  const sequence = evaluateStabilitySequence(attempts);
  let primaryTreeUnchanged = false;
  try {
    const after = inspectFoundationProvenance(canonicalRoot);
    primaryTreeUnchanged =
      before.commitIdentity === after.commitIdentity &&
      before.treeIdentity === after.treeIdentity &&
      before.assuranceToolDigest === after.assuranceToolDigest;
  } catch {
    primaryTreeUnchanged = false;
  }
  const exitCode = campaignExit(attempts, sequence.qualified, primaryTreeUnchanged);
  const runtimes = attempts.map((attempt) => attempt.durationMilliseconds);
  const invalidAttempts = attempts.filter((attempt) =>
    ['invalid', 'incomplete', 'cancelled'].includes(attempt.classification),
  ).length;
  const runId = randomUUID();
  const artifactPath = `test-harness/.assurance-results/${runId}/stability/${command}/${seedSet}/result.json`;
  const absoluteArtifactPath = resolve(canonicalRoot, artifactPath);
  const artifact: StabilityCampaignArtifact = {
    schemaVersion: 1,
    runId,
    candidate,
    seedSet,
    requiredConsecutiveExecutions: stabilityRequiredConsecutive,
    maximumAttempts: stabilityMaximumAttempts,
    attemptDeadlineMilliseconds: stabilityAttemptDeadlineMilliseconds,
    ...before,
    dependencyLockDigest,
    attempts,
    sequence,
    p50RuntimeMilliseconds: percentile(runtimes, 50),
    p95RuntimeMilliseconds: percentile(runtimes, 95),
    invalidRunRate: attempts.length === 0 ? 1 : invalidAttempts / attempts.length,
    noHiddenRetry: true,
    primaryTreeUnchanged,
    zeroOwnedResidue: !attempts.some((attempt) => attempt.failureOwner === 'cleanup'),
    artifactMode: 0o600,
    promotionAuthorized: false,
    exitCode,
  };
  writeAtomicArtifact(absoluteArtifactPath, artifact);
  if (statSync(absoluteArtifactPath).mode & 0o077) {
    throw new Error('stability artifact mode is not owner-only');
  }
  if (
    !relative(canonicalRoot, absoluteArtifactPath).startsWith('test-harness/.assurance-results/')
  ) {
    throw new Error('stability artifact escaped the owned results root');
  }
  return Object.freeze({
    runId,
    candidateId: candidate.candidateId,
    qualified: sequence.qualified && exitCode === 0,
    exitCode,
    artifactPath,
  });
}
