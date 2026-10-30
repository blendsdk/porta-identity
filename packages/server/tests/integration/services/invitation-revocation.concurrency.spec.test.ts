/** Real row-lock ordering determines invitation authority; arrival time does not. */
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { replaceInvitation } from '../../../src/auth/token-repository.js';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  acceptFixture, createInvitationBoundary, createRevocationInvitation, invitationSnapshot,
  recipientCount, revocationAudits, revokeFixture,
} from '../helpers/invitation-revocation.js';

/** Require PostgreSQL to identify the winning transaction as a blocker of the loser. */
async function observeBlocking(winnerPid: number, loserPid: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await getPool().query<{ blocked: boolean }>(
      `SELECT wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(pid)) AS blocked
       FROM pg_stat_activity WHERE pid = $2`, [winnerPid, loserPid],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Did not observe the competing invitation transaction blocked by the winner');
}

/**
 * Hold a completed real mutation before commit, then prove the competing mutation waits on it.
 * Both operations finish normally only after the observation; all gates release on failure.
 */
async function inCommitOrder<First, Second>(
  first: () => Promise<First>, second: () => Promise<Second>,
): Promise<[First, Second]> {
  const held = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const secondBackend = Promise.withResolvers<number>();
  const operation = new AsyncLocalStorage<'winner' | 'loser'>();
  const pool = getPool();
  const originalConnect = pool.connect;
  const originalQueries = new Map<PoolClient, PoolClient['query']>();

  // Instrument only explicitly acquired transaction connections. SQL and its
  // results remain real; the winning transaction pauses just before COMMIT.
  // Acceptance owns its own connection, so an outer transaction is not proof
  // that its actual account-creation transaction is blocked or uncommitted.
  pool.connect = new Proxy(originalConnect, {
    apply(target, receiver, args) {
      const label = operation.getStore();
      const connection = Reflect.apply(target, receiver, args);
      if (!label || args.length !== 0) return connection;
      return Promise.resolve(connection).then((client: PoolClient) => {
        const original = originalQueries.get(client) ?? client.query;
        originalQueries.set(client, original);
        let pid: number | undefined;
        client.query = new Proxy(original, {
          apply(query, queryReceiver, queryArgs) {
            const command = queryArgs[0];
            if (command === 'BEGIN') {
              return client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid').then((result) => {
                pid = result.rows[0]!.pid;
                if (label === 'loser') secondBackend.resolve(pid);
                return Reflect.apply(query, queryReceiver, queryArgs);
              });
            }
            if (command === 'COMMIT' && label === 'winner') {
              if (pid === undefined) throw new Error('Winning transaction backend was not captured');
              held.resolve(pid);
              return release.promise.then(() => Reflect.apply(query, queryReceiver, queryArgs));
            }
            return Reflect.apply(query, queryReceiver, queryArgs);
          },
        });
        return client;
      });
    },
  });

  const winner = operation.run('winner', first);
  let loser: Promise<Second> | undefined;
  try {
    const winnerPid = await Promise.race([held.promise, winner.then(() => {
      throw new Error('Winning transaction ended before its commit barrier');
    })]);
    loser = operation.run('loser', second);
    const loserPid = await Promise.race([secondBackend.promise, loser.then(() => {
      throw new Error('Competing transaction ended before its backend was captured');
    })]);
    await observeBlocking(winnerPid, loserPid);
    release.resolve();
    return await Promise.all([winner, loser]);
  } finally {
    release.resolve();
    await Promise.allSettled(loser ? [winner, loser] : [winner]);
    pool.connect = originalConnect;
    for (const [client, query] of originalQueries) client.query = query;
  }
}

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();
});

describe('invitation mutation ordering', () => {
  it('serializes duplicate revocations into one durable transition and one event', async () => {
    const boundary = await createInvitationBoundary();
    const invitation = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const before = await invitationSnapshot(invitation.id);
    let firstTransition: Awaited<ReturnType<typeof invitationSnapshot>>;
    const results = await inCommitOrder(
      async () => {
        await revokeFixture(boundary, invitation.id);
        firstTransition = await invitationSnapshot(invitation.id);
      },
      () => revokeFixture(boundary, invitation.id),
    );
    expect(results).toEqual([undefined, undefined]);
    const after = await invitationSnapshot(invitation.id);
    expect(after?.used_at).toEqual(expect.any(String));
    expect(after).toEqual({ ...before, used_at: after?.used_at });
    expect(after).toEqual(firstTransition);
    expect((await revocationAudits(boundary.organizationId)).rows).toHaveLength(1);
    expect(await acceptFixture(invitation)).toBeNull();
    expect(await recipientCount(invitation)).toBe(0);
  });

  it('rejects overlapping real acceptance when revocation holds the first committed row lock', async () => {
    const boundary = await createInvitationBoundary();
    const invitation = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const results = await inCommitOrder(
      () => revokeFixture(boundary, invitation.id), () => acceptFixture(invitation),
    );
    expect(results).toEqual([undefined, null]);
    expect(await recipientCount(invitation)).toBe(0);
    expect(await invitationSnapshot(invitation.id)).toMatchObject({ user_id: null, used_at: expect.any(String) });
    expect((await revocationAudits(boundary.organizationId)).rows).toHaveLength(1);
  });

  it('preserves real acceptance when it holds the first committed row lock', async () => {
    const boundary = await createInvitationBoundary();
    const invitation = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const [accepted, revoked] = await inCommitOrder(
      () => acceptFixture(invitation), () => revokeFixture(boundary, invitation.id),
    );
    expect(accepted).toEqual({ userId: expect.any(String), email: invitation.email });
    expect(revoked).toBeUndefined();
    expect(await recipientCount(invitation)).toBe(1);
    expect(await invitationSnapshot(invitation.id)).toMatchObject({
      user_id: accepted!.userId, used_at: expect.any(String),
    });
    expect((await revocationAudits(boundary.organizationId)).rows).toEqual([]);
  });

  it('does not let an old invitation id revoke an already committed replacement', async () => {
    const boundary = await createInvitationBoundary();
    const old = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const tokenHash = randomBytes(32).toString('hex');
    const replacement = await replaceInvitation({
      ...boundary, email: old.email, tokenHash, expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(replacement.id).not.toBe(old.id);
    const before = await invitationSnapshot(replacement.id);
    await expect(revokeFixture(boundary, old.id)).resolves.toBeUndefined();
    expect(await invitationSnapshot(replacement.id)).toEqual(before);
    expect((await revocationAudits(boundary.organizationId)).rows).toEqual([]);
    expect(await acceptFixture({ ...old, tokenHash })).toEqual({
      userId: expect.any(String), email: old.email,
    });
    expect(await acceptFixture(old)).toBeNull();
    expect(await recipientCount(old)).toBe(1);
  });

  it.each(['replacement first', 'revocation first'])(
    'keeps the replacement usable during an overlapping old-id revoke with %s', async (order) => {
      const boundary = await createInvitationBoundary();
      const old = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
      const tokenHash = randomBytes(32).toString('hex');
      const replace = () => replaceInvitation({
        ...boundary, email: old.email, tokenHash, expiresAt: new Date(Date.now() + 86_400_000),
      });
      if (order === 'replacement first') {
        await inCommitOrder(replace, () => revokeFixture(boundary, old.id));
      } else {
        await inCommitOrder(() => revokeFixture(boundary, old.id), replace);
      }
      const live = await getPool().query<{ id: string; application_id: string }>(
        `SELECT id, application_id FROM invitation_tokens WHERE organization_id = $1
         AND email = $2 AND used_at IS NULL`, [boundary.organizationId, old.email],
      );
      expect(live.rows).toEqual([{ id: expect.any(String), application_id: boundary.applicationId }]);
      expect(live.rows[0]!.id).not.toBe(old.id);
      const before = await invitationSnapshot(live.rows[0]!.id);
      await expect(revokeFixture(boundary, old.id)).resolves.toBeUndefined();
      expect(await invitationSnapshot(live.rows[0]!.id)).toEqual(before);
      expect((await revocationAudits(boundary.organizationId)).rows)
        .toHaveLength(order === 'revocation first' ? 1 : 0);
      expect(await acceptFixture({ ...old, tokenHash })).toEqual({
        userId: expect.any(String), email: old.email,
      });
      expect(await acceptFixture(old)).toBeNull();
      expect(await recipientCount(old)).toBe(1);
    },
  );
});
