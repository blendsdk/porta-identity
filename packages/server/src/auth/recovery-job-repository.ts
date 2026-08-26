/**
 * Durable PostgreSQL repository for account-recovery work.
 *
 * Public request handlers enqueue only protected, tenant-bound input. A worker later claims a
 * bounded batch and performs account-specific work outside the request path. Every transition is
 * conditional on the current claim owner so a stale worker cannot complete or reschedule work
 * reclaimed by another process.
 */

import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';
import { getPool } from '../lib/database.js';

/** Closed recovery operations accepted by the durable queue. */
export const RECOVERY_JOB_TYPES = ['magic_link', 'password_reset'] as const;

/** Closed durable lifecycle states for recovery work. */
export const RECOVERY_JOB_STATUSES = [
  'available',
  'claimed',
  'completed',
  'terminal_failure',
] as const;

/** Maximum number of jobs one worker pass may claim. */
export const RECOVERY_JOB_CLAIM_LIMIT = 25;

/** Maximum processing attempts retained by the durable schema. */
export const RECOVERY_JOB_ATTEMPT_LIMIT = 5;

/** Recovery operation represented by a durable job. */
export type RecoveryJobType = (typeof RECOVERY_JOB_TYPES)[number];

/** Durable lifecycle state of recovery work. */
export type RecoveryJobStatus = (typeof RECOVERY_JOB_STATUSES)[number];

/**
 * Authenticated-encryption envelope for a normalized recovery address.
 *
 * The repository treats these values as opaque protected bytes encoded by the caller. Plaintext
 * addresses must never cross this boundary.
 */
export interface ProtectedRecoveryAddress {
  /** Authenticated ciphertext encoded as base64url. */
  readonly ciphertext: string;
  /** Unique AES-GCM initialization vector encoded as base64url. */
  readonly iv: string;
  /** AES-GCM authentication tag encoded as base64url. */
  readonly tag: string;
  /** Non-secret identifier for the encryption key used by the envelope. */
  readonly keyId: string;
}

/** Input accepted when one public recovery request enqueues durable work. */
export interface EnqueueRecoveryJobInput {
  /** Recovery operation to perform. */
  readonly jobType: RecoveryJobType;
  /** Tenant authority resolved by the public route. */
  readonly organizationId: string;
  /** Protected normalized recovery address. */
  readonly protectedAddress: ProtectedRecoveryAddress;
  /** OIDC interaction binding for a magic-link request, otherwise null. */
  readonly interactionUid: string | null;
  /** Keyed, domain-separated digest identifying this admitted request. */
  readonly idempotencyDigest: string;
  /** Earliest time at which a worker may claim the job. */
  readonly availableAt: Date;
}

/** Durable recovery job returned to request and worker services. */
export interface RecoveryJob {
  /** Durable job identifier. */
  readonly id: string;
  /** Recovery operation represented by the job. */
  readonly jobType: RecoveryJobType;
  /** Tenant authority persisted with the job. */
  readonly organizationId: string;
  /** Protected recovery address. */
  readonly protectedAddress: ProtectedRecoveryAddress;
  /** OIDC interaction binding, or null for standalone work. */
  readonly interactionUid: string | null;
  /** Keyed, domain-separated request idempotency digest. */
  readonly idempotencyDigest: string;
  /** Current durable lifecycle state. */
  readonly status: RecoveryJobStatus;
  /** Earliest claim time. */
  readonly availableAt: Date;
  /** Time at which the current worker claimed the job. */
  readonly claimedAt: Date | null;
  /** Current worker owner identifier. */
  readonly claimedBy: string | null;
  /** Number of processing attempts already started. */
  readonly attemptCount: number;
  /** Closed failure reason from the latest unsuccessful attempt. */
  readonly lastFailureReason: string | null;
  /** Terminal transition time. */
  readonly completedAt: Date | null;
  /** Job creation time. */
  readonly createdAt: Date;
  /** Latest durable transition time. */
  readonly updatedAt: Date;
}

/** Recovery job returned from an atomic claim with its acquisition reason. */
export interface ClaimedRecoveryJob extends RecoveryJob {
  /**
   * How this worker acquired the row. An exhausted lease must be terminally closed without
   * performing account-specific work because the prior fifth attempt has an unknown outcome.
   */
  readonly claimDisposition: 'available' | 'lease_reclaimed' | 'lease_exhausted';
}

/** Result of an idempotent enqueue operation. */
export interface EnqueueRecoveryJobResult {
  /** Durable row representing the request. */
  readonly job: RecoveryJob;
  /** Whether this call inserted the row rather than observing an existing idempotency match. */
  readonly inserted: boolean;
}

/** Input for one bounded atomic claim operation. */
export interface ClaimRecoveryJobsInput {
  /** Unique worker-process identifier. */
  readonly workerId: string;
  /** Repository clock value used for every row in the transition. */
  readonly now: Date;
  /** Claims at or before this instant may be reclaimed. */
  readonly leaseExpiredBefore: Date;
  /** Maximum jobs to claim, bounded to the product policy maximum. */
  readonly limit?: number;
}

/** Input for charging one processing attempt against an owned claim. */
export interface BeginRecoveryJobAttemptInput {
  /** Durable job identifier. */
  readonly jobId: string;
  /** Worker that currently owns the claim. */
  readonly workerId: string;
  /** Repository clock value used for the transition. */
  readonly now: Date;
}

/** Input for returning an owned claim to the available queue. */
export interface RetryRecoveryJobInput {
  /** Durable job identifier. */
  readonly jobId: string;
  /** Worker that currently owns the claim. */
  readonly workerId: string;
  /** Earliest time at which the retry may be claimed. */
  readonly availableAt: Date;
  /** Closed privacy-safe failure reason. */
  readonly reason: string;
  /** Repository clock value used for the transition. */
  readonly now: Date;
}

/** Input for a terminal owned-claim transition. */
export interface FinishRecoveryJobInput {
  /** Durable job identifier. */
  readonly jobId: string;
  /** Worker that currently owns the claim. */
  readonly workerId: string;
  /** Repository clock value used for the transition. */
  readonly now: Date;
  /** Closed reason required for terminal failure and omitted for success. */
  readonly reason?: string;
}

/** Minimal query boundary shared by PostgreSQL pools and transaction clients. */
export interface RecoveryJobDatabase {
  /** Execute one parameterized query. */
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

interface RecoveryJobRow extends QueryResultRow {
  id: string;
  job_type: RecoveryJobType;
  organization_id: string;
  address_ciphertext: string;
  address_iv: string;
  address_tag: string;
  address_key_id: string;
  interaction_uid: string | null;
  idempotency_digest: string;
  status: RecoveryJobStatus;
  available_at: Date;
  claimed_at: Date | null;
  claimed_by: string | null;
  attempt_count: number;
  last_failure_reason: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ClaimedRecoveryJobRow extends RecoveryJobRow {
  claim_disposition: ClaimedRecoveryJob['claimDisposition'];
}

const uuidSchema = z.string().uuid();
const protectedTextSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[A-Za-z0-9_-]+$/);
const keyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const interactionUidSchema = z.string().min(1).max(128).nullable();
const reasonSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

const enqueueSchema = z
  .object({
    jobType: z.enum(RECOVERY_JOB_TYPES),
    organizationId: uuidSchema,
    protectedAddress: z
      .object({
        ciphertext: protectedTextSchema,
        iv: protectedTextSchema,
        tag: protectedTextSchema,
        keyId: keyIdSchema,
      })
      .strict(),
    interactionUid: interactionUidSchema,
    idempotencyDigest: digestSchema,
    availableAt: z.date(),
  })
  .strict()
  .superRefine((input, context) => {
    const interactionMatchesType =
      input.jobType === 'magic_link' ||
      (input.jobType === 'password_reset' && input.interactionUid === null);
    if (!interactionMatchesType) {
      context.addIssue({
        code: 'custom',
        path: ['interactionUid'],
        message: 'interaction binding does not match the recovery job type',
      });
    }
  });

const claimSchema = z
  .object({
    workerId: uuidSchema,
    now: z.date(),
    leaseExpiredBefore: z.date(),
    limit: z.number().int().min(1).max(RECOVERY_JOB_CLAIM_LIMIT).default(RECOVERY_JOB_CLAIM_LIMIT),
  })
  .strict()
  .refine((input) => input.leaseExpiredBefore.getTime() <= input.now.getTime(), {
    path: ['leaseExpiredBefore'],
    message: 'lease expiry cutoff cannot be later than the repository clock',
  });

const retrySchema = z
  .object({
    jobId: uuidSchema,
    workerId: uuidSchema,
    availableAt: z.date(),
    reason: reasonSchema,
    now: z.date(),
  })
  .strict()
  .refine((input) => input.availableAt.getTime() >= input.now.getTime(), {
    path: ['availableAt'],
    message: 'retry availability cannot precede the repository clock',
  });

const beginAttemptSchema = z
  .object({
    jobId: uuidSchema,
    workerId: uuidSchema,
    now: z.date(),
  })
  .strict();

const finishSchema = z
  .object({
    jobId: uuidSchema,
    workerId: uuidSchema,
    now: z.date(),
    reason: reasonSchema.optional(),
  })
  .strict();

const JOB_COLUMNS = `
  id, job_type, organization_id,
  address_ciphertext, address_iv, address_tag, address_key_id,
  interaction_uid, idempotency_digest, status, available_at,
  claimed_at, claimed_by, attempt_count, last_failure_reason,
  completed_at, created_at, updated_at
`;

const QUALIFIED_JOB_COLUMNS = `
  job.id, job.job_type, job.organization_id,
  job.address_ciphertext, job.address_iv, job.address_tag, job.address_key_id,
  job.interaction_uid, job.idempotency_digest, job.status, job.available_at,
  job.claimed_at, job.claimed_by, job.attempt_count, job.last_failure_reason,
  job.completed_at, job.created_at, job.updated_at
`;

/** Map one database row to the public repository model. */
function mapRecoveryJob(row: RecoveryJobRow): RecoveryJob {
  return {
    id: row.id,
    jobType: row.job_type,
    organizationId: row.organization_id,
    protectedAddress: {
      ciphertext: row.address_ciphertext,
      iv: row.address_iv,
      tag: row.address_tag,
      keyId: row.address_key_id,
    },
    interactionUid: row.interaction_uid,
    idempotencyDigest: row.idempotency_digest,
    status: row.status,
    availableAt: row.available_at,
    claimedAt: row.claimed_at,
    claimedBy: row.claimed_by,
    attemptCount: row.attempt_count,
    lastFailureReason: row.last_failure_reason,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a durable recovery-job repository.
 *
 * Passing a transaction client keeps enqueue operations composable with a request-owned
 * transaction. Omitting the argument uses Porta's connected application pool.
 *
 * @param database - PostgreSQL pool or transaction client.
 * @returns Typed repository for durable recovery work.
 */
export function createRecoveryJobRepository(
  database: RecoveryJobDatabase = getPool(),
): RecoveryJobRepository {
  return new RecoveryJobRepository(database);
}

/** PostgreSQL implementation of durable recovery-work transitions. */
export class RecoveryJobRepository {
  /** Query boundary used by every repository operation. */
  protected readonly database: RecoveryJobDatabase;

  /**
   * Create a repository over a pool or existing transaction.
   *
   * @param database - Parameterized PostgreSQL query boundary.
   */
  public constructor(database: RecoveryJobDatabase) {
    this.database = database;
  }

  /**
   * Insert one durable job or return the existing idempotency match.
   *
   * @param input - Protected tenant-bound recovery request.
   * @returns Durable row and whether this invocation inserted it.
   */
  public async enqueue(input: EnqueueRecoveryJobInput): Promise<EnqueueRecoveryJobResult> {
    const parsed = enqueueSchema.parse(input);
    const result = await this.database.query<RecoveryJobRow>(
      `INSERT INTO auth_recovery_jobs (
         job_type, organization_id,
         address_ciphertext, address_iv, address_tag, address_key_id,
         interaction_uid, idempotency_digest, available_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, job_type, idempotency_digest) DO NOTHING
       RETURNING ${JOB_COLUMNS}`,
      [
        parsed.jobType,
        parsed.organizationId,
        parsed.protectedAddress.ciphertext,
        parsed.protectedAddress.iv,
        parsed.protectedAddress.tag,
        parsed.protectedAddress.keyId,
        parsed.interactionUid,
        parsed.idempotencyDigest,
        parsed.availableAt,
      ],
    );

    if (result.rows[0]) {
      return { job: mapRecoveryJob(result.rows[0]), inserted: true };
    }

    const existing = await this.database.query<RecoveryJobRow>(
      `SELECT ${JOB_COLUMNS}
       FROM auth_recovery_jobs
       WHERE organization_id = $1
         AND job_type = $2
         AND idempotency_digest = $3`,
      [parsed.organizationId, parsed.jobType, parsed.idempotencyDigest],
    );

    if (!existing.rows[0]) {
      throw new Error('Recovery job idempotency row disappeared after insert conflict');
    }

    return { job: mapRecoveryJob(existing.rows[0]), inserted: false };
  }

  /**
   * Atomically lease a bounded batch of available or lease-expired jobs.
   *
   * Leasing does not charge a processing attempt. The worker starts each attempt separately, just
   * before invoking account-specific work, so a crash while walking a batch cannot consume the
   * retry budget of jobs it never started.
   *
   * @param input - Worker identity, clock, lease cutoff, and optional bound.
   * @returns Claimed rows with an explicit fresh, reclaimed, or exhausted-lease disposition.
   */
  public async claimAvailable(
    input: ClaimRecoveryJobsInput,
  ): Promise<readonly ClaimedRecoveryJob[]> {
    const parsed = claimSchema.parse(input);
    const result = await this.database.query<ClaimedRecoveryJobRow>(
      `WITH candidates AS (
         SELECT id, status AS previous_status, attempt_count AS previous_attempt_count
         FROM auth_recovery_jobs
         WHERE (status = 'available' AND available_at <= $1 AND attempt_count < $5)
            OR (status = 'claimed' AND claimed_at <= $2 AND attempt_count <= $5)
         ORDER BY COALESCE(claimed_at, available_at), created_at, id
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE auth_recovery_jobs AS job
       SET status = 'claimed',
           claimed_at = $1,
           claimed_by = $4,
           last_failure_reason = NULL,
           completed_at = NULL,
           updated_at = $1
       FROM candidates
       WHERE job.id = candidates.id
       RETURNING ${QUALIFIED_JOB_COLUMNS},
         CASE
           WHEN candidates.previous_status = 'available' THEN 'available'
           WHEN candidates.previous_attempt_count >= $5 THEN 'lease_exhausted'
           ELSE 'lease_reclaimed'
         END AS claim_disposition`,
      [
        parsed.now,
        parsed.leaseExpiredBefore,
        parsed.limit,
        parsed.workerId,
        RECOVERY_JOB_ATTEMPT_LIMIT,
      ],
    );

    return result.rows.map((row) => ({
      ...mapRecoveryJob(row),
      claimDisposition: row.claim_disposition,
    }));
  }

  /**
   * Charge one processing attempt immediately before an owned job is processed.
   *
   * @param input - Owned job identity and repository clock.
   * @returns The updated claimed row, or null when ownership was lost or the budget is exhausted.
   */
  public async beginAttempt(input: BeginRecoveryJobAttemptInput): Promise<RecoveryJob | null> {
    const parsed = beginAttemptSchema.parse(input);
    const result = await this.database.query<RecoveryJobRow>(
      `UPDATE auth_recovery_jobs
       SET attempt_count = attempt_count + 1,
           updated_at = $3
       WHERE id = $1
         AND claimed_by = $2
         AND status = 'claimed'
         AND attempt_count < $4
       RETURNING ${JOB_COLUMNS}`,
      [parsed.jobId, parsed.workerId, parsed.now, RECOVERY_JOB_ATTEMPT_LIMIT],
    );

    return result.rows[0] ? mapRecoveryJob(result.rows[0]) : null;
  }

  /**
   * Return an owned claim to the queue after a transient failure.
   *
   * @param input - Owned job, retry time, closed reason, and repository clock.
   * @returns True only when the caller still owned the claim.
   */
  public async scheduleRetry(input: RetryRecoveryJobInput): Promise<boolean> {
    const parsed = retrySchema.parse(input);
    const result = await this.database.query(
      `UPDATE auth_recovery_jobs
       SET status = 'available',
           available_at = $3,
           claimed_at = NULL,
           claimed_by = NULL,
           last_failure_reason = $4,
           updated_at = $5
       WHERE id = $1
         AND claimed_by = $2
         AND status = 'claimed'
         AND attempt_count < $6`,
      [
        parsed.jobId,
        parsed.workerId,
        parsed.availableAt,
        parsed.reason,
        parsed.now,
        RECOVERY_JOB_ATTEMPT_LIMIT,
      ],
    );

    return result.rowCount === 1;
  }

  /**
   * Mark an owned claim complete after its external effects settle.
   *
   * @param input - Owned job and repository clock; reason must be omitted.
   * @returns True only when the caller still owned the claim.
   */
  public async markCompleted(input: FinishRecoveryJobInput): Promise<boolean> {
    const parsed = finishSchema.parse(input);
    if (parsed.reason !== undefined) {
      throw new Error('Completed recovery jobs cannot carry a failure reason');
    }

    const result = await this.database.query(
      `UPDATE auth_recovery_jobs
       SET status = 'completed',
           claimed_at = NULL,
           claimed_by = NULL,
           last_failure_reason = NULL,
           completed_at = $3,
           updated_at = $3
       WHERE id = $1
         AND claimed_by = $2
         AND status = 'claimed'`,
      [parsed.jobId, parsed.workerId, parsed.now],
    );

    return result.rowCount === 1;
  }

  /**
   * Mark an owned claim terminally failed with a closed privacy-safe reason.
   *
   * @param input - Owned job, repository clock, and required closed reason.
   * @returns True only when the caller still owned the claim.
   */
  public async markTerminalFailure(input: FinishRecoveryJobInput): Promise<boolean> {
    const parsed = finishSchema.extend({ reason: reasonSchema }).parse(input);
    const result = await this.database.query(
      `UPDATE auth_recovery_jobs
       SET status = 'terminal_failure',
           claimed_at = NULL,
           claimed_by = NULL,
           last_failure_reason = $3,
           completed_at = $4,
           updated_at = $4
       WHERE id = $1
         AND claimed_by = $2
         AND status = 'claimed'`,
      [parsed.jobId, parsed.workerId, parsed.reason, parsed.now],
    );

    return result.rowCount === 1;
  }
}

/** PostgreSQL clients accepted by the repository factory. */
export type RecoveryJobPostgresClient = Pool | PoolClient;
