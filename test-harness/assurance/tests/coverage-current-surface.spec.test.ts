import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const expectedGaps = [
  'porta-v8-capture-absent',
  'raw-output-mount-absent',
  'converter-module-absent',
  'coverage-handler-unavailable',
] as const;
const expectedMarker = `COVERAGE_CURRENT_SURFACE_GAPS: ${expectedGaps.join(',')}`;

/** Reads a required repository source without importing implementation code. */
function readRequiredSource(repositoryPath: string): string {
  const absolutePath = resolve(repositoryRoot, repositoryPath);
  if (!existsSync(absolutePath))
    throw new Error(`required coverage source is absent: ${repositoryPath}`);
  return readFileSync(absolutePath, 'utf8');
}

// The RED checkpoint is valid only when the retained harness lacks all four planned coverage
// capabilities. Partial matches indicate a stale diagnosis and cannot satisfy the RED wrapper.
test('should expose the complete current server-process coverage gap set', () => {
  readRequiredSource('test-harness/assurance/tests/coverage-spec-fixtures.ts');
  const composeSource = readRequiredSource('test-harness/docker-compose.yml');
  const dispatcherSource = readRequiredSource('test-harness/assurance/scripts/run-command.ts');
  const observations: readonly (readonly [(typeof expectedGaps)[number], boolean])[] = [
    ['porta-v8-capture-absent', !/NODE_V8_COVERAGE/u.test(composeSource)],
    [
      'raw-output-mount-absent',
      !/HARNESS_COVERAGE_RAW_DIR/u.test(composeSource) &&
        !/\/app\/\.v8-coverage/u.test(composeSource),
    ],
    [
      'converter-module-absent',
      !existsSync(resolve(repositoryRoot, 'test-harness/assurance/coverage/index.ts')),
    ],
    ['coverage-handler-unavailable', !/action\s*===\s*['"]coverage['"]/u.test(dispatcherSource)],
  ];
  const observed = observations.filter(([, present]) => present).map(([gap]) => gap);

  if (observed.length === 0) return;
  if (observed.join(',') !== expectedGaps.join(',')) {
    throw new Error(`coverage surface diagnosis is partial or stale: ${observed.join(',')}`);
  }
  assert.fail(expectedMarker);
});
