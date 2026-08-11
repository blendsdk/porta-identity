import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoverageProvenance } from './coverage-attribution-planned.js';
import { createCoverageAttributionContract } from './coverage-attribution-planned.js';
import {
  coverageSeed,
  exactCountsVector,
  expectedCoverageProvenance,
  manualMappingOracle,
  trustedRawEnvelope,
} from './coverage-spec-fixtures.js';

// The known compiled spike contains executed and unexecuted branches. Exact source-map conversion
// must reproduce manually sampled TypeScript paths, covered lines, uncovered lines, and counts.
test('should map the known branch spike to the exact manual TypeScript oracle', async () => {
  const contract = createCoverageAttributionContract();

  const result = await contract.convert(
    trustedRawEnvelope(),
    manualMappingOracle,
    expectedCoverageProvenance,
  );

  assert.equal(result.accepted, true);
  assert.ok(result.artifact);
  assert.equal(result.artifact.merger, '@bcoe/v8-coverage');
  assert.deepEqual(result.artifact.normalizedPaths, [manualMappingOracle.sourcePath]);
  assert.deepEqual(
    result.artifact.coveredLines[manualMappingOracle.sourcePath],
    manualMappingOracle.coveredLines,
  );
  assert.deepEqual(
    result.artifact.uncoveredLines[manualMappingOracle.sourcePath],
    manualMappingOracle.uncoveredLines,
  );
  assert.deepEqual(
    result.artifact.files[manualMappingOracle.sourcePath],
    manualMappingOracle.counts,
  );
  assert.deepEqual(result.artifact.totals, manualMappingOracle.counts);
  assert.equal(result.artifact.jsonProduced, true);
  assert.equal(result.artifact.htmlProduced, true);
  assert.deepEqual(
    result.exclusions.map((exclusion) => exclusion.url),
    ['node:internal/process/task_queues', '/app/node_modules/koa/lib/application.js'],
  );
  assert.deepEqual(result.unmapped, []);
});

// Revision, source-map, and image identity are independent provenance gates. A mismatch in any
// dimension rejects conversion rather than producing apparently valid mapped evidence.
for (const [name, provenance, rejectionReason] of [
  ['revision', { ...expectedCoverageProvenance, revision: 'f'.repeat(40) }, 'revision-mismatch'],
  [
    'source map',
    { ...expectedCoverageProvenance, sourceMapDigest: `sha256:${'c'.repeat(64)}` },
    'source-map-mismatch',
  ],
  [
    'image',
    { ...expectedCoverageProvenance, imageDigest: `sha256:${'d'.repeat(64)}` },
    'image-mismatch',
  ],
] as const satisfies ReadonlyArray<readonly [string, CoverageProvenance, string]>) {
  test(`should reject a mismatched ${name} identity`, async () => {
    const contract = createCoverageAttributionContract();

    const result = await contract.convert(trustedRawEnvelope(), manualMappingOracle, provenance);

    assert.equal(result.accepted, false);
    assert.equal(result.artifact, undefined);
    assert.equal(result.rejectionReason, rejectionReason);
  });
}

// Every excluded or unmapped raw input is explicit. Eligible unmapped Porta output is a hard
// mapping failure rather than a silent reduction of first-party totals.
test('should record exclusions and reject an eligible unmapped input', async () => {
  const contract = createCoverageAttributionContract();
  const envelope = trustedRawEnvelope();
  const result = await contract.convert(
    {
      ...envelope,
      scripts: [
        ...envelope.scripts,
        {
          url: '/app/dist/unmapped.js',
          provenance: expectedCoverageProvenance,
          ranges: [{ startOffset: 0, endOffset: 40, count: 0 }],
        },
      ],
    },
    manualMappingOracle,
    expectedCoverageProvenance,
  );

  assert.equal(result.accepted, false);
  assert.equal(result.rejectionReason, 'unmapped-eligible-input');
  assert.ok(result.unmapped.some((input) => input.url === '/app/dist/unmapped.js'));
  assert.deepEqual(
    result.exclusions.map((exclusion) => exclusion.url),
    ['node:internal/process/task_queues', '/app/node_modules/koa/lib/application.js'],
  );
});

// Two clean runs with the same fixed seed produce identical exact totals, covered counts, and
// normalized paths; approximate or percentage-only reproducibility is insufficient.
test('should reproduce exact totals and normalized path sets across two clean runs', async () => {
  const contract = createCoverageAttributionContract();

  const first = await contract.runClean(coverageSeed);
  const second = await contract.runClean(coverageSeed);

  assert.deepEqual(first.normalizedPaths, second.normalizedPaths);
  assert.deepEqual(exactCountsVector(first.totals), exactCountsVector(second.totals));
  assert.deepEqual(first.files, second.files);
  assert.deepEqual(first.coveredLines, second.coveredLines);
});
