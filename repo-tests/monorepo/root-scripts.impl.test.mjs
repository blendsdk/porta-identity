import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const pnpmBuiltins = new Set(['exec', 'install', 'run']);

/**
 * Reads a JSON file relative to the repository root.
 *
 * @param {string} repositoryPath Repository-relative path to a JSON file.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8'));
}

/**
 * Finds pnpm commands that can refer to another root script.
 *
 * pnpm built-ins such as `install`, `run`, and `exec` use the same command position as scripts, so
 * callers exclude them before checking the root manifest. Filter arguments such as `--filter` are
 * intentionally not matched.
 *
 * @param {string} command Root script command text.
 * @returns {string[]} Candidate root-script names.
 */
function findPnpmScriptReferences(command) {
  return [...command.matchAll(/(?:^|&&\s*)pnpm\s+(?!-)([a-z][\w:-]*)/g)].map((match) => match[1]);
}

// Root scripts may compose supported aliases, but must never call an alias removed from the manifest.
test('should resolve every composed pnpm alias through the root manifest', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};

  for (const [scriptName, command] of Object.entries(scripts)) {
    for (const reference of findPnpmScriptReferences(command)) {
      if (pnpmBuiltins.has(reference)) {
        continue;
      }

      assert.ok(
        scripts[reference],
        `${scriptName} must not invoke missing root script ${reference}`,
      );
    }
  }
});

// Duplicate commands create multiple names for the same operation and make the coordinator drift.
test('should not expose duplicate root-script commands', () => {
  const scripts = readRepositoryJson('package.json').scripts ?? {};
  const scriptNamesByCommand = new Map();

  for (const [scriptName, command] of Object.entries(scripts)) {
    const existingNames = scriptNamesByCommand.get(command) ?? [];
    existingNames.push(scriptName);
    scriptNamesByCommand.set(command, existingNames);
  }

  const duplicates = [...scriptNamesByCommand.entries()]
    .filter(([, scriptNames]) => scriptNames.length > 1)
    .map(([command, scriptNames]) => ({ command, scriptNames }));

  assert.deepEqual(duplicates, [], 'root scripts must not provide duplicate command aliases');
});

// Every documented workspace command must point to a real package script after alias cleanup.
test('should keep server README workspace commands executable', () => {
  const readme = readFileSync(resolve(repositoryRoot, 'packages/server/README.md'), 'utf8');
  const workspaceManifests = new Map(
    ['server', 'sdk', 'cli'].map((directory) => {
      const manifest = readRepositoryJson(`packages/${directory}/package.json`);
      return [manifest.name, manifest];
    }),
  );

  for (const match of readme.matchAll(/pnpm --filter (@portaidentity\/[^\s]+) ([\w:-]+)/g)) {
    const [, workspaceName, scriptName] = match;
    const manifest = workspaceManifests.get(workspaceName);

    assert.ok(manifest, `README command must reference active workspace ${workspaceName}`);
    assert.ok(
      manifest.scripts?.[scriptName],
      `README command must reference ${workspaceName} script ${scriptName}`,
    );
  }
});
