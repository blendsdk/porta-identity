import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');
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
  const releaseVersion = rootManifest.version;
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
  assert.ok(
    readRepositoryFile('packages/sdk/src/version.ts').includes(`SDK_VERSION = '${releaseVersion}'`),
  );
  assert.ok(
    readRepositoryFile('packages/cli/src/commands/version.ts').includes(
      `CLI_VERSION = '${releaseVersion}'`,
    ),
  );
  assert.ok(
    readRepositoryFile('packages/server/src/version.ts').includes(
      `SERVER_VERSION = '${releaseVersion}'`,
    ),
  );
  const serverEntry = readRepositoryFile('packages/server/src/index.ts');
  assert.match(
    serverEntry,
    /logger\.info\(\s*\{[^}]*version:\s*SERVER_VERSION[^}]*\},?\s*'Server started'/s,
  );
  assert.ok(
    readRepositoryFile('scripts/sync-versions.js').includes('packages/server/src/version.ts'),
  );
});

test('should release from a manual dispatch that bumps, notes, tags, and publishes', () => {
  const manifest = readRepositoryJson('package.json');
  const workflow = readWorkflow('.github/workflows/release.yml');
  const source = readRepositoryFile('.github/workflows/release.yml');

  // Manual dispatch only: the version bump is automated inside the run.
  assert.equal(workflow.on?.workflow_run, undefined);
  const dispatch = workflow.on?.workflow_dispatch;
  assert.ok(dispatch, 'workflow_dispatch trigger is required');
  assert.deepEqual(dispatch.inputs?.bump?.options, ['auto', 'patch', 'minor', 'major']);
  assert.equal(dispatch.inputs?.bump?.default, 'auto');
  assert.equal(dispatch.inputs?.dry_run?.type, 'boolean');

  assert.equal(workflow.permissions?.contents, 'write');
  assert.equal(workflow.permissions?.['id-token'], 'write');
  assert.equal(workflow.permissions?.actions, 'write');
  assert.equal(workflow.permissions?.issues, undefined);
  assert.equal(workflow.permissions?.['pull-requests'], undefined);

  // Verification gate, automated bump, publish, explicit tag push, release, and Docker.
  assert.match(source, /Build and Test/);
  assert.match(source, /lockstep version/);
  assert.match(source, /--no-git-commit/);
  assert.match(source, /yarn release:preflight/);
  assert.match(source, /yarn release:publish/);
  assert.match(source, /--dry/);
  assert.match(source, /refs\/tags\//);
  assert.match(source, /gh release create/);
  assert.match(source, /--verify-tag/);
  assert.match(source, /gh workflow run docker\.yml/);
  assert.doesNotMatch(source, /^\s+workflow_run:/m);
  assert.doesNotMatch(source, /NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.match(manifest.scripts?.['release:publish'] ?? '', /--provenance/);
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

test('should publish through tokenless npm Trusted Publishing', () => {
  const source = readRepositoryFile('.github/workflows/release.yml');

  assert.match(source, /npm\s+(?:--version|exec)/);
  assert.match(source, /id-token:\s*write/);
  assert.match(source, /runs-on:\s*ubuntu-latest/);
  assert.match(source, /run:\s*yarn release:publish/);
  assert.match(source, /for attempt in \$\(seq 1 60\)/);
  assert.match(source, /sleep 15/);
  // The integrity comparison applies to the run that published; an already-published re-run
  // binds the published provenance to this repository and to the published integrity digest
  // because the regenerated changelog makes a repacked tarball differ.
  assert.match(source, /ALL_PUBLISHED: \$\{\{ steps\.published\.outputs\.all_published \}\}/);
  assert.match(source, /"\$ALL_PUBLISHED" = "true"/);
  assert.match(source, /"\$published_integrity" = "\$expected_integrity"/);
  assert.match(source, /registry\.npmjs\.org\/-\/npm\/v1\/attestations/);
  assert.match(source, /--connect-timeout 5 --max-time 20/);
  assert.match(source, /Buffer\.from\(sha512Hex, 'hex'\)\.toString\('base64'\)/);
  assert.match(source, /"\$published_by" = "https:\/\/github\.com\/\$GITHUB_REPOSITORY"/);
  assert.match(source, /"\$published_digest" = "\$published_integrity"/);
  assert.match(
    source,
    /"\$published_name" = "pkg:npm\/@portaidentity\/\$package_name@\$RELEASE_VERSION"/,
  );
  // The release is idempotent: a re-run skips the publish when every package
  // already carries the version and skips the Docker dispatch when the image
  // already exists, so a post-publish failure can be recovered.
  assert.match(source, /Check published state/);
  assert.match(source, /all_published/);
  assert.match(source, /docker manifest inspect/);
  assert.match(
    readRepositoryJson('package.json').scripts?.['release:publish'] ?? '',
    /npm_config_registry=https:\/\/registry\.npmjs\.org/,
  );
  assert.doesNotMatch(source, /bootstrap|publish_if_absent/);
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
