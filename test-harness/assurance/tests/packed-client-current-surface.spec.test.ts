import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const expectedGaps = [
  'packed-consumer-module-absent',
  'consumer-template-absent',
  'compat-handler-unavailable',
] as const;
const expectedMarker = `PACKED_CONSUMER_CURRENT_SURFACE_GAPS: ${expectedGaps.join(',')}`;

/** Reads one required source used only to diagnose the current dispatcher boundary. */
function readRequiredSource(repositoryPath: string): string {
  const absolutePath = resolve(repositoryRoot, repositoryPath);
  if (!existsSync(absolutePath)) throw new Error(`required source is absent: ${repositoryPath}`);
  return readFileSync(absolutePath, 'utf8');
}

// The RED checkpoint is valid only while runtime packing, the source template, and dispatcher
// ownership are all absent. A partial diagnosis is stale and cannot satisfy the exact wrapper.
test('should expose the complete current packed-client foundation gap set', () => {
  readRequiredSource('test-harness/assurance/tests/packed-client-foundations-planned.ts');
  const dispatcherSource = readRequiredSource('test-harness/assurance/scripts/run-command.ts');
  const observations: readonly (readonly [(typeof expectedGaps)[number], boolean])[] = [
    [
      'packed-consumer-module-absent',
      !existsSync(resolve(repositoryRoot, 'test-harness/assurance/compat/index.ts')),
    ],
    [
      'consumer-template-absent',
      !existsSync(resolve(repositoryRoot, 'test-harness/consumers/package.template.json')),
    ],
    ['compat-handler-unavailable', !/action\s*===\s*['"]compat['"]/u.test(dispatcherSource)],
  ];
  const observed = observations.filter(([, present]) => present).map(([gap]) => gap);

  if (observed.length === 0) return;
  if (observed.join(',') !== expectedGaps.join(',')) {
    throw new Error(`packed consumer surface diagnosis is partial or stale: ${observed.join(',')}`);
  }
  assert.fail(expectedMarker);
});
