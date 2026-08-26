import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/** Registers dependency, typecheck, and lint ownership specifications. */
export function registerFoundationBoundaryCases(repositoryRoot: string): void {
  test('keeps every harness-internal tool dependency directly owned by the root manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const directDependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    const requiredDependencies = [
      'tsx',
      'zod',
      '@types/node',
      '@typescript/native',
      '@eslint/js',
      'eslint',
      'eslint-config-prettier',
      'typescript-eslint',
    ];

    for (const dependency of requiredDependencies) {
      assert.equal(
        typeof directDependencies[dependency],
        'string',
        `root package must directly own ${dependency}`,
      );
    }
  });

  test('includes all assurance TypeScript in root-owned typecheck and lint boundaries', () => {
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const harnessTypeScript = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'test-harness/tsconfig.json'), 'utf8'),
    ) as { include?: string[] };
    const harnessLint = readFileSync(
      resolve(repositoryRoot, 'test-harness/eslint.config.js'),
      'utf8',
    );

    assert.equal(existsSync(resolve(repositoryRoot, 'test-harness/package.json')), false);
    assert.ok(
      harnessTypeScript.include?.some(
        (pattern) => pattern === 'assurance/**/*.ts' || pattern === '**/*.ts',
      ),
      'the harness TypeScript boundary must include assurance/**/*.ts',
    );
    assert.match(harnessLint, /assurance\/\*\*\/\*\.ts|\*\*\/\*\.ts/);
    assert.match(manifest.scripts?.typecheck ?? '', /test-harness|typecheck:harness/);
    assert.match(manifest.scripts?.lint ?? '', /test-harness|lint:harness/);
  });
}
