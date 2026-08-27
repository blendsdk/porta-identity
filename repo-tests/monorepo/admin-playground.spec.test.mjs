import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads a repository JSON file and reports its path when parsing fails.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, unknown>} Parsed JSON object.
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
 * Reads a UTF-8 repository file.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/**
 * Reports whether a repository-relative path exists as a regular file.
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
 * Reports whether a repository-relative path exists as a directory.
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
 * Recursively reads source files selected by an extension pattern.
 *
 * @param {string} repositoryPath Directory relative to the repository root.
 * @param {RegExp} extensionPattern File-name pattern to include.
 * @returns {Array<{ path: string, contents: string }>} Selected source files and their contents.
 */
function readRepositorySources(repositoryPath, extensionPattern) {
  const absoluteDirectory = resolve(repositoryRoot, repositoryPath);
  const sources = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const entryPath = `${repositoryPath}/${entry.name}`;

    if (entry.isDirectory()) {
      sources.push(...readRepositorySources(entryPath, extensionPattern));
    } else if (entry.isFile() && extensionPattern.test(entry.name)) {
      sources.push({
        path: entryPath,
        contents: readFileSync(resolve(repositoryRoot, entryPath), 'utf8'),
      });
    }
  }

  return sources;
}

test('should declare the lockstep JSVision dependencies when the admin shell belongs to the CLI', () => {
  const cliManifest = readRepositoryJson('packages/cli/package.json');
  const dependencyGroups = [
    cliManifest.dependencies ?? {},
    cliManifest.devDependencies ?? {},
    cliManifest.optionalDependencies ?? {},
    cliManifest.peerDependencies ?? {},
  ];
  const jsVisionDeclarations = dependencyGroups.flatMap((dependencies) =>
    Object.entries(dependencies).filter(([name]) => name.startsWith('@jsvision/')),
  );

  assert.deepEqual(
    jsVisionDeclarations.map(([name]) => name).sort(),
    ['@jsvision/core', '@jsvision/ui'],
    'the CLI must directly own exactly the JSVision core and UI packages',
  );
  assert.equal(
    cliManifest.dependencies?.['@jsvision/core'],
    cliManifest.dependencies?.['@jsvision/ui'],
    'the JSVision core and UI packages must select the same release',
  );
  assert.match(
    cliManifest.dependencies?.['@jsvision/core'] ?? '',
    /^\d+\.\d+\.\d+$/,
    'the JSVision release must be an exact stable version',
  );
  assert.equal(
    cliManifest.dependencies?.['fs-ext-extra-prebuilt'],
    '2.2.13',
    'the native credential-lock dependency must remain exactly pinned',
  );
});

test('should expose the approved admin source boundary when the shell is implemented in the CLI', () => {
  assert.equal(
    isRepositoryFile('packages/cli/src/commands/admin.ts'),
    true,
    'the CLI must provide the porta admin command module',
  );
  assert.equal(
    isRepositoryDirectory('packages/cli/src/admin'),
    true,
    'the CLI must keep admin shell implementation under src/admin/',
  );
});

test('should remove retired GUI discovery when the admin shell is loaded directly', () => {
  const cliSources = readRepositorySources('packages/cli/src', /\.ts$/);

  assert.equal(
    isRepositoryFile('packages/cli/src/commands/gui.ts'),
    false,
    'the retired gui command module must be absent',
  );

  for (const source of cliSources) {
    assert.doesNotMatch(
      source.contents,
      /@portaidentity\/admin-gui|\bguiCommand\b|commands\/gui(?:\.js)?/,
      `${source.path} must not discover or register the retired admin GUI`,
    );
  }
});

test('should avoid a separate admin workflow when the admin shell follows the existing CLI workflow', () => {
  const workflowNames = readdirSync(resolve(repositoryRoot, '.github/workflows'));

  assert.deepEqual(
    workflowNames.filter((name) => /admin|jsvision/i.test(name)),
    [],
    'admin verification must remain in the existing repository workflow',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'packages/admin-ui')) ||
      existsSync(resolve(repositoryRoot, 'packages/porta-admin-ui')) ||
      existsSync(resolve(repositoryRoot, 'packages/porta-admin-gui')),
    false,
    'the admin shell must not create a separate workspace package',
  );
});

test('should expose one root lifecycle command when the playground belongs to the repository', () => {
  const rootManifest = readRepositoryJson('package.json');

  assert.match(
    rootManifest.scripts?.['admin:env'] ?? '',
    /^node (?:\.\/)?docker\/admin-playground\/scripts\/admin-env\.mjs$/,
    'the root command must delegate directly to the owned lifecycle entry point',
  );

  for (const repositoryPath of [
    'docker/admin-playground/compose.yml',
    'docker/admin-playground/nginx.conf',
    'docker/admin-playground/scripts/admin-env.mjs',
    'docker/admin-playground/scripts/check-prerequisites.mjs',
    'docker/admin-playground/.gitignore',
  ]) {
    assert.equal(isRepositoryFile(repositoryPath), true, `${repositoryPath} must exist`);
  }
});

test('should fail closed on DNS drift when the fixed playground hostname is checked', () => {
  const prerequisiteSource = readRepositoryFile(
    'docker/admin-playground/scripts/check-prerequisites.mjs',
  );
  const lifecycleSource = readRepositoryFile('docker/admin-playground/scripts/admin-env.mjs');

  assert.match(
    prerequisiteSource,
    /porta-admin-playground\.ci\.portaidentity\.com/,
    'DNS preflight must own the fixed playground hostname',
  );
  assert.match(prerequisiteSource, /resolve4/, 'DNS preflight must inspect every IPv4 answer');
  assert.match(prerequisiteSource, /resolve6/, 'DNS preflight must inspect IPv6 answers');
  assert.match(
    prerequisiteSource,
    /127\.0\.0\.1/,
    'DNS preflight must require the exact IPv4 loopback address',
  );
  assert.match(
    lifecycleSource,
    /check-prerequisites|checkPrerequisites|runPreflight/,
    'the lifecycle must run prerequisite checks before starting Compose',
  );
});

test('should publish only loopback HTTPS and MailHog UI ports when Compose is rendered', () => {
  const compose = parse(readRepositoryFile('docker/admin-playground/compose.yml'));

  assert.equal(compose.name, 'porta-admin-playground', 'Compose project identity must be fixed');
  assert.deepEqual(
    compose.services?.nginx?.ports,
    ['127.0.0.1:${PORTA_ADMIN_HTTPS_PORT:-3543}:443'],
    'nginx must expose only the configurable loopback HTTPS port',
  );
  assert.deepEqual(
    compose.services?.mailhog?.ports,
    ['127.0.0.1:${PORTA_ADMIN_MAILHOG_PORT:-8026}:8025'],
    'MailHog must expose only its configurable loopback web port',
  );

  for (const serviceName of ['porta', 'postgres', 'redis']) {
    assert.equal(
      'ports' in (compose.services?.[serviceName] ?? {}),
      false,
      `${serviceName} must remain internal to the playground network`,
    );
  }

  assert.doesNotMatch(
    JSON.stringify(compose),
    /0\.0\.0\.0:/,
    'the playground must not publish a service on every host interface',
  );
});

test('should bound reset to exact owned volumes when destructive lifecycle code is inspected', () => {
  const compose = parse(readRepositoryFile('docker/admin-playground/compose.yml'));
  const lifecycleSource = readRepositoryFile('docker/admin-playground/scripts/admin-env.mjs');
  const ownedVolumeNames = Object.keys(compose.volumes ?? {});

  assert.ok(ownedVolumeNames.length > 0, 'the playground must declare named persistent volumes');
  assert.match(
    lifecycleSource,
    /reset porta-admin-playground/,
    'interactive reset must require the exact typed confirmation phrase',
  );

  for (const volumeName of ownedVolumeNames) {
    assert.match(
      lifecycleSource,
      new RegExp(`['\"]${volumeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`),
      `reset must explicitly allowlist the ${volumeName} volume`,
    );
  }

  assert.doesNotMatch(
    lifecycleSource,
    /docker\s+(?:system|volume)\s+prune|rm\s+-rf|\*.*volume|volume.*\*/i,
    'reset must not use broad deletion or wildcard volume selection',
  );
});

test('should keep generated runtime assets untracked when playground state is persisted locally', () => {
  const ignoreRules = readRepositoryFile('docker/admin-playground/.gitignore');
  const trackedRuntimeFiles = execFileSync(
    'git',
    ['ls-files', '--', 'docker/admin-playground/runtime'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim();

  assert.match(
    ignoreRules,
    /(?:^|\n)runtime\/(?:\n|$)/,
    'the entire runtime directory must be ignored',
  );
  assert.equal(trackedRuntimeFiles, '', 'generated infrastructure secrets must not be committed');
});
