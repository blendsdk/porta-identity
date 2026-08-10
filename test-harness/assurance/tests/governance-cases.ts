import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { completeClaim, knownTests } from './assurance-fixtures.js';

type ValidationModule = typeof import('../scripts/validate-assurance.js');

/** Registers claim governance, evidence-state, defect-routing, and traceability specifications. */
export function registerGovernanceCases(
  validation: ValidationModule,
  repositoryRoot: string,
): void {
  /** Creates canonical authoritative files and returns the branded validation context they load. */
  function createContext(
    overrides: {
      inventory?: unknown;
      manifest?: Record<string, unknown>;
    } = {},
  ): {
    context: ReturnType<ValidationModule['loadAssuranceValidationContext']>;
    cleanup: () => void;
  } {
    const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-assurance-context-'));
    const inventoryDirectory = resolve(sandbox, 'test-harness/assurance');
    const testDirectory = resolve(inventoryDirectory, 'tests');
    const runDirectory = resolve(
      sandbox,
      'test-harness/.assurance-results/00000000-0000-4000-8000-000000000001',
    );
    mkdirSync(testDirectory, { recursive: true });
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(
      resolve(testDirectory, 'protocol.spec.test.ts'),
      '// immutable sentinel fixture\n',
    );
    writeFileSync(
      resolve(inventoryDirectory, 'test-inventory.json'),
      JSON.stringify(overrides.inventory ?? { version: 1, tests: knownTests }),
    );
    writeFileSync(
      resolve(runDirectory, 'manifest.json'),
      JSON.stringify({
        runId: '00000000-0000-4000-8000-000000000001',
        status: 'passed',
        command: 'yarn assurance:test',
        startedAt: '2026-08-10T09:59:00.000Z',
        completedAt: '2026-08-10T10:00:00.000Z',
        buildIdentity: completeClaim.evidence.buildIdentity,
        treeIdentity: 'tree:0123456789abcdef',
        fixtureIdentity: completeClaim.evidence.fixtureIdentity,
        executionArtifact: { kind: 'source-tree', digest: 'sha256:0123456789abcdef' },
        dependencyLockDigest: 'sha256:0123456789abcdef',
        assuranceToolDigest: 'sha256:0123456789abcdef',
        definitionDigests: {
          traceability: 'sha256:0123456789abcdef',
          redSignatures: 'sha256:0123456789abcdef',
          testInventory: 'sha256:0123456789abcdef',
        },
        toolVersions: { node: 'v22.0.0', commandContract: 1 },
        results: completeClaim.evidence.results,
        killedFaultIds: completeClaim.evidence.killedFaultIds,
        artifacts: ['validation/result.json'],
        accessPolicy: 'restricted synthetic evidence',
        retentionPolicy: 'disposable',
        ...overrides.manifest,
      }),
    );
    return {
      context: validation.loadAssuranceValidationContext(sandbox, {
        inventory: 'test-harness/assurance/test-inventory.json',
        manifest:
          'test-harness/.assurance-results/00000000-0000-4000-8000-000000000001/manifest.json',
      }),
      cleanup: () => rmSync(sandbox, { recursive: true, force: true }),
    };
  }

  test('rejects duplicate claim identifiers and names the duplicate', () => {
    const loaded = createContext();
    try {
      assert.throws(
        () =>
          validation.validateCatalog(
            [completeClaim, structuredClone(completeClaim)],
            loaded.context,
          ),
        /duplicate[^\n]*CLAIM-R1-01|CLAIM-R1-01[^\n]*duplicate/i,
      );
    } finally {
      loaded.cleanup();
    }
  });

  test('rejects a critical claim without a negative sentinel', () => {
    const claim = structuredClone(completeClaim);
    claim.sentinels = claim.sentinels.filter((sentinel) => sentinel.classification !== 'negative');

    const loaded = createContext();
    try {
      assert.throws(
        () => validation.validateCatalog([claim], loaded.context),
        /critical[^\n]*negative sentinel|negative sentinel[^\n]*critical/i,
      );
    } finally {
      loaded.cleanup();
    }
  });

  test('rejects and identifies an unresolved test or case reference', () => {
    const claim = structuredClone(completeClaim);
    claim.sentinels[0].case = 'missing exact sentinel case';
    const loaded = createContext();
    try {
      assert.throws(
        () => validation.validateCatalog([claim], loaded.context),
        /missing exact sentinel case/,
      );
    } finally {
      loaded.cleanup();
    }
  });

  test('requires every assurance precondition before entering assured state', () => {
    const invalidClaims = [
      Object.assign(structuredClone(completeClaim), {
        gaps: [
          {
            id: 'protocol-retry-behavior',
            name: 'unverified retry behavior',
            reason: 'No exact case.',
          },
        ],
      }),
      Object.assign(structuredClone(completeClaim), {
        evidence: { ...completeClaim.evidence, current: false },
      }),
      Object.assign(structuredClone(completeClaim), {
        evidence: {
          ...completeClaim.evidence,
          results: [{ command: 'yarn verify', status: 'failed' }],
        },
      }),
      Object.assign(structuredClone(completeClaim), {
        evidence: { ...completeClaim.evidence, killedFaultIds: [] },
      }),
    ];

    const loaded = createContext();
    try {
      for (const claim of invalidClaims) {
        assert.throws(
          () => validation.transitionClaim(claim, 'assured', loaded.context),
          /assured/i,
        );
      }
    } finally {
      loaded.cleanup();
    }
  });

  test('rejects invalid records that arrive already marked assured', () => {
    const loaded = createContext();
    try {
      for (const mutation of [
        (claim: typeof completeClaim) => {
          Object.assign(claim, {
            gaps: [
              {
                id: 'unresolved-gap',
                name: 'unresolved gap',
                reason: 'Missing evidence.',
                owner: 'identity-security',
                blocksClaims: [claim.id],
              },
            ],
          });
        },
        (claim: typeof completeClaim) => {
          claim.evidence.current = false;
        },
        (claim: typeof completeClaim) => {
          claim.evidence.results[0]!.status = 'failed';
        },
        (claim: typeof completeClaim) => {
          claim.evidence.killedFaultIds = [];
        },
      ]) {
        const claim = structuredClone(completeClaim);
        claim.status = 'assured';
        mutation(claim);
        assert.throws(() => validation.validateCatalog([claim], loaded.context), /assured/i);
      }
    } finally {
      loaded.cleanup();
    }
  });

  test('fails closed on missing, malformed, empty, or partially malformed test inventories', () => {
    assert.throws(
      () => validation.validateCatalog([completeClaim], undefined),
      /authoritative|context|inventory/i,
    );
    for (const inventory of [
      {},
      { version: 1, tests: [] },
      { version: 1, tests: [{ path: 42, runner: 'node', cases: [] }] },
    ]) {
      assert.throws(() => createContext({ inventory }), /inventory|test|path|case/i);
    }
  });

  test('rejects untrusted sentinels and fabricated run provenance before assurance', () => {
    const untrustedInventory = structuredClone({ version: 1, tests: knownTests });
    untrustedInventory.tests[0]!.cases[0]!.trusted = false;
    const untrusted = createContext({ inventory: untrustedInventory });
    try {
      assert.throws(
        () => validation.transitionClaim(completeClaim, 'assured', untrusted.context),
        /trusted|reviewed/i,
      );
    } finally {
      untrusted.cleanup();
    }

    for (const evidence of [
      { buildIdentity: 'commit:attacker' },
      { fixtureIdentity: 'fixture:attacker' },
      { commands: ['yarn attacker-command'] },
      { killedFaultIds: ['attacker-fault'] },
    ]) {
      const loaded = createContext();
      const claim = structuredClone(completeClaim);
      Object.assign(claim.evidence, evidence);
      try {
        assert.throws(
          () => validation.transitionClaim(claim, 'assured', loaded.context),
          /provenance|build|fixture|command|fault|authoritative/i,
        );
      } finally {
        loaded.cleanup();
      }
    }
  });

  test('permits assurance only with canonical trusted sentinels and matching owned-run evidence', () => {
    const loaded = createContext();
    try {
      assert.equal(
        validation.transitionClaim(completeClaim, 'assured', loaded.context).status,
        'assured',
      );
    } finally {
      loaded.cleanup();
    }
  });

  test('imports existing inventory without implying assurance', () => {
    const imported = validation.importInventory([], knownTests);
    assert.equal(
      imported.filter((claim: { status: string }) => claim.status === 'assured').length,
      0,
    );
  });

  test('routes a confirmed product defect and blocks its claim without editing product source', () => {
    const productPath = resolve(repositoryRoot, 'packages/server/src/index.ts');
    const before = readFileSync(productPath, 'utf8');
    const routed = validation.recordProductDefect(completeClaim, {
      id: 'protocol-client-binding',
      severity: 'critical',
      reproduction: 'Cross-client code redemption returns a token.',
      observed: { status: 200 },
      required: { status: 400, error: 'invalid_grant' },
      routing: 'product-defect-backlog',
    });

    assert.equal(routed.claim.status, 'blocked');
    assert.equal(routed.defect.routing, 'product-defect-backlog');
    assert.equal(readFileSync(productPath, 'utf8'), before);
  });

  test('rejects self-derived oracles', () => {
    for (const sourceKind of ['production-helper', 'current-output']) {
      assert.throws(
        () => validation.validateOracle({ ...completeClaim.oracle, sourceKind }),
        /independent|self-derived|production helper|current output/i,
      );
    }
  });

  test('rejects or leaves vacuous sentinels untrusted', () => {
    const sentinels = [
      { pattern: 'conditional-early-exit', source: 'if (!ready) return' },
      { pattern: 'swallowed-setup', source: 'try { setup() } catch {}' },
      { pattern: 'broad-status-allowlist', acceptedStatuses: [200, 400, 401, 403, 404] },
      { pattern: 'not-500', assertion: 'status !== 500' },
    ];

    for (const sentinel of sentinels) {
      let assessment: { trusted: boolean } | undefined;
      try {
        assessment = validation.assessSentinel(sentinel);
      } catch (error) {
        assert.match(String(error), /vacuous|untrusted|exact assertion/i);
        continue;
      }
      assert.ok(assessment, 'a non-throwing sentinel assessment must return a result');
      assert.equal(assessment.trusted, false);
    }
  });

  test('requires a named gap and forbids safety implications when review evidence is insufficient', () => {
    assert.throws(
      () =>
        validation.completeSurfaceReview({
          surface: 'admin-api',
          evidenceSufficient: false,
          gaps: [],
        }),
      /named gap|gap.*required/i,
    );
    assert.throws(
      () =>
        validation.completeSurfaceReview({
          surface: 'admin-api',
          evidenceSufficient: false,
          gaps: [
            {
              id: 'admin-bulk-import-authorization',
              name: 'bulk import authorization',
              reason: 'No exact case.',
            },
          ],
          safetyImplication: 'safe',
        }),
      /cannot imply safety|safety implication/i,
    );
  });

  test('requires exact contract claims for every supported external surface', () => {
    const claims = ['oidc', 'admin', 'sdk', 'cli', 'email', 'config', 'lifecycle'].map(
      (surface, index) => ({
        surface,
        claimIds: [`CLAIM-R4-0${index + 1}`],
        contract: { observation: `${surface} public observation`, expected: 'exact-result' },
      }),
    );
    assert.deepEqual(validation.validateSurfaceClaims(claims), claims);
    assert.throws(
      () => validation.validateSurfaceClaims(claims.filter((claim) => claim.surface !== 'email')),
      /email/,
    );
  });

  test('assigns required test names to exactly one runner', () => {
    const ownership = [
      { path: 'test-harness/assurance/tests/model.spec.test.ts', runners: ['node'] },
      { path: 'test-harness/assurance/tests/model.impl.test.ts', runners: ['node'] },
      { path: 'test-harness/tests/spa-login.spec.ts', runners: ['playwright'] },
    ];
    assert.deepEqual(validation.validateTestOwnership(ownership), ownership);
    assert.throws(
      () =>
        validation.validateTestOwnership([
          { path: 'test-harness/assurance/tests/model.test.ts', runners: ['node'] },
        ]),
      /spec\.test\.ts|impl\.test\.ts|required naming/i,
    );
    assert.throws(
      () =>
        validation.validateTestOwnership([
          {
            path: 'test-harness/assurance/tests/model.spec.test.ts',
            runners: ['node', 'playwright'],
          },
        ]),
      /exactly one runner|runner ownership/i,
    );
  });

  test('validates complete traceability and rejects dangling edges', () => {
    const traceability = {
      requirements: ['R1.1'],
      cases: ['ST-01'],
      tasks: ['1.1'],
      claims: [completeClaim.id],
      edges: [
        { from: 'R1.1', to: 'ST-01' },
        { from: 'ST-01', to: '1.1' },
        { from: '1.1', to: completeClaim.id },
      ],
    };
    assert.deepEqual(
      validation.validateDirectedTraceability(traceability, [completeClaim]),
      traceability,
    );
    assert.throws(
      () =>
        validation.validateDirectedTraceability(
          { ...traceability, edges: [...traceability.edges, { from: '1.1', to: 'CLAIM-R1-99' }] },
          [completeClaim],
        ),
      /CLAIM-R1-99/,
    );
  });

  test('rejects synchronized traceability deletion, unknown nodes, and wrong source clauses', () => {
    const authority = validation.loadTraceabilityAuthority(repositoryRoot);
    const graph = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'test-harness/assurance/traceability.json'), 'utf8'),
    );
    const deleted = structuredClone(graph);
    deleted.mappings.shift();
    deleted.requirements.shift();
    deleted.cases = [
      ...new Set(deleted.mappings.flatMap((mapping: { cases: string[] }) => mapping.cases)),
    ];
    deleted.tasks = [
      ...new Set(deleted.mappings.flatMap((mapping: { tasks: string[] }) => mapping.tasks)),
    ];
    deleted.claims.shift();
    assert.throws(
      () => validation.validateTraceability(deleted, authority),
      /missing|authority|exact/i,
    );

    for (const [field, value] of [
      ['cases', 'ST-99'],
      ['tasks', '11.99'],
      ['claim', 'CLAIM-R1-99'],
      ['sourceClause', 'RD-07#R7.12'],
    ] as const) {
      const drifted = structuredClone(graph);
      if (field === 'cases' || field === 'tasks') drifted.mappings[0]![field].push(value);
      else drifted.mappings[0]![field] = value;
      assert.throws(
        () => validation.validateTraceability(drifted, authority),
        /unknown|source|authority|exact/i,
      );
    }
  });

  test('matches RED evidence against the observed child exit, not the normalized wrapper exit', () => {
    const registry = {
      version: 1 as const,
      signatures: [
        {
          id: 'foundation-red',
          caseId: 'ST-01',
          observedChildExit: 1,
          normalizedFailureExit: 21,
          command: 'yarn tsx --test test-harness/assurance/tests/assurance.spec.test.ts',
          marker: 'ASSURANCE_FOUNDATION_MISSING',
        },
      ],
    };

    assert.equal(
      validation.matchRedSignature(
        registry,
        'ST-01',
        'foundation-red',
        1,
        'ASSURANCE_FOUNDATION_MISSING',
      ),
      true,
    );
    assert.throws(
      () =>
        validation.matchRedSignature(
          registry,
          'ST-01',
          'foundation-red',
          21,
          'ASSURANCE_FOUNDATION_MISSING',
        ),
      /child exit mismatch/i,
    );
  });
}
