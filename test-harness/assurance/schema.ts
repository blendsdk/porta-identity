import { z } from 'zod';

/** Allowlisted stable identifier used by assurance definitions. */
const manifestIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);

/** Stable claim identifier grouped by its governing requirement document. */
const claimIdSchema = z.string().regex(/^CLAIM-R[1-7]-[0-9]{2}$/);

/** Immutable specification case identifier. */
const specificationIdSchema = z.string().regex(/^ST-[0-9]{2}[A-Z]?$/);

/** Non-empty string that prevents structurally present but meaningless evidence fields. */
const nonEmptyTextSchema = z.string().trim().min(1);

/** ISO timestamp stored in portable evidence records. */
const timestampSchema = z.iso.datetime({ offset: true });

/** Authoritative source used to derive an independent oracle. */
const sourceSchema = z.object({
  authority: nonEmptyTextSchema,
  version: nonEmptyTextSchema,
  section: nonEmptyTextSchema,
});

/** Public observation and exact expected outcome for one claim. */
const oracleSchema = z.object({
  sourceKind: z.enum([
    'approved-requirement',
    'published-contract',
    'published-standard',
    'security-invariant',
    'independent-client',
  ]),
  observation: nonEmptyTextSchema,
  expected: z.unknown(),
});

/** Independently executable positive or negative claim sentinel. */
const sentinelSchema = z.object({
  test: nonEmptyTextSchema,
  case: nonEmptyTextSchema,
  classification: z.enum(['positive', 'negative']),
  runner: z.enum(['node', 'playwright']),
  trusted: z.boolean(),
});

/** One command result referenced by claim evidence. */
export const evidenceResultSchema = z.object({
  command: nonEmptyTextSchema,
  status: z.enum(['passed', 'failed', 'invalid', 'incomplete']),
});

/** Evidence that binds a claim to exact source, fixture, commands, and sensitivity records. */
const evidenceSchema = z.object({
  buildIdentity: nonEmptyTextSchema,
  fixtureIdentity: nonEmptyTextSchema,
  commands: z.array(nonEmptyTextSchema).min(1),
  results: z.array(evidenceResultSchema).min(1),
  faultIds: z.array(manifestIdSchema),
  killedFaultIds: z.array(manifestIdSchema),
  coverageReference: nonEmptyTextSchema,
  recordedAt: timestampSchema,
  current: z.boolean(),
});

/** Validates named assurance gaps. */
export const gapSchema = z.object({
  id: manifestIdSchema,
  name: nonEmptyTextSchema,
  reason: nonEmptyTextSchema,
  owner: nonEmptyTextSchema,
  blocksClaims: z.array(claimIdSchema).min(1),
});

/** Validates assurance claim records without inferring trust from a passing test. */
export const claimSchema = z
  .object({
    id: claimIdSchema,
    slice: manifestIdSchema,
    risk: z.enum(['critical', 'high', 'medium', 'low']),
    owner: nonEmptyTextSchema,
    sources: z.array(sourceSchema).min(1),
    threat: nonEmptyTextSchema,
    oracle: oracleSchema,
    sentinels: z.array(sentinelSchema).min(1),
    status: z.enum(['unreviewed', 'incomplete', 'blocked', 'assured', 'stale']),
    evidence: evidenceSchema,
    gaps: z.array(gapSchema),
    reopenWhen: z.array(nonEmptyTextSchema).min(1),
    profile: z.enum(['operational', 'production-security']),
    sliceProfile: manifestIdSchema,
  })
  .superRefine((claim, context) => {
    if (
      claim.risk === 'critical' &&
      !claim.sentinels.some((sentinel) => sentinel.classification === 'negative')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sentinels'],
        message: 'critical claims require at least one negative sentinel',
      });
    }
  });

/** Validates one command result with complete build and fixture provenance. */
export const resultSchema = z
  .object({
    id: manifestIdSchema,
    command: nonEmptyTextSchema,
    status: z.enum(['passed', 'failed', 'invalid', 'incomplete']),
    startedAt: timestampSchema,
    completedAt: timestampSchema,
    buildIdentity: nonEmptyTextSchema,
    fixtureIdentity: nonEmptyTextSchema,
    redactedLog: z.string(),
    metrics: z.record(z.string(), z.number().int().nonnegative()).optional(),
  })
  .superRefine((result, context) => {
    if (Date.parse(result.completedAt) < Date.parse(result.startedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'completedAt cannot precede startedAt',
      });
    }
  });

/** Validates the exact count summary emitted by foundation definition validation. */
export const foundationValidationResultSchema = resultSchema.safeExtend({
  metrics: z.object({
    requirementCount: z.number().int().nonnegative(),
    caseCount: z.number().int().nonnegative(),
    taskCount: z.number().int().nonnegative(),
    claimCount: z.number().int().nonnegative(),
    redSignatureCount: z.number().int().nonnegative(),
    commandContractVersion: z.number().int().positive(),
  }),
});

/** Validates the immutable source-tree artifact used by a foundation run. */
const sourceTreeArtifactSchema = z.object({
  kind: z.literal('source-tree'),
  digest: nonEmptyTextSchema,
});

/** Validates a complete owned-run manifest before it can authorize assurance evidence. */
export const foundationManifestSchema = z.object({
  runId: z.uuid(),
  status: z.enum(['passed', 'failed', 'invalid', 'incomplete']),
  command: nonEmptyTextSchema,
  startedAt: timestampSchema,
  completedAt: timestampSchema,
  buildIdentity: nonEmptyTextSchema,
  treeIdentity: nonEmptyTextSchema,
  fixtureIdentity: nonEmptyTextSchema,
  executionArtifact: sourceTreeArtifactSchema,
  dependencyLockDigest: nonEmptyTextSchema,
  assuranceToolDigest: nonEmptyTextSchema,
  definitionDigests: z.object({
    traceability: nonEmptyTextSchema,
    redSignatures: nonEmptyTextSchema,
    testInventory: nonEmptyTextSchema,
  }),
  toolVersions: z.object({
    node: nonEmptyTextSchema,
    commandContract: z.number().int().positive(),
  }),
  results: z.array(evidenceResultSchema).min(1),
  killedFaultIds: z.array(manifestIdSchema),
  artifacts: z.array(nonEmptyTextSchema).min(1),
  accessPolicy: nonEmptyTextSchema,
  retentionPolicy: nonEmptyTextSchema,
});

/** One reviewed case in the canonical test inventory. */
const inventoriedCaseSchema = z.object({
  name: nonEmptyTextSchema,
  trusted: z.boolean(),
});

/** One canonical test path and its exact reviewed cases. */
export const inventoriedTestSchema = z.object({
  path: nonEmptyTextSchema,
  runner: z.enum(['node', 'playwright']),
  cases: z.array(inventoriedCaseSchema).min(1),
});

/** Versioned authoritative inventory used to resolve claim sentinels. */
export const testInventorySchema = z.object({
  version: z.literal(1),
  tests: z.array(inventoriedTestSchema).min(1),
});

/** Validates curated-fault identity, execution, and cleanup provenance. */
export const faultSchema = z.object({
  id: manifestIdSchema,
  claimId: claimIdSchema,
  sentinelId: specificationIdSchema,
  expectedSignature: manifestIdSchema,
  targetRevision: z.string().regex(/^[0-9a-f]{7,64}$/),
  patch: nonEmptyTextSchema,
  buildCommand: nonEmptyTextSchema,
  executionCommand: nonEmptyTextSchema,
  cleanupVerification: nonEmptyTextSchema,
});

/** Exact result categories required in every actor/action/resource risk-slice profile. */
const sliceResultsSchema = z.object({
  allowed: z.array(nonEmptyTextSchema).min(1),
  unauthenticated: z.array(nonEmptyTextSchema).min(1),
  forbidden: z.array(nonEmptyTextSchema).min(1),
  notFound: z.array(nonEmptyTextSchema).min(1),
});

/** Validates complete actor, action, resource, trust, logging, and recovery profiles. */
export const sliceProfileSchema = z.object({
  id: manifestIdSchema,
  actors: z.array(nonEmptyTextSchema).min(1),
  actions: z.array(nonEmptyTextSchema).min(1),
  resources: z.array(nonEmptyTextSchema).min(1),
  results: sliceResultsSchema,
  entryPoints: z.array(nonEmptyTextSchema).min(1),
  trustBoundaries: z.array(nonEmptyTextSchema).min(1),
  rejectionClasses: z.array(nonEmptyTextSchema).min(1),
  abuseClasses: z.array(nonEmptyTextSchema).min(1),
  prohibitedSideEffects: z.array(nonEmptyTextSchema).min(1),
  privacySafeLogs: z.array(nonEmptyTextSchema).min(1),
  recoveryExpectations: z.array(nonEmptyTextSchema).min(1),
});

/** One exact requirement-to-case-to-task-to-claim mapping. */
export const traceabilityMappingSchema = z.object({
  requirement: z.string().regex(/^R[1-7]\.[0-9]+$/),
  sourceClause: z.string().regex(/^RD-0[1-7]#R[1-7]\.[0-9]+$/),
  cases: z.array(specificationIdSchema).min(1),
  tasks: z.array(z.string().regex(/^(?:[1-9]|1[01])\.[1-9][0-9]*$/)).min(1),
  claim: claimIdSchema,
});

/** Versioned executable traceability graph stored in the repository. */
export const traceabilitySchema = z.object({
  version: z.literal(1),
  requirements: z.array(z.string().regex(/^R[1-7]\.[0-9]+$/)).min(1),
  cases: z.array(specificationIdSchema).min(1),
  tasks: z.array(z.string().regex(/^(?:[1-9]|1[01])\.[1-9][0-9]*$/)).min(1),
  claims: z.array(claimIdSchema).min(1),
  mappings: z.array(traceabilityMappingSchema).min(1),
});

/** One authoritative Must requirement and its versioned source clause. */
const authoritativeRequirementSchema = z.object({
  id: z.string().regex(/^R[1-7]\.[0-9]+$/),
  sourceClause: z.string().regex(/^RD-0[1-7]#R[1-7]\.[0-9]+$/),
});

/** Independent node/source inventory used to prove traceability completeness. */
export const traceabilityAuthoritySchema = z.object({
  version: z.literal(1),
  requirements: z.array(authoritativeRequirementSchema).min(1),
  cases: z.array(specificationIdSchema).min(1),
  tasks: z.array(z.string().regex(/^(?:[1-9]|1[01])\.[1-9][0-9]*$/)).min(1),
  claims: z.array(claimIdSchema).min(1),
});

/** One exact, non-regex failure marker accepted as RED evidence. */
export const redSignatureSchema = z.object({
  id: manifestIdSchema,
  caseId: specificationIdSchema,
  observedChildExit: z.number().int().min(1).max(255),
  normalizedFailureExit: z.number().int().min(1).max(255),
  command: nonEmptyTextSchema,
  marker: nonEmptyTextSchema,
});

/** Versioned registry of exact RED signatures. */
export const redSignatureRegistrySchema = z.object({
  version: z.literal(1),
  signatures: z.array(redSignatureSchema).min(1),
});
