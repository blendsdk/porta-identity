import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { executeControlSensitivityCheck } from '../control-sensitivity/executor.js';
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
  });
});

test('rejects malformed recovery identities without touching runtime state', async () => {
  assert.equal(await recoverLocalControlSensitivityRun(process.cwd(), '../other-run'), false);
  assert.equal(await recoverLocalControlSensitivityRun(process.cwd(), 'not-a-uuid'), false);
});

test('prepares and builds every real isolated variant with frozen dependencies', async () => {
  for (const definition of tenantAdminControlChecks) {
    const runtime = new LocalControlSensitivityRuntime(process.cwd());
    try {
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
