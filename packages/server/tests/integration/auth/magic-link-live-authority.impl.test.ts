import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createSmtpTransport } from '../../../src/auth/email-transport.js';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import { AccountRecoveryJobProcessor } from '../../../src/auth/recovery-job-processor.js';
import { createRecoveryJobRepository } from '../../../src/auth/recovery-job-repository.js';
import { enqueueAccountRecovery } from '../../../src/auth/recovery-service.js';
import { hashToken } from '../../../src/auth/tokens.js';
import { getPool } from '../../../src/lib/database.js';
import { MailHogClient } from '../../e2e/helpers/mailhog.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';

const mailhog = new MailHogClient();

/**
 * Claim and start the exact recovery job created by one test request.
 *
 * @param jobId - Durable job UUID returned by the public enqueue boundary.
 * @returns The exact owned claim after its attempt counter starts.
 */
async function claimRecoveryJob(jobId: string) {
  const repository = createRecoveryJobRepository();
  const workerId = randomUUID();
  const now = new Date();
  const jobs = await repository.claimAvailable({
    workerId,
    now,
    leaseExpiredBefore: new Date(now.getTime() - 300_000),
  });
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error('Expected recovery job was not claimed');
  const started = await repository.beginAttempt({ jobId, workerId, now });
  if (!started) throw new Error('Expected recovery job attempt was not started');
  return { ...job, ...started, claimDisposition: job.claimDisposition };
}

describe('magic-link live issuance authority', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await mailhog.clearAll();
    setEmailTransport(createSmtpTransport());
  });

  afterAll(() => setEmailTransport(null));

  it.each(['missing', 'foreign-client'] as const)(
    'preserves existing authority when the live interaction is %s',
    async (authorityState) => {
      const alpha = await createTestOrganization({ name: 'Magic Alpha' });
      const bravo = await createTestOrganization({ name: 'Magic Bravo' });
      const application = await createTestApplication();
      await createTestClient(alpha.id, application.id);
      const bravoClient = await createTestClient(bravo.id, application.id);
      const user = await createTestUser(alpha.id, {
        email: `magic-${randomUUID()}@test.example.com`,
      });
      await getPool().query(
        `INSERT INTO magic_link_tokens
           (user_id, token_hash, expires_at, organization_id, interaction_uid, authority_bound)
         VALUES ($1, $2, NOW() + INTERVAL '15 minutes', $3, $4, TRUE)`,
        [user.id, hashToken(randomUUID()), alpha.id, 'existing-interaction'],
      );
      const requestedInteraction = `requested-${randomUUID()}`;
      const enqueued = await enqueueAccountRecovery({
        jobType: 'magic_link',
        organizationId: alpha.id,
        email: user.email,
        interactionUid: requestedInteraction,
        actionNonce: randomUUID(),
      });
      const job = await claimRecoveryJob(enqueued.job.id);
      const processor = new AccountRecoveryJobProcessor({
        resolve: async () =>
          authorityState === 'missing'
            ? null
            : { interactionUid: requestedInteraction, clientId: bravoClient.clientId },
      });

      await expect(processor.process(job)).resolves.toBe('no_op');
      const artifacts = await getPool().query<{ used_at: Date | null }>(
        `SELECT used_at FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at`,
        [user.id],
      );
      expect(artifacts.rows).toStrictEqual([{ used_at: null }]);
      expect(await mailhog.getMessages()).toHaveLength(0);
    },
  );

  it('creates and delivers authority when the current client belongs to the route tenant', async () => {
    const alpha = await createTestOrganization({ name: 'Magic Alpha' });
    const application = await createTestApplication();
    const alphaClient = await createTestClient(alpha.id, application.id);
    const user = await createTestUser(alpha.id, {
      email: `magic-${randomUUID()}@test.example.com`,
    });
    const interactionUid = `requested-${randomUUID()}`;
    const enqueued = await enqueueAccountRecovery({
      jobType: 'magic_link',
      organizationId: alpha.id,
      email: user.email,
      interactionUid,
      actionNonce: randomUUID(),
    });
    const job = await claimRecoveryJob(enqueued.job.id);
    const processor = new AccountRecoveryJobProcessor({
      resolve: async () => ({ interactionUid, clientId: alphaClient.clientId }),
    });

    await expect(processor.process(job)).resolves.toBe('completed');
    const artifact = await getPool().query<{ interaction_uid: string }>(
      `SELECT interaction_uid FROM magic_link_tokens WHERE recovery_job_id = $1`,
      [job.id],
    );
    expect(artifact.rows).toStrictEqual([{ interaction_uid: interactionUid }]);
    expect(
      (await mailhog.getMessages()).filter((message) => message.to.includes(user.email)),
    ).toHaveLength(1);
  });
});
