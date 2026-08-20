import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  aggregateChildRegistry,
  aggregateRegistryDigest,
  runAssuranceAggregate,
  validateAggregateEvidence,
  type AggregateRunnerDependencies,
} from '../aggregate/index.js';
import type { AssuranceAllInvocationRegistration } from './assurance-all-aggregate-contract.js';
import type { ManagedChildOutcome } from '../scripts/managed-child.js';

const fixedProvenance = Object.freeze({
  commitIdentity: `commit:${'a'.repeat(40)}`,
  treeIdentity: `tree:${'b'.repeat(40)}`,
  assuranceToolDigest: `sha256:${'c'.repeat(64)}`,
});

/** Creates one clean managed-child observation with optional bounded output. */
function outcome(code = 0, stdout = ''): ManagedChildOutcome {
  return {
    code,
    signal: null,
    forwardedSignal: null,
    timedOut: false,
    setupFailed: false,
    cleanupFailed: false,
    stdout,
    stderr: '',
    outputTruncated: false,
  };
}

/** Creates deterministic injected dependencies and records exact invocation order. */
function dependencies(
  calls: AssuranceAllInvocationRegistration[],
  terminalAt?: string,
): AggregateRunnerDependencies {
  return {
    inspectProvenance: () => fixedProvenance,
    execute(invocation) {
      calls.push(invocation);
      if (invocation.id === terminalAt) return Promise.resolve(outcome(70));
      if (invocation.command === 'assurance:validate') {
        return Promise.resolve(
          outcome(0, 'ASSURANCE_RUN_ID=11111111-1111-4111-8111-111111111111\n'),
        );
      }
      return Promise.resolve(outcome());
    },
  };
}

test('keeps the executable registry independent and identical to the immutable contract', () => {
  assert.deepEqual(
    aggregateChildRegistry.flatMap((child) => child.invocations.map((entry) => entry.id)),
    [
      'validate-registered-surface',
      'internal-deduplicated-suite',
      'harness-spa-operational',
      'harness-bff-operational',
      'harness-protocol-operational',
      'harness-security-operational',
      'harness-compatibility-operational',
      'harness-security-production-security',
      'coverage-protocol-operational',
      'coverage-security-production-security',
      'fault-full-catalog',
      'compat-tenant-admin',
      'compat-protocol',
      'compat-p1-admin',
      'compat-compatibility',
      'report-aggregate-run',
    ],
  );
  assert.match(aggregateRegistryDigest(), /^sha256:[a-f0-9]{64}$/);
});

test('executes every child sequentially and publishes a truthful owner-only roll-up', async () => {
  const root = mkdtempSync(join(tmpdir(), 'porta-assurance-all-'));
  const calls: AssuranceAllInvocationRegistration[] = [];
  try {
    const result = await runAssuranceAggregate(root, dependencies(calls));
    assert.equal(calls.length, 16);
    assert.deepEqual(calls.at(-1)?.arguments, ['--run', '11111111-1111-4111-8111-111111111111']);
    assert.equal(result.exitCode, 50);
    assert.ok(result.counts.assured > 0);
    assert.ok(result.counts.blocked > 0);
    assert.ok(result.counts.unqualified > 0);
    const artifact = join(root, result.artifactPath);
    assert.equal(statSync(artifact).mode & 0o077, 0);
    const parsed: unknown = JSON.parse(readFileSync(artifact, 'utf8'));
    assert.equal(validateAggregateEvidence(parsed).exitCode, 50);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stops after a terminal child and accounts for every remaining invocation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'porta-assurance-all-stop-'));
  const calls: AssuranceAllInvocationRegistration[] = [];
  try {
    const result = await runAssuranceAggregate(
      root,
      dependencies(calls, 'harness-protocol-operational'),
    );
    assert.equal(result.exitCode, 70);
    assert.equal(calls.at(-1)?.id, 'harness-protocol-operational');
    const parsed: unknown = JSON.parse(readFileSync(join(root, result.artifactPath), 'utf8'));
    const evidence = validateAggregateEvidence(parsed);
    assert.ok(
      evidence.children
        .flatMap((child) => child.invocations)
        .some((invocation) => invocation.executionStatus === 'not-run'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
