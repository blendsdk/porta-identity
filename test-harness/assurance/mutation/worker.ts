import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';

import { Stryker } from '@stryker-mutator/core';

import type {
  MutationPilotClassification,
  MutationPilotTargetResult,
  MutationPilotWorkerResult,
} from './model.js';
import { registeredMutationPilotTargets } from './registry.js';

/** Converts one Stryker status into the smaller stable assurance vocabulary. */
function classifyStatus(status: string): MutationPilotClassification {
  switch (status) {
    case 'Killed':
      return 'killed';
    case 'Survived':
      return 'survived';
    case 'NoCoverage':
      return 'no-coverage';
    case 'Timeout':
      return 'timeout';
    case 'CompileError':
    case 'RuntimeError':
    case 'Ignored':
    case 'Pending':
      return 'invalid';
    default:
      throw new Error('mutation runner returned an unknown status');
  }
}

/** Returns a normalized repository-relative path and rejects worktree escapes. */
function repositoryPath(path: string): string {
  const normalized = (isAbsolute(path) ? relative(process.cwd(), path) : path).split(sep).join('/');
  if (normalized.startsWith('../') || normalized.startsWith('/') || normalized.includes('\\')) {
    throw new Error('mutation runner returned a path outside the disposable worktree');
  }
  return normalized;
}

/** Creates an empty count record without retaining variation details. */
function emptyCounts(): Record<MutationPilotClassification, number> {
  return { killed: 0, survived: 0, invalid: 0, 'no-coverage': 0, timeout: 0 };
}

/** Runs the version-pinned Stryker API and writes only bounded count evidence. */
async function main(): Promise<void> {
  const runner = new Stryker({
    basePath: process.cwd(),
    mutate: registeredMutationPilotTargets.map((target) => target.sourcePath),
    testFiles: registeredMutationPilotTargets.map((target) => target.testPath),
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    reporters: [],
    coverageAnalysis: 'perTest',
    concurrency: 1,
    timeoutMS: 10_000,
    timeoutFactor: 1.5,
    dryRunTimeoutMinutes: 5,
    cleanTempDir: true,
    tempDirName: '.stryker-tmp/porta-bounded-pilot',
    disableTypeChecks: true,
    thresholds: { high: 100, low: 0, break: null },
    vitest: {
      configFile: 'packages/server/vitest.config.ts',
      dir: 'packages/server',
      related: false,
    },
  });
  let variations: Awaited<ReturnType<Stryker['runMutationTest']>>;
  try {
    variations = await runner.runMutationTest();
  } catch {
    const incompatible: MutationPilotWorkerResult = {
      schemaVersion: 1,
      compatibility: 'incompatible',
      targets: [],
    };
    writeFileSync(
      resolve(process.cwd(), '../worker-result.json'),
      `${JSON.stringify(incompatible)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    return;
  }
  const byTarget = new Map<string, Record<MutationPilotClassification, number>>(
    registeredMutationPilotTargets.map((target) => [target.sourcePath, emptyCounts()]),
  );
  for (const variation of variations) {
    const sourcePath = repositoryPath(variation.fileName);
    const counts = byTarget.get(sourcePath);
    if (counts === undefined) throw new Error('mutation runner returned an unregistered target');
    counts[classifyStatus(variation.status)] += 1;
  }
  const targets: MutationPilotTargetResult[] = registeredMutationPilotTargets.map((target) => {
    const classifications = byTarget.get(target.sourcePath);
    if (classifications === undefined) throw new Error('registered mutation target is missing');
    return {
      sourcePath: target.sourcePath,
      classifications,
      total: Object.values(classifications).reduce((sum, count) => sum + count, 0),
    };
  });
  const result: MutationPilotWorkerResult = {
    schemaVersion: 1,
    compatibility: 'compatible',
    targets,
  };
  writeFileSync(resolve(process.cwd(), '../worker-result.json'), `${JSON.stringify(result)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

await main();
