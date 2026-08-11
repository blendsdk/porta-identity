import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  classifyCoverageEnvelope,
  digestCoverageFile,
  loadAndClassifyCoverageCapture,
  type CoverageProvenance,
  type RawCoverageEnvelope,
} from '../coverage/index.js';

const provenance: CoverageProvenance = {
  revision: 'a'.repeat(40),
  imageDigest: `sha256:${'b'.repeat(64)}`,
  sourceMapDigest: `sha256:${'c'.repeat(64)}`,
  processIdentity: `container:${'d'.repeat(64)}`,
};

/** Returns one complete envelope containing each accepted classification. */
function acceptedEnvelope(): RawCoverageEnvelope {
  return {
    seed: 'coverage-baseline',
    flushStatus: 'complete',
    scripts: [
      {
        url: 'file:///app/dist/server.js',
        provenance,
        ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
      },
      {
        url: 'node:internal/process/task_queues',
        provenance,
        ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
      },
      {
        url: 'file:///app/node_modules/koa/lib/application.js',
        provenance,
        ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
      },
    ],
  };
}

test('should preserve and classify every accepted raw script in input order', () => {
  const envelope = acceptedEnvelope();

  const result = classifyCoverageEnvelope(envelope);

  assert.equal(result.rejected, false);
  assert.equal(result.scripts.length, envelope.scripts.length);
  assert.deepEqual(
    result.scripts.map((script) => [script.classification, script.eligible]),
    [
      ['first-party', true],
      ['node-internal', false],
      ['dependency', false],
    ],
  );
  assert.ok(result.scripts.every((script) => script.provenance === provenance));
});

for (const url of [
  '/tmp/injected.js',
  'file:///app/dist/../private.js',
  'file:///app/dist/%2e%2e/private.js',
  'https://attacker.invalid/injected.js',
]) {
  test(`should reject unexpected script path ${url}`, () => {
    const envelope = acceptedEnvelope();
    const result = classifyCoverageEnvelope({
      ...envelope,
      scripts: [
        ...envelope.scripts,
        { url, provenance, ranges: [{ startOffset: 0, endOffset: 10, count: 1 }] },
      ],
    });

    assert.equal(result.scripts.length, envelope.scripts.length + 1);
    assert.equal(result.scripts.at(-1)?.classification, 'unexpected-local');
    assert.equal(result.rejected, true);
    assert.equal(result.rejectionReason, 'unexpected-local-script');
  });
}

test('should reject missing provenance and incomplete flush without dropping scripts', () => {
  const envelope = acceptedEnvelope();
  const missing = classifyCoverageEnvelope({
    ...envelope,
    scripts: envelope.scripts.map((script, index) =>
      index === 0 ? { url: script.url, ranges: script.ranges } : script,
    ),
  });
  const incomplete = classifyCoverageEnvelope({ ...envelope, flushStatus: 'incomplete' });

  assert.equal(missing.scripts.length, envelope.scripts.length);
  assert.equal(missing.rejectionReason, 'missing-provenance');
  assert.equal(incomplete.scripts.length, envelope.scripts.length);
  assert.equal(incomplete.rejectionReason, 'incomplete-flush');
});

test('should load only manifest-listed raw files and reject content tampering', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-coverage-classification-'));
  try {
    const rawDirectory = resolve(root, 'raw');
    mkdirSync(rawDirectory);
    const rawName = 'coverage-123-456-0.json';
    const rawPath = resolve(rawDirectory, rawName);
    writeFileSync(
      rawPath,
      JSON.stringify({
        result: [
          {
            scriptId: '1',
            url: 'file:///app/dist/server.js',
            functions: [
              {
                functionName: '',
                ranges: [{ startOffset: 0, endOffset: 10, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      }),
    );
    const manifestPath = resolve(root, 'capture-manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        runId: '00000000-0000-4000-8000-000000000001',
        seed: 'coverage-baseline',
        revision: provenance.revision,
        imageDigest: provenance.imageDigest,
        compiledOutputDigest: provenance.sourceMapDigest,
        processIdentity: provenance.processIdentity,
        flushStatus: 'complete',
        rawFiles: [
          {
            name: rawName,
            digest: digestCoverageFile(rawPath),
            bytes: statSync(rawPath).size,
          },
        ],
      }),
    );

    const loaded = loadAndClassifyCoverageCapture(manifestPath);
    assert.equal(loaded.envelope.scripts.length, 1);
    assert.equal(loaded.classification.rejected, false);

    writeFileSync(rawPath, `${readFileSync(rawPath, 'utf8')} `);
    assert.throws(
      () => loadAndClassifyCoverageCapture(manifestPath),
      /raw coverage identity mismatch/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
