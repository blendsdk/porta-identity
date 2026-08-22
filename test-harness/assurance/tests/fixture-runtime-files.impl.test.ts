import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { z } from 'zod';

import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';
import {
  expectedFixtureCounts,
  expectedFixtureDigest,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';

/** Resolves the active run's generated fixture files without accepting caller-supplied IDs. */
function activeFixtureFiles(): { readonly publicPath: string; readonly credentialPath: string } {
  const runtimeRoot = resolve(import.meta.dirname, '../../.assurance-runtime');
  const active = z
    .object({ runId: z.uuid() })
    .passthrough()
    .parse(JSON.parse(readFileSync(resolve(runtimeRoot, 'active-run.json'), 'utf8')));
  return {
    publicPath: resolve(runtimeRoot, active.runId, 'fixture-public.json'),
    credentialPath: resolve(runtimeRoot, active.runId, 'fixture-credentials.json'),
  };
}

test('should persist exact redacted fixture provenance with owner-only files', () => {
  const paths = activeFixtureFiles();
  const publicFile = readPublicRuntimeFixtureManifest(paths.publicPath);
  const publicText = readFileSync(paths.publicPath, 'utf8');
  const protectedFile = z
    .object({
      runId: z.uuid(),
      credentials: z.record(z.string().startsWith('credential:'), z.string().min(1)),
    })
    .strict()
    .parse(JSON.parse(readFileSync(paths.credentialPath, 'utf8')));

  assert.equal(statSync(paths.publicPath).mode & 0o777, 0o600);
  assert.equal(statSync(paths.credentialPath).mode & 0o777, 0o600);
  assert.equal(publicFile.fixtureDigest, expectedFixtureDigest);
  assert.deepEqual(publicFile.fixtureCounts, expectedFixtureCounts);
  assert.equal(publicFile.runId, protectedFile.runId);
  for (const [reference, rawValue] of Object.entries(protectedFile.credentials)) {
    assert.ok(!publicText.includes(rawValue), `public manifest exposed ${reference}`);
  }
});

test('should verify live fixture prerequisites through every required public boundary', async () => {
  const surface = await loadFixtureAssuranceSurface();
  const results = await surface.verifyPublicPostconditions('operational');

  assert.deepEqual(results.map((result) => result.boundary).sort(), [
    'administration',
    'browser',
    'email',
    'fixtures',
    'http',
    'protocol',
  ]);
  assert.ok(results.every((result) => result.status === 'passed'));
  assert.ok(results.every((result) => result.expectationSource === 'public-contract'));
  assert.ok(results.every((result) => result.productionDerived === false));
});
