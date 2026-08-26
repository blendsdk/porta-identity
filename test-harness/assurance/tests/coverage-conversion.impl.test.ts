import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { classifyCoverageEnvelope, convertCoverageEnvelope } from '../coverage/index.js';
import { captureCoverageSpike, spikeProvenance } from './coverage-spike-rig.js';

test('should match the manually audited TypeScript source-map spike exactly', async () => {
  const reportDirectory = mkdtempSync(resolve(tmpdir(), 'porta-coverage-report-'));
  try {
    const envelope = captureCoverageSpike();
    const classification = classifyCoverageEnvelope(envelope);
    const fixtureRoot = resolve(import.meta.dirname, 'fixtures/coverage-spike');
    const result = await convertCoverageEnvelope(envelope, classification, {
      compiledDirectory: resolve(fixtureRoot, 'compiled'),
      sourcePackageRoot: fixtureRoot,
      normalizedPathRoot: fixtureRoot,
      reportDirectory,
      expectedProvenance: spikeProvenance,
      virtualCompiledRoot: '/app/dist',
    });

    assert.equal(result.accepted, true);
    assert.ok(result.artifact);
    assert.deepEqual(result.artifact.normalizedPaths, ['src/coverage-spike.ts']);
    assert.deepEqual(result.artifact.files['src/coverage-spike.ts'], {
      statements: { covered: 3, total: 5 },
      branches: { covered: 2, total: 4 },
      functions: { covered: 1, total: 2 },
      lines: { covered: 3, total: 5 },
    });
    assert.deepEqual(result.artifact.coveredLines['src/coverage-spike.ts'], [4, 5, 9]);
    assert.deepEqual(result.artifact.uncoveredLines['src/coverage-spike.ts'], [7, 12]);
    assert.equal(existsSync(resolve(reportDirectory, 'coverage-summary.json')), true);
    assert.equal(existsSync(resolve(reportDirectory, 'index.html')), true);
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
});
