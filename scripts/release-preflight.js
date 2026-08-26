#!/usr/bin/env node
/**
 * Validates that the committed release candidate is internally consistent.
 *
 * This command is intentionally read-only. It must be safe to run immediately
 * before publication without changing the package bytes that CI already tested.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const expectedNpmVersion = '11.15.0';
const expectedRepository = 'https://github.com/blendsdk/porta-identity.git';
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

console.log(`Release candidate ${coordinatedVersion} passed manifest and npm preflight checks`);
