import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads JSON relative to the repository root.
 *
 * @param {string} repositoryPath Repository-relative JSON path.
 * @returns {object} Parsed JSON value.
 */
function readRepositoryJson(repositoryPath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
}

/**
 * Discovers direct package workspaces and their manifests.
 *
 * @returns {Array<{directory: string, manifest: object}>} Workspace metadata sorted by path.
 */
function readPackageWorkspaces() {
  const packagesDirectory = resolve(repositoryRoot, 'packages');

  return readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      directory: `packages/${entry.name}`,
      manifest: readRepositoryJson(`packages/${entry.name}/package.json`),
    }))
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

// Repository metadata should continue to identify each package after future directory moves.
test('should keep package repository metadata aligned with physical workspace paths', () => {
  for (const workspace of readPackageWorkspaces()) {
    assert.equal(
      workspace.manifest.repository?.directory,
      workspace.directory,
      `${workspace.manifest.name} repository.directory must match ${workspace.directory}`,
    );
  }
});

// Internal dependencies must use the synchronized workspace version and may not introduce cycles.
test('should keep internal workspace dependencies exact and acyclic', () => {
  const workspaces = readPackageWorkspaces();
  const manifestsByName = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest]));
  const internalEdges = new Map();

  for (const { manifest } of workspaces) {
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    const edges = [];

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      const dependencyManifest = manifestsByName.get(dependencyName);
      if (!dependencyManifest) {
        continue;
      }

      assert.equal(
        dependencyVersion,
        dependencyManifest.version,
        `${manifest.name} must use the exact synchronized version of ${dependencyName}`,
      );
      edges.push(dependencyName);
    }

    internalEdges.set(manifest.name, edges);
  }

  /**
   * Visits an internal package edge and rejects dependency cycles.
   *
   * @param {string} packageName Workspace package to visit.
   * @param {Set<string>} visiting Packages in the current traversal path.
   * @param {Set<string>} visited Packages whose dependencies are already known to be acyclic.
   * @returns {void}
   */
  function visit(packageName, visiting, visited) {
    if (visited.has(packageName)) {
      return;
    }

    assert.equal(
      visiting.has(packageName),
      false,
      `internal dependency cycle reaches ${packageName}`,
    );
    visiting.add(packageName);

    for (const dependencyName of internalEdges.get(packageName) ?? []) {
      visit(dependencyName, visiting, visited);
    }

    visiting.delete(packageName);
    visited.add(packageName);
  }

  const visited = new Set();
  for (const packageName of internalEdges.keys()) {
    visit(packageName, new Set(), visited);
  }
});

// Root Turbo aliases and package scripts form one complete orchestration surface.
test('should wire every root Turbo alias to an implemented package task', () => {
  const rootManifest = readRepositoryJson('package.json');
  const turbo = readRepositoryJson('turbo.json');
  const workspaces = readPackageWorkspaces();

  for (const taskName of ['build', 'typecheck', 'lint', 'test', 'verify']) {
    const rootCommand = rootManifest.scripts?.[taskName] ?? '';
    assert.match(
      rootCommand,
      new RegExp(`(?:^|&&\\s*)turbo run ${taskName}$`),
      `root ${taskName} must delegate to Turbo after any root-only checks`,
    );
    assert.ok(turbo.tasks?.[taskName], `Turbo must define ${taskName}`);

    for (const { manifest } of workspaces) {
      assert.ok(manifest.scripts?.[taskName], `${manifest.name} must implement ${taskName}`);
    }
  }
});

// Operational aliases run from the repository root so the established root .env remains effective.
test('should preserve repository-root execution for server operational commands', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  assert.match(scripts.dev ?? '', /tsx watch packages\/server\/src\/index\.ts$/);
  assert.equal(scripts.start, 'node packages/server/dist/index.js');
  assert.equal(scripts.porta, 'tsx packages/server/src/cli/index.ts');

  for (const scriptName of ['migrate', 'migrate:rollback', 'migrate:status', 'migrate:create']) {
    assert.match(
      scripts[scriptName] ?? '',
      /--migrations-dir packages\/server\/migrations(?:\s|$)/,
      `${scriptName} must resolve the moved migration directory from the repository root`,
    );
  }
});

// These aliases remain stable until the branch workflow is migrated to the Turbo entry points.
test('should retain the server test aliases used by branch CI', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  for (const scriptName of [
    'test:unit',
    'test:integration',
    'test:e2e',
    'test:pentest',
    'test:ui',
  ]) {
    assert.match(
      scripts[scriptName] ?? '',
      /^yarn workspace @portaidentity\/server test:/,
      `${scriptName} must delegate to the server package`,
    );
  }
});

// Nested install boundaries can silently bypass the root lockfile and workspace dependency graph.
test('should keep active package and harness installs under the root lockfile', () => {
  for (const { directory } of readPackageWorkspaces()) {
    assert.equal(existsSync(resolve(repositoryRoot, directory, 'yarn.lock')), false);
  }

  assert.equal(existsSync(resolve(repositoryRoot, 'test-harness/package.json')), false);
  assert.equal(existsSync(resolve(repositoryRoot, 'test-harness/yarn.lock')), false);
  assert.equal(existsSync(resolve(repositoryRoot, 'yarn.lock')), true);
});
