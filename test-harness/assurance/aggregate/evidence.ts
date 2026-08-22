import type {
  AssuranceAllAggregateEvidence,
  AssuranceAllChildEvidence,
  AssuranceAllConclusion,
  AssuranceAllInvocationEvidence,
  AssuranceAllInvocationRegistration,
  AssuranceAllItemEvidence,
  AssuranceAllTerminalObservation,
} from '../tests/assurance-all-aggregate-contract.js';
import { z } from 'zod';

import { aggregateChildRegistry, aggregateKnownGaps, aggregateRegistryDigest } from './registry.js';

/** Closed top-level fields retained by aggregate evidence. */
export const aggregateRetainedFields = Object.freeze([
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

const childIdSchema = z.enum([
  'validate',
  'test',
  'harness:operational',
  'harness:production-security',
  'coverage',
  'fault',
  'compat',
  'report',
]);
const conclusionSchema = z.enum(['assured', 'blocked', 'incomplete', 'survived', 'unqualified']);
const exitCodeSchema = z.union([
  z.literal(0),
  z.literal(20),
  z.literal(21),
  z.literal(30),
  z.literal(40),
  z.literal(50),
  z.literal(60),
  z.literal(70),
  z.literal(130),
  z.literal(143),
]);
const invocationSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
    command: z.enum([
      'assurance:validate',
      'assurance:test',
      'assurance:harness',
      'assurance:coverage',
      'assurance:fault',
      'assurance:compat',
      'assurance:report',
    ]),
    selector: z.string().max(128).nullable(),
    profile: z.enum(['operational', 'production-security']).nullable(),
    arguments: z.array(z.string().max(256)).max(8),
    executionStatus: z.enum(['completed', 'not-run']),
    exitCode: exitCodeSchema.nullable(),
    artifactReference: z
      .string()
      .regex(/^all\/[a-z0-9/_.-]+$/)
      .nullable(),
    artifactDigest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    sourceTreeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    toolIdentity: z.string().regex(/^assurance:[a-z-]+$/),
    toolDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    cleanupComplete: z.boolean(),
    notRunReason: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{2,127}$/)
      .nullable(),
  })
  .strict();
const childSchema = z
  .object({
    id: childIdSchema,
    ordinal: z.number().int().nonnegative(),
    executionStatus: z.enum(['completed', 'not-run']),
    processOwnership: z.literal('managed-child').nullable(),
    outcome: z
      .enum(['passed', 'known-product-defect', 'assertion-failed', 'survived', 'incomplete'])
      .nullable(),
    notRunReason: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{2,127}$/)
      .nullable(),
    cleanupComplete: z.boolean(),
    invocations: z.array(invocationSchema),
  })
  .strict();
const itemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/),
    childId: childIdSchema,
    authority: z.enum([
      'eligible',
      'known-product-defect-collector',
      'authority-blocked',
      'stale-or-no-go-evidence',
    ]),
    executionStatus: z.enum(['completed', 'not-run']),
    observation: z
      .enum([
        'passed',
        'product-defect-observed',
        'evidence-incomplete',
        'fault-survived',
        'assertion-failed',
      ])
      .nullable(),
    notRunReason: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{2,127}$/)
      .nullable(),
    conclusion: conclusionSchema,
  })
  .strict();
const terminalSchema = z
  .object({
    cleanupOrPrimaryTreeDrift: z.boolean(),
    signal: z.enum(['sigint', 'sigterm']).nullable(),
    timedOut: z.boolean(),
    invalidEvidence: z.boolean(),
    coverageIncomplete: z.boolean(),
    infrastructureFailed: z.boolean(),
    productDefectObserved: z.boolean(),
    assertionFailedOrFaultSurvived: z.boolean(),
  })
  .strict();
const cleanupSchema = z
  .object({
    primaryTreeUnchanged: z.boolean(),
    activeChildStopped: z.boolean(),
    childProcessGroupStopped: z.boolean(),
    ownedResourcesRemovedOrExactlyRecovered: z.boolean(),
    recoveryRequired: z.boolean(),
    recoveryCommand: z.string().max(256).nullable(),
  })
  .strict();
const aggregateEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    registryVersion: z.literal(1),
    registryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    baselineRevision: z.string().regex(/^[a-f0-9]{40}$/),
    baselineTreeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    children: z.array(childSchema),
    items: z.array(itemSchema),
    rollup: z
      .object({
        assured: z.array(z.string()),
        blocked: z.array(z.string()),
        incomplete: z.array(z.string()),
        survived: z.array(z.string()),
        unqualified: z.array(z.string()),
      })
      .strict(),
    terminal: terminalSchema,
    exitCode: exitCodeSchema,
    terminalReason: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    artifactMode: z.literal(0o600),
    atomicWrite: z.literal(true),
    cleanup: cleanupSchema,
    retainedFieldNames: z.array(z.string()),
  })
  .strict();

/** Applies the documented aggregate exit precedence. */
export function aggregateExitCode(
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

/** Returns the one terminal reason bound to an aggregate exit code. */
function expectedTerminalReason(exitCode: AssuranceAllAggregateEvidence['exitCode']): string {
  return {
    0: 'ALL_REGISTERED_ITEMS_ASSURED',
    20: 'KNOWN_PRODUCT_DEFECT_RETAINED',
    21: 'ASSERTION_OR_FAULT_SURVIVAL',
    30: 'INFRASTRUCTURE_FAILURE',
    40: 'COVERAGE_INCOMPLETE',
    50: 'BLOCKED_OR_UNQUALIFIED_ITEMS_RETAINED',
    60: 'CLEANUP_OR_PRIMARY_TREE_DRIFT',
    70: 'CHILD_TIMEOUT',
    130: 'INTERRUPTED_SIGINT',
    143: 'INTERRUPTED_SIGTERM',
  }[exitCode];
}

/** Compares simple evidence values without accepting missing or additional fields. */
function exact(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Accepts the one run-specific substitution in the report invocation. */
function exactInvocationRegistration(
  observed: AssuranceAllInvocationEvidence,
  registered: AssuranceAllInvocationRegistration,
): boolean {
  const argumentsMatch =
    exact(observed.arguments, registered.arguments) ||
    (registered.id === 'report-aggregate-run' &&
      observed.arguments.length === 4 &&
      observed.arguments[0] === '--run' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        observed.arguments[1] ?? '',
      ) &&
      observed.arguments[2] === '--coverage-run' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        observed.arguments[3] ?? '',
      ));
  return (
    observed.id === registered.id &&
    observed.command === registered.command &&
    observed.selector === registered.selector &&
    observed.profile === registered.profile &&
    argumentsMatch
  );
}

/** Derives one claim-sized item solely from a registered invocation observation. */
function invocationItem(
  childId: AssuranceAllChildEvidence['id'],
  invocation: AssuranceAllInvocationEvidence,
): AssuranceAllItemEvidence {
  if (invocation.executionStatus === 'not-run') {
    return {
      id: `invocation:${invocation.id}`,
      childId,
      authority: 'eligible',
      executionStatus: 'not-run',
      observation: null,
      notRunReason: invocation.notRunReason,
      conclusion: 'incomplete',
    };
  }
  const exitCode = invocation.exitCode;
  const faultSurvived = exitCode === 21 && childId === 'fault';
  return {
    id: `invocation:${invocation.id}`,
    childId,
    authority: exitCode === 20 ? 'known-product-defect-collector' : 'eligible',
    executionStatus: 'completed',
    observation:
      exitCode === 0
        ? 'passed'
        : exitCode === 20
          ? 'product-defect-observed'
          : exitCode === 40
            ? 'evidence-incomplete'
            : faultSurvived
              ? 'fault-survived'
              : 'assertion-failed',
    notRunReason: null,
    conclusion:
      exitCode === 0
        ? 'assured'
        : exitCode === 20
          ? 'blocked'
          : exitCode === 40
            ? 'incomplete'
            : faultSurvived
              ? 'survived'
              : 'incomplete',
  };
}

/** Derives one group outcome from its exact invocation observations. */
function childOutcome(
  child: AssuranceAllChildEvidence,
): Omit<AssuranceAllChildEvidence, 'invocations' | 'id' | 'ordinal'> {
  const completed = child.invocations.filter((entry) => entry.executionStatus === 'completed');
  const notRun = child.invocations.length - completed.length;
  const exits = completed.map((entry) => entry.exitCode);
  const entirelyNotRun = notRun === child.invocations.length;
  const failed = exits.some((code) => code !== 0 && code !== 20 && code !== 40);
  return {
    executionStatus: entirelyNotRun ? 'not-run' : 'completed',
    processOwnership: entirelyNotRun ? null : 'managed-child',
    outcome: entirelyNotRun
      ? null
      : failed
        ? 'assertion-failed'
        : exits.includes(40) || notRun > 0
          ? 'incomplete'
          : exits.includes(20)
            ? 'known-product-defect'
            : 'passed',
    notRunReason: entirelyNotRun ? 'EARLIER_CHILD_TERMINATED' : null,
    cleanupComplete: completed.every((entry) => entry.cleanupComplete),
  };
}

/** Builds the exact sorted roll-up from independently derived items. */
function derivedRollup(
  items: readonly AssuranceAllItemEvidence[],
): Readonly<Record<AssuranceAllConclusion, readonly string[]>> {
  const rollup: Record<AssuranceAllConclusion, string[]> = {
    assured: [],
    blocked: [],
    incomplete: [],
    survived: [],
    unqualified: [],
  };
  for (const item of items) rollup[item.conclusion].push(item.id);
  for (const values of Object.values(rollup)) values.sort();
  return rollup;
}

/** Derives terminal flags from exact invocation, gap, tree, and cleanup observations. */
function derivedTerminal(evidence: AssuranceAllAggregateEvidence): AssuranceAllTerminalObservation {
  const invocations = evidence.children.flatMap((child) => child.invocations);
  const completed = invocations.filter((entry) => entry.executionStatus === 'completed');
  const exits = completed.map((entry) => entry.exitCode);
  const cleanupFailure = completed.some((entry) => !entry.cleanupComplete);
  return {
    cleanupOrPrimaryTreeDrift:
      !evidence.cleanup.primaryTreeUnchanged ||
      cleanupFailure ||
      exits.includes(60) ||
      !evidence.cleanup.ownedResourcesRemovedOrExactlyRecovered,
    signal: exits.includes(130) ? 'sigint' : exits.includes(143) ? 'sigterm' : null,
    timedOut: exits.includes(70),
    invalidEvidence: exits.includes(50) || aggregateKnownGaps.length > 0,
    coverageIncomplete: exits.includes(40),
    infrastructureFailed: exits.includes(30),
    productDefectObserved: exits.includes(20),
    assertionFailedOrFaultSurvived: exits.includes(21),
  };
}

/** Validates a complete sanitized aggregate document against independently derived authority. */
export function validateAggregateEvidence(value: unknown): AssuranceAllAggregateEvidence {
  let evidence: AssuranceAllAggregateEvidence;
  try {
    evidence = aggregateEvidenceSchema.parse(value);
  } catch {
    throw new Error('ASSURANCE_ALL_SCHEMA_INVALID');
  }
  if (evidence.registryVersion !== 1 || evidence.registryDigest !== aggregateRegistryDigest()) {
    throw new Error('ASSURANCE_ALL_REGISTRY_INVALID');
  }
  if (evidence.children.length !== aggregateChildRegistry.length) {
    throw new Error('ASSURANCE_ALL_CHILDREN_INVALID');
  }

  const derivedItems: AssuranceAllItemEvidence[] = [];
  const invocationIds = new Set<string>();
  const toolDigests = new Set<string>();
  for (const [ordinal, registeredChild] of aggregateChildRegistry.entries()) {
    const child = evidence.children[ordinal];
    if (
      child === undefined ||
      child.id !== registeredChild.id ||
      child.ordinal !== registeredChild.ordinal ||
      child.invocations.length !== registeredChild.invocations.length
    ) {
      throw new Error('ASSURANCE_ALL_INVOCATIONS_INVALID');
    }
    for (const [invocationOrdinal, registered] of registeredChild.invocations.entries()) {
      const observed = child.invocations[invocationOrdinal];
      if (
        observed === undefined ||
        invocationIds.has(observed.id) ||
        !exactInvocationRegistration(observed, registered)
      ) {
        throw new Error('ASSURANCE_ALL_INVOCATIONS_INVALID');
      }
      invocationIds.add(observed.id);
      toolDigests.add(observed.toolDigest);
      const completed = observed.executionStatus === 'completed';
      if (
        observed.sourceRevision !== evidence.baselineRevision ||
        observed.sourceTreeDigest !== evidence.baselineTreeDigest ||
        observed.toolIdentity !== registered.command ||
        (completed &&
          (observed.exitCode === null ||
            observed.artifactReference === null ||
            observed.artifactDigest === null ||
            !observed.artifactReference.endsWith(`/children/${observed.id}.json`) ||
            observed.notRunReason !== null)) ||
        (!completed &&
          (observed.exitCode !== null ||
            observed.artifactReference !== null ||
            observed.artifactDigest !== null ||
            observed.cleanupComplete ||
            observed.notRunReason === null))
      ) {
        throw new Error('ASSURANCE_ALL_INVOCATION_FACTS_INVALID');
      }
      derivedItems.push(invocationItem(child.id, observed));
    }
    if (
      !exact(childOutcome(child), {
        executionStatus: child.executionStatus,
        processOwnership: child.processOwnership,
        outcome: child.outcome,
        notRunReason: child.notRunReason,
        cleanupComplete: child.cleanupComplete,
      })
    ) {
      throw new Error('ASSURANCE_ALL_CHILD_OUTCOME_INVALID');
    }
  }
  if (toolDigests.size !== 1) throw new Error('ASSURANCE_ALL_INVOCATION_FACTS_INVALID');

  for (const gap of aggregateKnownGaps) {
    derivedItems.push({
      id: gap.id,
      childId: 'report',
      authority: gap.authority,
      executionStatus: 'not-run',
      observation: null,
      notRunReason:
        gap.authority === 'authority-blocked'
          ? 'AUTHORITY_CONTRACT_UNAVAILABLE'
          : 'OBSERVATION_UNQUALIFIED',
      conclusion: gap.conclusion,
    });
  }
  if (!exact(evidence.items, derivedItems)) throw new Error('ASSURANCE_ALL_ITEMS_INVALID');
  if (!exact(evidence.rollup, derivedRollup(derivedItems))) {
    throw new Error('ASSURANCE_ALL_ROLLUP_INVALID');
  }

  const cleanupFailure = evidence.children.some((child) => !child.cleanupComplete);
  const exits = evidence.children
    .flatMap((child) => child.invocations)
    .filter((entry) => entry.executionStatus === 'completed')
    .map((entry) => entry.exitCode);
  const expectedCleanup = {
    primaryTreeUnchanged: evidence.cleanup.primaryTreeUnchanged,
    activeChildStopped: !exits.includes(60),
    childProcessGroupStopped: !exits.includes(60),
    ownedResourcesRemovedOrExactlyRecovered: !cleanupFailure && !exits.includes(60),
    recoveryRequired: exits.includes(60),
    recoveryCommand: null,
  };
  if (
    !exact(evidence.cleanup, expectedCleanup) ||
    (!evidence.cleanup.recoveryRequired && evidence.cleanup.recoveryCommand !== null)
  ) {
    throw new Error('ASSURANCE_ALL_CLEANUP_INVALID');
  }

  const terminal = derivedTerminal(evidence);
  const exitCode = aggregateExitCode(terminal);
  if (
    !exact(evidence.terminal, terminal) ||
    evidence.exitCode !== exitCode ||
    evidence.terminalReason !== expectedTerminalReason(exitCode)
  ) {
    throw new Error('ASSURANCE_ALL_TERMINAL_INVALID');
  }
  if (
    evidence.artifactMode !== 0o600 ||
    !evidence.atomicWrite ||
    !exact(evidence.retainedFieldNames, aggregateRetainedFields)
  ) {
    throw new Error('ASSURANCE_ALL_STORAGE_INVALID');
  }
  if (
    /(?:stdout|stderr|exception|stacktrace|credential|password|access.?token|refresh.?token|private.?key|patch.?bytes|absolute.?path|\/home\/|\/tmp\/|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s|authorization:)/i.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error('ASSURANCE_ALL_EVIDENCE_SECRET');
  }
  return evidence;
}
