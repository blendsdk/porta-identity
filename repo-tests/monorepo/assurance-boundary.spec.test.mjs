import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const internalSpecification = 'test-harness/assurance/tests/assurance.spec.test.ts';

/**
 * Reads a repository file as UTF-8 text.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/**
 * Reads a repository JSON file and reports malformed input with its path.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  try {
    return JSON.parse(readRepositoryFile(repositoryPath));
  } catch (error) {
    throw new Error(`Expected ${repositoryPath} to contain valid JSON`, { cause: error });
  }
}

// Internal assurance tooling belongs to the root install graph without creating another workspace.
test('should keep assurance tooling under direct root dependency ownership', () => {
  const rootManifest = readRepositoryJson('package.json');

  assert.equal(
    typeof rootManifest.devDependencies?.tsx,
    'string',
    'the root manifest must directly own tsx for TypeScript Node tests',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'test-harness/package.json')),
    false,
    'the retained harness must not acquire its own package manifest',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'test-harness/yarn.lock')),
    false,
    'the retained harness must use the root lockfile',
  );
  assert.deepEqual(
    rootManifest.workspaces,
    ['packages/*'],
    'the harness must remain outside the root workspace graph',
  );
});

// Repository checks use Node's runner and deliberately leave provisional TypeScript specs isolated.
test('should leave harness-internal TypeScript specifications outside required collection', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  assert.equal(
    scripts['test:structure'],
    'node --test repo-tests/monorepo/*.test.mjs',
    'structure checks must collect only repository-owned JavaScript tests',
  );
  assert.doesNotMatch(
    scripts['test:structure'] ?? '',
    /test-harness|tsx/,
    'structure checks must not collect provisional harness-internal specifications',
  );
  assert.ok(
    existsSync(resolve(repositoryRoot, internalSpecification)),
    `${internalSpecification} must exist for the isolated red-phase command`,
  );
});

// Playwright owns external browser journeys only; Node owns assurance model specifications.
test('should keep Playwright collection disjoint from harness-internal Node tests', () => {
  const playwrightConfig = readRepositoryFile('test-harness/playwright.config.ts');
  const internalPath = resolve(repositoryRoot, internalSpecification);
  const playwrightDirectory = resolve(repositoryRoot, 'test-harness/tests');

  assert.match(
    playwrightConfig,
    /testDir:\s*['"]\.\/tests['"]/,
    'Playwright must remain directory-scoped to retained external journeys',
  );
  assert.match(
    playwrightConfig,
    /testMatch:\s*\/spa-\.\*\\\.spec\\\.ts\//,
    'the SPA project must collect only its external journey naming convention',
  );
  assert.match(
    playwrightConfig,
    /testMatch:\s*\/bff-\.\*\\\.spec\\\.ts\//,
    'the BFF project must collect only its external journey naming convention',
  );
  assert.equal(
    internalPath.startsWith(`${playwrightDirectory}/`),
    false,
    'harness-internal Node tests must remain outside Playwright testDir',
  );
  assert.equal(
    /^(?:spa|bff)-.*\.spec\.ts$/.test('assurance.spec.test.ts'),
    false,
    'the internal naming convention must not overlap either Playwright project',
  );
});

// Root commands retain ownership of static checks instead of delegating to a hidden harness package.
test('should keep typecheck and lint ownership at the repository root', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  for (const command of ['typecheck', 'lint', 'lint:fix']) {
    assert.equal(typeof scripts[command], 'string', `root script ${command} must exist`);
    assert.doesNotMatch(
      scripts[command],
      /yarn\s+workspace\s+[^\s]*harness|test-harness\/package\.json/,
      `root script ${command} must not delegate to a harness workspace`,
    );
  }
});
