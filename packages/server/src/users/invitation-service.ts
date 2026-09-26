/**
 * Invitation acceptance service.
 *
 * Owns the one transaction that turns a deferred invitation into a real account. The invitation is
 * locked, re-checked, and consumed in the same transaction that inserts the user, so a token can be
 * used at most once and a concurrent double-submit cannot create two accounts.
 *
 * Pre-assignment application and route-level rejection auditing stay in the accept route; this
 * module only creates the account and consumes the invitation.
 */

import { getPool } from '../lib/database.js';
import { hashPassword, validatePassword } from './password.js';
import { UserValidationError } from './errors.js';
import { emailExistsWithClient, insertUserWithClient } from './repository.js';
import type { User } from './types.js';
import {
  consumeInvitation,
  lockValidInvitationForUpdate,
} from '../auth/token-repository.js';
import { cacheUser } from './cache.js';
import { writeAuditLog } from '../lib/audit-log.js';

/** Inputs required to accept an invitation. */
export interface AcceptInvitationInput {
  /** SHA-256 digest of the presented invitation token. */
  tokenHash: string;
  /** Organization resolved from the public route; the token's tenant authority. */
  organizationId: string;
  /** Plaintext password chosen by the invited person. */
  password: string;
}

/** Result of a successful acceptance. */
export interface AcceptedInvitation {
  /** Newly created account id. */
  userId: string;
  /** Invited address the account was created for. */
  email: string;
}

/**
 * Insert the invited account and consume its invitation in one transaction.
 *
 * @param input - Token digest, tenant, and the already-hashed password.
 * @returns The created user, or null for every invalid/expired/used/conflicting case.
 */
async function createUserForInvitation(input: {
  tokenHash: string;
  organizationId: string;
  passwordHash: string;
}): Promise<User | null> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Lock the invitation so concurrent acceptances serialize on this row.
    const invitation = await lockValidInvitationForUpdate(
      client,
      input.tokenHash,
      input.organizationId,
    );
    if (!invitation) {
      await client.query('ROLLBACK');
      return null;
    }

    // The address may have become a real account after the invite was sent.
    if (await emailExistsWithClient(client, input.organizationId, invitation.email)) {
      await client.query('ROLLBACK');
      return null;
    }

    const user = await insertUserWithClient(client, {
      organizationId: input.organizationId,
      email: invitation.email,
      passwordHash: input.passwordHash,
      emailVerified: true,
      givenName: invitation.givenName,
      familyName: invitation.familyName,
      locale: invitation.locale,
    });

    const consumed = await consumeInvitation(client, invitation.id, user.id);
    if (!consumed) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create the user for one valid invitation and consume it atomically.
 *
 * The password is validated and hashed before the transaction opens. After the transaction commits,
 * the new account is cached and a `user.created` audit event is written.
 *
 * @param input - Token digest, tenant, and the chosen plaintext password.
 * @returns The created user id and email, or null for every invalid/expired/used/conflicting case.
 * @throws UserValidationError when the password fails the project policy.
 */
export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<AcceptedInvitation | null> {
  const validation = validatePassword(input.password);
  if (!validation.isValid) {
    throw new UserValidationError(validation.error!);
  }
  const passwordHash = await hashPassword(input.password);

  const user = await createUserForInvitation({
    tokenHash: input.tokenHash,
    organizationId: input.organizationId,
    passwordHash,
  });
  if (!user) return null;

  await cacheUser(user);
  await writeAuditLog({
    organizationId: input.organizationId,
    userId: user.id,
    eventType: 'user.created',
    eventCategory: 'admin',
    metadata: { userId: user.id, email: user.email },
  });

  return { userId: user.id, email: user.email };
}
