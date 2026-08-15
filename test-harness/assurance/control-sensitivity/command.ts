import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { executeControlSensitivityCheck } from './executor.js';
import { LocalControlSensitivityRuntime } from './local-runtime.js';
import type { ControlSensitivityOutcome } from './model.js';
import { tenantAdminControlCheck } from './registry.js';

/** Root-command result for one defensive local control check. */
export interface ControlSensitivityCommandResult {
  /** Local control-check owner. */
  readonly runId: string;
  /** Stable operator-facing outcome. */
  readonly outcome: ControlSensitivityOutcome;
  /** Root assurance exit code. */
  readonly exitCode: 0 | 21 | 30 | 50 | 60 | 70;
  /** Repository-relative sanitized artifact. */
  readonly artifactPath: string;
  /** Bounded root recovery command when owned-resource absence is not proven. */
  readonly recoveryCommand?: string;
}

/** Maps defensive check outcomes to the stable root command taxonomy. */
function outcomeExit(outcome: ControlSensitivityOutcome, cleanupComplete: boolean) {
  if (!cleanupComplete) return 60 as const;
  if (outcome === 'detected') return 0 as const;
  if (outcome === 'not-detected') return 21 as const;
  if (outcome === 'check-invalid') return 50 as const;
  if (outcome === 'timed-out') return 70 as const;
  return 30 as const;
}

/** Writes one owner-only JSON artifact using an atomic same-directory rename. */
function writeAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, undefined, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Executes one code-owned local control check and records only sanitized result fields. */
export async function runTenantAdminControlSensitivity(
  repositoryRoot: string,
  id: string,
): Promise<ControlSensitivityCommandResult> {
  const definition = tenantAdminControlCheck(id);
  const runtime = new LocalControlSensitivityRuntime(repositoryRoot);
  const result = await executeControlSensitivityCheck(definition, runtime);
  const artifact = resolve(
    repositoryRoot,
    'test-harness/.assurance-results',
    runtime.runId,
    'control-check',
    definition.id,
    'result.json',
  );
  mkdirSync(resolve(artifact, '..'), { recursive: true, mode: 0o700 });
  const exitCode = outcomeExit(result.outcome, result.cleanupComplete);
  writeAtomic(artifact, {
    version: 1,
    runId: runtime.runId,
    controlCheckId: definition.id,
    subSentinel: definition.subSentinel,
    outcome: result.outcome,
    stage: result.stage,
    exitCode,
    cleanupComplete: result.cleanupComplete,
    signature: result.signature,
  });
  return Object.freeze({
    runId: runtime.runId,
    outcome: result.outcome,
    exitCode,
    artifactPath: relative(repositoryRoot, artifact).split(sep).join('/'),
    recoveryCommand: result.cleanupComplete
      ? undefined
      : `yarn assurance:control-check --recover ${runtime.runId}`,
  });
}
