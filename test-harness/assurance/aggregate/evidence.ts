import type {
  AssuranceAllAggregateEvidence,
  AssuranceAllConclusion,
  AssuranceAllItemEvidence,
  AssuranceAllTerminalObservation,
} from '../tests/assurance-all-aggregate-contract.js';
import { z } from 'zod';

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
const invocationSchema = z.object({
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
  exitCode: z.number().int().nullable(),
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
});
const aggregateEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  registryVersion: z.literal(1),
  registryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  baselineRevision: z.string().regex(/^[a-f0-9]{40}$/),
  baselineTreeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  children: z.array(
    z.object({
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
    }),
  ),
  items: z.array(
    z.object({
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
    }),
  ),
  rollup: z.object({
    assured: z.array(z.string()),
    blocked: z.array(z.string()),
    incomplete: z.array(z.string()),
    survived: z.array(z.string()),
    unqualified: z.array(z.string()),
  }),
  terminal: z.object({
    cleanupOrPrimaryTreeDrift: z.boolean(),
    signal: z.enum(['sigint', 'sigterm']).nullable(),
    timedOut: z.boolean(),
    invalidEvidence: z.boolean(),
    coverageIncomplete: z.boolean(),
    infrastructureFailed: z.boolean(),
    productDefectObserved: z.boolean(),
    assertionFailedOrFaultSurvived: z.boolean(),
  }),
  exitCode: z.union([
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
  ]),
  terminalReason: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
  artifactMode: z.literal(0o600),
  atomicWrite: z.literal(true),
  cleanup: z.object({
    primaryTreeUnchanged: z.boolean(),
    activeChildStopped: z.boolean(),
    childProcessGroupStopped: z.boolean(),
    ownedResourcesRemovedOrExactlyRecovered: z.boolean(),
    recoveryRequired: z.boolean(),
    recoveryCommand: z.string().max(256).nullable(),
  }),
  retainedFieldNames: z.array(z.string()),
});

/** Classifies one item from observed execution facts. */
function itemConclusion(item: AssuranceAllItemEvidence): AssuranceAllConclusion {
  if (item.authority === 'authority-blocked') return 'blocked';
  if (item.authority === 'stale-or-no-go-evidence') return 'unqualified';
  if (item.executionStatus === 'not-run') return 'incomplete';
  if (item.observation === 'fault-survived') return 'survived';
  if (item.observation === 'product-defect-observed') return 'blocked';
  if (item.observation === 'passed') return 'assured';
  return 'incomplete';
}

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

/** Validates a complete sanitized aggregate document without trusting its claimed conclusions. */
export function validateAggregateEvidence(value: unknown): AssuranceAllAggregateEvidence {
  const evidence: AssuranceAllAggregateEvidence = aggregateEvidenceSchema.parse(value);
  const childIds = evidence.children.map((child) => child.id);
  const expectedChildren = [
    'validate',
    'test',
    'harness:operational',
    'harness:production-security',
    'coverage',
    'fault',
    'compat',
    'report',
  ];
  if (JSON.stringify(childIds) !== JSON.stringify(expectedChildren)) {
    throw new Error('ASSURANCE_ALL_CHILDREN_INVALID');
  }
  if (evidence.children.some((child, ordinal) => child.ordinal !== ordinal)) {
    throw new Error('ASSURANCE_ALL_CHILD_ORDER_INVALID');
  }
  const itemIds = evidence.items.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) throw new Error('ASSURANCE_ALL_ITEM_DUPLICATE');
  const derived: Record<AssuranceAllConclusion, string[]> = {
    assured: [],
    blocked: [],
    incomplete: [],
    survived: [],
    unqualified: [],
  };
  for (const item of evidence.items) {
    const conclusion = itemConclusion(item);
    if (item.conclusion !== conclusion) throw new Error('ASSURANCE_ALL_ITEM_LAUNDERED');
    derived[conclusion].push(item.id);
  }
  for (const conclusion of Object.keys(derived) as AssuranceAllConclusion[]) {
    derived[conclusion].sort();
    if (JSON.stringify(derived[conclusion]) !== JSON.stringify(evidence.rollup[conclusion])) {
      throw new Error('ASSURANCE_ALL_ROLLUP_INVALID');
    }
  }
  if (aggregateExitCode(evidence.terminal) !== evidence.exitCode) {
    throw new Error('ASSURANCE_ALL_EXIT_INVALID');
  }
  if (
    evidence.artifactMode !== 0o600 ||
    !evidence.atomicWrite ||
    JSON.stringify(evidence.retainedFieldNames) !== JSON.stringify(aggregateRetainedFields)
  ) {
    throw new Error('ASSURANCE_ALL_STORAGE_INVALID');
  }
  if (!evidence.cleanup.primaryTreeUnchanged && evidence.exitCode !== 60) {
    throw new Error('ASSURANCE_ALL_TREE_DRIFT_NOT_TERMINAL');
  }
  const serialized = JSON.stringify(evidence);
  if (/(?:\/home\/|\/tmp\/|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s|authorization:)/i.test(serialized)) {
    throw new Error('ASSURANCE_ALL_EVIDENCE_SECRET');
  }
  return evidence;
}
