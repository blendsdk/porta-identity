import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

type CommandModule = typeof import('../commands.js');
type RenderingModule = typeof import('../scripts/render-summary.js');
type RedactionModule = typeof import('../scripts/redact-evidence.js');
type ValidationModule = typeof import('../scripts/validate-assurance.js');

/** Registers path-safety, redaction, deterministic-rendering, and command-contract specifications. */
export function registerEvidenceAndCommandCases(
  modules: {
    commands: CommandModule;
    rendering: RenderingModule;
    redaction: RedactionModule;
    validation: ValidationModule;
  },
  repositoryRoot: string,
): void {
  const { commands, rendering, redaction, validation } = modules;

  test('redacts token, password, cookie, and client-secret canaries before rendering', () => {
    const canaries = [
      'TOKEN-CANARY-7fb70d',
      'PASSWORD-CANARY-e9c461',
      'COOKIE-CANARY-b55043',
      'CLIENT-SECRET-CANARY-f72a04',
    ];
    const evidence = {
      token: canaries[0],
      password: canaries[1],
      headers: { cookie: `sid=${canaries[2]}` },
      clientSecret: canaries[3],
    };
    const sanitized = redaction.redactEvidence(evidence);
    const outputs = [JSON.stringify(sanitized), rendering.renderSummary(sanitized)];

    for (const output of outputs) {
      for (const canary of canaries) assert.doesNotMatch(output, new RegExp(canary));
    }
  });

  test('redacts structured and embedded personal data while preserving synthetic correlation IDs', () => {
    const evidence = {
      email: 'alice.personal@example.test',
      fullName: 'Alice Personal Canary',
      phone: '+31 6 1234 5678',
      address: 'Personal Street 42, 1234 AB Amsterdam',
      userId: 'real-user-42',
      correlationId: 'synthetic-run-7fb70d',
      log: 'email=embedded.person@example.test phone=+31-612345678 name=Embedded Person',
    };
    const sanitized = redaction.redactEvidence(evidence);
    const outputs = [
      JSON.stringify(sanitized),
      rendering.renderJson(evidence),
      rendering.renderSummary(evidence),
    ];

    for (const output of outputs) {
      for (const personalValue of [
        'alice.personal@example.test',
        'Alice Personal Canary',
        '+31 6 1234 5678',
        'Personal Street 42',
        'real-user-42',
        'embedded.person@example.test',
        '+31-612345678',
        'Embedded Person',
      ]) {
        assert.doesNotMatch(
          output,
          new RegExp(personalValue.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')),
        );
      }
      assert.match(output, /synthetic-run-7fb70d/);
    }
  });

  test('rejects a rendered artifact when a residual secret or personal-data canary survives', () => {
    for (const residual of [
      'TOKEN-CANARY-RESIDUAL',
      'residual.person@example.test',
      'phone=+31-612345678',
    ]) {
      assert.throws(
        () => redaction.assertEvidenceSanitized(residual),
        /sensitive|personal|canary/i,
      );
    }
  });

  test('rejects unsafe repository references before resolving registered tests or artifacts', () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-assurance-paths-'));
    const allowedRoot = resolve(sandbox, 'test-harness/assurance');
    const outsideFile = resolve(sandbox, 'outside.spec.test.ts');
    const safeFile = resolve(allowedRoot, 'tests/safe.spec.test.ts');
    const escapingLink = resolve(allowedRoot, 'tests/escape.spec.test.ts');

    try {
      mkdirSync(resolve(allowedRoot, 'tests'), { recursive: true });
      writeFileSync(outsideFile, 'outside');
      writeFileSync(safeFile, 'safe', { flush: true });
      symlinkSync(outsideFile, escapingLink);
      assert.equal(
        validation.validateRepositoryReference('test-harness/assurance/tests/safe.spec.test.ts', {
          repositoryRoot: sandbox,
          allowedRoot: 'test-harness/assurance',
        }),
        'test-harness/assurance/tests/safe.spec.test.ts',
      );

      for (const reference of [
        outsideFile,
        '../outside.spec.test.ts',
        'test-harness/assurance/../tests/outside.spec.test.ts',
        'test-harness/assurance/tests/control\u0000.spec.test.ts',
        'test-harness/assurance/tests/escape.spec.test.ts',
      ]) {
        assert.throws(
          () =>
            validation.validateRepositoryReference(reference, {
              repositoryRoot: sandbox,
              allowedRoot: 'test-harness/assurance',
            }),
          /absolute|traversal|control|symlink|allowed|canonical/i,
        );
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('renders deterministic JSON and Markdown only after redacting secret-bearing input', () => {
    const first = {
      status: 'incomplete',
      evidence: { token: 'TOKEN-DETERMINISM-CANARY', password: 'PASSWORD-DETERMINISM-CANARY' },
      claimId: 'CLAIM-R1-01',
    };
    const reordered = {
      claimId: 'CLAIM-R1-01',
      evidence: { password: 'PASSWORD-DETERMINISM-CANARY', token: 'TOKEN-DETERMINISM-CANARY' },
      status: 'incomplete',
    };
    const json = rendering.renderJson(first);
    const markdown = rendering.renderSummary(first);

    assert.equal(json, rendering.renderJson(reordered));
    assert.equal(markdown, rendering.renderSummary(reordered));
    for (const output of [json, markdown]) {
      assert.doesNotMatch(output, /TOKEN-DETERMINISM-CANARY/);
      assert.doesNotMatch(output, /PASSWORD-DETERMINISM-CANARY/);
    }
  });

  test('publishes complete versioned command contracts and stable outcome precedence', () => {
    const scripts =
      (
        JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
          scripts?: Record<string, string>;
        }
      ).scripts ?? {};
    const expectedContracts = {
      'assurance:test': [
        '--select <registered-suite|ST-ID|internal-test-path>',
        '120s; fixture-ontology=900s; fixtures-all=900s-per-child',
        'test/',
        /frozen root install.*definitions.*declared services/i,
      ],
      'assurance:red': [
        '--case <ST-ID> --signature <signature-id>',
        '120s',
        'red/',
        /case.*signature.*registered.*required lanes green/i,
      ],
      'assurance:baseline': [
        '--case <ST-ID>',
        '120s',
        'baseline/',
        /case registered.*required lanes green.*fault tuple/i,
      ],
      'assurance:validate': ['', '120s', 'validation/', /frozen root install/i],
      'assurance:harness': [
        '--project <spa|bff|protocol|security|compatibility> --profile <operational|production-security>',
        '1800s',
        'harness/<project>/<profile>/',
        /DNS.*Docker.*lease.*migrated.*seeded.*healthy/i,
      ],
      'assurance:coverage': [
        '--project <project-enum> --profile <profile-enum> --seed <registered-seed>',
        '2400s',
        'coverage/<project>/<profile>/',
        /harness.*image.*maps.*writable raw mount/i,
      ],
      'assurance:fault': [
        '--fault <fault-id> --claim <claim-id> --sentinel <sentinel-id>',
        '3600s',
        'fault/<fault>/<claim>/<sentinel>/',
        /clean baseline.*registered tuple.*Docker.*disposable worktree/i,
      ],
      'assurance:control-check': [
        '--check <tenant-read-scope|tenant-write-scope|issuer-separation|organization-cache-scope|stale-authority-recheck|admin-organization-membership|admin-permission-rbac> | --recover <run-uuid>',
        '3600s',
        'control-check/<check>/',
        /clean baseline.*registered check.*Docker.*disposable worktree/i,
      ],
      'assurance:compat': [
        '--select <ST-69|ST-70|ST-71|ST-72|ST-73|tenant-admin|compatibility>',
        '1800s',
        'compat/<selector>/',
        /SDK.*CLI.*archives.*clean consumer.*temporary HOME.*healthy harness/i,
      ],
      'assurance:report': ['--run <run-uuid>', '120s', 'summary/', /sanitized.*run manifest/i],
      'assurance:stability': [
        '--command <test|harness|coverage|fault|compat> --seed-set <registered-set>',
        'child-timeout+300s; campaign<=125-attempts',
        'stability/<command>/<seed-set>/',
        /child prerequisites.*fixed.*seed set.*empty sequence/i,
      ],
      'assurance:all': [
        '',
        '7200s',
        'all/',
        /all command prerequisites.*explicit local operator start/i,
      ],
    } as const;

    assert.equal(commands.commandContractVersion, 1);
    assert.deepEqual(
      Object.keys(commands.commandContracts).sort(),
      Object.keys(expectedContracts).sort(),
    );
    for (const [alias, expected] of Object.entries(expectedContracts)) {
      assert.equal(typeof scripts[alias], 'string', `root command ${alias} must exist`);
      const contract = commands.commandContracts[alias];
      assert.equal(contract.selectorGrammar, expected[0], `${alias} selector grammar`);
      assert.equal(contract.timeout, expected[1], `${alias} timeout`);
      assert.equal(contract.artifactSubdirectory, expected[2], `${alias} artifact directory`);
      assert.match(contract.prerequisites.join('; '), expected[3], `${alias} prerequisites`);
      assert.match(contract.signalContract, /SIGINT.*SIGTERM|common signal cleanup/i);
      assert.match(
        contract.cleanupContract,
        /owned resources|exact recovery|no service ownership|primary tree immutable|common cleanup/i,
      );
    }

    assert.deepEqual(commands.commandContracts['assurance:all'].composition, [
      'validate',
      'test',
      'harness:operational',
      'harness:production-security',
      'coverage',
      'fault',
      'compat',
      'report',
    ]);
    assert.deepEqual(commands.exitTaxonomy, {
      0: 'success',
      20: 'product-failure',
      21: 'test-failure',
      30: 'setup-failure',
      40: 'coverage-incomplete',
      50: 'assurance-invalid',
      60: 'cleanup-failure',
      70: 'timeout',
      130: 'interrupted-sigint',
      143: 'interrupted-sigterm',
    });
    assert.deepEqual(commands.exitPrecedence, [60, 130, 143, 70, 50, 40, 30, 20, 21]);
    assert.doesNotMatch(
      scripts.verify ?? '',
      /assurance:(?:harness|coverage|fault|compat|stability|all)/,
    );
  });
}
