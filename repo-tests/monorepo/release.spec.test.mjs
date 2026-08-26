import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const releaseVersion = '1.7.0';
const packagePaths = [
  'packages/server/package.json',
  'packages/sdk/package.json',
  'packages/cli/package.json',
];

/**
 * Reads a UTF-8 repository file by its root-relative path.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/**
 * Reads and parses a repository JSON document.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  return JSON.parse(readRepositoryFile(repositoryPath));
}

/**
 * Reads a GitHub Actions workflow while preserving a literal `on` key.
 *
 * @param {string} repositoryPath Workflow path relative to the repository root.
 * @returns {Record<string, any>} Parsed workflow document.
 */
function readWorkflow(repositoryPath) {
  return parse(readRepositoryFile(repositoryPath));
}

test('should select one exact release toolchain and expose three release commands', () => {
  const manifest = readRepositoryJson('package.json');

  assert.equal(manifest.devDependencies?.['@blendsdk/lockstep'], '1.3.0');
  assert.equal(manifest.devDependencies?.npm, '11.15.0');
  assert.equal(typeof manifest.scripts?.['release:prepare'], 'string');
  assert.equal(typeof manifest.scripts?.['release:preflight'], 'string');
  assert.equal(typeof manifest.scripts?.['release:publish'], 'string');
  assert.equal(existsSync(resolve(repositoryRoot, '.releaserc.json')), false);
});

test('should keep every publishable component on the coordinated release version', () => {
  const rootManifest = readRepositoryJson('package.json');
  const manifests = packagePaths.map(readRepositoryJson);

  assert.equal(rootManifest.version, releaseVersion);
  for (const manifest of manifests) {
    assert.equal(manifest.version, releaseVersion, `${manifest.name} must use ${releaseVersion}`);
    assert.equal(manifest.publishConfig?.access, 'public');
    assert.equal(manifest.repository?.url, 'https://github.com/blendsdk/porta-identity.git');
  }
  assert.equal(
    readRepositoryJson('packages/cli/package.json').dependencies?.['@portaidentity/sdk'],
    releaseVersion,
  );
  assert.match(readRepositoryFile('packages/sdk/src/version.ts'), /SDK_VERSION = '1\.7\.0'/);
  assert.match(readRepositoryFile('packages/cli/src/commands/version.ts'), /CLI_VERSION = '1\.7\.0'/);
});

test('should publish only an exact successful main candidate with provenance', () => {
  const workflow = readWorkflow('.github/workflows/release.yml');
  const source = readRepositoryFile('.github/workflows/release.yml');

  assert.deepEqual(workflow.on?.workflow_run?.branches, ['main']);
  assert.equal(workflow.permissions?.['id-token'], 'write');
  assert.equal(workflow.permissions?.issues, undefined);
  assert.equal(workflow.permissions?.['pull-requests'], undefined);
  assert.match(source, /github\.event\.workflow_run\.head_sha/);
  assert.match(source, /yarn release:preflight/);
  assert.match(source, /yarn release:publish/);
  assert.match(source, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  assert.match(source, /--provenance|NPM_CONFIG_PROVENANCE:\s*true/);
  assert.doesNotMatch(source, /semantic-release/);
  assert.doesNotMatch(source, /\byarn\s+build:(?:sdk|cli)\b/);
});

test('should dispatch Docker from the verified release tag and publish one image digest', () => {
  const workflow = readWorkflow('.github/workflows/docker.yml');
  const source = readRepositoryFile('.github/workflows/docker.yml');

  assert.equal(workflow.on?.workflow_run, undefined);
  assert.ok(workflow.on?.workflow_dispatch?.inputs?.tag?.required);
  assert.ok(workflow.on?.workflow_dispatch?.inputs?.sha?.required);
  assert.match(source, /type=semver,pattern=\{\{version\}\}/);
  assert.match(source, /type=semver,pattern=\{\{major\}\}\.\{\{minor\}\}/);
  assert.match(source, /type=semver,pattern=\{\{major\}\}/);
  assert.match(source, /type=raw,value=latest/);
  assert.match(source, /linux\/amd64,linux\/arm64/);
  assert.doesNotMatch(source, /github\.event_name == 'workflow_run'/);
});

test('should retain a tokenless trusted-publishing path after bootstrap', () => {
  const source = readRepositoryFile('.github/workflows/release.yml');

  assert.match(source, /npm\s+(?:--version|exec)/);
  assert.match(source, /id-token:\s*write/);
  assert.match(source, /runs-on:\s*ubuntu-latest/);
  assert.match(source, /release\.yml/);
});

test('should remove stale release ownership and retired workspace paths', () => {
  const inspectedPaths = [
    'package.json',
    '.github/workflows/release.yml',
    '.github/workflows/docker.yml',
    'scripts/sync-versions.js',
  ];
  const source = inspectedPaths
    .filter((path) => existsSync(resolve(repositoryRoot, path)))
    .map(readRepositoryFile)
    .join('\n');

  assert.doesNotMatch(source, /semantic-release|packages\/porta-(?:sdk|cli|admin-gui)/);
});
