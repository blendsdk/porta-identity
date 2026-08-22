import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  digestMonitoredPaths,
  inspectRepositoryStaleness,
  loadAssuranceRatchetBaseline,
  requireCurrentAssuranceInputs,
} from '../ratchets/index.js';
import { reviewedStalenessDigests } from './assurance-ratchets-requirements.js';

test('should load complete reviewed metadata with local-only enforcement', () => {
  const baseline = loadAssuranceRatchetBaseline(process.cwd());
  assert.equal(baseline.version, 1);
  assert.equal(baseline.coverage.enforcement, 'local-observation-only');
  assert.equal(baseline.coverage.promotionAuthorized, false);
  assert.equal(baseline.review.promotionAuthorized, false);
  assert.match(baseline.review.reviewId, /^local-observation-baseline-/u);
});

test('should bind every monitored digest to its exact ordered repository paths', () => {
  const baseline = loadAssuranceRatchetBaseline(process.cwd());
  for (const trigger of ['requirement-r5', 'fixture', 'dependency', 'sentinel'] as const) {
    const monitored = baseline.monitoredInputs[trigger];
    assert.equal(
      digestMonitoredPaths(process.cwd(), monitored.paths),
      reviewedStalenessDigests[trigger],
      trigger,
    );
  }
});

test('should admit governed reporting only while every monitored input is current', () => {
  assert.deepEqual(inspectRepositoryStaleness(process.cwd()), {
    staleClaims: [],
    changedInputs: [],
    reportAllowed: true,
  });
  assert.doesNotThrow(() => requireCurrentAssuranceInputs(process.cwd()));
});

test('should reject baseline metadata without an explicit review or with promotion authority', () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-ratchet-baseline-'));
  try {
    const assuranceRoot = resolve(sandbox, 'test-harness/assurance');
    mkdirSync(assuranceRoot, { recursive: true });
    const baseline = structuredClone(loadAssuranceRatchetBaseline(process.cwd()));
    Reflect.deleteProperty(baseline, 'review');
    writeFileSync(resolve(assuranceRoot, 'ratchet-baselines.json'), JSON.stringify(baseline));
    assert.throws(() => loadAssuranceRatchetBaseline(sandbox));

    const promoted = structuredClone(loadAssuranceRatchetBaseline(process.cwd()));
    Object.assign(promoted.coverage, { promotionAuthorized: true });
    writeFileSync(resolve(assuranceRoot, 'ratchet-baselines.json'), JSON.stringify(promoted));
    assert.throws(() => loadAssuranceRatchetBaseline(sandbox));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('should reject traversal and noncanonical monitored path inputs', () => {
  assert.throws(
    () => digestMonitoredPaths(process.cwd(), ['../outside']),
    /monitored ratchet path is invalid/i,
  );
  assert.throws(
    () => digestMonitoredPaths(process.cwd(), ['/absolute']),
    /monitored ratchet path is invalid/i,
  );
});
