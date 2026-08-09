import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { completeClaim, knownTests } from './assurance-fixtures.js';

type ValidationModule = typeof import('../scripts/validate-assurance.js');

/** Registers claim governance, evidence-state, defect-routing, and traceability specifications. */
export function registerGovernanceCases(
  validation: ValidationModule,
  repositoryRoot: string,
): void {
  test('rejects duplicate claim identifiers and names the duplicate', () => {
    assert.throws(
      () =>
        validation.validateCatalog([completeClaim, structuredClone(completeClaim)], { knownTests }),
      /duplicate[^\n]*CLAIM-R1-01|CLAIM-R1-01[^\n]*duplicate/i,
    );
  });

  test('rejects a critical claim without a negative sentinel', () => {
    const claim = structuredClone(completeClaim);
    claim.sentinels = claim.sentinels.filter((sentinel) => sentinel.classification !== 'negative');

    assert.throws(
      () => validation.validateCatalog([claim], { knownTests }),
      /critical[^\n]*negative sentinel|negative sentinel[^\n]*critical/i,
    );
  });

  test('rejects and identifies an unresolved test or case reference', () => {
    const claim = structuredClone(completeClaim);
    claim.sentinels[0].case = 'missing exact sentinel case';
    assert.throws(
      () => validation.validateCatalog([claim], { knownTests }),
      /missing exact sentinel case/,
    );
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

    for (const claim of invalidClaims) {
      assert.throws(() => validation.transitionClaim(claim, 'assured', { knownTests }), /assured/i);
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
    assert.deepEqual(validation.validateTraceability(traceability, [completeClaim]), traceability);
    assert.throws(
      () =>
        validation.validateTraceability(
          { ...traceability, edges: [...traceability.edges, { from: '1.1', to: 'CLAIM-R1-99' }] },
          [completeClaim],
        ),
      /CLAIM-R1-99/,
    );
  });
}
