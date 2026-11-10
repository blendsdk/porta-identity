import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import type { ClientRequest } from 'node:http';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { getServiceAccount, revokeServiceAccount } from '../../../src/service-accounts/index.js';
import { holdLifecycleWork, waitForLifecycleParentBlock } from './lifecycle-concurrency-fixtures.js';
import {
  createMachineHttpFixture, issueMachineToken, machineTokenValue,
  readMachineInvitation, readMachineUserCount,
} from './machine-http-fixtures.js';

/** A real request whose body remains incomplete until the test observes initial authentication. */
interface PartialUpload {
  /** Actual loopback request, destroyed on every failed interleaving. */
  readonly request: ClientRequest;
  /** Final HTTP status; credential-bearing request objects never appear in errors. */
  readonly result: Promise<number>;
  /** Remaining JSON bytes, held only in memory. */
  readonly remainder: string;
}

/** Send headers and partial JSON, without introducing an application hook or fabricated identity. */
function beginUpload(url: string, token: string, email: string): PartialUpload {
  const body = JSON.stringify({ email });
  let send: ClientRequest | undefined;
  const result = new Promise<number>((resolve, reject) => {
    send = request(url, { method: 'POST', headers: { authorization: `Bearer ${token}`,
      'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
      response.on('error', () => reject(new Error('Upload response failed')));
    });
    send.on('error', () => reject(new Error('Upload request failed')));
    send.flushHeaders();
    send.write(body.slice(0, 1));
  });
  // Attach immediately, including for an early setup failure before the caller awaits the result.
  void result.catch(() => {});
  if (!send) throw new Error('Upload request was not created');
  return { request: send, result, remainder: body.slice(1) };
}

/** Read the exact backend waiting on the held parent, not an elapsed-time approximation. */
async function blockedBackend(blockerPid: number): Promise<number> {
  await waitForLifecycleParentBlock(blockerPid);
  const found = await getPool().query<{ pid: number }>(
    `SELECT pid FROM pg_stat_activity WHERE query = $1 AND wait_event_type = 'Lock'
       AND $2::integer = ANY(pg_blocking_pids(pid))`,
    ['SELECT id FROM clients WHERE id = $1 FOR UPDATE', blockerPid],
  );
  const pid = found.rows[0]?.pid;
  if (!pid) throw new Error('Initial authentication backend is unavailable');
  return pid;
}

/**
 * Observe the end of the initial authentication transaction before completing the body.
 *
 * The connection pool may reuse the backend as soon as it becomes idle, so the last command is not
 * required to remain `COMMIT`. A previously blocked authentication backend that is now idle with no
 * open transaction has already finished its authentication work. The bound is generous because the
 * full repository gate runs this file under heavy shared load; it only limits failure waiting. The
 * outer Vitest timeout below is larger so a stuck wait reports this specific error instead of a
 * generic test timeout.
 */
async function waitForAuthenticationCommit(pid: number): Promise<void> {
  const deadline = performance.now() + 90000;
  while (performance.now() < deadline) {
    const found = await getPool().query<{ finished: boolean }>(
      `SELECT (state = 'idle' AND (query = 'COMMIT' OR xact_start IS NULL)) AS finished
         FROM pg_stat_activity WHERE pid = $1`, [pid],
    );
    if (found.rows[0]?.finished) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Initial authentication did not commit before body completion');
}

describe.sequential('machine invitation incomplete upload authority', () => {
  it.each(['binding revocation', 'strict expiry'] as const)(
    'rechecks native authority after %s while a real body upload is incomplete',
    async (change) => {
      const fixture = await createMachineHttpFixture();
      let upload: PartialUpload | undefined;
      let release = () => {};
      let heldResult: Promise<unknown> = Promise.resolve();
      try {
        const issued = await issueMachineToken(fixture);
        expect(issued.status).toBe(200);
        const token = machineTokenValue(issued);
        const native = await fixture.provider.ClientCredentials.find(token);
        if (!native || typeof native.exp !== 'number') throw new Error('Native upload token is unavailable');
        const held = holdLifecycleWork(() => getServiceAccount(fixture.lifecycle.client.id, fixture.lifecycle.actor));
        release = held.release;
        heldResult = held.result;
        const { pid } = await held.ready;
        const email = `upload-${randomUUID()}@example.test`;
        upload = beginUpload(`${fixture.baseUrl}/api/admin/organizations/${fixture.lifecycle.organization.id}/users/invite`, token, email);
        const authPid = await blockedBackend(pid);
        held.release();
        await held.result;
        await waitForAuthenticationCommit(authPid);
        if (change === 'binding revocation') {
          await revokeServiceAccount(fixture.lifecycle.client.id, fixture.lifecycle.actor);
        } else {
          vi.useFakeTimers({ toFake: ['Date'] });
          vi.setSystemTime((native.exp + 1) * 1000);
        }
        upload.request.end(upload.remainder);
        expect(await upload.result).toBe(change === 'binding revocation' ? 403 : 401);
        expect(await readMachineInvitation(fixture.lifecycle.organization.id, email)).toBeNull();
        expect(await readMachineUserCount(fixture.lifecycle.organization.id, email)).toBe(0);
        expect(fixture.mail.attempts).toBe(0);
      } finally {
        vi.useRealTimers();
        release();
        await heldResult.catch(() => {});
        upload?.request.destroy();
        await upload?.result.catch(() => {});
        await fixture.close();
      }
    },
    120_000,
  );
});
