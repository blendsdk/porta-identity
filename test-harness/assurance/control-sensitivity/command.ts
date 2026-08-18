import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { z } from 'zod';

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
  readonly exitCode: 0 | 21 | 30 | 50 | 60 | 70 | 130 | 143;
  /** Repository-relative sanitized artifact. */
  readonly artifactPath: string;
  /** Bounded root recovery command when owned-resource absence is not proven. */
  readonly recoveryCommand?: string;
}

/** Maps defensive check outcomes to the stable root command taxonomy. */
export function controlSensitivityExitCode(
  outcome: ControlSensitivityOutcome,
  cleanupComplete: boolean,
  terminalSignal?: 'SIGINT' | 'SIGTERM',
) {
  if (!cleanupComplete) return 60 as const;
  if (terminalSignal === 'SIGINT') return 130 as const;
  if (terminalSignal === 'SIGTERM') return 143 as const;
  if (outcome === 'detected') return 0 as const;
  if (outcome === 'not-detected') return 21 as const;
  if (outcome === 'check-invalid') return 50 as const;
  if (outcome === 'timed-out') return 70 as const;
  return 30 as const;
}

const resultArtifactSchema = z
  .object({
    version: z.literal(2),
    runId: z.uuid(),
    controlCheckId: z.string().min(1),
    subSentinel: z.string().min(1),
    outcome: z.enum([
      'detected',
      'not-detected',
      'check-invalid',
      'environment-failed',
      'timed-out',
    ]),
    stage: z.enum(['validation', 'variant', 'build', 'startup', 'fixture', 'check', 'cleanup']),
    exitCode: z.union([
      z.literal(0),
      z.literal(21),
      z.literal(30),
      z.literal(50),
      z.literal(60),
      z.literal(70),
      z.literal(130),
      z.literal(143),
    ]),
    cleanupComplete: z.boolean(),
    signature: z.string().min(1).optional(),
    terminalSignal: z.enum(['SIGINT', 'SIGTERM']).optional(),
    provenance: z
      .object({
        commitIdentity: z.string().regex(/^commit:[0-9a-f]{40}$/u),
        treeIdentity: z.string().regex(/^tree:[0-9a-f]{40}$/u),
        assuranceToolDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
        dependencyLockDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
        targetPath: z.string().min(1),
        originalSha256: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
        variantSha256: z
          .string()
          .regex(/^sha256:[0-9a-f]{64}$/u)
          .optional(),
        lifecycleRunId: z.uuid().optional(),
        fixtureIdentity: z
          .string()
          .regex(/^sha256:[0-9a-f]{64}$/u)
          .optional(),
        serverImageDigest: z
          .string()
          .regex(/^sha256:[0-9a-f]{64}$/u)
          .optional(),
        containerIds: z
          .array(z.string().regex(/^[0-9a-f]{64}$/u))
          .min(1)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (
      (artifact.outcome === 'detected' || artifact.outcome === 'not-detected') &&
      (artifact.provenance?.variantSha256 === undefined ||
        artifact.provenance.lifecycleRunId === undefined ||
        artifact.provenance.fixtureIdentity === undefined ||
        artifact.provenance.serverImageDigest === undefined ||
        artifact.provenance.containerIds === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['provenance'],
        message: 'completed control-check evidence requires complete runtime provenance',
      });
    }
  });

/** Validates one sanitized control-check result before it can be admitted as evidence. */
export function validateControlSensitivityArtifact(value: unknown): unknown {
  return resultArtifactSchema.parse(value);
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
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
  const onSigint = (): void => {
    interrupted ??= 'SIGINT';
  };
  const onSigterm = (): void => {
    interrupted ??= 'SIGTERM';
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  const result = await (async () => {
    try {
      return await executeControlSensitivityCheck(definition, runtime, () => interrupted);
    } finally {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    }
  })();
  const artifact = resolve(
    repositoryRoot,
    'test-harness/.assurance-results',
    runtime.runId,
    'control-check',
    definition.id,
    'result.json',
  );
  mkdirSync(resolve(artifact, '..'), { recursive: true, mode: 0o700 });
  const exitCode = controlSensitivityExitCode(
    result.outcome,
    result.cleanupComplete,
    result.terminalSignal,
  );
  if (
    (result.outcome === 'detected' || result.outcome === 'not-detected') &&
    (result.provenance?.targetPath !== definition.targetPath ||
      result.provenance.originalSha256 !== definition.originalSha256)
  ) {
    throw new Error('control-check evidence does not match its registered source target');
  }
  const evidence = resultArtifactSchema.parse({
    version: 2,
    runId: runtime.runId,
    controlCheckId: definition.id,
    subSentinel: definition.subSentinel,
    outcome: result.outcome,
    stage: result.stage,
    exitCode,
    cleanupComplete: result.cleanupComplete,
    signature: result.signature,
    terminalSignal: result.terminalSignal,
    provenance: result.provenance,
  });
  writeAtomic(artifact, evidence);
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
