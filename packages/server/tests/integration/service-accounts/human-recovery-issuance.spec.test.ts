/** Recovery workers and artifact issuance must recheck classification rather than cached users. */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  hashToken,
  initI18n,
  initTemplateEngine,
  setEmailTransport,
} from '../../../src/auth/index.js';
import { AccountRecoveryJobProcessor } from '../../../src/auth/recovery-job-processor.js';
import {
  ensureRecoveryJobToken,
  findValidToken,
  findValidTokenForOrganization,
} from '../../../src/auth/token-repository.js';
import { getUserByEmail, getUserById } from '../../../src/users/index.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestUserWithPassword } from '../helpers/factories.js';
import {
  HUMAN_RECOVERY_KINDS,
  claimHumanRecovery,
  classifyFixtureUser,
  controlPlaneOrganizationId,
  enqueueHumanRecovery,
  humanFixturePassword,
  humanSessionCounts,
  humanUserFingerprint,
  resetHumanFixtures,
  usableHumanRecoveryArtifacts,
} from './human-fixtures.js';

describe('Recovery issuance excludes permanently classified accounts', () => {
  let deliveredMessages = 0;

  beforeAll(async () => {
    await initI18n();
    await initTemplateEngine();
  });

  beforeEach(async () => {
    await resetHumanFixtures();
    deliveredMessages = 0;
    // Only delivery is external; account lookup, queue claiming and token persistence stay real.
    setEmailTransport({
      send: async (options) => {
        deliveredMessages += 1;
        return { messageId: randomUUID(), accepted: [options.to], rejected: [] };
      },
    });
  });

  afterEach(async () => {
    setEmailTransport(null);
    await truncateAllTables();
  });

  it.each(HUMAN_RECOVERY_KINDS)(
    'should leave %s undelivered and unusable when a queued human request predates classification',
    async (jobType) => {
      const organizationId = await controlPlaneOrganizationId();
      const { user } = await createTestUserWithPassword(organizationId, humanFixturePassword());
      const queued = await enqueueHumanRecovery(organizationId, user.email, jobType);
      expect((await getUserById(user.id))?.id).toBe(user.id);
      expect((await getUserByEmail(organizationId, user.email))?.id).toBe(user.id);
      await classifyFixtureUser(user.id);
      const before = await humanUserFingerprint(user.id);
      const claimed = await claimHumanRecovery(queued.id);

      expect(await new AccountRecoveryJobProcessor().process(claimed)).toBe('no_op');

      expect(deliveredMessages).toBe(0);
      expect(await usableHumanRecoveryArtifacts(user.id)).toBe(0);
      expect(await humanUserFingerprint(user.id)).toBe(before);
      expect(await humanSessionCounts(user.id)).toEqual({ oidc: 0, admin: 0 });
    },
  );

  it.each(HUMAN_RECOVERY_KINDS)(
    'should refuse active %s artifacts when the classified account reaches the real token writer',
    async (jobType) => {
      const organizationId = await controlPlaneOrganizationId();
      const { user } = await createTestUserWithPassword(organizationId, humanFixturePassword());
      await classifyFixtureUser(user.id);
      const queued = await enqueueHumanRecovery(organizationId, user.email, jobType);
      await claimHumanRecovery(queued.id);
      const tokenHash = hashToken(randomBytes(32).toString('base64url'));
      const common = {
        recoveryJobId: queued.id,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      };
      const outcome =
        jobType === 'magic_link'
          ? await ensureRecoveryJobToken({
              ...common,
              table: 'magic_link_tokens',
              organizationId,
              interactionUid: null,
              clientId: null,
            })
          : await ensureRecoveryJobToken({ ...common, table: 'password_reset_tokens' });
      const table = jobType === 'magic_link' ? 'magic_link_tokens' : 'password_reset_tokens';

      expect(outcome).toBe('superseded');
      expect(Boolean(await findValidToken(table, tokenHash))).toBe(false);
      expect(Boolean(await findValidTokenForOrganization(table, tokenHash, organizationId))).toBe(
        false,
      );
      expect(await usableHumanRecoveryArtifacts(user.id)).toBe(0);
      expect(deliveredMessages).toBe(0);
    },
  );

  it.each(HUMAN_RECOVERY_KINDS)(
    'should retain real %s issuance and delivery when the queued account remains human',
    async (jobType) => {
      const organizationId = await controlPlaneOrganizationId();
      const { user } = await createTestUserWithPassword(organizationId, humanFixturePassword());
      const queued = await enqueueHumanRecovery(organizationId, user.email, jobType);
      const claimed = await claimHumanRecovery(queued.id);

      expect(await new AccountRecoveryJobProcessor().process(claimed)).toBe('completed');

      expect(deliveredMessages).toBe(1);
      expect(await usableHumanRecoveryArtifacts(user.id)).toBe(1);
    },
  );
});
