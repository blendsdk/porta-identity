import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

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
 * Reports whether a repository-relative path exists as a directory.
 * Missing paths return false so assertions can provide contract-specific messages.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {boolean} Whether the path exists and is a directory.
 */
function isRepositoryDirectory(repositoryPath) {
  try {
    return statSync(resolve(repositoryRoot, repositoryPath)).isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

/**
 * Reports whether a repository-relative path exists as a regular file.
 * Missing paths return false so assertions can identify the required artifact.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {boolean} Whether the path exists and is a regular file.
 */
function isRepositoryFile(repositoryPath) {
  try {
    return statSync(resolve(repositoryRoot, repositoryPath)).isFile();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

/**
 * Recursively finds physical files whose names match a test-file pattern.
 * Symbolic links are not followed, which prevents counting the same test through another path.
 *
 * @param {string} repositoryPath Directory relative to the repository root.
 * @param {RegExp} filePattern Pattern matched against each file name.
 * @returns {string[]} Repository-relative file paths.
 */
function findPhysicalFiles(repositoryPath, filePattern) {
  const absoluteDirectory = resolve(repositoryRoot, repositoryPath);
  const files = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const entryRepositoryPath = `${repositoryPath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...findPhysicalFiles(entryRepositoryPath, filePattern));
    } else if (entry.isFile() && filePattern.test(entry.name)) {
      files.push(entryRepositoryPath);
    }
  }

  return files;
}

/**
 * Executes an existing repository command and includes captured output when it fails.
 *
 * @param {string} command Executable available on the current PATH.
 * @param {string[]} arguments Command arguments.
 * @returns {string} Standard output produced by the command.
 */
function runRepositoryCommand(command, arguments_) {
  try {
    return execFileSync(command, arguments_, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output = [error?.stdout, error?.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${arguments_.join(' ')} failed\n${output}`, { cause: error });
  }
}

/**
 * Asserts that configuration text contains none of the retired repository paths.
 *
 * @param {string} repositoryPath File path shown in assertion failures.
 * @param {string} contents File contents to inspect.
 * @param {RegExp} forbiddenPattern Retired paths that must no longer be referenced.
 */
function assertContainsNoRetiredPaths(repositoryPath, contents, forbiddenPattern) {
  assert.doesNotMatch(
    contents,
    forbiddenPattern,
    `${repositoryPath} must not reference retired repository paths`,
  );
}

// Server source, behavior tests, and runtime assets move together into one self-contained package.
test('should keep all server-owned directories inside the server package', () => {
  for (const directoryName of ['src', 'tests', 'migrations', 'templates', 'locales']) {
    assert.equal(
      isRepositoryDirectory(`packages/server/${directoryName}`),
      true,
      `packages/server/${directoryName}/ must exist after the server migration`,
    );
    assert.equal(
      isRepositoryDirectory(directoryName),
      false,
      `legacy root ${directoryName}/ must be absent after the server migration`,
    );
  }

  assert.equal(
    isRepositoryDirectory('repo-tests'),
    true,
    'root repo-tests/ must remain outside the server package',
  );
});

// The server package retains the synchronized baseline version and exposes its executable entry points.
test('should identify the server package and its executable entry points', () => {
  const serverManifest = readRepositoryJson('packages/server/package.json');

  assert.equal(
    serverManifest.name,
    '@portaidentity/server',
    'server package name must use the retained public scope',
  );
  assert.equal(
    serverManifest.version,
    '1.6.2',
    'server package must remain at the synchronized pre-release baseline version',
  );
  assert.equal(
    'main' in serverManifest,
    false,
    'server package must not advertise a JavaScript import entry point',
  );
  assert.equal(
    'types' in serverManifest,
    false,
    'server package must not advertise a TypeScript import entry point',
  );
  assert.equal('exports' in serverManifest, false, 'server package must remain executable-only');
  assert.equal(
    serverManifest.bin?.['porta-server'],
    'dist/cli/index.js',
    'porta-server executable must target the compiled server CLI',
  );
  assert.equal(
    serverManifest.scripts?.start,
    'node dist/index.js',
    'server start script must run the compiled server entry point',
  );
});

// Published server contents include the compiled program and every runtime asset it needs.
test('should declare and provide complete server package contents', () => {
  const serverManifest = readRepositoryJson('packages/server/package.json');

  assert.ok(
    Array.isArray(serverManifest.files),
    'packages/server/package.json files must be an array',
  );
  for (const packageEntry of ['dist', 'migrations', 'templates', 'locales']) {
    assert.ok(
      serverManifest.files?.includes(packageEntry),
      `packages/server/package.json files must include ${packageEntry}`,
    );
  }

  for (const assetDirectory of ['migrations', 'templates', 'locales']) {
    assert.equal(
      isRepositoryDirectory(`packages/server/${assetDirectory}`),
      true,
      `packages/server/${assetDirectory}/ must exist as a package asset`,
    );
  }

  for (const packageFile of ['README.md', 'LICENSE']) {
    assert.equal(
      isRepositoryFile(`packages/server/${packageFile}`),
      true,
      `packages/server/${packageFile} must exist`,
    );
  }

  const trackedSourceFiles = runRepositoryCommand('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'packages/server',
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.deepEqual(
    trackedSourceFiles.filter((filePath) => /(?:^|\/)\.env(?:\.|$)/.test(filePath)),
    [],
    'packages/server must not contain committed environment files',
  );
});

// A normal server workspace build produces both runtime entry points promised by the package manifest.
test('should build the server and produce both compiled entry points', () => {
  runRepositoryCommand('yarn', ['workspace', '@portaidentity/server', 'build']);

  for (const compiledFile of ['dist/index.js', 'dist/cli/index.js']) {
    assert.equal(
      isRepositoryFile(`packages/server/${compiledFile}`),
      true,
      `server build must produce packages/server/${compiledFile}`,
    );
  }
});

// Production container files consume the server workspace while preserving the established runtime contract.
test('should use the server workspace in the production container', () => {
  const dockerfilePath = 'docker/Dockerfile';
  const entrypointPath = 'docker/entrypoint.sh';
  const dockerfile = readFileSync(resolve(repositoryRoot, dockerfilePath), 'utf8');
  const entrypoint = readFileSync(resolve(repositoryRoot, entrypointPath), 'utf8');
  const retiredPackagePattern = /packages\/porta-(?:sdk|cli|admin-gui)|@portaidentity\/admin-gui/i;

  assertContainsNoRetiredPaths(dockerfilePath, dockerfile, retiredPackagePattern);
  assertContainsNoRetiredPaths(entrypointPath, entrypoint, retiredPackagePattern);
  assert.match(dockerfile, /packages\/server/, 'docker/Dockerfile must use the server workspace');
  assert.match(
    dockerfile,
    /packages\/server\/dist/,
    'docker/Dockerfile must copy the server build output',
  );
  assert.match(
    dockerfile,
    /packages\/server\/node_modules/,
    'docker/Dockerfile must copy package-local production dependencies',
  );
  for (const assetDirectory of ['migrations', 'templates', 'locales']) {
    assert.match(
      dockerfile,
      new RegExp(`packages/server/${assetDirectory}`),
      `docker/Dockerfile must copy packages/server/${assetDirectory}`,
    );
  }
  assert.match(
    dockerfile,
    /^USER\s+porta\s*$/m,
    'docker/Dockerfile must retain the non-root porta user',
  );
  assert.match(dockerfile, /^EXPOSE\s+3000\s*$/m, 'docker/Dockerfile must expose port 3000');
  assert.match(dockerfile, /^HEALTHCHECK\b/m, 'docker/Dockerfile must retain its health check');
  assert.match(
    dockerfile,
    /\/usr\/local\/bin\/porta/,
    'docker/Dockerfile must provide the embedded porta command',
  );
  assert.match(
    dockerfile,
    /node\s+[^\n]*dist\/cli\/index\.js/,
    'embedded porta command must invoke dist/cli/index.js',
  );

  assert.match(
    entrypoint,
    /if\s+\[\s+[^\]]*AUTO_MIGRATE[^\]]*=\s*["']true["']\s*\]\s*;?\s*then/,
    'docker/entrypoint.sh must conditionally run migrations',
  );
  assert.match(
    entrypoint,
    /node\s+dist\/cli\/index\.js\s+migrate\b/,
    'docker/entrypoint.sh must migrate through the embedded CLI',
  );
  assert.match(
    entrypoint,
    /exec\s+node\s+dist\/index\.js/,
    'docker/entrypoint.sh must exec the compiled server',
  );
});

// The OIDC harness image follows the current server path without restoring the removed admin GUI.
test('should use current package paths in the OIDC harness image', () => {
  const harnessDockerfilePath = 'test-harness/Dockerfile';
  const harnessDockerfile = readFileSync(resolve(repositoryRoot, harnessDockerfilePath), 'utf8');

  assertContainsNoRetiredPaths(
    harnessDockerfilePath,
    harnessDockerfile,
    /packages\/porta-(?:sdk|cli|admin-gui)|@portaidentity\/admin-gui|admin[- ]gui/i,
  );
  assert.match(
    harnessDockerfile,
    /packages\/server/,
    'test-harness/Dockerfile must use packages/server',
  );
  assert.match(
    harnessDockerfile,
    /packages\/server\/node_modules/,
    'test-harness/Dockerfile must copy package-local production dependencies',
  );
});

test('should preserve OIDC harness failures while always cleaning up', () => {
  const rootManifest = readRepositoryJson('package.json');
  const testScriptPath = 'test-harness/scripts/test.sh';
  const testScript = readFileSync(resolve(repositoryRoot, testScriptPath), 'utf8');

  assert.equal(
    rootManifest.scripts['harness:test'],
    `bash ${testScriptPath}`,
    'root harness:test must use the guarded harness runner',
  );
  assert.match(testScript, /start\.sh["']?\s+--ci/, 'harness runner must start the CI stack');
  assert.match(testScript, /playwright\s+test/, 'harness runner must execute Playwright');
  assert.match(testScript, /stop\.sh/, 'harness runner must always invoke cleanup');
  assert.match(testScript, /exit\s+["']?\$status/, 'harness runner must preserve failure status');
});

// The migration retains the complete behavioral test inventory in its designated package locations.
test('should retain every behavioral and harness test file', () => {
  const inventories = [
    {
      label: 'server unit, integration, end-to-end, and penetration tests',
      paths: ['unit', 'integration', 'e2e', 'pentest'].flatMap((suite) =>
        findPhysicalFiles(`packages/server/tests/${suite}`, /(?:\.test|\.spec)\.ts$/),
      ),
      expectedCount: 238,
    },
    {
      label: 'server browser UI tests',
      paths: findPhysicalFiles('packages/server/tests/ui', /\.spec\.ts$/),
      expectedCount: 24,
    },
    {
      label: 'SDK tests',
      paths: findPhysicalFiles('packages/sdk/tests', /\.test\.ts$/),
      expectedCount: 31,
    },
    {
      label: 'CLI tests',
      paths: findPhysicalFiles('packages/cli/tests', /\.test\.ts$/),
      expectedCount: 29,
    },
    {
      label: 'OIDC harness tests',
      paths: findPhysicalFiles('test-harness/tests', /\.spec\.ts$/),
      expectedCount: 6,
    },
  ];

  for (const inventory of inventories) {
    assert.equal(
      inventory.paths.length,
      inventory.expectedCount,
      `${inventory.label} must retain ${inventory.expectedCount} physical files; found ${inventory.paths.length}`,
    );
  }
});

// Smoke and harness utilities import server source from its package instead of the retired root location.
test('should point retained smoke and harness utilities at current package paths', () => {
  const smokeTestPath = 'scripts/provision-smoke-test.ts';
  assert.equal(isRepositoryFile(smokeTestPath), true, `${smokeTestPath} must remain available`);

  const smokeTest = readFileSync(resolve(repositoryRoot, smokeTestPath), 'utf8');
  const activeSourceImports = [
    ...smokeTest.matchAll(/\bimport\s*\(\s*['"]([^'"]*src\/[^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);
  assert.ok(
    activeSourceImports.length > 0,
    `${smokeTestPath} must retain its server source imports`,
  );
  for (const importPath of activeSourceImports) {
    assert.match(
      importPath,
      /packages\/server\/src\//,
      `${smokeTestPath} import ${importPath} must point to packages/server/src`,
    );
  }

  const harnessFiles = [
    'test-harness/Dockerfile',
    ...findPhysicalFiles('test-harness/scripts', /\.(?:sh|ts)$/),
  ];
  for (const harnessPath of harnessFiles) {
    const contents = readFileSync(resolve(repositoryRoot, harnessPath), 'utf8');
    assertContainsNoRetiredPaths(
      harnessPath,
      contents,
      /packages\/porta-(?:sdk|cli|admin-gui)|@portaidentity\/admin-gui|(?:\.\.\/)+src\/|\bCOPY\s+src\//i,
    );
  }
});
