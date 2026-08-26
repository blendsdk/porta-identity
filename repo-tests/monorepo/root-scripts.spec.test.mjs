import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const supportedScripts = [
  'assurance:all',
  'assurance:baseline',
  'assurance:compat',
  'assurance:control-check',
  'assurance:coverage',
  'assurance:fault',
  'assurance:harness',
  'assurance:mutation',
  'assurance:red',
  'assurance:report',
  'assurance:stability',
  'assurance:test',
  'assurance:validate',
  'build',
  'cli',
  'deps:check',
  'deps:update',
  'dev',
  'docker:down',
  'docker:logs',
  'docker:up',
  'docs:build',
  'docs:dev',
  'docs:preview',
  'format',
  'format:check',
  'harness:start',
  'harness:stop',
  'harness:test',
  'lint',
  'lint:fix',
  'migrate',
  'migrate:create',
  'migrate:rollback',
  'migrate:status',
  'porta',
  'release:preflight',
  'release:prepare',
  'release:publish',
  'start',
  'test',
  'test:all',
  'test:coverage',
  'test:e2e',
  'test:integration',
  'test:pentest',
  'test:structure',
  'test:ui',
  'test:ui:debug',
  'test:unit',
  'test:watch',
  'typecheck',
  'verify',
];
const removedScripts = [
  'build:cli',
  'build:packages',
  'build:sdk',
  'build:server',
  'dev:server',
  'kill',
  'playground',
  'playground:reset',
  'playground:stop',
  'provision:smoke',
  'test:cli',
  'test:packages',
  'test:sdk',
  'test:server',
  'verify:cli',
  'verify:sdk',
  'verify:server',
];

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
 * Reads the root manifest and reports malformed JSON with an actionable path.
 *
 * @returns {Record<string, any>} Parsed root package manifest.
 */
function readRootManifest() {
  try {
    return JSON.parse(readRepositoryFile('package.json'));
  } catch (error) {
    throw new Error('Expected package.json to contain valid JSON', { cause: error });
  }
}

/**
 * Escapes a script name before inserting it into a regular expression.
 *
 * @param {string} value Literal script name.
 * @returns {string} Regular-expression-safe text.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Requires a root script to equal the durable delegated command.
 *
 * @param {Record<string, string>} scripts Root manifest scripts.
 * @param {string} scriptName Supported script name.
 * @param {string} expectedCommand Required command.
 */
function assertScriptEquals(scripts, scriptName, expectedCommand) {
  assert.equal(
    scripts[scriptName],
    expectedCommand,
    `package.json script ${scriptName} must delegate to: ${expectedCommand}`,
  );
}

// The root exposes one intentional command surface with no obsolete convenience aliases.
test('should expose exactly the supported root script names', () => {
  const scriptNames = Object.keys(readRootManifest().scripts ?? {}).sort();

  assert.deepEqual(
    scriptNames,
    supportedScripts,
    'package.json scripts must exactly match the supported root command surface',
  );
  for (const removedScript of removedScripts) {
    assert.equal(
      scriptNames.includes(removedScript),
      false,
      `package.json must not retain removed alias ${removedScript}`,
    );
  }
});

// Development starts the migrated server directly and never kills an unrelated process on port 3000.
test('should start development and production server entry points directly', () => {
  const scripts = readRootManifest().scripts ?? {};

  assertScriptEquals(scripts, 'dev', 'tsx watch packages/server/src/index.ts');
  assertScriptEquals(scripts, 'start', 'node packages/server/dist/index.js');
  assert.doesNotMatch(
    scripts.dev ?? '',
    /\b(?:kill|fuser)\b|3000\/tcp/i,
    'package.json script dev must not terminate a process using port 3000',
  );
});

// Package tasks remain Turbo-owned while root static checks also cover the non-workspace harness.
test('should keep package tasks in Turbo and root-own retained-harness static checks', () => {
  const scripts = readRootManifest().scripts ?? {};

  for (const turboTask of ['build', 'test']) {
    assertScriptEquals(scripts, turboTask, `turbo run ${turboTask}`);
  }
  assert.match(scripts.typecheck ?? '', /test-harness\/tsconfig\.assurance\.json/);
  assert.match(scripts.typecheck ?? '', /turbo run typecheck/);
  assert.match(scripts.lint ?? '', /test-harness\/eslint\.config\.js/);
  assert.match(scripts.lint ?? '', /turbo run lint/);
  assert.match(scripts['lint:fix'] ?? '', /test-harness\/eslint\.config\.js/);
  assert.match(scripts['lint:fix'] ?? '', /turbo run lint:fix/);
  assertScriptEquals(scripts, 'test:structure', 'node --test repo-tests/monorepo/*.test.mjs');
  assertScriptEquals(scripts, 'verify', 'yarn test:structure && turbo run verify');
  assertScriptEquals(scripts, 'format', 'prettier --write .');
  assertScriptEquals(scripts, 'format:check', 'prettier --check .');
});

// The full test command addresses every active workspace without routing through removed aliases.
test('should run all active workspace tests directly', () => {
  const scripts = readRootManifest().scripts ?? {};
  const allTests = scripts['test:all'] ?? '';

  assertScriptEquals(
    scripts,
    'test:all',
    'yarn workspace @portaidentity/server test:all && yarn workspace @portaidentity/sdk test && yarn workspace @portaidentity/cli test',
  );
  assert.doesNotMatch(
    allTests,
    /\byarn\s+test:(?:server|sdk|cli|packages)\b/,
    'package.json script test:all must not invoke removed test aliases',
  );

  for (const serverTest of [
    'unit',
    'integration',
    'e2e',
    'pentest',
    'ui',
    'ui:debug',
    'watch',
    'coverage',
  ]) {
    assertScriptEquals(
      scripts,
      `test:${serverTest}`,
      `yarn workspace @portaidentity/server test:${serverTest}`,
    );
  }
});

// Root operational commands point at migrated server, CLI, migration, Docker, and harness locations.
test('should delegate operational commands to current monorepo paths', () => {
  const scripts = readRootManifest().scripts ?? {};

  assertScriptEquals(
    scripts,
    'migrate',
    'node-pg-migrate up --migrations-dir packages/server/migrations --migration-file-language sql',
  );
  assertScriptEquals(
    scripts,
    'migrate:rollback',
    'node-pg-migrate down --migrations-dir packages/server/migrations --migration-file-language sql --count 1',
  );
  assertScriptEquals(
    scripts,
    'migrate:status',
    'node-pg-migrate status --migrations-dir packages/server/migrations --migration-file-language sql',
  );
  assertScriptEquals(
    scripts,
    'migrate:create',
    'node-pg-migrate create --migrations-dir packages/server/migrations --migration-file-language sql',
  );
  assertScriptEquals(scripts, 'porta', 'tsx packages/server/src/cli/index.ts');
  assertScriptEquals(scripts, 'cli', 'tsx packages/cli/src/index.ts --insecure');

  for (const dockerAction of ['up', 'down', 'logs']) {
    const suffix = dockerAction === 'up' ? 'up -d' : dockerAction === 'logs' ? 'logs -f' : 'down';
    assertScriptEquals(
      scripts,
      `docker:${dockerAction}`,
      `docker compose -f docker/docker-compose.yml ${suffix}`,
    );
  }
  for (const harnessAction of ['start', 'stop', 'test']) {
    assertScriptEquals(
      scripts,
      `harness:${harnessAction}`,
      `bash test-harness/scripts/${harnessAction}.sh`,
    );
  }
});

// The container exposes only the server package CLI; administrative commands run from the standalone CLI.
test('should keep Docker guidance within the server CLI command boundary', () => {
  const dockerWrapper = readRepositoryFile('docker/porta.sh');
  const invalidContainerAdminCommand =
    /(?:docker exec[^\n]*porta|\.\/porta)\s+(?:login|org|provision)\b/i;

  assert.doesNotMatch(
    dockerWrapper,
    /HOST_FILE|\/dev\/stdin|\b(?:login|org|provision)\b[^\n]*#.*(?:container|local file)/i,
    'docker/porta.sh must not route standalone administrative commands through the server container',
  );

  for (const documentationPath of [
    'docker/DOCKERHUB.md',
    'docs/api/authentication.md',
    'docs/cli/bootstrap.md',
    'docs/cli/provisioning.md',
    'docs/guide/quickstart.md',
    'docs/guide/setup-alternatives.md',
  ]) {
    assert.doesNotMatch(
      readRepositoryFile(documentationPath),
      invalidContainerAdminCommand,
      `${documentationPath} must use @portaidentity/cli for administrative commands`,
    );
  }
});

// Documentation and dependency maintenance retain their established root-level tool delegation.
test('should delegate documentation and dependency maintenance commands from the root', () => {
  const scripts = readRootManifest().scripts ?? {};

  for (const docsAction of ['dev', 'build', 'preview']) {
    assertScriptEquals(scripts, `docs:${docsAction}`, `vitepress ${docsAction} docs`);
  }
  assertScriptEquals(scripts, 'deps:check', 'ncu --root --workspaces -x "@portaidentity/*"');
  assertScriptEquals(
    scripts,
    'deps:update',
    'ncu -u --root --workspaces -x "@portaidentity/*" && rm -rf node_modules yarn.lock && yarn install && yarn verify',
  );
});

// Active documentation names only supported commands and does not promise destructive port cleanup.
test('should keep active root-script documentation aligned with the supported command surface', () => {
  for (const documentationPath of [
    'README.md',
    'packages/server/README.md',
    'techdocs/guides/deployment.md',
    'techdocs/guides/getting-started.md',
  ]) {
    const documentation = readRepositoryFile(documentationPath);

    for (const removedScript of removedScripts) {
      const removedReference = new RegExp(
        `(?:\\byarn\\s+|\`)${escapeRegExp(removedScript)}(?=\\s|\`|$)`,
        'i',
      );
      assert.doesNotMatch(
        documentation,
        removedReference,
        `${documentationPath} must not reference removed root alias ${removedScript}`,
      );
    }

    assert.doesNotMatch(
      documentation,
      /\bdev(?:elopment)?\s+script[\s\S]{0,120}\b(?:kill|terminate|free)s?\b[\s\S]{0,80}\bport\s+3000\b/i,
      `${documentationPath} must not claim that the dev command kills the process on port 3000`,
    );
  }

  const repositoryReadme = readRepositoryFile('README.md');
  assert.doesNotMatch(
    repositoryReadme,
    /\bnode\s+dist\/cli\/index\.js\b/,
    'README.md must not reference server CLI output at the retired root dist path',
  );
  assert.match(
    repositoryReadme,
    /\byarn porta migrate up\b[\s\S]{0,80}\byarn porta init\b/,
    'README.md must initialize a source checkout through the supported server CLI alias',
  );

  const deploymentGuide = readRepositoryFile('techdocs/guides/deployment.md');
  assert.doesNotMatch(
    deploymentGuide,
    /\bnode\s+dist\/index\.js\b/,
    'source deployment guidance must not reference server output at the retired root dist path',
  );
  assert.match(
    deploymentGuide,
    /\bNODE_ENV=production yarn start\b/,
    'source deployment guidance must use the supported root start command',
  );
});
