import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { executeControlSensitivityCheck } from '../control-sensitivity/executor.js';
import {
  controlSensitivityExitCode,
  validateControlSensitivityArtifact,
} from '../control-sensitivity/command.js';
import {
  LocalControlSensitivityRuntime,
  recoverLocalControlSensitivityRun,
} from '../control-sensitivity/local-runtime.js';
import type {
  ControlSensitivityRuntime,
  ControlSensitivityStageObservation,
  TenantAdminControlCheckDefinition,
} from '../control-sensitivity/model.js';
import {
  tenantAdminControlCheck,
  tenantAdminControlChecks,
} from '../control-sensitivity/registry.js';
import { applyControlVariant } from '../control-sensitivity/variant.js';
import type { ManagedChildOutcome } from '../scripts/managed-child.js';
import { tenantAdminFaultRequirements } from './tenant-admin-fault-requirements.js';
import { createTenantAdminBoundariesSpecRig } from './tenant-admin-boundaries-spec-rig.js';
import { evaluateTenantAdminControlCheck } from './tenant-admin-fault-live-adapter.js';

const passed: ControlSensitivityStageObservation = Object.freeze({ status: 'passed' });

/** Deterministic runtime double used only to verify stage ordering and result precedence. */
class SensitivityRuntimeDouble implements ControlSensitivityRuntime {
  /** Ordered stage calls retained for assertions. */
  public readonly calls: string[] = [];

  /** Per-stage observations overridden by each test. */
  public readonly observations = new Map<string, ControlSensitivityStageObservation>();

  /** Records one stage and returns its configured observation. */
  protected observe(stage: string): ControlSensitivityStageObservation {
    this.calls.push(stage);
    return this.observations.get(stage) ?? passed;
  }

  /** Records validation. */
  public async validate(): Promise<ControlSensitivityStageObservation> {
    return this.observe('validation');
  }

  /** Records isolated source preparation. */
  public async prepareVariant(): Promise<ControlSensitivityStageObservation> {
    return this.observe('variant');
  }

  /** Records build execution. */
  public async build(): Promise<ControlSensitivityStageObservation> {
    return this.observe('build');
  }

  /** Records lifecycle-owned startup. */
  public async start(): Promise<ControlSensitivityStageObservation> {
    return this.observe('startup');
  }

  /** Records fixture verification. */
  public async verifyFixture(): Promise<ControlSensitivityStageObservation> {
    return this.observe('fixture');
  }

  /** Records the designated check. */
  public async runCheck(): Promise<ControlSensitivityStageObservation> {
    return this.observe('check');
  }

  /** Records unconditional cleanup. */
  public async cleanup(): Promise<ControlSensitivityStageObservation> {
    return this.observe('cleanup');
  }

  /** Returns deterministic provenance for executor result assertions. */
  public provenance() {
    return Object.freeze({
      commitIdentity: `commit:${'a'.repeat(40)}`,
      treeIdentity: `tree:${'b'.repeat(40)}`,
      assuranceToolDigest: `sha256:${'c'.repeat(64)}`,
      dependencyLockDigest: `sha256:${'d'.repeat(64)}`,
      targetPath: 'packages/server/src/example.ts',
      originalSha256: `sha256:${'e'.repeat(64)}`,
    });
  }
}

/** Local runtime whose lifecycle stop deterministically fails for recovery-preservation testing. */
class StopFailureRuntime extends LocalControlSensitivityRuntime {
  /** Creates the exact owned paths that cleanup must preserve after a failed stop. */
  public arrangeOwnedWorktree(): string {
    mkdirSync(this.worktreeRoot, { recursive: true });
    this.worktreeCreated = true;
    this.observedProvenance = Object.freeze({
      commitIdentity: `commit:${'a'.repeat(40)}`,
      treeIdentity: `tree:${'b'.repeat(40)}`,
      assuranceToolDigest: `sha256:${'c'.repeat(64)}`,
      dependencyLockDigest: `sha256:${'d'.repeat(64)}`,
      targetPath: 'packages/server/src/example.ts',
      originalSha256: `sha256:${'e'.repeat(64)}`,
    });
    this.persist('startup');
    return this.runtimeRoot;
  }

  /** Returns a sanitized failed managed-child result without running Docker. */
  protected override async lifecycle(): Promise<ManagedChildOutcome> {
    return {
      code: 30,
      signal: null,
      forwardedSignal: null,
      timedOut: false,
      setupFailed: false,
      cleanupFailed: false,
      stdout: '',
      stderr: '',
      outputTruncated: false,
    };
  }
}

test('registers one exact source target and designated signature for every requirement', () => {
  assert.equal(tenantAdminControlChecks.length, 7);
  assert.deepEqual(
    tenantAdminControlChecks.map((entry) => entry.id).sort(),
    tenantAdminFaultRequirements.map((entry) => entry.id).sort(),
  );
  assert.equal(new Set(tenantAdminControlChecks.map((entry) => entry.id)).size, 7);
  assert.equal(new Set(tenantAdminControlChecks.map((entry) => entry.subSentinel)).size, 7);
  for (const definition of tenantAdminControlChecks) {
    const requirement = tenantAdminFaultRequirements.find((entry) => entry.id === definition.id);
    assert.ok(requirement);
    assert.equal(definition.subSentinel, requirement.tuple.subSentinel);
    assert.equal(definition.expectedSignature, requirement.tuple.expectedSignature);
    assert.match(definition.targetPath, /^packages\/server\/src\/[a-z0-9./-]+\.ts$/u);
    assert.ok(definition.replacements.length > 0);
  }
  assert.equal(
    tenantAdminControlCheck('organization-cache-scope').targetPath,
    'packages/server/src/middleware/tenant-resolver.ts',
  );
  assert.equal(
    tenantAdminControlCheck('stale-authority-recheck').targetPath,
    'packages/server/src/middleware/admin-auth.ts',
  );
});

test('applies every reviewed transformation to only its exact copied target', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-control-sensitivity-'));
  try {
    for (const definition of tenantAdminControlChecks) {
      const source = resolve(process.cwd(), definition.targetPath);
      const target = resolve(root, definition.targetPath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      const before = readFileSync(target, 'utf8');
      const result = applyControlVariant(root, definition);
      const after = readFileSync(target, 'utf8');
      assert.equal(result.targetPath, definition.targetPath);
      assert.equal(result.originalSha256, definition.originalSha256);
      assert.notEqual(result.variantSha256, definition.originalSha256);
      assert.notEqual(after, before);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects target drift and unknown selectors before creating a control check', () => {
  assert.throws(() => tenantAdminControlCheck('unregistered-control'));
  const root = mkdtempSync(resolve(tmpdir(), 'porta-control-drift-'));
  try {
    const definition = tenantAdminControlCheck('tenant-read-scope');
    const target = resolve(root, definition.targetPath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(process.cwd(), definition.targetPath), target);
    const drifted: TenantAdminControlCheckDefinition = {
      ...definition,
      originalSha256: `sha256:${'0'.repeat(64)}`,
    };
    assert.throws(() => applyControlVariant(root, drifted), /identity/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('classifies only the exact designated signature as detected', async () => {
  const definition = tenantAdminControlCheck('tenant-read-scope');
  const runtime = new SensitivityRuntimeDouble();
  runtime.observations.set('check', {
    status: 'failed',
    signature: definition.expectedSignature,
  });
  const result = await executeControlSensitivityCheck(definition, runtime);
  assert.equal(result.outcome, 'detected');
  assert.equal(result.signature, definition.expectedSignature);
  assert.equal(result.cleanupComplete, true);
  assert.deepEqual(runtime.calls, [
    'validation',
    'variant',
    'build',
    'startup',
    'fixture',
    'check',
    'cleanup',
  ]);

  const unrelated = new SensitivityRuntimeDouble();
  unrelated.observations.set('check', { status: 'failed', signature: 'UNRELATED_FAILURE' });
  const unrelatedResult = await executeControlSensitivityCheck(definition, unrelated);
  assert.equal(unrelatedResult.outcome, 'check-invalid');
  assert.equal(unrelatedResult.signature, undefined);
});

test('distinguishes undetected invalid environment timeout and cleanup outcomes', async () => {
  const definition = tenantAdminControlCheck('tenant-read-scope');
  const cases = [
    { stage: 'check', observation: passed, outcome: 'not-detected' },
    { stage: 'build', observation: { status: 'failed' } as const, outcome: 'check-invalid' },
    { stage: 'startup', observation: { status: 'failed' } as const, outcome: 'environment-failed' },
    { stage: 'check', observation: { status: 'timed-out' } as const, outcome: 'timed-out' },
  ] as const;
  for (const scenario of cases) {
    const runtime = new SensitivityRuntimeDouble();
    runtime.observations.set(scenario.stage, scenario.observation);
    const result = await executeControlSensitivityCheck(definition, runtime);
    assert.equal(result.outcome, scenario.outcome);
    assert.equal(runtime.calls.at(-1), 'cleanup');
  }

  const cleanupFailure = new SensitivityRuntimeDouble();
  cleanupFailure.observations.set('check', {
    status: 'failed',
    signature: definition.expectedSignature,
  });
  cleanupFailure.observations.set('cleanup', { status: 'failed' });
  const cleanupResult = await executeControlSensitivityCheck(definition, cleanupFailure);
  assert.deepEqual(cleanupResult, {
    id: definition.id,
    outcome: 'environment-failed',
    stage: 'cleanup',
    cleanupComplete: false,
    provenance: cleanupFailure.provenance(),
  });
});

test('preserves operator signals separately and applies cleanup precedence', async () => {
  const definition = tenantAdminControlCheck('tenant-read-scope');
  const interrupted = new SensitivityRuntimeDouble();
  interrupted.observations.set('build', { status: 'failed', forwardedSignal: 'SIGTERM' });
  const result = await executeControlSensitivityCheck(definition, interrupted);
  assert.equal(result.terminalSignal, 'SIGTERM');
  assert.equal(result.cleanupComplete, true);
  assert.equal(controlSensitivityExitCode(result.outcome, true, result.terminalSignal), 143);
  assert.equal(controlSensitivityExitCode(result.outcome, true, 'SIGINT'), 130);

  const cleanupFailed = new SensitivityRuntimeDouble();
  cleanupFailed.observations.set('build', { status: 'failed', forwardedSignal: 'SIGINT' });
  cleanupFailed.observations.set('cleanup', { status: 'failed' });
  const failed = await executeControlSensitivityCheck(definition, cleanupFailed);
  assert.equal(failed.terminalSignal, undefined);
  assert.equal(failed.stage, 'cleanup');
  assert.equal(failed.cleanupComplete, false);
  assert.equal(controlSensitivityExitCode('detected', false, 'SIGINT'), 60);

  const betweenStages = new SensitivityRuntimeDouble();
  let checks = 0;
  const betweenResult = await executeControlSensitivityCheck(definition, betweenStages, () =>
    ++checks === 2 ? 'SIGINT' : undefined,
  );
  assert.equal(betweenResult.terminalSignal, 'SIGINT');
  assert.deepEqual(betweenStages.calls, ['validation', 'cleanup']);
});

test('rejects incomplete or tampered control-check provenance artifacts', () => {
  const artifact = {
    version: 2,
    runId: '00000000-0000-4000-8000-000000000001',
    controlCheckId: 'tenant-read-scope',
    subSentinel: 'tenant-read',
    outcome: 'detected',
    stage: 'check',
    exitCode: 0,
    cleanupComplete: true,
    provenance: {
      ...new SensitivityRuntimeDouble().provenance(),
      variantSha256: `sha256:${'f'.repeat(64)}`,
      lifecycleRunId: '00000000-0000-4000-8000-000000000002',
      fixtureIdentity: `sha256:${'1'.repeat(64)}`,
      serverImageDigest: `sha256:${'2'.repeat(64)}`,
      containerIds: ['3'.repeat(64)],
    },
  };
  assert.deepEqual(validateControlSensitivityArtifact(artifact), artifact);
  const missing = structuredClone(artifact);
  delete (missing.provenance as { dependencyLockDigest?: string }).dependencyLockDigest;
  assert.throws(() => validateControlSensitivityArtifact(missing));
  const tampered = structuredClone(artifact);
  tampered.provenance.serverImageDigest = 'sha256:not-a-digest';
  assert.throws(() => validateControlSensitivityArtifact(tampered));
});

test('rejects malformed recovery identities without touching runtime state', async () => {
  assert.equal(await recoverLocalControlSensitivityRun(process.cwd(), '../other-run'), false);
  assert.equal(await recoverLocalControlSensitivityRun(process.cwd(), 'not-a-uuid'), false);
});

test('preserves the worktree and recovery record when lifecycle stop fails', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-control-stop-failure-'));
  try {
    const runtime = new StopFailureRuntime(root);
    const runtimeRoot = runtime.arrangeOwnedWorktree();
    assert.deepEqual(await runtime.cleanup(), { status: 'failed' });
    assert.equal(existsSync(runtimeRoot), true);
    assert.equal(existsSync(resolve(runtimeRoot, 'worktree')), true);
    assert.equal(existsSync(resolve(runtimeRoot, 'run.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepares and builds every real isolated variant with frozen dependencies', async () => {
  for (const definition of tenantAdminControlChecks) {
    const runtime = new LocalControlSensitivityRuntime(process.cwd());
    try {
      const validation = await runtime.validate(definition);
      if (validation.status !== 'passed') {
        assert.deepEqual(validation, { status: 'failed' });
        continue;
      }
      assert.deepEqual(await runtime.prepareVariant(definition), passed, definition.id);
      assert.deepEqual(await runtime.build(), passed, definition.id);
    } finally {
      assert.deepEqual(await runtime.cleanup(), passed, definition.id);
    }
  }
});

test('keeps every designated control check green against the requirement-owned baseline rig', async () => {
  for (const definition of tenantAdminControlChecks) {
    await evaluateTenantAdminControlCheck(definition.id, createTenantAdminBoundariesSpecRig());
  }
});
