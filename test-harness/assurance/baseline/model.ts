import { z } from 'zod';

/** Tenant/admin specification cases that share one external-boundary assurance claim. */
export const tenantAdminBaselineCaseIds = ['ST-28', 'ST-29', 'ST-30', 'ST-31', 'ST-32'] as const;

/** One tenant/admin case accepted by the baseline command. */
export type TenantAdminBaselineCaseId = (typeof tenantAdminBaselineCaseIds)[number];

/** Protocol specification cases that require exact live OIDC or token sentinels. */
export const protocolBaselineCaseIds = [
  'ST-33',
  'ST-34',
  'ST-35',
  'ST-36',
  'ST-37',
  'ST-38',
  'ST-39',
  'ST-40',
  'ST-41',
] as const;

/** One OIDC/token case accepted by the baseline command. */
export type ProtocolBaselineCaseId = (typeof protocolBaselineCaseIds)[number];

/** Human-authentication cases whose existing external tests require strict baseline audit. */
export const humanAuthBaselineCaseIds = [
  'ST-42',
  'ST-43',
  'ST-44',
  'ST-45',
  'ST-46',
  'ST-47',
  'ST-48',
] as const;

/** One human-authentication case accepted by the baseline command. */
export type HumanAuthBaselineCaseId = (typeof humanAuthBaselineCaseIds)[number];

/** Closed reasons that prevent a current human-auth test from receiving exact sentinel credit. */
export const humanAuthCandidateRejectionReasons = [
  'conditional-or-nonfatal-prerequisite',
  'conditional-assertion',
  'fake-artifact-only',
  'pre-marked-artifact',
  'status-only-oracle',
  'mock-or-service-only',
  'missing-independent-observation',
  'missing-delivery-observation',
  'missing-binding-observation',
  'missing-public-sequential-reuse',
  'incomplete-sentinel-scope',
  'unresolved-totp-replay-contract',
] as const;

/** One exact reason why a human-auth candidate cannot support its full sentinel. */
export type HumanAuthCandidateRejectionReason = (typeof humanAuthCandidateRejectionReasons)[number];

/** Partial behavior a reviewed candidate genuinely observes without closing the sentinel. */
export const humanAuthCandidateScopes = [
  'functional-response-equivalence',
  'login-method-and-limit-enforcement',
  'session-lifecycle',
  'cookie-and-csrf',
  'artifact-delivery-and-binding',
  'consumed-artifact-sequential-reuse',
  'email-otp-sequential-reuse',
  'totp-and-recovery-sequential-reuse',
] as const;

/** One partial human-auth behavior supported by a current candidate. */
export type HumanAuthCandidateScope = (typeof humanAuthCandidateScopes)[number];

/** Stable reasons why an existing test is ineligible as an exact external sentinel. */
export const baselineRejectionReasons = [
  'authentication-denial-before-handler',
  'broad-status-oracle',
  'mock-only',
  'missing-authorized-control',
  'missing-concurrent-tenant-context',
  'missing-independent-nonmutation',
  'missing-stale-authority-transition',
  'conditional-prerequisite-exit',
  'fake-artifact-only',
  'missing-code-issuance-observation',
  'missing-context-substitution',
  'missing-durable-state-observation',
  'missing-independent-jose',
  'missing-positive-control',
  'missing-real-artifact-substitution',
  'missing-true-concurrency',
  'missing-attacker-key-location-variants',
  'missing-concurrent-issuer-context',
  'wrong-token-kind',
] as const;

/** One reason why an existing test cannot support the selected claim. */
export type BaselineRejectionReason = (typeof baselineRejectionReasons)[number];

/** Immutable source identity bound to baseline evidence. */
export interface BaselineProvenance {
  /** Exact clean commit identity. */
  readonly commitIdentity: string;
  /** Exact clean Git tree identity. */
  readonly treeIdentity: string;
  /** Digest of the assurance implementation used to create evidence. */
  readonly assuranceToolDigest: string;
}

/** One audited but ineligible existing E2E or pentest candidate. */
export interface BaselineCandidate {
  /** Repository-relative canonical test path. */
  readonly path: string;
  /** Human-readable test title used to locate the existing case. */
  readonly testTitle: string;
  /** Eligibility is false until the test reaches and proves the complete boundary. */
  readonly eligible: false;
  /** Exact shortcomings that prevent this candidate from supporting the claim. */
  readonly rejectionReasons: readonly BaselineRejectionReason[];
}

/** Sanitized evidence that an exact external sentinel does not yet exist. */
export interface TenantAdminBaselineResult {
  /** Artifact schema version. */
  readonly version: 1;
  /** UUID that owns this evidence directory. */
  readonly runId: string;
  /** Exact selected specification case. */
  readonly caseId: TenantAdminBaselineCaseId;
  /** Claim shared by the selected tenant/admin cases. */
  readonly claimId: 'CLAIM-R5-03';
  /** Baseline category; this is expected RED evidence, not a passing claim. */
  readonly classification: 'natural-red';
  /** Exact reason the case remains RED. */
  readonly reason: 'missing-live-sentinel';
  /** Explicitly prevents consumers from interpreting missing evidence as a product defect. */
  readonly productFailureObserved: false;
  /** Confirms the immutable specification oracle was not changed during baseline selection. */
  readonly oracleChanged: false;
  /** No sentinel is selected because every audited candidate is ineligible. */
  readonly selectedSentinel: null;
  /** Existing E2E or pentest candidates considered for this case. */
  readonly candidates: readonly BaselineCandidate[];
  /** Present only when no existing E2E or pentest candidate addresses the case at all. */
  readonly candidateAbsence: 'no-exact-e2e-or-pentest-candidate' | null;
  /** ISO timestamp at which the evidence was recorded. */
  readonly recordedAt: string;
  /** Clean commit identity that produced the evidence. */
  readonly buildIdentity: string;
  /** Clean tree identity that produced the evidence. */
  readonly treeIdentity: string;
  /** Assurance-tool digest that produced the evidence. */
  readonly assuranceToolDigest: string;
}

/** Sanitized evidence that one protocol case has no exact live sentinel yet. */
export interface ProtocolBaselineResult {
  /** Artifact schema version. */
  readonly version: 1;
  /** UUID that owns this evidence directory. */
  readonly runId: string;
  /** Exact selected protocol specification case. */
  readonly caseId: ProtocolBaselineCaseId;
  /** Assurance claims supported by the selected case. */
  readonly claimIds: readonly ('CLAIM-R5-04' | 'CLAIM-R5-05')[];
  /** Baseline category; passing legacy tests do not make the claim sensitive. */
  readonly classification: 'natural-red';
  /** Exact reason the case remains RED. */
  readonly reason: 'missing-exact-live-sentinel';
  /** Missing evidence is not interpreted as a Porta defect. */
  readonly productFailureObserved: false;
  /** The immutable protocol oracle remained unchanged during the audit. */
  readonly oracleChanged: false;
  /** No existing test is selected as an exact sentinel. */
  readonly selectedSentinel: null;
  /** Existing E2E or pentest candidates audited for this case. */
  readonly candidates: readonly BaselineCandidate[];
  /** Present only when no relevant E2E or pentest candidate exists. */
  readonly candidateAbsence: 'no-exact-e2e-or-pentest-candidate' | null;
  /** ISO timestamp at which the evidence was recorded. */
  readonly recordedAt: string;
  /** Clean commit identity that produced the evidence. */
  readonly buildIdentity: string;
  /** Clean tree identity that produced the evidence. */
  readonly treeIdentity: string;
  /** Assurance-tool digest that produced the evidence. */
  readonly assuranceToolDigest: string;
}

/** One audited current test considered for a human-auth baseline. */
export interface HumanAuthBaselineCandidate {
  /** Canonical repository-relative test path. */
  readonly path: string;
  /** Exact current test title checked before evidence is persisted. */
  readonly testTitle: string;
  /** Whether the candidate sends its decisive request through a public Porta boundary. */
  readonly publicBoundary: boolean;
  /** Whether required infrastructure failure is fatal rather than skipped or tolerated. */
  readonly prerequisite: 'none' | 'fatal' | 'conditional-or-nonfatal';
  /** Independent observations actually made by the current candidate. */
  readonly independentObservations: readonly string[];
  /** Narrow behavior the candidate corroborates without closing the sentinel. */
  readonly eligibleScopes: readonly HumanAuthCandidateScope[];
  /** Full sentinel eligibility stays false until every requirement-owned observation exists. */
  readonly exactSentinelEligible: false;
  /** Exact closed reasons the full sentinel remains ineligible. */
  readonly rejectionReasons: readonly HumanAuthCandidateRejectionReason[];
}

/** Sanitized evidence that one human-auth case has no exact external sentinel yet. */
export interface HumanAuthBaselineResult {
  /** Artifact schema version. */
  readonly version: 1;
  /** UUID that owns this evidence directory. */
  readonly runId: string;
  /** Exact selected human-authentication case. */
  readonly caseId: HumanAuthBaselineCaseId;
  /** Requirement claims supported by the selected case. */
  readonly claimIds: readonly ('CLAIM-R5-06' | 'CLAIM-R5-07')[];
  /** Baseline category; incomplete current evidence is a natural RED. */
  readonly classification: 'natural-red';
  /** Exact reason no current candidate can close the sentinel. */
  readonly reason: 'missing-exact-human-auth-sentinel';
  /** Missing evidence is not interpreted as a Porta product failure. */
  readonly productFailureObserved: false;
  /** The immutable human-authentication oracle remained unchanged. */
  readonly oracleChanged: false;
  /** No exact sentinel is selected while every candidate remains incomplete. */
  readonly selectedSentinel: null;
  /** Current external candidates audited for the selected case. */
  readonly candidates: readonly HumanAuthBaselineCandidate[];
  /** Present only when no relevant current candidate exists. */
  readonly candidateAbsence: 'no-exact-e2e-pentest-or-ui-candidate' | null;
  /** ISO timestamp at which the evidence was recorded. */
  readonly recordedAt: string;
  /** Clean commit identity that produced the evidence. */
  readonly buildIdentity: string;
  /** Clean tree identity that produced the evidence. */
  readonly treeIdentity: string;
  /** Assurance-tool digest that produced the evidence. */
  readonly assuranceToolDigest: string;
}

/** Runtime-validated candidate schema used before evidence persistence. */
export const baselineCandidateSchema = z.object({
  path: z.string().regex(/^packages\/server\/tests\/(?:e2e|pentest)\/[a-z0-9./_-]+\.test\.ts$/u),
  testTitle: z.string().trim().min(1).max(200),
  eligible: z.literal(false),
  rejectionReasons: z.array(z.enum(baselineRejectionReasons)).min(1),
});

/** Runtime-validated schema for one strict tenant/admin baseline artifact. */
export const tenantAdminBaselineResultSchema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  caseId: z.enum(tenantAdminBaselineCaseIds),
  claimId: z.literal('CLAIM-R5-03'),
  classification: z.literal('natural-red'),
  reason: z.literal('missing-live-sentinel'),
  productFailureObserved: z.literal(false),
  oracleChanged: z.literal(false),
  selectedSentinel: z.null(),
  candidates: z.array(baselineCandidateSchema),
  candidateAbsence: z.literal('no-exact-e2e-or-pentest-candidate').nullable(),
  recordedAt: z.iso.datetime(),
  buildIdentity: z.string().regex(/^commit:[0-9a-f]{40}$/u),
  treeIdentity: z.string().regex(/^tree:[0-9a-f]{40}$/u),
  assuranceToolDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

/** Runtime-validated schema for one strict protocol baseline artifact. */
export const protocolBaselineResultSchema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  caseId: z.enum(protocolBaselineCaseIds),
  claimIds: z.array(z.enum(['CLAIM-R5-04', 'CLAIM-R5-05'])).min(1),
  classification: z.literal('natural-red'),
  reason: z.literal('missing-exact-live-sentinel'),
  productFailureObserved: z.literal(false),
  oracleChanged: z.literal(false),
  selectedSentinel: z.null(),
  candidates: z.array(baselineCandidateSchema),
  candidateAbsence: z.literal('no-exact-e2e-or-pentest-candidate').nullable(),
  recordedAt: z.iso.datetime(),
  buildIdentity: z.string().regex(/^commit:[0-9a-f]{40}$/u),
  treeIdentity: z.string().regex(/^tree:[0-9a-f]{40}$/u),
  assuranceToolDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

/** Runtime-validated candidate schema for human-authentication baseline evidence. */
export const humanAuthBaselineCandidateSchema = z.object({
  path: z
    .string()
    .regex(/^packages\/server\/tests\/(?:e2e|pentest|ui|unit)\/[a-z0-9./_-]+\.(?:test|spec)\.ts$/u),
  testTitle: z.string().trim().min(1).max(200),
  publicBoundary: z.boolean(),
  prerequisite: z.enum(['none', 'fatal', 'conditional-or-nonfatal']),
  independentObservations: z.array(z.string().trim().min(1).max(80)),
  eligibleScopes: z.array(z.enum(humanAuthCandidateScopes)),
  exactSentinelEligible: z.literal(false),
  rejectionReasons: z.array(z.enum(humanAuthCandidateRejectionReasons)).min(1),
});

/** Runtime-validated schema for one strict human-authentication baseline artifact. */
export const humanAuthBaselineResultSchema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  caseId: z.enum(humanAuthBaselineCaseIds),
  claimIds: z.array(z.enum(['CLAIM-R5-06', 'CLAIM-R5-07'])).min(1),
  classification: z.literal('natural-red'),
  reason: z.literal('missing-exact-human-auth-sentinel'),
  productFailureObserved: z.literal(false),
  oracleChanged: z.literal(false),
  selectedSentinel: z.null(),
  candidates: z.array(humanAuthBaselineCandidateSchema),
  candidateAbsence: z.literal('no-exact-e2e-pentest-or-ui-candidate').nullable(),
  recordedAt: z.iso.datetime(),
  buildIdentity: z.string().regex(/^commit:[0-9a-f]{40}$/u),
  treeIdentity: z.string().regex(/^tree:[0-9a-f]{40}$/u),
  assuranceToolDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

/** Returns whether an untrusted selector is an exact tenant/admin baseline case. */
export function isTenantAdminBaselineCaseId(value: string): value is TenantAdminBaselineCaseId {
  return tenantAdminBaselineCaseIds.some((caseId) => caseId === value);
}

/** Returns whether an untrusted selector is an exact protocol baseline case. */
export function isProtocolBaselineCaseId(value: string): value is ProtocolBaselineCaseId {
  return protocolBaselineCaseIds.some((caseId) => caseId === value);
}

/** Returns whether an untrusted selector is an exact human-authentication baseline case. */
export function isHumanAuthBaselineCaseId(value: string): value is HumanAuthBaselineCaseId {
  return humanAuthBaselineCaseIds.some((caseId) => caseId === value);
}
