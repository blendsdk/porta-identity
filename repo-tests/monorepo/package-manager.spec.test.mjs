import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import test from 'node:test';

import { parseAllDocuments } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads a repository JSON file and reports its path when parsing fails.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  try {
    return JSON.parse(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
  } catch (error) {
    throw new Error(`Expected ${repositoryPath} to contain valid JSON`, { cause: error });
  }
}

/**
 * Reads a repository YAML file and returns its first document.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed YAML object.
 */
function readRepositoryYaml(repositoryPath) {
  const documents = parseAllDocuments(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
  const first = documents[0]?.toJSON();

  assert.ok(first && typeof first === 'object', `${repositoryPath} must contain a YAML object`);
  return first;
}

/**
 * Reads the project document from a pnpm lockfile.
 *
 * pnpm 12 may write a boot document followed by the project document. Tools must read the last
 * document so they do not mistake the package-manager boot data for the dependency graph.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed project lockfile document.
 */
function readPnpmProjectLockfile(repositoryPath) {
  const documents = parseAllDocuments(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
  const project = documents.at(-1)?.toJSON();

  assert.ok(
    project && typeof project === 'object' && project.importers,
    `${repositoryPath} must contain a project document with importers`,
  );
  return project;
}

/**
 * Finds files with a given name below a directory while excluding install trees.
 *
 * @param {string} directory Absolute directory to inspect.
 * @param {string} fileName Exact file name to find.
 * @returns {string[]} Repository-relative paths in stable order.
 */
function findFiles(directory, fileName) {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(entryPath, fileName));
    } else if (entry.name === fileName) {
      found.push(relative(repositoryRoot, entryPath).replaceAll('\\', '/'));
    }
  }

  return found.sort();
}

// The root is a private pnpm 12 workspace with a single explicit TypeScript 6 compatibility alias.
test('should pin pnpm and keep the private workspace root', () => {
  const manifest = readRepositoryJson('package.json');

  assert.equal(manifest.name, '@portaidentity/monorepo');
  assert.equal(manifest.private, true);
  assert.match(manifest.packageManager ?? '', /^pnpm@12\.15\.0(?:\+|$)/);
  assert.equal(manifest.engines?.node, '>=22.22.2');
  assert.equal(typeof manifest.engines?.pnpm, 'string');
  assert.equal(manifest.engines?.yarn, undefined);
  assert.deepEqual(manifest.workspaces, ['packages/*']);
  assert.equal(manifest.resolutions, undefined);
  assert.equal(
    manifest.devDependencies?.typescript,
    'npm:@typescript/typescript6@^6.0.2',
    'root TypeScript alias must keep typescript-eslint on the TS 6 API',
  );
});

// The workspace settings preserve the hoisted layout and approved native build scripts.
test('should configure the pnpm workspace for the hoisted migration', () => {
  const workspace = readRepositoryYaml('pnpm-workspace.yaml');

  assert.deepEqual(workspace.packages, ['packages/*']);
  assert.equal(workspace.nodeLinker, 'hoisted');
  assert.equal(workspace.linkWorkspacePackages, true);
  assert.equal(workspace.minimumReleaseAge, 0);
  assert.equal(workspace.strictDepBuilds, true);
  assert.equal(workspace.engineStrict, true);
  assert.equal(workspace.pmOnFail, 'ignore');
  assert.equal(workspace.savePrefix, '');
  assert.equal(workspace.autoInstallPeers, false);
  assert.deepEqual(workspace.skills?.dirs, []);

  for (const packageName of ['argon2', 'esbuild', 'fs-ext-extra-prebuilt', 'fsevents']) {
    assert.equal(workspace.allowBuilds?.[packageName], true, `${packageName} must be approved`);
  }

  assert.equal(workspace.overrides?.['co-body>qs'], '6.16.0');
  assert.equal(workspace.overrides?.['minimatch>brace-expansion'], '5.0.12');
  assert.equal(workspace.overrides?.['fast-copy'], '4.2.0');
});

// GitHub's dependency graph reads a pnpm lockfile as one YAML document. pnpm 12
// prepends a boot document when it enforces the packageManager pin; pmOnFail:
// ignore keeps the project document first and only, so the graph sees the 936
// project packages instead of pnpm's own executables.
test('should keep pnpm-lock.yaml single-document for dependency-graph readers', () => {
  const documents = parseAllDocuments(
    readFileSync(resolve(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'),
  );

  assert.equal(
    documents.length,
    1,
    'pnpm-lock.yaml must remain a single document so GitHub can parse the project graph',
  );
  const project = documents[0]?.toJSON();
  assert.ok(project?.importers?.['.'], 'single-document lockfile must retain the root importer');
});

// Exactly one root pnpm lockfile owns the install graph; Yarn lockfiles must be gone.
test('should keep one root pnpm lockfile and no Yarn lockfile', () => {
  assert.equal(existsSync(resolve(repositoryRoot, 'pnpm-lock.yaml')), true);
  assert.equal(existsSync(resolve(repositoryRoot, 'yarn.lock')), false);

  assert.deepEqual(findFiles(resolve(repositoryRoot, 'packages'), 'yarn.lock'), []);
  assert.deepEqual(findFiles(resolve(repositoryRoot, 'packages'), 'pnpm-lock.yaml'), []);
  assert.deepEqual(findFiles(resolve(repositoryRoot, 'test-harness'), 'yarn.lock'), []);
  assert.deepEqual(findFiles(resolve(repositoryRoot, 'test-harness'), 'pnpm-lock.yaml'), []);

  const lockfile = readPnpmProjectLockfile('pnpm-lock.yaml');
  for (const importer of ['.', 'packages/server', 'packages/sdk', 'packages/cli']) {
    assert.ok(lockfile.importers[importer], `pnpm-lock.yaml must import ${importer}`);
  }

  const cliSdk = lockfile.importers['packages/cli'].dependencies?.['@portaidentity/sdk'];
  assert.ok(cliSdk, 'CLI importer must depend on the local SDK');
  assert.match(String(cliSdk.version), /sdk/, 'CLI SDK dependency must link to the workspace package');
});

// Repository commands must no longer invoke Yarn after the migration.
test('should use pnpm for the root and package command surfaces', () => {
  const manifest = readRepositoryJson('package.json');
  const scripts = manifest.scripts ?? {};

  assert.match(scripts.verify ?? '', /^pnpm test:structure && turbo run verify$/);
  assert.match(scripts['test:all'] ?? '', /pnpm --filter @portaidentity\/server test:all/);
  assert.match(scripts['test:all'] ?? '', /pnpm --filter @portaidentity\/sdk test/);
  assert.match(scripts['test:all'] ?? '', /pnpm --filter @portaidentity\/cli test/);
  assert.match(scripts['deps:update'] ?? '', /pnpm install/);
  assert.match(scripts['deps:update'] ?? '', /pnpm verify/);

  for (const [name, command] of Object.entries(scripts)) {
    assert.doesNotMatch(String(command), /\byarn\b/, `root script ${name} must not invoke Yarn`);
  }

  for (const packagePath of ['packages/server', 'packages/sdk', 'packages/cli']) {
    const packageManifest = readRepositoryJson(`${packagePath}/package.json`);
    for (const [name, command] of Object.entries(packageManifest.scripts ?? {})) {
      assert.doesNotMatch(
        String(command),
        /\byarn\b/,
        `${packagePath} script ${name} must not invoke Yarn`,
      );
    }
  }
});
