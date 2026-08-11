import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  classifyCoverageEnvelope,
  convertCoverageEnvelope,
  type CoverageConversionResult,
  type RawCoverageEnvelope,
} from '../coverage/index.js';
import { captureCoverageSpike, spikeProvenance } from './coverage-spike-rig.js';

/** Converts one envelope against a disposable copy of the committed compiled/source fixture. */
async function withDisposableFixture(
  envelope: RawCoverageEnvelope,
  mutate: (fixtureRoot: string) => void = () => undefined,
): Promise<CoverageConversionResult> {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'porta-coverage-hardening-'));
  const fixtureRoot = resolve(temporaryRoot, 'coverage-spike');
  try {
    cpSync(resolve(import.meta.dirname, 'fixtures/coverage-spike'), fixtureRoot, {
      recursive: true,
    });
    mutate(fixtureRoot);
    return await convertCoverageEnvelope(envelope, classifyCoverageEnvelope(envelope), {
      compiledDirectory: resolve(fixtureRoot, 'compiled'),
      sourcePackageRoot: fixtureRoot,
      normalizedPathRoot: fixtureRoot,
      reportDirectory: resolve(temporaryRoot, 'report'),
      expectedProvenance: spikeProvenance,
      virtualCompiledRoot: '/app/dist',
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test('should merge duplicate process records into one mapped source file', async () => {
  const envelope = captureCoverageSpike();
  const firstProcess = envelope.processes?.[0];
  assert.ok(firstProcess);
  const duplicate = {
    scripts: firstProcess.scripts.map((script) => ({ ...script, scriptId: 'duplicate-process' })),
  };

  const result = await withDisposableFixture({
    ...envelope,
    scripts: [...envelope.scripts, ...duplicate.scripts],
    processes: [firstProcess, duplicate],
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(result.artifact?.normalizedPaths, ['src/coverage-spike.ts']);
  assert.deepEqual(result.artifact?.files['src/coverage-spike.ts'], {
    statements: { covered: 3, total: 5 },
    branches: { covered: 2, total: 4 },
    functions: { covered: 1, total: 2 },
    lines: { covered: 3, total: 5 },
  });
});

test('should normalize mapped paths relative to the declared report root', async () => {
  const result = await withDisposableFixture(captureCoverageSpike());

  assert.equal(result.accepted, true);
  assert.deepEqual(result.artifact?.normalizedPaths, ['src/coverage-spike.ts']);
  assert.ok(result.artifact?.normalizedPaths.every((path) => !path.startsWith('/')));
});

test('should retain dependency scripts as explicit non-contributing exclusions', async () => {
  const envelope = captureCoverageSpike();
  const dependency = {
    url: 'file:///app/node_modules/koa/lib/application.js',
    provenance: spikeProvenance,
    ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
  };
  const result = await withDisposableFixture({
    ...envelope,
    scripts: [...envelope.scripts, dependency],
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(
    result.exclusions.map((entry) => entry.url),
    [dependency.url],
  );
});

test('should reject a partial V8 flush before producing mapped evidence', async () => {
  const envelope = captureCoverageSpike();
  const result = await withDisposableFixture({ ...envelope, flushStatus: 'incomplete' });

  assert.equal(result.accepted, false);
  assert.equal(result.artifact, undefined);
});

test('should reject a malformed source map as an unmapped eligible input', async () => {
  const result = await withDisposableFixture(captureCoverageSpike(), (fixtureRoot) => {
    writeFileSync(resolve(fixtureRoot, 'compiled/coverage-spike.js.map'), '{"version":3}');
  });

  assert.equal(result.accepted, false);
  assert.equal(result.rejectionReason, 'unmapped-eligible-input');
  assert.equal(result.unmapped.length, 1);
});

test('should reject a missing source map as an unmapped eligible input', async () => {
  const result = await withDisposableFixture(captureCoverageSpike(), (fixtureRoot) => {
    unlinkSync(resolve(fixtureRoot, 'compiled/coverage-spike.js.map'));
  });

  assert.equal(result.accepted, false);
  assert.equal(result.rejectionReason, 'unmapped-eligible-input');
  assert.equal(result.unmapped.length, 1);
});
