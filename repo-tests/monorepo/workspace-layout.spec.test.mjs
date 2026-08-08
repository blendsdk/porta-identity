import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const expectedPublicPackages = [
  '@portaidentity/cli',
  '@portaidentity/sdk',
  '@portaidentity/server',
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
 * Collects package manifests while excluding installed dependency trees.
 *
 * @param {string} directory Directory to inspect.
 * @returns {string[]} Absolute paths to discovered package manifests.
 */
function findPackageManifests(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const manifests = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...findPackageManifests(entryPath));
    } else if (entry.name === 'package.json') {
      manifests.push(entryPath);
    }
  }

  return manifests;
}

/**
 * Returns Yarn Classic workspace patterns from either supported manifest shape.
 *
 * @param {Record<string, any>} manifest Root package manifest.
 * @returns {string[]} Workspace path patterns.
 */
function getWorkspacePatterns(manifest) {
  if (Array.isArray(manifest.workspaces)) {
    return manifest.workspaces;
  }

  if (manifest.workspaces && Array.isArray(manifest.workspaces.packages)) {
    return manifest.workspaces.packages;
  }

  return [];
}

/**
 * Converts the small set of path globs supported by Yarn workspaces to a regular expression.
 * A single star stays within one directory segment, while a double star can cross segments.
 *
 * @param {string} pattern Workspace path pattern.
 * @returns {RegExp} Regular expression anchored to the full repository-relative path.
 */
function workspaceGlobToRegExp(pattern) {
  const normalizedPattern = pattern.replace(/^\.\//, '').replace(/\/$/, '');
  let expression = '^';

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];

    if (character === '*' && normalizedPattern[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (character === '*') {
      expression += '[^/]*';
    } else {
      expression += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  return new RegExp(`${expression}$`);
}

/**
 * Determines whether a repository-relative directory belongs to the Yarn install graph.
 *
 * @param {string} directory Repository-relative directory using forward slashes.
 * @param {string[]} patterns Root workspace patterns.
 * @returns {boolean} Whether any workspace pattern selects the directory.
 */
function isWorkspaceDirectory(directory, patterns) {
  return patterns.some((pattern) => workspaceGlobToRegExp(pattern).test(directory));
}

// The repository root identifies the private Yarn Classic monorepo and its supported Node floor.
test('should identify the private Yarn Classic monorepo at the repository root', () => {
  const rootManifest = readRepositoryJson('package.json');

  assert.equal(
    rootManifest.name,
    '@portaidentity/monorepo',
    'root package name must identify the monorepo',
  );
  assert.equal(rootManifest.private, true, 'root package must be private');
  assert.match(
    rootManifest.packageManager ?? '',
    /^yarn@1\.22\.22(?:\+|$)/,
    'packageManager must identify Yarn 1.22.22',
  );
  assert.equal(rootManifest.engines?.node, '>=22.22.2', 'Node engine must have a >=22.22.2 floor');
});

// Exactly the server, SDK, and standalone CLI are public packages in the active install graph.
test('should expose exactly the three retained public packages as root workspaces', () => {
  const rootManifest = readRepositoryJson('package.json');
  const workspacePatterns = getWorkspacePatterns(rootManifest);
  const packageManifests = findPackageManifests(resolve(repositoryRoot, 'packages'));
  const publicPackages = packageManifests
    .map((manifestPath) => ({
      directory: relative(repositoryRoot, resolve(manifestPath, '..')).replaceAll('\\', '/'),
      manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    }))
    .filter(({ manifest }) => manifest.private !== true);

  assert.deepEqual(
    publicPackages.map(({ manifest }) => manifest.name).sort(),
    expectedPublicPackages,
    'packages/ must contain exactly the public server, SDK, and CLI manifests',
  );
  assert.ok(workspacePatterns.length > 0, 'root package must declare Yarn workspaces');

  for (const publicPackage of publicPackages) {
    assert.ok(
      isWorkspaceDirectory(publicPackage.directory, workspacePatterns),
      `${publicPackage.manifest.name} must be selected by a root workspace pattern`,
    );
  }

  assert.equal(
    existsSync(resolve(repositoryRoot, 'test-harness/package.json')),
    false,
    'OIDC harness must not own a package manifest',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'test-harness/yarn.lock')),
    false,
    'OIDC harness must use the root lockfile',
  );
});

// The admin GUI leaves the workspace and root build scripts, while the standalone CLI's optional gui command remains outside this scan.
test('should remove the admin GUI from the root workspace and build-script topology', () => {
  const rootManifest = readRepositoryJson('package.json');
  const rootScripts = Object.entries(rootManifest.scripts ?? {});
  const workspacePatterns = getWorkspacePatterns(rootManifest);

  assert.equal(
    existsSync(resolve(repositoryRoot, 'packages/porta-admin-gui')),
    false,
    'admin GUI source workspace must be absent',
  );
  assert.deepEqual(
    workspacePatterns.filter((pattern) => /porta-admin-gui|admin-gui/i.test(pattern)),
    [],
    'root workspaces must not select the removed admin GUI package',
  );
  assert.deepEqual(
    rootScripts
      .filter(
        ([scriptName, command]) =>
          /(?:^|:)gui(?:$|:)/i.test(scriptName) ||
          /@portaidentity\/admin-gui|packages\/porta-admin-gui/i.test(command),
      )
      .map(([scriptName]) => scriptName),
    [],
    'root scripts must not define or invoke admin GUI build, test, verify, or development targets',
  );
});

// Turbo builds package output, avoids caching stateful work, and stays local-only.
test('should configure a minimal local-only Turbo task graph', () => {
  const turbo = readRepositoryJson('turbo.json');
  const tasks = turbo.tasks ?? turbo.pipeline;

  assert.ok(tasks, 'turbo.json must define a task graph');
  assert.ok(
    tasks.build?.outputs?.includes('dist/**'),
    'Turbo build task must declare dist/** output',
  );

  for (const taskName of ['test', 'verify', 'dev']) {
    assert.ok(tasks[taskName], `Turbo must define the ${taskName} task`);
    assert.equal(tasks[taskName].cache, false, `Turbo ${taskName} task must disable caching`);
  }

  assert.doesNotMatch(
    JSON.stringify(turbo),
    /remoteCache|teamId|apiUrl|TURBO_(?:TOKEN|TEAM)/i,
    'turbo.json must not configure remote caching',
  );
});

// Dependency checks cover the root and all workspaces without trying to upgrade local Porta packages.
test('should provide root-and-workspace dependency maintenance commands', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  for (const scriptName of ['deps:check', 'deps:update']) {
    const command = scripts[scriptName] ?? '';
    assert.match(command, /\bncu\b/, `${scriptName} must invoke npm-check-updates`);
    assert.match(command, /--root\b/, `${scriptName} must include the root package`);
    assert.match(command, /--workspaces\b/, `${scriptName} must include all workspaces`);
    assert.match(
      command,
      /(?:^|\s)-x\s+["']?@portaidentity\/\*["']?(?:\s|$)/,
      `${scriptName} must exclude local @portaidentity packages`,
    );
  }

  assert.match(
    scripts['deps:update'] ?? '',
    /\byarn install\b/,
    'deps:update must reinstall dependencies',
  );
  assert.match(
    scripts['deps:update'] ?? '',
    /\byarn verify\b/,
    'deps:update must verify the repository after reinstalling',
  );
});

// Development playgrounds remain outside Yarn and Turbo orchestration during this migration.
test('should exclude both deferred playgrounds from the workspace graph', () => {
  const workspacePatterns = getWorkspacePatterns(readRepositoryJson('package.json'));

  for (const playgroundPath of ['playground', 'playground-bff']) {
    assert.equal(
      isWorkspaceDirectory(playgroundPath, workspacePatterns),
      false,
      `${playgroundPath} must not be selected by a root workspace pattern`,
    );
  }
});
