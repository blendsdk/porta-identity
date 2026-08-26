import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import { AccountRecoveryJobProcessor } from '../../../src/auth/recovery-job-processor.js';
import {
  createRecoveryJobRepository,
  RECOVERY_JOB_ATTEMPT_LIMIT,
} from '../../../src/auth/recovery-job-repository.js';
import { ensureRecoveryJobToken } from '../../../src/auth/token-repository.js';
import { enqueueAccountRecovery } from '../../../src/auth/recovery-service.js';
import { RecoveryJobProcessingError, RecoveryWorker } from '../../../src/auth/recovery-worker.js';
import { getPool } from '../../../src/lib/database.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';

const WORKER_ONE = '00000000-0000-4000-8000-000000000811';
const WORKER_TWO = '00000000-0000-4000-8000-000000000812';
const mailhog = new MailHogClient();

/** Product worker exposing one normal cycle to integration tests. */
class TestRecoveryWorker extends RecoveryWorker {
  /** Execute one bounded claim/process cycle. */
  public executeOnce(): Promise<void> {
    return this.runCycle();
  }
}

/** Insert one protected recovery job with an explicit ordering time. */
async function insertRecoveryJob(organizationId: string, createdAt: Date): Promise<string> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO auth_recovery_jobs (
       id, job_type, organization_id,
       address_ciphertext, address_iv, address_tag, address_key_id,
       interaction_uid, idempotency_digest, available_at, created_at, updated_at
     ) VALUES ($1, 'password_reset', $2, 'protected', 'protected', 'protected',
               'key00001', NULL, $3, $4, $4, $4)`,
    [id, organizationId, id.replaceAll('-', '').padEnd(64, '0').slice(0, 64), createdAt],
  );
  return id;
}

describe('recovery concurrency', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await mailhog.clearAll();
    setEmailTransport(createSmtpTransport());
  });

  afterAll(() => setEmailTransport(null));

  it('serializes concurrent artifacts and prevents an older retry from replacing the newest', async () => {
    const organization = await createTestOrganization();
    const user = await createTestUser(organization.id);
    const olderJob = await insertRecoveryJob(organization.id, new Date('2026-08-21T12:00:00.000Z'));
    const newerJob = await insertRecoveryJob(organization.id, new Date('2026-08-21T12:00:01.000Z'));

    await Promise.all([
      ensureRecoveryJobToken({
        table: 'password_reset_tokens',
        recoveryJobId: olderJob,
        userId: user.id,
        tokenHash: 'older-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      ensureRecoveryJobToken({
        table: 'password_reset_tokens',
        recoveryJobId: newerJob,
        userId: user.id,
        tokenHash: 'newer-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ]);

    const active = await getPool().query<{ recovery_job_id: string }>(
      `SELECT recovery_job_id
       FROM password_reset_tokens
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [user.id],
    );
    expect(active.rows).toStrictEqual([{ recovery_job_id: newerJob }]);

    await expect(
      ensureRecoveryJobToken({
        table: 'password_reset_tokens',
        recoveryJobId: olderJob,
        userId: user.id,
        tokenHash: 'older-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toBe('superseded');
  });

  it.each(['consumed', 'expired'] as const)(
    'keeps an older pre-artifact retry superseded after newer authority is %s',
    async (newerState) => {
      const organization = await createTestOrganization();
      const user = await createTestUser(organization.id);
      const olderJob = await insertRecoveryJob(
        organization.id,
        new Date('2026-08-21T12:00:00.000Z'),
      );
      const newerJob = await insertRecoveryJob(
        organization.id,
        new Date('2026-08-21T12:00:01.000Z'),
      );

      await expect(
        ensureRecoveryJobToken({
          table: 'password_reset_tokens',
          recoveryJobId: newerJob,
          userId: user.id,
          tokenHash: `newer-${newerState}-token-hash`,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ).resolves.toBe('active');
      await getPool().query(
        newerState === 'consumed'
          ? `UPDATE password_reset_tokens
             SET used_at = NOW()
             WHERE recovery_job_id = $1`
          : `UPDATE password_reset_tokens
             SET expires_at = NOW() - INTERVAL '1 second'
             WHERE recovery_job_id = $1`,
        [newerJob],
      );

      await expect(
        ensureRecoveryJobToken({
          table: 'password_reset_tokens',
          recoveryJobId: olderJob,
          userId: user.id,
          tokenHash: 'older-delayed-token-hash',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ).resolves.toBe('superseded');
      const olderArtifacts = await getPool().query(
        'SELECT 1 FROM password_reset_tokens WHERE recovery_job_id = $1',
        [olderJob],
      );
      expect(olderArtifacts.rowCount).toBe(0);
    },
  );

  it('does not charge leased batch members until each job actually starts processing', async () => {
    const organization = await createTestOrganization();
    const firstJob = await insertRecoveryJob(organization.id, new Date());
    const secondJob = await insertRecoveryJob(organization.id, new Date());
    const repository = createRecoveryJobRepository();
    const claimedAt = new Date();

    const firstClaim = await repository.claimAvailable({
      workerId: WORKER_ONE,
      now: claimedAt,
      leaseExpiredBefore: new Date(claimedAt.getTime() - 300_000),
      limit: 25,
    });
    expect(firstClaim.map((job) => job.attemptCount)).toStrictEqual([0, 0]);

    const reclaimedAt = new Date(claimedAt.getTime() + 300_001);
    const reclaimed = await repository.claimAvailable({
      workerId: WORKER_TWO,
      now: reclaimedAt,
      leaseExpiredBefore: new Date(reclaimedAt.getTime() - 300_000),
      limit: 25,
    });
    expect(reclaimed.map((job) => job.claimDisposition)).toStrictEqual([
      'lease_reclaimed',
      'lease_reclaimed',
    ]);

    await expect(
      repository.beginAttempt({ jobId: firstJob, workerId: WORKER_TWO, now: reclaimedAt }),
    ).resolves.toMatchObject({ attemptCount: 1 });
    const attempts = await getPool().query<{ id: string; attempt_count: number }>(
      `SELECT id, attempt_count
       FROM auth_recovery_jobs
       WHERE id = ANY($1::uuid[])
       ORDER BY id`,
      [[firstJob, secondJob]],
    );
    expect(attempts.rows).toContainEqual({ id: firstJob, attempt_count: 1 });
    expect(attempts.rows).toContainEqual({ id: secondJob, attempt_count: 0 });
    expect(attempts.rows.every((row) => row.attempt_count <= RECOVERY_JOB_ATTEMPT_LIMIT)).toBe(
      true,
    );
  });

  it('retries an unknown SMTP outcome with the same single active artifact', async () => {
    const organization = await createTestOrganization();
    const user = await createTestUser(organization.id, {
      email: `recovery-${randomUUID()}@test.example.com`,
    });
    const enqueued = await enqueueAccountRecovery({
      jobType: 'password_reset',
      organizationId: organization.id,
      email: user.email,
      interactionUid: null,
      actionNonce: randomUUID(),
    });
    let now = new Date();
    let firstAttempt = true;
    const processor = new AccountRecoveryJobProcessor();
    const worker = new TestRecoveryWorker({
      repository: createRecoveryJobRepository(),
      workerId: WORKER_ONE,
      clock: { now: () => now, setTimeout, clearTimeout },
      processor: {
        process: async (job) => {
          const result = await processor.process(job);
          if (firstAttempt) {
            firstAttempt = false;
            throw new RecoveryJobProcessingError('smtp_outcome_unknown', true);
          }
          return result;
        },
      },
    });

    await worker.executeOnce();
    now = new Date(now.getTime() + 1_001);
    await worker.executeOnce();

    const messages = (await mailhog.getMessages()).filter((message) =>
      message.to.includes(user.email),
    );
    expect(messages).toHaveLength(2);
    const identities = messages.map((message) => {
      const link = `${message.body}\n${message.html}`.match(
        /https?:\/\/[^\s"<]+\/reset-password\/[^\s"<]+/,
      )?.[0];
      expect(link).toBeTruthy();
      return createHash('sha256').update(link!).digest('hex');
    });
    expect(new Set(identities).size).toBe(1);

    const active = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM password_reset_tokens
       WHERE recovery_job_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [enqueued.job.id],
    );
    expect(active.rows[0]?.count).toBe('1');
  });
});
