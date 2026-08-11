import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const expectedVersions = {
  '@bcoe/v8-coverage': '1.0.2',
  'ast-v8-to-istanbul': '1.0.5',
  acorn: '8.18.0',
} as const;

/** Reads one package manifest as a validated JSON record. */
function readPackageManifest(path: string): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
  return parsed;
}

test('should declare exact direct coverage conversion dependency versions', () => {
  const rootManifest = readPackageManifest(resolve(repositoryRoot, 'package.json'));
  const devDependencies = rootManifest.devDependencies;
  assert.ok(
    devDependencies !== null &&
      typeof devDependencies === 'object' &&
      !Array.isArray(devDependencies),
  );

  for (const [name, version] of Object.entries(expectedVersions)) {
    assert.equal(Reflect.get(devDependencies, name), version, name);
    const installedManifest = readPackageManifest(
      resolve(repositoryRoot, 'node_modules', name, 'package.json'),
    );
    assert.equal(installedManifest.version, version, name);
  }
});

test('should execute the merge, ESM conversion, and parser APIs on Node 22', () => {
  const spike = [
    "import { mergeProcessCovs } from '@bcoe/v8-coverage';",
    "import { convert } from 'ast-v8-to-istanbul';",
    "import { parse } from 'acorn';",
    "const code = 'export const covered = true;\\n';",
    "const coverage = { scriptId: '1', url: 'file:///app/dist/spike.js', functions: [{ functionName: '', ranges: [{ startOffset: 0, endOffset: code.length, count: 1 }], isBlockCoverage: true }] };",
    "const mapped = await convert({ ast: parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true }), code, wrapperLength: 0, coverage });",
    'const merged = mergeProcessCovs([{ result: [coverage] }, { result: [coverage] }]);',
    "if (Object.keys(mapped).join(',') !== '/app/dist/spike.js' || merged.result.length !== 1) process.exit(1);",
    "process.stdout.write('COVERAGE_DEPENDENCY_SPIKE_OK\\n');",
  ].join('\n');

  const output = execFileSync(process.execPath, ['--input-type=module', '-e', spike], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(output, 'COVERAGE_DEPENDENCY_SPIKE_OK\n');
});
