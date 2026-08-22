import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const expectedGaps = [
  'fault-catalog-absent',
  'fault-runner-module-absent',
  'fault-handler-unavailable',
] as const;
const expectedMarker = `FAULT_RUNNER_CURRENT_SURFACE_GAPS: ${expectedGaps.join(',')}`;

/** Reads one required source used only to diagnose the current dispatcher boundary. */
function readRequiredSource(repositoryPath: string): string {
  const absolutePath = resolve(repositoryRoot, repositoryPath);
  if (!existsSync(absolutePath)) throw new Error(`required source is absent: ${repositoryPath}`);
  return readFileSync(absolutePath, 'utf8');
}

// The RED checkpoint is valid only while the catalog, runner module, and dispatcher handler are
// all absent. A partial diagnosis is stale and cannot satisfy the exact RED wrapper.
test('should expose the complete current curated-fault runner gap set', () => {
  readRequiredSource('test-harness/assurance/tests/fault-runner-planned.ts');
  const dispatcherSource = readRequiredSource('test-harness/assurance/scripts/run-command.ts');
  const observations: readonly (readonly [(typeof expectedGaps)[number], boolean])[] = [
    [
      'fault-catalog-absent',
      !existsSync(resolve(repositoryRoot, 'test-harness/assurance/fault/catalog.json')),
    ],
    [
      'fault-runner-module-absent',
      !existsSync(resolve(repositoryRoot, 'test-harness/assurance/fault/index.ts')),
    ],
    ['fault-handler-unavailable', !/action\s*===\s*['"]fault['"]/u.test(dispatcherSource)],
  ];
  const observed = observations.filter(([, present]) => present).map(([gap]) => gap);

  if (observed.length === 0) return;
  if (observed.join(',') !== expectedGaps.join(',')) {
    throw new Error(`fault runner surface diagnosis is partial or stale: ${observed.join(',')}`);
  }
  assert.fail(expectedMarker);
});
