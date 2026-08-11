import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/** Stable gap names whose complete set constitutes the pre-implementation fixture RED state. */
const expectedGaps = [
  'shared-single-tenant',
  'project-collection-incomplete',
  'secret-output-present',
  'production-security-profile-absent',
] as const;

/** Exact marker accepted by the bounded RED command. */
const expectedMarker = `FIXTURE_CURRENT_SURFACE_GAPS: ${expectedGaps.join(',')}`;

const repositoryRoot = resolve(import.meta.dirname, '../../..');

/** Reads one required repository source file without importing or executing it. */
function readRequiredSource(repositoryPath: string): string {
  const absolutePath = resolve(repositoryRoot, repositoryPath);
  if (!existsSync(absolutePath))
    throw new Error(`required fixture source is absent: ${repositoryPath}`);
  return readFileSync(absolutePath, 'utf8');
}

/** Detects the retained seed's shared single-organization fixture. */
function hasSharedSingleTenantSeed(seedSource: string): boolean {
  return (
    /const\s+ORG_SLUG\s*=\s*['"]test-org['"]/u.test(seedSource) &&
    !/['"]alpha['"]/u.test(seedSource) &&
    !/['"]bravo['"]/u.test(seedSource)
  );
}

/** Detects absence of any required directory-owned Playwright project. */
function hasIncompleteProjectCollection(configSource: string): boolean {
  return ['protocol', 'security', 'compatibility'].some(
    (project) => !new RegExp(`name:\\s*['"]${project}['"]`, 'u').test(configSource),
  );
}

/** Detects explicit output of a raw client secret or password from the retained seed. */
function hasSecretBearingOutput(seedSource: string): boolean {
  return (
    /console\.log\([^\n]*(?:client secret|BFF Secret)[^\n]*\$\{bffSecret\}/iu.test(seedSource) ||
    /console\.log\([^\n]*\$\{TEST_USER_PASSWORD\}/u.test(seedSource)
  );
}

/** Detects the absence of the exact production-security Compose override. */
function lacksProductionSecurityProfile(): boolean {
  return !existsSync(
    resolve(repositoryRoot, 'test-harness/docker-compose.production-security.yml'),
  );
}

// The pre-implementation checkpoint is valid only when all four known fixture gaps are present.
// A partial diagnosis is an unrelated failure, while a fully implemented surface becomes green.
test('should expose the complete current fixture surface gap set before implementation', () => {
  const seedSource = readRequiredSource('test-harness/scripts/seed.ts');
  const configSource = readRequiredSource('test-harness/playwright.config.ts');
  const observations: readonly (readonly [(typeof expectedGaps)[number], boolean])[] = [
    ['shared-single-tenant', hasSharedSingleTenantSeed(seedSource)],
    ['project-collection-incomplete', hasIncompleteProjectCollection(configSource)],
    ['secret-output-present', hasSecretBearingOutput(seedSource)],
    ['production-security-profile-absent', lacksProductionSecurityProfile()],
  ];
  const observed = observations.filter(([, present]) => present).map(([gap]) => gap);

  if (observed.length === 0) return;
  if (observed.join(',') !== expectedGaps.join(',')) {
    throw new Error(`fixture surface diagnosis is partial or stale: ${observed.join(',')}`);
  }
  assert.fail(expectedMarker);
});
