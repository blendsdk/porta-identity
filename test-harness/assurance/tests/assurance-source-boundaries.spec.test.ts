import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import test from 'node:test';

import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

/** Recursively lists TypeScript source beneath one fixed repository directory. */
function listTypeScriptFiles(repositoryPath: string): readonly string[] {
  const absoluteRoot = resolve(repositoryRoot, repositoryPath);
  const pending = [absoluteRoot];
  const files: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absoluteEntry = resolve(directory, entry.name);
      if (entry.isDirectory()) pending.push(absoluteEntry);
      if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)) {
        files.push(relative(repositoryRoot, absoluteEntry).split(sep).join('/'));
      }
    }
  }
  return files.sort();
}

/** Extracts static and dynamic module specifiers without executing a test module. */
function moduleSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const matcher = /(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(matcher)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Returns whether an import resolves to Porta server production source. */
function importsProductionServer(testFile: string, specifier: string): boolean {
  if (specifier === '@portaidentity/server' || specifier.startsWith('@portaidentity/server/')) {
    return true;
  }
  if (!specifier.startsWith('.')) return false;
  const resolvedImport = resolve(repositoryRoot, 'test-harness', dirname(testFile), specifier);
  const productionRoot = resolve(repositoryRoot, 'packages/server/src');
  return resolvedImport === productionRoot || resolvedImport.startsWith(`${productionRoot}${sep}`);
}

// Collected assurance specs may drive public interfaces but never import Porta server production
// modules to calculate the expected outcome they later assert.
test('should keep production implementation imports out of every collected spec', async () => {
  const { projects } = await loadFixtureAssuranceSurface();
  const violations: string[] = [];
  for (const testFile of projects.flatMap((project) => project.files)) {
    const source = readFileSync(resolve(repositoryRoot, 'test-harness', testFile), 'utf8');
    if (
      moduleSpecifiers(source).some((specifier) => importsProductionServer(testFile, specifier))
    ) {
      violations.push(testFile);
    }
  }

  assert.deepEqual(violations.sort(), []);
});

// Production server source contains no assurance-only reset, bypass, fault, or credential control;
// all such capabilities remain confined to the external retained harness.
test('should keep assurance-only controls out of Porta production source', () => {
  const forbiddenControl =
    /PORTA_ASSURANCE|ASSURANCE_ONLY|assuranceOnly|testBypass|bypassAuth|faultInjection|reset(?:Database|State|ForTest)|testCredential/;
  const violations = listTypeScriptFiles('packages/server/src').filter((repositoryPath) =>
    forbiddenControl.test(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8')),
  );

  assert.deepEqual(violations, []);
});
