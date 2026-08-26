/** Account-specific processing for durable recovery jobs. */

import { config } from '../config/index.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { getOrganizationById } from '../organizations/service.js';
import type { Organization } from '../organizations/types.js';
import { getUserByEmail } from '../users/service.js';
import type { User } from '../users/types.js';
import { sendRecoveryEmailStrict } from './email-service.js';
import { recoveryArtifactToken, revealRecoveryAddress } from './recovery-crypto.js';
import type { ClaimedRecoveryJob } from './recovery-job-repository.js';
import { ensureRecoveryJobToken } from './token-repository.js';
import { hashToken } from './tokens.js';
import {
  RecoveryJobProcessingError,
  type RecoveryJobProcessingResult,
  type RecoveryJobProcessor,
} from './recovery-worker.js';
import type { InteractionAuthorityResolver } from './interaction-authority.js';

/** Concrete tenant-scoped processor for magic-link and password-reset work. */
export class AccountRecoveryJobProcessor implements RecoveryJobProcessor {
  /**
   * Create a processor with the provider-owned interaction boundary used by magic-link work.
   *
   * @param interactionAuthority - Live interaction resolver. Password-reset jobs do not use it.
   */
  public constructor(protected readonly interactionAuthority?: InteractionAuthorityResolver) {}

  /** Resolve eligibility, create one artifact, and deliver its stable link. */
  public async process(job: ClaimedRecoveryJob): Promise<RecoveryJobProcessingResult> {
    let address: string;
    try {
      address = revealRecoveryAddress(job.protectedAddress, {
        organizationId: job.organizationId,
        jobType: job.jobType,
        interactionUid: job.interactionUid,
        idempotencyDigest: job.idempotencyDigest,
      });
    } catch {
      throw new RecoveryJobProcessingError('invalid_protected_input', false);
    }

    let organization: Organization | null;
    let user: User | null;
    try {
      organization = await getOrganizationById(job.organizationId);
      user = await getUserByEmail(job.organizationId, address);
    } catch {
      throw new RecoveryJobProcessingError('database_unavailable', true);
    }
    if (!organization || organization.status !== 'active' || !user || user.status !== 'active') {
      return 'no_op';
    }

    let plaintext: string;
    try {
      plaintext = recoveryArtifactToken(job.id, job.jobType, job.protectedAddress.keyId);
      const ttlSeconds = await getSystemConfigNumber(
        job.jobType === 'magic_link' ? 'magic_link_ttl' : 'password_reset_ttl',
        job.jobType === 'magic_link' ? 900 : 3_600,
      );
      const artifactInput = {
        recoveryJobId: job.id,
        userId: user.id,
        tokenHash: hashToken(plaintext),
        expiresAt: new Date(Date.now() + ttlSeconds * 1_000),
      };
      let artifact;
      if (job.jobType === 'magic_link') {
        const liveAuthority = job.interactionUid
          ? await this.interactionAuthority?.resolve(job.interactionUid)
          : null;
        if (job.interactionUid && !liveAuthority) return 'no_op';
        artifact = await ensureRecoveryJobToken({
          ...artifactInput,
          table: 'magic_link_tokens',
          organizationId: job.organizationId,
          interactionUid: job.interactionUid,
          clientId: liveAuthority?.clientId ?? null,
        });
      } else {
        artifact = await ensureRecoveryJobToken({
          ...artifactInput,
          table: 'password_reset_tokens',
        });
      }
      if (artifact === 'superseded') return 'no_op';
    } catch {
      throw new RecoveryJobProcessingError('database_unavailable', true);
    }

    const base = `${config.issuerBaseUrl}/${organization.slug}/auth`;
    const recoveryUrl =
      job.jobType === 'magic_link'
        ? `${base}/magic-link/${plaintext}${
            job.interactionUid ? `?interaction=${encodeURIComponent(job.interactionUid)}` : ''
          }`
        : `${base}/reset-password/${plaintext}`;
    try {
      await sendRecoveryEmailStrict({
        type: job.jobType,
        user,
        organization,
        recoveryUrl,
        locale: user.locale ?? organization.defaultLocale,
        messageId: `<recovery-${job.id}@porta.invalid>`,
      });
    } catch {
      throw new RecoveryJobProcessingError('smtp_outcome_unknown', true);
    }

    void writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      eventType:
        job.jobType === 'magic_link' ? 'user.magic_link.sent' : 'user.password_reset.requested',
      eventCategory: 'authentication',
      description: 'Recovery message accepted for delivery',
      metadata: { recoveryType: job.jobType },
    });
    return 'completed';
  }
}

/**
 * Create the production account-recovery processor.
 *
 * @param interactionAuthority - Live provider authority for interaction-bound magic links.
 * @returns The account-independent processor used by the durable worker.
 */
export function createAccountRecoveryJobProcessor(
  interactionAuthority?: InteractionAuthorityResolver,
): RecoveryJobProcessor {
  return new AccountRecoveryJobProcessor(interactionAuthority);
}
