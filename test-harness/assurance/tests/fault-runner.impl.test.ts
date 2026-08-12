import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadFaultCatalog, resolveFaultFile, selectFault } from '../fault/catalog.js';
import {
  finalizePendingFaultOutcome,
  observationFromSentinelChild,
  verifyExactPatchedTarget,
  type PendingFaultOutcome,
} from '../fault/runner.js';
import type { FaultTuple } from '../fault/model.js';
import type { ManagedChildOutcome } from '../scripts/managed-child.js';

const tuple: FaultTuple = Object.freeze({
  claimId: 'CLAIM-R6-01',
  sentinelId: 'ST-64',
  expectedSignature: 'FOUNDATION_FAULT_DETECTED_ALPHA',
});

function child(overrides: Partial<ManagedChildOutcome> = {}): ManagedChildOutcome {
  return {
    code: 1,
    signal: null,
    forwardedSignal: null,
    timedOut: false,
    setupFailed: false,
    cleanupFailed: false,
    stdout: '',
    stderr: `${tuple.expectedSignature}\n`,
    outputTruncated: false,
    ...overrides,
  };
}

function killedPending(): PendingFaultOutcome {
  return {
    classification: 'killed',
    exitCode: 0,
    tuple,
    blockedClaims: [],
    killedClaims: [tuple.claimId],
    stage: 'sentinel',
  };
}

test('loads only the versioned foundation fault with two independent tuples', () => {
  const catalog = loadFaultCatalog(process.cwd());
  const fault = selectFault(catalog, 'foundation-smoke');

  assert.equal(catalog.version, 1);
  assert.equal(fault.tuples.length, 2);
  assert.equal(
    new Set(fault.tuples.map(({ claimId, sentinelId }) => `${claimId}/${sentinelId}`)).size,
    2,
  );
  assert.equal(fault.cleanupVerification, 'primary-tree-unchanged-and-no-owned-residue');
});

test('rejects traversal, absolute paths, and non-file fault targets', () => {
  for (const repositoryPath of ['../package.json', '/etc/passwd', 'test-harness/assurance/fault']) {
    assert.throws(() =>
      resolveFaultFile(process.cwd(), repositoryPath, 'test-harness/assurance/fault'),
    );
  }
});

test('accepts only the exact closed sentinel failure grammar', () => {
  const exact = observationFromSentinelChild('sentinel', child(), tuple.expectedSignature);
  const unrelated = observationFromSentinelChild(
    'sentinel',
    child({ stderr: `${tuple.expectedSignature}\nunrelated failure\n` }),
    tuple.expectedSignature,
  );

  assert.deepEqual(exact.assertionSignatures, [tuple.expectedSignature]);
  assert.equal(exact.unrelatedFailure, false);
  assert.deepEqual(unrelated.assertionSignatures, []);
  assert.equal(unrelated.unrelatedFailure, true);
});

test('clears killed claims after interruption timeout or cleanup failure', () => {
  for (const scenario of [
    { exit: 143 as const, cleanup: true, classification: 'invalid', stage: 'sentinel' },
    { exit: 70 as const, cleanup: true, classification: 'timeout', stage: 'sentinel' },
    { exit: undefined, cleanup: false, classification: 'infrastructure-failed', stage: 'cleanup' },
  ] as const) {
    const finalized = finalizePendingFaultOutcome(killedPending(), scenario.exit, scenario.cleanup);
    assert.equal(finalized.classification, scenario.classification);
    assert.equal(finalized.stage, scenario.stage);
    assert.deepEqual(finalized.killedClaims, []);
  }
});

test('rejects a disposable patch result that changes more than its declared target', () => {
  const repository = mkdtempSync(resolve(tmpdir(), 'porta-fault-target-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'assurance@example.invalid'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Porta Assurance'], { cwd: repository });
    writeFileSync(resolve(repository, 'target.mjs'), 'export const target = true;\n');
    writeFileSync(resolve(repository, 'extra.mjs'), 'export const extra = true;\n');
    execFileSync('git', ['add', '--', 'target.mjs', 'extra.mjs'], { cwd: repository });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repository });
    writeFileSync(resolve(repository, 'target.mjs'), 'export const target = false;\n');
    verifyExactPatchedTarget(repository, 'target.mjs');
    writeFileSync(resolve(repository, 'extra.mjs'), 'export const extra = false;\n');
    assert.throws(
      () => verifyExactPatchedTarget(repository, 'target.mjs'),
      /outside its declared target/u,
    );
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
