import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const publicSurfacePaths = {
  setup: 'test-harness/tests/global-setup.ts',
  start: 'test-harness/scripts/start.sh',
  stop: 'test-harness/scripts/stop.sh',
  compose: 'test-harness/docker-compose.yml',
} as const;
const plannedRuntimePath = 'test-harness/fixtures/lifecycle.ts';
const plannedCliPath = 'test-harness/scripts/lifecycle.ts';
const expectedGapNames = [
  'reset-failures-nonfatal',
  'fixed-endpoints',
  'cleanup-unfenced',
  'poison-state-absent',
] as const;
const fullGapMarker =
  'LIFECYCLE_CURRENT_SURFACE_GAPS: reset-failures-nonfatal,fixed-endpoints,cleanup-unfenced,poison-state-absent';

/** Reads a fixed repository-relative public harness surface without exposing its contents. */
function readPublicSurface(repositoryPath: string): string {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/** Returns a planned TypeScript surface when present, or an empty value before implementation. */
function readPlannedSurface(repositoryPath: string): string {
  const absolutePath = resolve(repositoryRoot, repositoryPath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

/** Detects best-effort reset handling that can continue after a required reset failure. */
function hasNonfatalResetSurface(setupSource: string): boolean {
  const resetConcern = /redis|mailhog|reset/i.test(setupSource);
  const ignoredFailure =
    /\.catch\s*\(/.test(setupSource) ||
    /catch\s*\([^)]*\)\s*\{[^}]*(?:console\.(?:warn|log)|return\s*;)/s.test(setupSource) ||
    /\|\|\s*true/.test(setupSource);
  const delegatesToTypedLifecycle = /(?:fixtures|scripts)[/\\]lifecycle(?:\.js|\.ts)?/.test(
    setupSource,
  );
  return (resetConcern && ignoredFailure) || !delegatesToTypedLifecycle;
}

/** Detects fixed endpoint defaults or an endpoint surface not sourced from one manifest. */
function hasFixedEndpointSurface(
  setupSource: string,
  startSource: string,
  composeSource: string,
): boolean {
  const combinedSource = `${setupSource}\n${startSource}\n${composeSource}`;
  const fixedDefault =
    /\$\{[A-Z][A-Z0-9_]*:-\d{2,5}\}/.test(combinedSource) ||
    /^\s*-\s*["']?\d{2,5}:\d{2,5}/m.test(composeSource) ||
    /https?:\/\/(?:127\.0\.0\.1|localhost|[a-z0-9.-]+\.ci\.portaidentity\.com):\d{2,5}/i.test(
      combinedSource,
    );
  const manifestDriven = /endpoint[_-]?manifest|PORTA_ENDPOINT_MANIFEST/i.test(combinedSource);
  return fixedDefault || !manifestDriven;
}

/** Detects cleanup that is not fenced by exact persisted Compose ownership. */
function hasUnfencedCleanupSurface(stopSource: string): boolean {
  const projectWideDown = /docker\s+compose(?:\s+[^\n]*)?\s+down\b/.test(stopSource);
  const ignoredStatus = /\|\|\s*true|set\s+\+e/.test(stopSource);
  const delegatesToTypedLifecycle = /(?:fixtures|scripts)[/\\]lifecycle(?:\.js|\.ts)?/.test(
    stopSource,
  );
  const persistedOwnerIdentity =
    /owner[_-]?manifest|lease[_-]?(?:record|state)|compose[_-]?project[_-]?identity/i.test(
      stopSource,
    );
  return projectWideDown || ignoredStatus || !delegatesToTypedLifecycle || !persistedOwnerIdentity;
}

/** Detects absence of the typed lifecycle boundary, durable poison state, or thin shell callers. */
function hasAbsentPoisonSurface(
  runtimeSource: string,
  cliSource: string,
  startSource: string,
  stopSource: string,
): boolean {
  const typedBoundaryExists = runtimeSource.length > 0 && cliSource.length > 0;
  const durablePoisonExists =
    /resetting-poisoned/.test(runtimeSource) &&
    /(?:persist|durable|flush)/i.test(runtimeSource) &&
    /recover\s*\(/.test(runtimeSource);
  const shellCallersAreThin = [startSource, stopSource].every((source) =>
    /(?:fixtures|scripts)[/\\]lifecycle(?:\.js|\.ts)?/.test(source),
  );
  return !typedBoundaryExists || !durablePoisonExists || !shellCallersAreThin;
}

// Required reset failures are fatal, endpoint identity is manifest-owned, cleanup is fenced by
// persisted ownership, and durable poison recovery lives behind a typed lifecycle/CLI boundary.
test('should expose the complete current lifecycle surface gap set before implementation', () => {
  const setupSource = readPublicSurface(publicSurfacePaths.setup);
  const startSource = readPublicSurface(publicSurfacePaths.start);
  const stopSource = readPublicSurface(publicSurfacePaths.stop);
  const composeSource = readPublicSurface(publicSurfacePaths.compose);
  const runtimeSource = readPlannedSurface(plannedRuntimePath);
  const cliSource = readPlannedSurface(plannedCliPath);
  const gapChecks: ReadonlyArray<readonly [name: (typeof expectedGapNames)[number], gap: boolean]> =
    [
      ['reset-failures-nonfatal', hasNonfatalResetSurface(setupSource)],
      ['fixed-endpoints', hasFixedEndpointSurface(setupSource, startSource, composeSource)],
      ['cleanup-unfenced', hasUnfencedCleanupSurface(stopSource)],
      [
        'poison-state-absent',
        hasAbsentPoisonSurface(runtimeSource, cliSource, startSource, stopSource),
      ],
    ];
  const detectedGapNames = gapChecks.filter(([, gap]) => gap).map(([name]) => name);

  if (detectedGapNames.join(',') !== expectedGapNames.join(',')) {
    throw new Error('LIFECYCLE_CURRENT_SURFACE_DIAGNOSIS_STALE');
  }
  assert.fail(fullGapMarker);
});
