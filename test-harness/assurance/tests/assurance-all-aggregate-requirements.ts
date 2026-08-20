import type {
  AssuranceAllAggregateEvidence,
  AssuranceAllChildRegistration,
  AssuranceAllConclusion,
  AssuranceAllInternalSuiteEntry,
  AssuranceAllInternalSuiteInput,
  AssuranceAllItemEvidence,
  AssuranceAllKnownGapRegistration,
  AssuranceAllTerminalObservation,
} from './assurance-all-aggregate-contract.js';

/** Builds one frozen exact child invocation without admitting arbitrary commands. */
function invocation(
  id: string,
  command:
    | 'assurance:validate'
    | 'assurance:test'
    | 'assurance:harness'
    | 'assurance:coverage'
    | 'assurance:fault'
    | 'assurance:compat'
    | 'assurance:report',
  selector: string | null,
  profile: 'operational' | 'production-security' | null,
  args: readonly string[],
) {
  return Object.freeze({ id, command, selector, profile, arguments: Object.freeze([...args]) });
}

/** Exact versioned sequential child registry for the local aggregate. */
export const assuranceAllChildRegistry: readonly AssuranceAllChildRegistration[] = Object.freeze([
  {
    id: 'validate',
    ordinal: 0,
    purpose: 'validate the registered assurance command surface and prerequisites',
    internalSuite: null,
    invocations: Object.freeze([
      invocation('validate-registered-surface', 'assurance:validate', null, null, []),
    ]),
  },
  {
    id: 'test',
    ordinal: 1,
    purpose: 'execute every registered internal specification once by canonical file identity',
    internalSuite: 'deduplicated-canonical-files',
    invocations: Object.freeze([
      invocation(
        'internal-deduplicated-suite',
        'assurance:test',
        'assurance-all-internal-v1',
        null,
        ['--select', 'assurance-all-internal-v1'],
      ),
    ]),
  },
  {
    id: 'harness:operational',
    ordinal: 2,
    purpose: 'collect the registered operational black-box surface',
    internalSuite: null,
    invocations: Object.freeze(
      ['spa', 'bff', 'protocol', 'security', 'compatibility'].map((project) =>
        invocation(`harness-${project}-operational`, 'assurance:harness', project, 'operational', [
          '--project',
          project,
          '--profile',
          'operational',
        ]),
      ),
    ),
  },
  {
    id: 'harness:production-security',
    ordinal: 3,
    purpose: 'collect the registered production-security black-box surface',
    internalSuite: null,
    invocations: Object.freeze([
      invocation(
        'harness-security-production-security',
        'assurance:harness',
        'security',
        'production-security',
        ['--project', 'security', '--profile', 'production-security'],
      ),
    ]),
  },
  {
    id: 'coverage',
    ordinal: 4,
    purpose: 'collect the fixed coverage catalog and claim mapping',
    internalSuite: null,
    invocations: Object.freeze([
      invocation('coverage-protocol-operational', 'assurance:coverage', 'protocol', 'operational', [
        '--project',
        'protocol',
        '--profile',
        'operational',
        '--seed',
        'coverage-baseline',
      ]),
      invocation(
        'coverage-security-production-security',
        'assurance:coverage',
        'security',
        'production-security',
        [
          '--project',
          'security',
          '--profile',
          'production-security',
          '--seed',
          'coverage-baseline',
        ],
      ),
    ]),
  },
  {
    id: 'fault',
    ordinal: 5,
    purpose: 'execute the complete curated fault catalog',
    internalSuite: null,
    invocations: Object.freeze([
      invocation('fault-full-catalog', 'assurance:fault', 'full-catalog/catalog/all', null, [
        '--fault',
        'full-catalog',
        '--claim',
        'catalog',
        '--sentinel',
        'all',
      ]),
    ]),
  },
  {
    id: 'compat',
    ordinal: 6,
    purpose: 'collect the registered packed SDK and CLI compatibility surface',
    internalSuite: null,
    invocations: Object.freeze(
      ['tenant-admin', 'protocol', 'p1-admin', 'compatibility'].map((selector) =>
        invocation(`compat-${selector}`, 'assurance:compat', selector, null, [
          '--select',
          selector,
        ]),
      ),
    ),
  },
  {
    id: 'report',
    ordinal: 7,
    purpose: 'validate and render the truthful aggregate roll-up',
    internalSuite: null,
    invocations: Object.freeze([
      invocation('report-aggregate-run', 'assurance:report', 'aggregate-run-id', null, [
        '--run',
        '<aggregate-run-id>',
      ]),
    ]),
  },
]);

/** Frozen status authority for known gaps; none of these entries receives assurance credit. */
export const assuranceAllKnownGapRegistry: readonly AssuranceAllKnownGapRegistration[] =
  Object.freeze([
    {
      id: 'protocol-independent-observation-gaps',
      authority: 'stale-or-no-go-evidence',
      statusSource: 'approved-program-gap-register',
      conclusion: 'unqualified',
    },
    {
      id: 'enumeration-timing-contract-unapproved',
      authority: 'authority-blocked',
      statusSource: 'approved-program-gap-register',
      conclusion: 'blocked',
    },
    {
      id: 'totp-same-window-replay-authority',
      authority: 'authority-blocked',
      statusSource: 'approved-program-gap-register',
      conclusion: 'blocked',
    },
    {
      id: 'bulk-import-export-contract-unapproved',
      authority: 'authority-blocked',
      statusSource: 'approved-program-gap-register',
      conclusion: 'blocked',
    },
    {
      id: 'forwarding-context-observer-incomplete',
      authority: 'stale-or-no-go-evidence',
      statusSource: 'approved-program-gap-register',
      conclusion: 'unqualified',
    },
    {
      id: 'source-variation-campaign-not-executed',
      authority: 'stale-or-no-go-evidence',
      statusSource: 'approved-program-gap-register',
      conclusion: 'unqualified',
    },
  ]);

/** Exact known incomplete collector rules that may continue without receiving assurance credit. */
export const assuranceAllKnownIncompleteCollectorRegistry = Object.freeze(
  (['operational', 'production-security'] as const).map((profile) =>
    Object.freeze({
      invocationId: `harness-security-${profile}`,
      profile,
      gapId: 'forwarding-context-observer-incomplete',
      incompleteCaseIds: Object.freeze([
        'st53-untrusted-forwarded-host',
        'st53-untrusted-forwarded-proto',
        'st53-untrusted-forwarded-client-ip',
      ]),
      unobservedStateObservations: Object.freeze([
        'configured-public-origin-unchanged',
        'cookie-policy-unchanged',
        'rate-limit-key-uses-direct-peer-not-spoofed-value',
      ]),
      unobservedProhibitedEffects: Object.freeze(['rate-limit-budget-split-by-spoofed-ip']),
      continuedConclusion: 'incomplete',
      finalExitRemainsNonzero: true,
    }),
  ),
);

/** Closed artifact fields allowed to survive evidence sanitization. */
export const assuranceAllRetainedFieldNames = Object.freeze([
  'schemaVersion',
  'registryVersion',
  'registryDigest',
  'baselineRevision',
  'baselineTreeDigest',
  'children',
  'items',
  'rollup',
  'terminal',
  'exitCode',
  'terminalReason',
  'artifactMode',
  'atomicWrite',
  'cleanup',
  'retainedFieldNames',
]);

/** Security-sensitive fields and values forbidden from aggregate evidence. */
export const assuranceAllForbiddenEvidencePatterns = Object.freeze([
  /stdout/i,
  /stderr/i,
  /exception/i,
  /stack(?:trace)?/i,
  /credential/i,
  /password/i,
  /access.?token/i,
  /refresh.?token/i,
  /private.?key/i,
  /patch(?:bytes)?/i,
  /absolute.?path/i,
  /(?:\/home\/|\/tmp\/|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s|authorization:)/i,
]);

/** Exact terminal precedence, highest priority first. */
export const assuranceAllTerminalPrecedence = Object.freeze([
  { condition: 'cleanup-or-primary-tree-drift', exitCode: 60 },
  { condition: 'sigint', exitCode: 130 },
  { condition: 'sigterm', exitCode: 143 },
  { condition: 'timeout', exitCode: 70 },
  { condition: 'invalid-evidence', exitCode: 50 },
  { condition: 'coverage-incomplete', exitCode: 40 },
  { condition: 'infrastructure-failure', exitCode: 30 },
  { condition: 'product-defect', exitCode: 20 },
  { condition: 'assertion-or-surviving-fault', exitCode: 21 },
] as const);

/** Creates the stable, first-seen internal suite with all contributors retained. */
export function deduplicateAssuranceAllInternalSuite(
  inputs: readonly AssuranceAllInternalSuiteInput[],
): readonly AssuranceAllInternalSuiteEntry[] {
  const entries = new Map<string, { ordinal: number; contributedBy: string[] }>();
  for (const input of inputs) {
    for (const canonicalFile of input.canonicalFiles) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*\.(?:test|spec\.test)\.ts$/.test(canonicalFile)) {
        throw new Error('ASSURANCE_ALL_INTERNAL_FILE_NOT_CANONICAL');
      }
      const current = entries.get(canonicalFile);
      if (current) {
        if (!current.contributedBy.includes(input.selector))
          current.contributedBy.push(input.selector);
      } else {
        entries.set(canonicalFile, { ordinal: entries.size, contributedBy: [input.selector] });
      }
    }
  }
  return Object.freeze(
    [...entries].map(([canonicalFile, entry]) =>
      Object.freeze({
        canonicalFile,
        ordinal: entry.ordinal,
        contributedBy: Object.freeze([...entry.contributedBy]),
      }),
    ),
  );
}

/** Classifies one item without turning a defect collector or authority gap into assurance. */
export function classifyAssuranceAllItem(
  item: Omit<AssuranceAllItemEvidence, 'conclusion'>,
): AssuranceAllConclusion {
  if (item.authority === 'authority-blocked') {
    if (item.executionStatus !== 'not-run' || item.observation !== null) {
      throw new Error('ASSURANCE_ALL_AUTHORITY_GAP_EXECUTED');
    }
    return 'blocked';
  }
  if (item.authority === 'stale-or-no-go-evidence') {
    if (item.executionStatus !== 'not-run' || item.observation !== null) {
      throw new Error('ASSURANCE_ALL_UNQUALIFIED_ITEM_EXECUTED');
    }
    return 'unqualified';
  }
  if (item.executionStatus === 'not-run') return 'incomplete';
  if (item.observation === 'fault-survived') return 'survived';
  if (item.observation === 'evidence-incomplete' || item.observation === 'assertion-failed') {
    return 'incomplete';
  }
  if (item.observation === 'product-defect-observed') return 'blocked';
  if (item.observation === 'passed') return 'assured';
  throw new Error('ASSURANCE_ALL_COMPLETED_ITEM_MISSING_OBSERVATION');
}

/** Builds a complete disjoint roll-up and rejects duplicated item identities. */
export function rollUpAssuranceAllItems(
  items: readonly Omit<AssuranceAllItemEvidence, 'conclusion'>[],
): Readonly<Record<AssuranceAllConclusion, readonly string[]>> {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('ASSURANCE_ALL_DUPLICATE_ITEM_ID');
  const rollup: Record<AssuranceAllConclusion, string[]> = {
    assured: [],
    blocked: [],
    incomplete: [],
    survived: [],
    unqualified: [],
  };
  for (const item of items) rollup[classifyAssuranceAllItem(item)].push(item.id);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(rollup).map(([conclusion, itemIds]) => [
        conclusion,
        Object.freeze([...itemIds].sort()),
      ]),
    ),
  ) as Readonly<Record<AssuranceAllConclusion, readonly string[]>>;
}

/** Applies the fixed aggregate exit precedence to one actual terminal observation. */
export function classifyAssuranceAllExit(
  terminal: AssuranceAllTerminalObservation,
): AssuranceAllAggregateEvidence['exitCode'] {
  if (terminal.cleanupOrPrimaryTreeDrift) return 60;
  if (terminal.signal === 'sigint') return 130;
  if (terminal.signal === 'sigterm') return 143;
  if (terminal.timedOut) return 70;
  if (terminal.invalidEvidence) return 50;
  if (terminal.coverageIncomplete) return 40;
  if (terminal.infrastructureFailed) return 30;
  if (terminal.productDefectObserved) return 20;
  if (terminal.assertionFailedOrFaultSurvived) return 21;
  return 0;
}

/** Requirement-owned fixture containing every conclusion without claiming product evidence. */
export const assuranceAllAggregateEvidenceFixture: AssuranceAllAggregateEvidence = Object.freeze({
  schemaVersion: 1,
  registryVersion: 1,
  registryDigest: `sha256:${'a'.repeat(64)}`,
  baselineRevision: 'b'.repeat(40),
  baselineTreeDigest: `sha256:${'c'.repeat(64)}`,
  children: Object.freeze(
    assuranceAllChildRegistry.map((child) =>
      Object.freeze({
        id: child.id,
        ordinal: child.ordinal,
        executionStatus: 'completed' as const,
        processOwnership: 'managed-child' as const,
        outcome:
          child.id === 'harness:operational'
            ? ('known-product-defect' as const)
            : ('passed' as const),
        notRunReason: null,
        cleanupComplete: true,
        invocations: Object.freeze(
          child.invocations.map((registered) =>
            Object.freeze({
              ...registered,
              executionStatus: 'completed' as const,
              exitCode: child.id === 'harness:operational' ? 20 : 0,
              artifactReference: `all/requirement-run/children/${registered.id}.json`,
              artifactDigest: `sha256:${'d'.repeat(64)}`,
              sourceRevision: 'b'.repeat(40),
              sourceTreeDigest: `sha256:${'c'.repeat(64)}`,
              toolIdentity: registered.command,
              toolDigest: `sha256:${'e'.repeat(64)}`,
              cleanupComplete: true,
              notRunReason: null,
            }),
          ),
        ),
      }),
    ),
  ),
  items: Object.freeze<AssuranceAllItemEvidence[]>([
    {
      id: 'qualified-control',
      childId: 'harness:production-security',
      authority: 'eligible',
      executionStatus: 'completed',
      observation: 'passed',
      notRunReason: null,
      conclusion: 'assured',
    },
    {
      id: 'known-product-defect',
      childId: 'harness:operational',
      authority: 'known-product-defect-collector',
      executionStatus: 'completed',
      observation: 'product-defect-observed',
      notRunReason: null,
      conclusion: 'blocked',
    },
    {
      id: 'insufficient-observation',
      childId: 'coverage',
      authority: 'eligible',
      executionStatus: 'completed',
      observation: 'evidence-incomplete',
      notRunReason: null,
      conclusion: 'incomplete',
    },
    {
      id: 'surviving-fault',
      childId: 'fault',
      authority: 'eligible',
      executionStatus: 'completed',
      observation: 'fault-survived',
      notRunReason: null,
      conclusion: 'survived',
    },
    {
      id: 'authority-blocked-contract',
      childId: 'report',
      authority: 'authority-blocked',
      executionStatus: 'not-run',
      observation: null,
      notRunReason: 'AUTHORITY_CONTRACT_UNAVAILABLE',
      conclusion: 'blocked',
    },
    {
      id: 'unsupported-observation',
      childId: 'report',
      authority: 'stale-or-no-go-evidence',
      executionStatus: 'not-run',
      observation: null,
      notRunReason: 'OBSERVATION_UNQUALIFIED',
      conclusion: 'unqualified',
    },
  ]),
  rollup: Object.freeze({
    assured: Object.freeze(['qualified-control']),
    blocked: Object.freeze(['authority-blocked-contract', 'known-product-defect']),
    incomplete: Object.freeze(['insufficient-observation']),
    survived: Object.freeze(['surviving-fault']),
    unqualified: Object.freeze(['unsupported-observation']),
  }),
  terminal: Object.freeze({
    cleanupOrPrimaryTreeDrift: false,
    signal: null,
    timedOut: false,
    invalidEvidence: false,
    coverageIncomplete: false,
    infrastructureFailed: false,
    productDefectObserved: true,
    assertionFailedOrFaultSurvived: true,
  }),
  exitCode: 20,
  terminalReason: 'KNOWN_PRODUCT_DEFECT_RETAINED',
  artifactMode: 0o600,
  atomicWrite: true,
  cleanup: Object.freeze({
    primaryTreeUnchanged: true,
    activeChildStopped: true,
    childProcessGroupStopped: true,
    ownedResourcesRemovedOrExactlyRecovered: true,
    recoveryRequired: false,
    recoveryCommand: null,
  }),
  retainedFieldNames: assuranceAllRetainedFieldNames,
});
