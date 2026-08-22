import type {
  FaultCatalogCampaignBaseline,
  FaultCatalogCampaignCatalog,
  FaultCatalogCampaignSelector,
  FaultCatalogCampaignTuplePlan,
} from './fault-catalog-campaign-contract.js';

/** Exact aggregate selector; no fault with this identifier is implied. */
export const aggregateFaultCatalogSelector: FaultCatalogCampaignSelector = Object.freeze({
  fault: 'full-catalog',
  claim: 'catalog',
  sentinel: 'all',
});

/** Closed security-sensitive fields forbidden from the aggregate artifact. */
export const faultCatalogCampaignForbiddenArtifactFields = Object.freeze([
  'stdout',
  'stderr',
  'exception',
  'stack',
  'credential',
  'token',
  'secret',
  'absolutePath',
  'patch',
  'patchBytes',
]);

/** Exact fields permitted in the sanitized aggregate artifact. */
export const faultCatalogCampaignRetainedFields = Object.freeze([
  'schemaVersion',
  'selector',
  'catalogDigest',
  'baseline',
  'tuples',
  'exitCode',
  'terminalReason',
  'artifactMode',
  'atomicWrite',
  'primaryTreeUnchanged',
  'ownedResourcesRemovedOrRecovered',
  'ownedResourceCleanup',
  'recoveryCommand',
  'retainedFieldNames',
]);

/** Requirement-owned catalog with shared and single-claim faults for expansion checks. */
export const faultCatalogCampaignFixture: FaultCatalogCampaignCatalog = Object.freeze({
  version: 1,
  digest: `sha256:${'a'.repeat(64)}`,
  faults: Object.freeze([
    {
      id: 'alpha-boundary-fault',
      targetRevision: 'b'.repeat(40),
      targetPath: 'test-harness/assurance/fault/fixtures/alpha-control.mjs',
      targetHash: `sha256:${'c'.repeat(64)}`,
      patchPath: 'test-harness/assurance/fault/patches/alpha-boundary.patch',
      buildCommandId: 'fault-alpha-build',
      executionCommandId: 'fault-alpha-sentinel',
      tuples: Object.freeze([
        {
          claimId: 'CLAIM-R6-01',
          sentinelId: 'ST-64',
          expectedSignature: 'ALPHA_REVISION_MISMATCH_DETECTED',
        },
        {
          claimId: 'CLAIM-R6-03',
          sentinelId: 'ST-66',
          expectedSignature: 'ALPHA_SHARED_TUPLE_KILLED',
        },
        {
          claimId: 'CLAIM-R6-02',
          sentinelId: 'ST-65',
          expectedSignature: 'ALPHA_UNRELATED_FAILURE_REJECTED',
        },
      ]),
    },
    {
      id: 'bravo-lifecycle-fault',
      targetRevision: 'b'.repeat(40),
      targetPath: 'test-harness/assurance/fault/fixtures/bravo-control.mjs',
      targetHash: `sha256:${'d'.repeat(64)}`,
      patchPath: 'test-harness/assurance/fault/patches/bravo-lifecycle.patch',
      buildCommandId: 'fault-bravo-build',
      executionCommandId: 'fault-bravo-sentinel',
      tuples: Object.freeze([
        {
          claimId: 'CLAIM-R6-04',
          sentinelId: 'ST-67',
          expectedSignature: 'BRAVO_SURVIVOR_DETECTED',
        },
        {
          claimId: 'CLAIM-R6-05',
          sentinelId: 'ST-68',
          expectedSignature: 'BRAVO_CLEANUP_DRIFT_DETECTED',
        },
        {
          claimId: 'CLAIM-R6-05',
          sentinelId: 'ST-68A',
          expectedSignature: 'BRAVO_OUTSIDE_SCOPE_REFUSED',
        },
      ]),
    },
  ]),
});

/** Requirement-owned clean baseline captured once for the complete campaign. */
export const faultCatalogCampaignBaselineFixture: FaultCatalogCampaignBaseline = Object.freeze({
  commit: 'b'.repeat(40),
  treeDigest: `sha256:${'e'.repeat(64)}`,
  toolchainDigest: `sha256:${'f'.repeat(64)}`,
  catalogDigest: faultCatalogCampaignFixture.digest,
  clean: true,
});

/** Exact independent tuple-classification rules used by aggregate accounting. */
export const faultCatalogTupleClassificationRules = Object.freeze([
  { condition: 'revision-mismatch', classification: 'invalid', killed: false, incomplete: true },
  { condition: 'target-hash-mismatch', classification: 'invalid', killed: false, incomplete: true },
  { condition: 'tuple-mismatch', classification: 'invalid', killed: false, incomplete: true },
  { condition: 'build-failure', classification: 'invalid', killed: false, incomplete: true },
  {
    condition: 'setup-failure',
    classification: 'infrastructure-failed',
    killed: false,
    incomplete: true,
  },
  { condition: 'unrelated-failure', classification: 'invalid', killed: false, incomplete: true },
  {
    condition: 'exact-signature-failed',
    classification: 'killed',
    killed: true,
    incomplete: false,
  },
  { condition: 'sentinel-survived', classification: 'survived', killed: false, incomplete: true },
  { condition: 'tuple-timeout', classification: 'timeout', killed: false, incomplete: true },
  {
    condition: 'outside-scope-mutation',
    classification: 'invalid',
    killed: false,
    incomplete: true,
  },
] as const);

/** Returns true only for the exact three-part aggregate selector. */
export function isExactAggregateFaultCatalogSelector(
  selector: FaultCatalogCampaignSelector,
): boolean {
  return (
    selector.fault === aggregateFaultCatalogSelector.fault &&
    selector.claim === aggregateFaultCatalogSelector.claim &&
    selector.sentinel === aggregateFaultCatalogSelector.sentinel
  );
}

/** Expands and lexically orders every globally unique fault/claim/sentinel tuple. */
export function expandFaultCatalogCampaign(
  catalog: FaultCatalogCampaignCatalog,
): readonly FaultCatalogCampaignTuplePlan[] {
  const expanded = catalog.faults.flatMap((fault) =>
    fault.tuples.map((tuple) => ({
      ...tuple,
      identity: `${fault.id}::${tuple.claimId}::${tuple.sentinelId}`,
      ordinal: 0,
      faultId: fault.id,
      targetRevision: fault.targetRevision,
      targetPath: fault.targetPath,
      targetHash: fault.targetHash,
      patchPath: fault.patchPath,
      buildCommandId: fault.buildCommandId,
      executionCommandId: fault.executionCommandId,
      executionIsolation: 'fresh-detached-worktree' as const,
    })),
  );
  const identities = expanded.map((tuple) => tuple.identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error('fault catalog contains a duplicate global tuple identity');
  }
  return Object.freeze(
    expanded
      .sort((left, right) => left.identity.localeCompare(right.identity))
      .map((tuple, ordinal) => Object.freeze({ ...tuple, ordinal })),
  );
}

/** Terminal conditions used by the independent aggregate exit-precedence oracle. */
export interface FaultCatalogCampaignTerminalConditions {
  readonly cleanupOrTreeDrift: boolean;
  readonly signal: 'sigint' | 'sigterm' | null;
  readonly timedOut: boolean;
  readonly invalid: boolean;
  readonly infrastructureFailed: boolean;
  readonly survived: boolean;
}

/** Applies the exact aggregate outcome precedence and exit-code contract. */
export function classifyFaultCatalogCampaignExit(
  conditions: FaultCatalogCampaignTerminalConditions,
): 0 | 21 | 30 | 50 | 60 | 70 | 130 | 143 {
  if (conditions.cleanupOrTreeDrift) return 60;
  if (conditions.signal === 'sigint') return 130;
  if (conditions.signal === 'sigterm') return 143;
  if (conditions.timedOut) return 70;
  if (conditions.invalid) return 50;
  if (conditions.infrastructureFailed) return 30;
  if (conditions.survived) return 21;
  return 0;
}

/** Returns whether one catalog definition stays within immutable allowlisted surfaces. */
export function faultDefinitionIsInScope(
  fault: FaultCatalogCampaignCatalog['faults'][number],
): boolean {
  const relativePath = (path: string) =>
    !path.startsWith('/') && !path.includes('..') && !path.includes('*') && !path.includes('\\');
  return (
    relativePath(fault.targetPath) &&
    relativePath(fault.patchPath) &&
    fault.targetPath.startsWith('test-harness/assurance/fault/fixtures/') &&
    fault.patchPath.startsWith('test-harness/assurance/fault/patches/') &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fault.buildCommandId) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fault.executionCommandId)
  );
}
