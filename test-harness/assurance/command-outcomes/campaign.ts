import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import {
  commandOutcomeForbiddenEvidenceFields,
  commandOutcomeMatrixRequirement,
} from '../tests/command-outcome-matrix-requirements.js';
import type { CommandOutcomeRequirement } from '../tests/command-outcome-matrix-contract.js';
import type {
  CommandOutcomeCampaignArtifact,
  CommandOutcomeCaseEvidence,
  CommandSignalCaseEvidence,
} from './model.js';
import {
  registeredCommandStages,
  registeredExecutableScenarios,
  terminalEventForScenario,
} from './registry.js';
import { reduceCommandTerminalEvents } from './reducer.js';

/** Maximum time allowed for one isolated stage to report readiness and terminate. */
const probeTimeoutMilliseconds = 5_000;

/** UUID format used to fence campaign and recovery ownership. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Waits for a predicate without extending a probe past its deadline. */
async function waitFor(predicate: () => boolean, timeoutMilliseconds: number): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('command signal probe timed out');
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}

/** Returns whether an isolated process group still exists. */
function processGroupExists(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

/** Hashes the current revision, index/worktree state, and tool entry without retaining paths. */
function primaryFingerprint(repositoryRoot: string): string {
  const revision = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5_000,
  });
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5_000,
  });
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    timeout: 10_000,
  });
  return `sha256:${createHash('sha256').update(revision).update(tree).update(status).digest('hex')}`;
}

/** Creates one canonical owner-only directory. */
function createOwnedDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error('command outcome directory is not canonical');
  }
}

/** Writes one owner-only JSON artifact through an atomic rename. */
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

/** Returns whether an object graph contains one forbidden evidence key. */
function hasForbiddenEvidenceKey(value: unknown, forbidden: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => hasForbiddenEvidenceKey(entry, forbidden));
  }
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(
    ([key, entry]) => forbidden.has(key) || hasForbiddenEvidenceKey(entry, forbidden),
  );
}

/** Removes one exact identity-bearing campaign residue without touching sibling owners. */
export function recoverCommandOutcomeResidue(
  repositoryRoot: string,
  runId: string,
  caseId: string,
): boolean {
  if (!uuidPattern.test(runId) || !uuidPattern.test(caseId)) return false;
  const canonicalRoot = realpathSync(repositoryRoot);
  const caseRoot = resolve(
    canonicalRoot,
    'test-harness/.assurance-runtime/command-outcomes',
    runId,
    'cases',
    caseId,
  );
  const ownerPath = resolve(caseRoot, 'owner');
  try {
    if (!existsSync(ownerPath) || readFileSync(ownerPath, 'utf8') !== runId) return false;
    rmSync(caseRoot, { recursive: true, force: true });
    return !existsSync(caseRoot);
  } catch {
    return false;
  }
}

/** Confirms that implementation and immutable executable dispositions are byte-for-byte equal. */
function validateImplementationRegistry(): void {
  for (const requirement of commandOutcomeMatrixRequirement.requirements) {
    const observed = registeredExecutableScenarios[requirement.alias].has(requirement.scenario);
    if (observed !== (requirement.disposition === 'executable')) {
      throw new Error(
        'command outcome implementation registry diverges from immutable requirements',
      );
    }
  }
  for (const stage of registeredCommandStages) {
    const sourcePath = resolve(process.cwd(), stage.sourceModule);
    if (!existsSync(sourcePath) || !lstatSync(sourcePath).isFile()) {
      throw new Error('registered command stage source is unavailable');
    }
  }
}

/** Reduces and compares one requirements row without executing unsupported pairs. */
function evaluateOutcome(requirement: CommandOutcomeRequirement): CommandOutcomeCaseEvidence {
  if (requirement.disposition === 'unsupported') {
    return {
      alias: requirement.alias,
      scenario: requirement.scenario,
      executionStatus: 'unsupported',
      matched: true,
    };
  }
  const event = terminalEventForScenario(requirement.scenario);
  const events = event === undefined ? [] : [event];
  if (requirement.scenario === 'cleanup-failure') {
    events.unshift({ exitCode: 21, classification: 'test-failure', stage: 'oracle' });
  }
  const observed = reduceCommandTerminalEvents(events);
  return {
    alias: requirement.alias,
    scenario: requirement.scenario,
    executionStatus: 'completed',
    exitCode: observed.exitCode,
    classification: observed.classification,
    stage: observed.stage,
    matched:
      observed.exitCode === requirement.exitCode &&
      observed.classification === requirement.classification &&
      observed.stage === requirement.stage,
  };
}

/** Runs one real signal probe and verifies process-group and file-resource cleanup. */
async function runSignalCase(
  repositoryRoot: string,
  runtimeParent: string,
  runId: string,
  stage: (typeof registeredCommandStages)[number],
  signal: 'SIGINT' | 'SIGTERM',
  foreignPath: string,
  foreignDigest: string,
): Promise<CommandSignalCaseEvidence> {
  if (!stage.resourceOwning) {
    return {
      alias: stage.alias,
      stageId: stage.stageId,
      signal,
      executionStatus: 'not-applicable',
      ownedResourceRemoved: true,
      foreignOwnerPreserved:
        existsSync(foreignPath) &&
        createHash('sha256').update(readFileSync(foreignPath)).digest('hex') === foreignDigest,
    };
  }
  const caseId = randomUUID();
  const caseRoot = resolve(runtimeParent, runId, 'cases', caseId);
  const readyPath = resolve(caseRoot, 'ready');
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'test-harness/assurance/command-outcomes/probe.ts',
      runtimeParent,
      runId,
      caseId,
    ],
    { cwd: repositoryRoot, detached: true, shell: false, stdio: 'ignore' },
  );
  try {
    await waitFor(() => existsSync(readyPath), probeTimeoutMilliseconds);
    process.kill(-child.pid!, signal);
    const exitCode = await new Promise<number | null>((resolveClose) =>
      child.once('close', (code) => resolveClose(code)),
    );
    await waitFor(() => !processGroupExists(child.pid), probeTimeoutMilliseconds);
    const expectedExit = signal === 'SIGINT' ? 130 : 143;
    return {
      alias: stage.alias,
      stageId: stage.stageId,
      signal,
      executionStatus: 'completed',
      exitCode: exitCode === expectedExit ? expectedExit : undefined,
      ownedResourceRemoved: !existsSync(caseRoot),
      foreignOwnerPreserved:
        existsSync(foreignPath) &&
        createHash('sha256').update(readFileSync(foreignPath)).digest('hex') === foreignDigest,
    };
  } finally {
    if (processGroupExists(child.pid)) process.kill(-child.pid!, 'SIGKILL');
    rmSync(caseRoot, { recursive: true, force: true });
  }
}

/** Executes the closed terminal-protocol campaign and returns its retained artifact path. */
export async function runCommandOutcomeCampaign(repositoryRoot: string): Promise<string> {
  const canonicalRoot = realpathSync(repositoryRoot);
  validateImplementationRegistry();
  const before = primaryFingerprint(canonicalRoot);
  const runId = randomUUID();
  const runtimeParent = resolve(canonicalRoot, 'test-harness/.assurance-runtime/command-outcomes');
  const runtimeRoot = resolve(runtimeParent, runId);
  const foreignRoot = resolve(runtimeParent, `foreign-${randomUUID()}`);
  const foreignPath = resolve(foreignRoot, 'decoy');
  createOwnedDirectory(runtimeRoot);
  createOwnedDirectory(foreignRoot);
  writeFileSync(foreignPath, 'foreign-owner-decoy\n', {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  const foreignDigest = createHash('sha256').update(readFileSync(foreignPath)).digest('hex');
  const outcomes = commandOutcomeMatrixRequirement.requirements.map(evaluateOutcome);
  const signals: CommandSignalCaseEvidence[] = [];
  let recoveryVerified: boolean;
  try {
    for (const stage of registeredCommandStages) {
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        signals.push(
          await runSignalCase(
            canonicalRoot,
            runtimeParent,
            runId,
            stage,
            signal,
            foreignPath,
            foreignDigest,
          ),
        );
      }
    }
    const recoveryCaseId = randomUUID();
    const residue = resolve(runtimeRoot, 'cases', recoveryCaseId);
    createOwnedDirectory(residue);
    writeFileSync(resolve(residue, 'owner'), runId, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    recoveryVerified = recoverCommandOutcomeResidue(canonicalRoot, runId, recoveryCaseId);
  } finally {
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
  const foreignOwnerPreserved =
    existsSync(foreignPath) &&
    createHash('sha256').update(readFileSync(foreignPath)).digest('hex') === foreignDigest;
  rmSync(foreignRoot, { recursive: true, force: true });
  const after = primaryFingerprint(canonicalRoot);
  const artifact: CommandOutcomeCampaignArtifact = {
    schemaVersion: 1,
    runId,
    evidenceScope: 'assurance-terminal-protocol-only',
    primaryFingerprint: { before, after, unchanged: before === after },
    outcomes,
    signals,
    recoveryVerified,
    foreignOwnerPreserved,
    ownedResourcesRemoved: !existsSync(runtimeRoot) && !existsSync(foreignRoot),
    artifactMode: 0o600,
    atomicWrite: true,
    rawDiagnosticsRetained: false,
  };
  if (
    outcomes.some((entry) => !entry.matched) ||
    signals.some(
      (entry) =>
        !entry.ownedResourceRemoved ||
        !entry.foreignOwnerPreserved ||
        (entry.executionStatus === 'completed' && entry.exitCode === undefined),
    ) ||
    !artifact.primaryFingerprint.unchanged ||
    !artifact.recoveryVerified ||
    !artifact.foreignOwnerPreserved ||
    !artifact.ownedResourcesRemoved
  ) {
    throw new Error('command outcome campaign did not satisfy the immutable contract');
  }
  if (hasForbiddenEvidenceKey(artifact, new Set(commandOutcomeForbiddenEvidenceFields))) {
    throw new Error('command outcome artifact contains a forbidden field');
  }
  const resultPath = resolve(
    canonicalRoot,
    'test-harness/.assurance-results',
    runId,
    'command-outcomes/result.json',
  );
  writeAtomic(resultPath, artifact);
  return relative(canonicalRoot, resultPath);
}
