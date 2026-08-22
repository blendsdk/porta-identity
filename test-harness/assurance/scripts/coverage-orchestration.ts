import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CoverageWorkspace } from '../coverage/index.js';
import { runManagedChild, type ManagedChildOutcome } from './managed-child.js';

/** Stable stages that may appear in a sanitized failed-capture artifact. */
export type CoverageFailureStage =
  | 'startup'
  | 'active-run'
  | 'container-inspect'
  | 'project'
  | 'graceful-stop'
  | 'raw-extract'
  | 'raw-validate'
  | 'conversion'
  | 'observation'
  | 'cleanup';

/** Executes work only after this invocation successfully acquired a harness stack. */
export async function withOwnedHarnessStack(
  start: () => Promise<number>,
  stopOwned: () => Promise<number>,
  work: () => Promise<number>,
): Promise<number> {
  const startExit = await start();
  if (startExit !== 0) return startExit;

  let primaryExit: number;
  try {
    primaryExit = await work();
  } catch {
    primaryExit = 30;
  } finally {
    const cleanupExit = await stopOwned();
    if (cleanupExit !== 0) primaryExit = 60;
  }
  return primaryExit;
}

/** Runs conversion/reporting in an isolated process group with a bounded TERM/KILL deadline. */
export function runManagedCoverageConversion(
  repositoryRoot: string,
  workspace: CoverageWorkspace,
): Promise<ManagedChildOutcome> {
  return runManagedChild(
    process.execPath,
    [
      '--import',
      'tsx',
      resolve(import.meta.dirname, 'coverage-conversion-worker.ts'),
      '--workspace',
      workspace.root,
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'pipe',
      maxOutputBytes: 64 * 1024,
      timeoutMilliseconds: 300_000,
      terminationGraceMilliseconds: 5_000,
      cleanup: () => undefined,
    },
  );
}

/** Removes an observation that cannot be admitted because the complete command did not succeed. */
export function removeCoverageObservation(workspace: CoverageWorkspace): void {
  rmSync(resolve(workspace.reportDirectory, 'coverage-observation.json'), { force: true });
}

/** Atomically records one sanitized terminal failure without paths or exception text. */
export function writeCoverageFailureArtifact(
  workspace: CoverageWorkspace,
  details: Readonly<{
    stage: CoverageFailureStage;
    exitCode: number;
    classification: string;
    project: string;
    profile: string;
    seed: string;
  }>,
): string {
  mkdirSync(workspace.root, { recursive: true, mode: 0o700 });
  const path = resolve(workspace.root, 'coverage-failure.json');
  const replacement = resolve(workspace.root, '.coverage-failure.tmp');
  rmSync(replacement, { force: true });
  writeFileSync(
    replacement,
    `${JSON.stringify({ version: 1, status: 'failed', ...details }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  renameSync(replacement, path);
  return path;
}
