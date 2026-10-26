#!/usr/bin/env node
/**
 * Validates that the committed release candidate is internally consistent.
 *
 * This command is intentionally read-only. It must be safe to run immediately
 * before publication without changing the package bytes that CI already tested.
 * The only subprocess that can write is `pnpm install --lockfile-only`, and it is
 * invoked with `--frozen-lockfile` so a stale candidate fails instead of mutating.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const expectedNpmVersion = '11.15.0';
const expectedRepository = 'https://github.com/blendsdk/porta-identity.git';
const expectedRegistry = 'https://registry.npmjs.org/';
const rehearsal = process.env.RELEASE_PREFLIGHT_REHEARSAL === '1';
const packagePaths = [
  'packages/server/package.json',
  'packages/sdk/package.json',
  'packages/cli/package.json',
];

/**
 * Reads a JSON file from the repository.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readJson(repositoryPath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
}

/**
 * Stops publication when a release invariant is false.
 *
 * @param {unknown} condition Value that must be truthy.
 * @param {string} message Failure message for the release operator.
 * @throws {Error} When the invariant is false.
 */
function assertReleaseInvariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Runs one command and returns trimmed standard output.
 *
 * @param {string} command Executable name.
 * @param {string[]} args Command arguments.
 * @param {string} failureMessage Operator-facing failure context.
 * @returns {string} Trimmed standard output.
 * @throws {Error} When the command fails.
 */
function run(command, args, failureMessage) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    }).trim();
  } catch (error) {
    throw new Error(`${failureMessage}: ${error.stderr?.toString().trim() || error.message}`);
  }
}

/**
 * Reports whether one commit is an ancestor of another.
 *
 * @param {string} ancestor Ancestor revision.
 * @param {string} descendant Descendant revision.
 * @returns {boolean} Whether the ancestor is reachable from the descendant.
 */
function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

const rootManifest = readJson('package.json');
const npmManifest = readJson('node_modules/npm/package.json');
const packageManifests = packagePaths.map(readJson);
const coordinatedVersion = rootManifest.version;

assertReleaseInvariant(
  /^\d+\.\d+\.\d+$/.test(coordinatedVersion),
  `Release version must be stable semantic version, got: ${coordinatedVersion}`,
);
assertReleaseInvariant(
  npmManifest.version === expectedNpmVersion,
  `Local npm must be ${expectedNpmVersion}, got: ${npmManifest.version}`,
);

for (const manifest of packageManifests) {
  assertReleaseInvariant(
    manifest.version === coordinatedVersion,
    `${manifest.name} must use coordinated version ${coordinatedVersion}`,
  );
  assertReleaseInvariant(
    manifest.publishConfig?.access === 'public',
    `${manifest.name} must publish with public access`,
  );
  assertReleaseInvariant(
    manifest.repository?.url === expectedRepository,
    `${manifest.name} must use repository ${expectedRepository}`,
  );
}

const cliManifest = packageManifests.find((manifest) => manifest.name === '@portaidentity/cli');
assertReleaseInvariant(
  cliManifest?.dependencies?.['@portaidentity/sdk'] === coordinatedVersion,
  `@portaidentity/cli must depend on @portaidentity/sdk ${coordinatedVersion}`,
);

assertReleaseInvariant(
  run('git', ['status', '--porcelain=v1', '--untracked-files=normal'], 'Release candidate status failed') === '',
  'Release candidate working tree must be clean',
);

if (!rehearsal) {
  assertReleaseInvariant(
    run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], 'Release branch lookup failed') === 'main',
    'Release preflight must run on main',
  );

  const head = run('git', ['rev-parse', 'HEAD'], 'Release HEAD lookup failed');
  const tag = run(
    'git',
    ['rev-parse', `v${coordinatedVersion}^{commit}`],
    `Release tag v${coordinatedVersion} is missing`,
  );
  assertReleaseInvariant(tag === head, `Release tag v${coordinatedVersion} must point to HEAD`);
  assertReleaseInvariant(
    isAncestor('origin/main', head),
    'Release commit must descend from origin/main',
  );
}

const registry = run('pnpm', ['config', 'get', 'registry'], 'pnpm registry lookup failed');
assertReleaseInvariant(
  registry.replace(/\/$/, '') === expectedRegistry.replace(/\/$/, ''),
  `pnpm must publish to ${expectedRegistry}, got: ${registry || '(empty)'}`,
);

assertReleaseInvariant(
  rootManifest.packageManager?.startsWith('pnpm@') === true,
  'Root packageManager must select pnpm',
);
run(
  'pnpm',
  ['install', '--lockfile-only', '--frozen-lockfile'],
  'pnpm-lock.yaml is not up to date with the release manifests',
);

console.log(
  `Release candidate ${coordinatedVersion} passed manifest, registry, git, and lockfile preflight checks${rehearsal ? ' (rehearsal mode)' : ''}`,
);
