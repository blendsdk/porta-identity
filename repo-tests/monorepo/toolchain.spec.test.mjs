import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const expectedPackages = [
  { directory: 'packages/cli', name: '@portaidentity/cli' },
  { directory: 'packages/sdk', name: '@portaidentity/sdk' },
  { directory: 'packages/server', name: '@portaidentity/server' },
];

/**
 * Reads a repository JSON file and reports its path when parsing fails.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  const absolutePath = resolve(repositoryRoot, repositoryPath);

  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Expected ${repositoryPath} to contain valid JSON`, { cause: error });
  }
}

/**
 * Returns the TypeScript 7 compiler alias declared by an active package.
 * TypeScript 7 has no compiler API, so lint tooling receives the official TypeScript 6
 * compatibility package through the conventional `typescript` dependency name.
 *
 * @param {Record<string, any>} manifest Active package manifest.
 * @param {string} manifestPath Path used in actionable assertion messages.
 * @returns {string} Declared TypeScript version or range.
 */
function getTypeScriptRange(manifest, manifestPath) {
  const versionRange =
    manifest.devDependencies?.['@typescript/native'] ??
    manifest.dependencies?.['@typescript/native'];
  const compatibilityRange =
    manifest.devDependencies?.typescript ?? manifest.dependencies?.typescript;

  assert.equal(
    typeof versionRange,
    'string',
    `${manifestPath} must declare the TypeScript 7 compiler alias as a build dependency`,
  );
  assert.match(
    compatibilityRange ?? '',
    /^npm:@typescript\/typescript6@\^6\.0\.2$/,
    `${manifestPath} must expose the official TypeScript 6 API compatibility package to tooling`,
  );
  return versionRange;
}

/**
 * Validates and normalizes the repository's supported exact or caret version style.
 * A numeric-only version deliberately rejects prerelease and build metadata suffixes.
 *
 * @param {string} versionRange TypeScript manifest range.
 * @param {string} manifestPath Path used in actionable assertion messages.
 * @returns {string} Normalized exact version without a caret prefix.
 */
function normalizeStableTypeScriptVersion(versionRange, manifestPath) {
  const match = /^npm:typescript@(?:\^)?(7\.\d+\.\d+)$/.exec(versionRange);

  assert.ok(
    match,
    `${manifestPath} TypeScript compiler alias must select a stable 7.x version; found ${versionRange}`,
  );
  return match[1];
}

/**
 * Extracts every TypeScript version selected by a Yarn Classic lockfile.
 *
 * @param {string} lockfile Yarn Classic lockfile contents.
 * @returns {string[]} Selected TypeScript versions.
 */
function getLockedTypeScriptVersions(lockfile) {
  const versions = [];
  const blocks = lockfile.split(/\n(?=\S)/);

  for (const block of blocks) {
    const header = block.slice(0, block.indexOf('\n'));
    if (!/(?:^|,\s*)["']?@typescript\/native@npm:typescript@/.test(header)) {
      continue;
    }

    const versionMatch = /^\s{2}version\s+["']([^"']+)["']\s*$/m.exec(block);
    assert.ok(
      versionMatch,
      `yarn.lock TypeScript entry must contain a selected version: ${header}`,
    );
    versions.push(versionMatch[1]);
  }

  return versions;
}

/**
 * Checks the common root/workspace selection used by dependency maintenance commands.
 *
 * @param {string} scriptName Manifest script name shown in failures.
 * @param {string} command Shell command declared by the script.
 */
function assertWorkspaceAwareNcuSelection(scriptName, command) {
  assert.match(command, /(?:^|\s)ncu(?:\s|$)/, `${scriptName} must invoke npm-check-updates`);
  assert.match(command, /(?:^|\s)--root(?:\s|$)/, `${scriptName} must include the root manifest`);
  assert.match(
    command,
    /(?:^|\s)--workspaces(?:\s|$)/,
    `${scriptName} must include active workspace manifests`,
  );
  assert.match(
    command,
    /(?:^|\s)-x\s+["']?@portaidentity\/\*["']?(?:\s|$)/,
    `${scriptName} must exclude internal @portaidentity/* dependencies`,
  );
}

// The private root coordinates exactly the server, SDK, and CLI through one Yarn Classic install.
test('should keep exactly the three active packages under the private Yarn Classic root', () => {
  const rootManifest = readRepositoryJson('package.json');
  const discoveredPackages = readdirSync(resolve(repositoryRoot, 'packages'), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(repositoryRoot, 'packages', entry.name, 'package.json')),
    )
    .map((entry) => ({
      directory: `packages/${entry.name}`,
      name: readRepositoryJson(`packages/${entry.name}/package.json`).name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  assert.equal(
    rootManifest.name,
    '@portaidentity/monorepo',
    'root manifest must identify the monorepo coordinator',
  );
  assert.equal(rootManifest.private, true, 'root monorepo coordinator must remain private');
  assert.match(
    rootManifest.packageManager ?? '',
    /^yarn@1\.22\.22(?:\+|$)/,
    'root packageManager must select Yarn Classic 1.22.22',
  );
  assert.deepEqual(
    discoveredPackages,
    expectedPackages,
    'packages/ must contain exactly the active server, SDK, and CLI',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'yarn.lock')),
    true,
    'the active install graph must use the root yarn.lock',
  );

  for (const activePackage of expectedPackages) {
    assert.equal(
      existsSync(resolve(repositoryRoot, activePackage.directory, 'yarn.lock')),
      false,
      `${activePackage.directory} must not own a separate lockfile`,
    );
  }
});

// Every active package and the Yarn Classic lockfile select one identical stable TypeScript 7 release.
test('should select the same stable TypeScript 7 version across active packages', () => {
  const manifestVersions = expectedPackages.map(({ directory }) => {
    const manifestPath = `${directory}/package.json`;
    const manifest = readRepositoryJson(manifestPath);
    const compilerPath = '../../node_modules/@typescript/native/bin/tsc';

    assert.ok(
      (manifest.scripts?.build ?? '') === compilerPath ||
        (manifest.scripts?.build ?? '').startsWith(`${compilerPath} `),
      `${manifestPath} build must invoke the TypeScript 7 compiler directly`,
    );
    assert.ok(
      (manifest.scripts?.typecheck ?? '') === compilerPath ||
        (manifest.scripts?.typecheck ?? '').startsWith(`${compilerPath} `),
      `${manifestPath} typecheck must invoke the TypeScript 7 compiler directly`,
    );

    return normalizeStableTypeScriptVersion(
      getTypeScriptRange(manifest, manifestPath),
      manifestPath,
    );
  });
  const uniqueManifestVersions = [...new Set(manifestVersions)];

  assert.equal(
    uniqueManifestVersions.length,
    1,
    `active package TypeScript versions must be synchronized; found ${uniqueManifestVersions.join(', ')}`,
  );

  const lockfile = readFileSync(resolve(repositoryRoot, 'yarn.lock'), 'utf8');
  assert.match(
    lockfile,
    /^# yarn lockfile v1$/m,
    'root yarn.lock must use the Yarn Classic lockfile format',
  );

  const lockedVersions = [...new Set(getLockedTypeScriptVersions(lockfile))];
  assert.ok(lockedVersions.length > 0, 'root yarn.lock must contain a TypeScript selection');
  assert.deepEqual(
    lockedVersions,
    uniqueManifestVersions,
    `root yarn.lock TypeScript selection must match active manifests; found ${lockedVersions.join(', ')}`,
  );
});

// Dependency maintenance selects root and workspaces while leaving internal packages to the workspace graph.
test('should check dependencies across the active workspace graph without network work in this test', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  assertWorkspaceAwareNcuSelection('deps:check', scripts['deps:check'] ?? '');
});

// Dependency updates use the same selection, reinstall with Yarn Classic, and verify the full repository.
test('should update, reinstall, and verify dependencies across the active workspace graph', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};
  const updateCommand = scripts['deps:update'] ?? '';

  assertWorkspaceAwareNcuSelection('deps:update', updateCommand);
  assert.match(
    updateCommand,
    /(?:^|\s)-u(?:\s|$)/,
    'deps:update must apply npm-check-updates results',
  );
  assert.match(
    updateCommand,
    /(?:^|\s)yarn\s+install(?:\s|&|$)/,
    'deps:update must reinstall with Yarn Classic',
  );
  assert.match(
    updateCommand,
    /(?:^|\s)yarn\s+verify(?:\s|&|$)/,
    'deps:update must run the repository verification',
  );

  const updateIndex = updateCommand.indexOf('ncu');
  const installIndex = updateCommand.indexOf('yarn install');
  const verifyIndex = updateCommand.indexOf('yarn verify');
  assert.ok(
    updateIndex < installIndex && installIndex < verifyIndex,
    'deps:update must update manifests before reinstalling and verify only after installation',
  );
});
