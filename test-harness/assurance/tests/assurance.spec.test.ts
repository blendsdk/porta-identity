import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const foundationFiles = [
  'test-harness/assurance/schema.ts',
  'test-harness/assurance/commands.ts',
  'test-harness/assurance/traceability.json',
  'test-harness/assurance/scripts/validate-assurance.ts',
  'test-harness/assurance/scripts/render-summary.ts',
  'test-harness/assurance/scripts/redact-evidence.ts',
  'test-harness/eslint.config.js',
] as const;
const missingFoundationFiles = foundationFiles.filter(
  (repositoryPath) => !existsSync(resolve(repositoryRoot, repositoryPath)),
);

test('assurance foundation is available for contract verification', () => {
  assert.deepEqual(
    missingFoundationFiles,
    [],
    `ASSURANCE_FOUNDATION_MISSING: ${missingFoundationFiles.join(', ')}`,
  );
});

if (missingFoundationFiles.length === 0) {
  const [
    schema,
    commands,
    validation,
    rendering,
    redaction,
    boundaries,
    schemaCases,
    governance,
    evidence,
    signals,
  ] = await Promise.all([
    import('../schema.js'),
    import('../commands.js'),
    import('../scripts/validate-assurance.js'),
    import('../scripts/render-summary.js'),
    import('../scripts/redact-evidence.js'),
    import('./foundation-boundary-cases.js'),
    import('./schema-cases.js'),
    import('./governance-cases.js'),
    import('./evidence-and-command-cases.js'),
    import('./dispatcher-signals.spec.test.js'),
  ]);

  boundaries.registerFoundationBoundaryCases(repositoryRoot);
  schemaCases.registerSchemaCases(schema);
  governance.registerGovernanceCases(validation, repositoryRoot);
  evidence.registerEvidenceAndCommandCases(
    { commands, rendering, redaction, validation },
    repositoryRoot,
  );
  void signals;
}
