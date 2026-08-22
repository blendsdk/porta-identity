import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import { runManagedChild } from '../scripts/managed-child.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import type {
  MutationPilotArtifact,
  MutationPilotCommandResult,
  MutationPilotTargetResult,
  MutationPilotWorkerResult,
} from './model.js';
import { registeredMutationPilotTargets } from './registry.js';

/** UUID format used to fence mutation runtime and recovery ownership. */
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Maximum count-only worker output accepted into memory. */
const workerOutputLimitBytes = 64 * 1024;

/** Maximum end-to-end Stryker child runtime for the two-file pilot. */
const pilotTimeoutMilliseconds = 900_000;

/** Creates a canonical owner-only directory. */
function createOwnedDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error('mutation pilot directory is not canonical');
  }
}

/** Writes one sanitized artifact atomically with owner-only permissions. */
function writeAtomic(path: string, value: unknown): void {
  createOwnedDirectory(dirname(path));
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

/** Reads and validates one exact installed package version. */
function installedPackageVersion(repositoryRoot: string, packageName: string): '9.6.1' {
  const packagePath = resolve(
    repositoryRoot,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );
  const value: unknown = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (!isRecord(value)) throw new Error('mutation runner package manifest is invalid');
  if (value.version !== '9.6.1') throw new Error('mutation runner package version is not approved');
  return value.version;
}

/** Narrows parsed JSON to an ordinary string-keyed record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads one non-negative safe integer from a parsed classification record. */
function classificationCount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
    throw new Error('mutation classification count is invalid');
  }
  return value;
}

/** Creates a detached worktree at the exact clean source commit. */
function createDetachedWorktree(
  repositoryRoot: string,
  worktreePath: string,
  commitIdentity: string,
): void {
  const commit = commitIdentity.replace(/^commit:/u, '');
  execFileSync('git', ['worktree', 'add', '--detach', '--', worktreePath, commit], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const observed = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
    cwd: worktreePath,
    encoding: 'utf8',
    timeout: 5_000,
  }).trim();
  if (observed !== commit) throw new Error('detached mutation worktree revision changed');
}

/** Shares the frozen root dependency tree without installing into the disposable checkout. */
function linkDependencies(repositoryRoot: string, worktreePath: string): void {
  const source = realpathSync(resolve(repositoryRoot, 'node_modules'));
  const destination = resolve(worktreePath, 'node_modules');
  symlinkSync(source, destination, 'dir');
  if (realpathSync(destination) !== source || readlinkSync(destination) !== source) {
    throw new Error('mutation dependency link does not identify the frozen root install');
  }
}

/** Removes one exact registered worktree without pruning unrelated Git metadata. */
function removeDetachedWorktree(repositoryRoot: string, worktreePath: string): void {
  if (!existsSync(worktreePath)) return;
  execFileSync('git', ['worktree', 'remove', '--force', '--', worktreePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (existsSync(worktreePath)) throw new Error('mutation worktree cleanup did not prove absence');
}

/** Validates the count-only worker result and rejects missing or additional targets. */
export function validateMutationPilotWorkerResult(value: unknown): MutationPilotWorkerResult {
  if (!isRecord(value)) throw new Error('mutation worker result is not an object');
  const record = value;
  if (
    record.schemaVersion !== 1 ||
    (record.compatibility !== 'compatible' && record.compatibility !== 'incompatible') ||
    !Array.isArray(record.targets)
  ) {
    throw new Error('mutation worker result has an unsupported schema');
  }
  if (record.compatibility === 'incompatible') {
    if (record.targets.length !== 0) {
      throw new Error('incompatible mutation worker result must not claim target results');
    }
    return { schemaVersion: 1, compatibility: 'incompatible', targets: [] };
  }
  const targets: MutationPilotTargetResult[] = record.targets.map((target) => {
    if (!isRecord(target)) throw new Error('mutation target result is invalid');
    const candidate = target;
    const sourcePath = candidate.sourcePath;
    const counts = candidate.classifications;
    if (
      typeof sourcePath !== 'string' ||
      !registeredMutationPilotTargets.some((registered) => registered.sourcePath === sourcePath) ||
      !isRecord(counts)
    ) {
      throw new Error('mutation target result is not registered');
    }
    const countRecord = counts;
    const classifications = {
      killed: classificationCount(countRecord, 'killed'),
      survived: classificationCount(countRecord, 'survived'),
      invalid: classificationCount(countRecord, 'invalid'),
      'no-coverage': classificationCount(countRecord, 'no-coverage'),
      timeout: classificationCount(countRecord, 'timeout'),
    };
    if (
      Object.keys(countRecord).sort().join(',') !==
      ['invalid', 'killed', 'no-coverage', 'survived', 'timeout'].join(',')
    ) {
      throw new Error('mutation classification counts are invalid');
    }
    const total = Object.values(classifications).reduce((sum, count) => sum + count, 0);
    if (candidate.total !== total)
      throw new Error('mutation target total does not match classifications');
    return {
      sourcePath,
      classifications,
      total,
    };
  });
  if (
    targets.length !== registeredMutationPilotTargets.length ||
    new Set(targets.map((target) => target.sourcePath)).size !== targets.length ||
    registeredMutationPilotTargets.some(
      (registered) => !targets.some((target) => target.sourcePath === registered.sourcePath),
    )
  ) {
    throw new Error('mutation worker result does not cover the exact target set');
  }
  return { schemaVersion: 1, compatibility: 'compatible', targets };
}

/** Selects a truthful pilot-level decision without using a global score. */
export function decideMutationPilot(
  targets: readonly MutationPilotTargetResult[],
): Pick<MutationPilotArtifact, 'decision' | 'reason'> {
  if (targets.every((target) => target.total === 0)) {
    return { decision: 'no-go', reason: 'no-generated-variations' };
  }
  if (
    targets.some(
      (target) =>
        target.total === 0 || target.classifications.killed + target.classifications.survived === 0,
    )
  ) {
    return { decision: 'no-go', reason: 'target-without-observable-result' };
  }
  return { decision: 'go', reason: 'compatible-useful-results' };
}

/** Removes one owner-validated mutation runtime and proves absence. */
export function recoverMutationPilotRun(repositoryRoot: string, runId: string): boolean {
  if (!runIdPattern.test(runId)) return false;
  const canonicalRoot = realpathSync(repositoryRoot);
  const runtimeRoot = resolve(canonicalRoot, 'test-harness/.assurance-runtime/mutation', runId);
  const worktreePath = resolve(runtimeRoot, 'worktree');
  try {
    removeDetachedWorktree(canonicalRoot, worktreePath);
    rmSync(runtimeRoot, { recursive: true, force: true });
    return !existsSync(runtimeRoot);
  } catch {
    return false;
  }
}

/** Executes the exact local pilot and writes one sanitized count-only artifact. */
export async function runMutationPilot(
  repositoryRoot: string,
): Promise<MutationPilotCommandResult> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const provenance = inspectFoundationProvenance(canonicalRoot);
  const runId = randomUUID();
  const runtimeRoot = resolve(canonicalRoot, 'test-harness/.assurance-runtime/mutation', runId);
  const worktreePath = resolve(runtimeRoot, 'worktree');
  const workerResultPath = resolve(runtimeRoot, 'worker-result.json');
  const resultPath = resolve(
    canonicalRoot,
    'test-harness/.assurance-results',
    runId,
    'mutation/bounded-pilot/result.json',
  );
  createOwnedDirectory(runtimeRoot);
  let worktreeCreated = false;
  let workerResult: MutationPilotWorkerResult | undefined;
  let terminalExit: MutationPilotCommandResult['exitCode'] = 30;
  try {
    const runnerVersion = installedPackageVersion(canonicalRoot, '@stryker-mutator/core');
    const runnerPackageVersion = installedPackageVersion(
      canonicalRoot,
      '@stryker-mutator/vitest-runner',
    );
    createDetachedWorktree(canonicalRoot, worktreePath, provenance.commitIdentity);
    worktreeCreated = true;
    linkDependencies(canonicalRoot, worktreePath);
    const child = await runManagedChild(
      process.execPath,
      ['--import', 'tsx', 'test-harness/assurance/mutation/worker.ts'],
      {
        cwd: worktreePath,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: workerOutputLimitBytes,
        timeoutMilliseconds: pilotTimeoutMilliseconds,
        terminationGraceMilliseconds: 10_000,
        cleanup: () => undefined,
      },
    );
    if (child.cleanupFailed) terminalExit = 60;
    else if (child.forwardedSignal === 'SIGINT') terminalExit = 130;
    else if (child.forwardedSignal === 'SIGTERM') terminalExit = 143;
    else if (child.timedOut) terminalExit = 70;
    else if (child.code !== 0) terminalExit = 30;
    else {
      workerResult = validateMutationPilotWorkerResult(
        JSON.parse(readFileSync(workerResultPath, 'utf8')),
      );
      terminalExit = 0;
    }
    removeDetachedWorktree(canonicalRoot, worktreePath);
    worktreeCreated = false;
    rmSync(runtimeRoot, { recursive: true, force: true });
    const after = inspectFoundationProvenance(canonicalRoot);
    const primaryTreeUnchanged = JSON.stringify(after) === JSON.stringify(provenance);
    if (!primaryTreeUnchanged) terminalExit = 60;
    if (workerResult === undefined || terminalExit !== 0) {
      return { runId, exitCode: terminalExit };
    }
    const decision =
      workerResult.compatibility === 'incompatible'
        ? ({ decision: 'no-go', reason: 'runner-incompatible' } as const)
        : decideMutationPilot(workerResult.targets);
    const artifact: MutationPilotArtifact = {
      schemaVersion: 1,
      runId,
      selector: 'bounded-pilot',
      ...decision,
      provenance: {
        ...provenance,
        dependencyLockDigest: `sha256:${createHash('sha256')
          .update(readFileSync(resolve(canonicalRoot, 'yarn.lock')))
          .digest('hex')}`,
        runnerVersion,
        runnerPackageVersion,
      },
      targets: workerResult.targets,
      freshDetachedWorktree: true,
      primaryTreeUnchanged,
      ownedResourcesRemoved: true,
      residue: [],
      artifactMode: 0o600,
      atomicWrite: true,
      rawDiagnosticsRetained: false,
      modifiedProductSourceRetained: false,
    };
    writeAtomic(resultPath, artifact);
    return {
      runId,
      exitCode: 0,
      artifactPath: relative(canonicalRoot, resultPath),
      decision: artifact.decision,
    };
  } catch {
    const recovered = recoverMutationPilotRun(canonicalRoot, runId);
    return recovered
      ? { runId, exitCode: terminalExit === 0 ? 50 : terminalExit }
      : {
          runId,
          exitCode: 60,
          recoveryCommand: `yarn assurance:mutation --recover ${runId}`,
        };
  } finally {
    if (worktreeCreated && !recoverMutationPilotRun(canonicalRoot, runId)) {
      // Recovery remains explicit in the returned result; no broad cleanup is attempted here.
    }
  }
}
