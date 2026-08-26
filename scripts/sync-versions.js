#!/usr/bin/env node
/**
 * Keeps source-level version constants aligned with Lockstep-owned manifests.
 *
 * Lockstep is the only tool allowed to change package manifests and internal
 * dependency ranges. This helper updates only values embedded in source code.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const checkOnly = process.argv.includes('--check');

/** Source files whose exported version is part of the public package behavior. */
const derivedVersions = [
  {
    path: 'packages/sdk/src/version.ts',
    expression: /export const SDK_VERSION = '[^']+';/,
    expected(version) {
      return `export const SDK_VERSION = '${version}';`;
    },
  },
  {
    path: 'packages/cli/src/commands/version.ts',
    expression: /export const CLI_VERSION = '[^']+';/,
    expected(version) {
      return `export const CLI_VERSION = '${version}';`;
    },
  },
];

/**
 * Reads the coordinated version selected by Lockstep.
 *
 * @returns {string} A stable semantic version from the root manifest.
 * @throws {Error} When the root version is not a stable semantic version.
 */
function readCoordinatedVersion() {
  const manifestPath = resolve(repositoryRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error(
      `Root package version must be a stable semantic version, got: ${manifest.version}`,
    );
  }

  return manifest.version;
}

/**
 * Checks or updates one source-level version constant.
 *
 * @param {{path: string, expression: RegExp, expected: (version: string) => string}} target
 *   Source file and replacement rule.
 * @param {string} version Coordinated release version.
 * @throws {Error} When the expected declaration is absent or check mode finds drift.
 */
function synchronizeDerivedVersion(target, version) {
  const absolutePath = resolve(repositoryRoot, target.path);
  const source = readFileSync(absolutePath, 'utf8');
  const expectedDeclaration = target.expected(version);

  if (!target.expression.test(source)) {
    throw new Error(`Version declaration was not found in ${target.path}`);
  }

  const updatedSource = source.replace(target.expression, expectedDeclaration);
  if (checkOnly && updatedSource !== source) {
    throw new Error(`${target.path} does not match coordinated version ${version}`);
  }

  if (!checkOnly && updatedSource !== source) {
    writeFileSync(absolutePath, updatedSource);
  }
}

const version = readCoordinatedVersion();
for (const target of derivedVersions) {
  synchronizeDerivedVersion(target, version);
}

console.log(`${checkOnly ? 'Verified' : 'Synchronized'} derived versions at ${version}`);
