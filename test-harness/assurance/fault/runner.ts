import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';

import { runManagedChild, type ManagedChildOutcome } from '../scripts/managed-child.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { loadFaultCatalog, resolveFaultFile, selectFault } from './catalog.js';
import { classifyFaultTuple } from './classification.js';
import type {
  CuratedFault,
  FaultClassification,
  FaultObservation,
  FaultTuple,
  FaultTupleResult,
} from './model.js';

/** Bounded output retained only long enough to match one exact sentinel signature. */
const faultOutputLimitBytes = 64 * 1024;

/** Grace period before a non-cooperative fault child is killed. */
const faultTerminationGraceMilliseconds = 2_000;

/** Result returned to the root dispatcher for one exact fault tuple. */
export interface FaultCommandResult {
  /** UUID that owns the sanitized evidence and any recovery state. */
  readonly runId: string;
  /** Exact terminal fault classification. */
  readonly classification: FaultClassification;
  /** Stable root assurance exit code. */
  readonly exitCode: 0 | 21 | 30 | 50 | 60 | 70 | 130 | 143;
  /** Repository-relative sanitized evidence path. */
  readonly artifactPath: string;
  /** Bounded recovery command when automatic cleanup could not prove absence. */
  readonly recoveryCommand?: string;
  /** Exact stage that produced the final tuple classification. */
  readonly stage: FaultObservation['stage'];
  /** Claims blocked by the final classification. */
  readonly blockedClaims: readonly string[];
  /** Claims killed by the exact registered signature. */
  readonly killedClaims: readonly string[];
  /** Whether a fresh detached worktree was created for this tuple. */
  readonly worktreeCreated: boolean;
  /** Whether the primary source identity remained unchanged. */
  readonly primaryTreeUnchanged: boolean;
  /** Sanitized resource kinds that remained after cleanup. */
  readonly residue: readonly string[];
}

/** Internal outcome accumulated before final cleanup precedence is known. */
export interface PendingFaultOutcome {
  classification: FaultClassification;
  exitCode: FaultCommandResult['exitCode'];
  tuple: FaultTuple;
  blockedClaims: readonly string[];
  killedClaims: readonly string[];
  stage: FaultObservation['stage'];
}

/** Exact caller selectors accepted by the curated-fault command. */
export interface FaultCommandSelection {
  /** Stable fault ID. */
  readonly faultId: string;
  /** Exact mapped claim ID. */
  readonly claimId: string;
  /** Exact mapped sentinel ID. */
  readonly sentinelId: string;
}

/** Returns a SHA-256 identity for one regular file. */
function digestFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

/** Writes one sanitized result atomically with owner-only permissions. */
function writeAtomic(path: string, value: unknown): void {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

/** Creates an owner-only directory and rejects symlink or alias replacement. */
function requireOwnedDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error('fault-owned directory is not canonical');
  }
}

/** Proves the clean execution revision descends from the immutable catalog floor. */
function revisionIsEligible(repositoryRoot: string, ancestorCommit: string): boolean {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', ancestorCommit, 'HEAD^{commit}'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'ignore', 'ignore'],
    },
  );
  return result.status === 0 && result.signal === null && result.error === undefined;
}

/** Selects the exact claim and sentinel tuple or throws before disposable work starts. */
function selectTuple(fault: CuratedFault, selection: FaultCommandSelection): FaultTuple {
  const tuple = fault.tuples.find(
    (candidate) =>
      candidate.claimId === selection.claimId && candidate.sentinelId === selection.sentinelId,
  );
  if (tuple === undefined) throw new Error('selected claim and sentinel tuple is not registered');
  return tuple;
}

/** Applies the reviewed patch only after Git confirms its exact precondition. */
function applyReviewedPatch(
  repositoryRoot: string,
  worktreePath: string,
  patchRepositoryPath: string,
  targetRepositoryPath: string,
): void {
  const patchPath = resolveFaultFile(
    repositoryRoot,
    patchRepositoryPath,
    'test-harness/assurance/fault/patches',
  );
  execFileSync('git', ['apply', '--check', '--whitespace=nowarn', '--', patchPath], {
    cwd: worktreePath,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  execFileSync('git', ['apply', '--whitespace=nowarn', '--', patchPath], {
    cwd: worktreePath,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  verifyExactPatchedTarget(worktreePath, targetRepositoryPath);
}

/** Proves that applying one reviewed patch changed exactly its declared target and nothing else. */
export function verifyExactPatchedTarget(worktreePath: string, targetRepositoryPath: string): void {
  const tracked = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', 'HEAD', '--'], {
    cwd: worktreePath,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z', '--'],
    {
      cwd: worktreePath,
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const changedPaths = `${tracked}${untracked}`.split('\0').filter(Boolean);
  if (changedPaths.length !== 1 || changedPaths[0] !== targetRepositoryPath) {
    throw new Error('reviewed fault patch changed files outside its declared target');
  }
}

/** Runs one allowlisted foundation build without interpreting catalog text as a command. */
async function runBuild(fault: CuratedFault, worktreePath: string): Promise<ManagedChildOutcome> {
  if (fault.buildCommand !== 'foundation-syntax-check') {
    throw new Error('fault build command is not allowlisted');
  }
  return runManagedChild(process.execPath, ['--check', resolve(worktreePath, fault.target.path)], {
    cwd: worktreePath,
    env: process.env,
    stdio: 'pipe',
    maxOutputBytes: faultOutputLimitBytes,
    timeoutMilliseconds: fault.timeoutMilliseconds,
    terminationGraceMilliseconds: faultTerminationGraceMilliseconds,
    cleanup: () => undefined,
  });
}

/** Runs one allowlisted sentinel with the exact selected tuple. */
async function runSentinel(
  fault: CuratedFault,
  tuple: FaultTuple,
  worktreePath: string,
): Promise<ManagedChildOutcome> {
  if (fault.executionCommand !== 'foundation-sentinel') {
    throw new Error('fault execution command is not allowlisted');
  }
  return runManagedChild(
    process.execPath,
    [
      resolve(worktreePath, 'test-harness/assurance/fault/fixtures/foundation-sentinel.mjs'),
      tuple.sentinelId,
    ],
    {
      cwd: worktreePath,
      env: process.env,
      stdio: 'pipe',
      maxOutputBytes: faultOutputLimitBytes,
      timeoutMilliseconds: fault.timeoutMilliseconds,
      terminationGraceMilliseconds: faultTerminationGraceMilliseconds,
      cleanup: () => undefined,
    },
  );
}

/** Accepts only the closed success or designated-failure output grammar of one sentinel. */
export function observationFromSentinelChild(
  stage: FaultObservation['stage'],
  child: ManagedChildOutcome,
  expectedSignature: string,
): FaultObservation {
  const exactFailure =
    child.code === 1 && child.stdout === '' && child.stderr === `${expectedSignature}\n`;
  const exactSuccess = child.code === 0 && child.stdout === '' && child.stderr === '';
  return Object.freeze({
    stage,
    exitCode: child.code ?? 1,
    assertionSignatures: Object.freeze(exactFailure ? [expectedSignature] : []),
    unrelatedFailure: !exactFailure && !exactSuccess,
    timedOut: child.timedOut,
  });
}

/** Applies signal and managed-child failure precedence before semantic classification. */
function childExitOverride(child: ManagedChildOutcome): FaultCommandResult['exitCode'] | undefined {
  if (child.cleanupFailed) return 60;
  if (child.forwardedSignal === 'SIGINT') return 130;
  if (child.forwardedSignal === 'SIGTERM') return 143;
  if (child.timedOut) return 70;
  if (child.setupFailed || child.outputTruncated || child.code === null) return 30;
  return undefined;
}

/** Maps one semantic tuple classification to the root command exit taxonomy. */
function classificationExit(classification: FaultClassification): FaultCommandResult['exitCode'] {
  if (classification === 'killed') return 0;
  if (classification === 'survived') return 21;
  if (classification === 'timeout') return 70;
  if (classification === 'infrastructure-failed') return 30;
  return 50;
}

/** Creates one pending result from the pure tuple classification boundary. */
function pendingFromClassification(result: FaultTupleResult): PendingFaultOutcome {
  return {
    classification: result.classification,
    exitCode: classificationExit(result.classification),
    tuple: result.tuple,
    blockedClaims: result.blockedClaims,
    killedClaims: result.killedClaims,
    stage: 'sentinel',
  };
}

/** Creates an invalid result when setup fails before a trusted tuple observation exists. */
function invalidPending(tuple: FaultTuple, stage: FaultObservation['stage']): PendingFaultOutcome {
  return {
    classification:
      stage === 'validation' || stage === 'build' ? 'invalid' : 'infrastructure-failed',
    exitCode: stage === 'validation' || stage === 'build' ? 50 : 30,
    tuple,
    blockedClaims: [],
    killedClaims: [],
    stage,
  };
}

/** Applies terminal and cleanup precedence while clearing every inadmissible claim outcome. */
export function finalizePendingFaultOutcome(
  pending: PendingFaultOutcome,
  terminalExit: FaultCommandResult['exitCode'] | undefined,
  cleanupComplete: boolean,
): PendingFaultOutcome {
  if (!cleanupComplete) {
    return {
      ...invalidPending(pending.tuple, 'cleanup'),
      exitCode: 60,
    };
  }
  if (terminalExit === undefined) return pending;
  if (terminalExit === 70) {
    return {
      classification: 'timeout',
      exitCode: 70,
      tuple: pending.tuple,
      blockedClaims: [],
      killedClaims: [],
      stage: pending.stage,
    };
  }
  return {
    classification: terminalExit === 60 ? 'infrastructure-failed' : 'invalid',
    exitCode: terminalExit,
    tuple: pending.tuple,
    blockedClaims: [],
    killedClaims: [],
    stage: terminalExit === 60 ? 'cleanup' : pending.stage,
  };
}

/** Removes the exact disposable worktree and runtime directory. */
function cleanupDisposableContext(
  repositoryRoot: string,
  runtimeRoot: string,
  worktreePath: string,
): boolean {
  let clean = true;
  if (existsSync(worktreePath)) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 20_000,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      clean = false;
    }
  }
  if (clean) {
    try {
      rmSync(runtimeRoot, { recursive: true, force: true });
    } catch {
      clean = false;
    }
  }
  return clean;
}

/**
 * Executes one reviewed fault tuple in a disposable Git worktree and writes sanitized evidence.
 *
 * The primary worktree must be clean before execution. Every catalog path and command is
 * allowlisted, all child processes are shell-free, and cleanup failure takes precedence over a
 * semantic kill.
 */
export async function runCuratedFault(
  repositoryRoot: string,
  selection: FaultCommandSelection,
): Promise<FaultCommandResult> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const baseline = inspectFoundationProvenance(canonicalRoot);
  const catalog = loadFaultCatalog(canonicalRoot);
  const fault = selectFault(catalog, selection.faultId);
  const tuple = selectTuple(fault, selection);
  const runId = randomUUID();
  const runtimeRoot = resolve(canonicalRoot, 'test-harness/.assurance-runtime/fault', runId);
  const worktreePath = resolve(runtimeRoot, 'worktree');
  const resultDirectory = resolve(
    canonicalRoot,
    'test-harness/.assurance-results',
    runId,
    'fault',
    fault.id,
    tuple.claimId,
    tuple.sentinelId,
  );
  const recoveryCommand = `git worktree remove --force test-harness/.assurance-runtime/fault/${runId}/worktree`;
  let pending = invalidPending(tuple, 'validation');
  let interruptedExit: 130 | 143 | undefined;
  let worktreeCreated = false;
  const onSigint = (): void => {
    interruptedExit ??= 130;
  };
  const onSigterm = (): void => {
    interruptedExit ??= 143;
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    try {
      const targetPath = resolveFaultFile(
        canonicalRoot,
        fault.target.path,
        'test-harness/assurance/fault',
      );
      const revisionEligible = revisionIsEligible(canonicalRoot, fault.target.ancestorCommit);
      const targetHashMatches = digestFile(targetPath) === fault.target.sha256;
      if (!revisionEligible || !targetHashMatches || interruptedExit !== undefined) {
        pending = finalizePendingFaultOutcome(pending, interruptedExit ?? 50, true);
      } else {
        requireOwnedDirectory(runtimeRoot);
        execFileSync('git', ['worktree', 'add', '--detach', worktreePath, 'HEAD^{commit}'], {
          cwd: canonicalRoot,
          encoding: 'utf8',
          timeout: 30_000,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        worktreeCreated = true;
        applyReviewedPatch(canonicalRoot, worktreePath, fault.patchPath, fault.target.path);
        const build = await runBuild(fault, worktreePath);
        const buildOverride = childExitOverride(build);
        if (buildOverride !== undefined || build.code !== 0) {
          pending = finalizePendingFaultOutcome(
            invalidPending(tuple, 'build'),
            buildOverride,
            true,
          );
        } else {
          const sentinel = await runSentinel(fault, tuple, worktreePath);
          const sentinelOverride = childExitOverride(sentinel);
          const classified = classifyFaultTuple({
            tuples: fault.tuples,
            claimId: tuple.claimId,
            sentinelId: tuple.sentinelId,
            revisionEligible,
            targetHashMatches,
            observation: observationFromSentinelChild(
              'sentinel',
              sentinel,
              tuple.expectedSignature,
            ),
          });
          pending = finalizePendingFaultOutcome(
            pendingFromClassification(classified),
            sentinelOverride ?? interruptedExit,
            true,
          );
        }
      }
    } catch {
      pending = invalidPending(tuple, worktreeCreated ? 'build' : 'validation');
    }

    const cleanupSucceeded = cleanupDisposableContext(canonicalRoot, runtimeRoot, worktreePath);
    let primaryTreeUnchanged: boolean;
    try {
      const after = inspectFoundationProvenance(canonicalRoot);
      primaryTreeUnchanged =
        after.commitIdentity === baseline.commitIdentity &&
        after.treeIdentity === baseline.treeIdentity &&
        after.assuranceToolDigest === baseline.assuranceToolDigest;
    } catch {
      primaryTreeUnchanged = false;
    }
    const cleanupComplete = cleanupSucceeded && primaryTreeUnchanged;
    pending = finalizePendingFaultOutcome(pending, interruptedExit, true);
    pending = finalizePendingFaultOutcome(pending, undefined, cleanupComplete);
    requireOwnedDirectory(resultDirectory);
    const artifactPath = resolve(resultDirectory, 'fault-result.json');
    const residue = [
      ...(cleanupSucceeded ? [] : ['disposable-worktree']),
      ...(primaryTreeUnchanged ? [] : ['primary-tree-drift']),
    ];
    writeAtomic(artifactPath, {
      version: 1,
      runId,
      faultId: fault.id,
      claimId: tuple.claimId,
      sentinelId: tuple.sentinelId,
      expectedSignature: tuple.expectedSignature,
      classification: pending.classification,
      stage: pending.stage,
      exitCode: pending.exitCode,
      blockedClaims: pending.blockedClaims,
      killedClaims: pending.killedClaims,
      targetRevision: baseline.commitIdentity,
      targetHash: fault.target.sha256,
      primaryTreeUnchanged,
      residue,
      recoveryCommand: cleanupSucceeded ? undefined : recoveryCommand,
    });
    return {
      runId,
      classification: pending.classification,
      exitCode: pending.exitCode,
      artifactPath: relative(canonicalRoot, artifactPath).split(sep).join('/'),
      recoveryCommand: cleanupSucceeded ? undefined : recoveryCommand,
      stage: pending.stage,
      blockedClaims: pending.blockedClaims,
      killedClaims: pending.killedClaims,
      worktreeCreated,
      primaryTreeUnchanged,
      residue,
    };
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}
