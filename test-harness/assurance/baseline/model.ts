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

/** Returns whether an untrusted selector is an exact tenant/admin baseline case. */
export function isTenantAdminBaselineCaseId(value: string): value is TenantAdminBaselineCaseId {
  return tenantAdminBaselineCaseIds.some((caseId) => caseId === value);
}

/** Returns whether an untrusted selector is an exact protocol baseline case. */
export function isProtocolBaselineCaseId(value: string): value is ProtocolBaselineCaseId {
  return protocolBaselineCaseIds.some((caseId) => caseId === value);
}
