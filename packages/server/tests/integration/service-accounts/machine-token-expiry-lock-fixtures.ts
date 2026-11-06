import { request as httpRequest } from 'node:http';
import type { ClientRequest } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { PoolClient } from 'pg';
import { getServiceAccount } from '../../../src/service-accounts/index.js';
import type { ServiceAccountBinding } from '../../../src/service-accounts/index.js';
import { holdLifecycleWork } from './lifecycle-concurrency-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';

/** Real read transaction held after it obtains the bound client's conflicting parent lock. */
export type ExpiryParentHold = ReturnType<typeof holdLifecycleWork<ServiceAccountBinding>>;

/** One owned HTTP upload whose body remains incomplete until the test supplies its remainder. */
export interface ExpiryPartialUpload {
  /** Native request containing authorization headers; never log or dump this object. */
  request: ClientRequest;
  /** Final HTTP status only, with transport failures replaced by fixed safe errors. */
  result: Promise<number>;
  /** Remaining valid JSON after the first opening brace already sent to the server. */
  remainder: string;
}

/** Actual PostgreSQL waiter identity and the blocking backend identities reported by PostgreSQL. */
export interface ExpiryParentWait {
  /** Backend executing the supplied real parent-lock statement. */
  pid: number;
  /** Hard and queued soft blockers, without inferring queue order from elapsed time. */
  blockers: number[];
}

/** Exact parent-lock observation interface shared by the existing lifecycle fixture. */
const PARENT_LOCK_QUERY = 'SELECT id FROM clients WHERE id = $1 FOR UPDATE';

/** Hold the genuine public binding read; readiness errors are observed even while another stage runs. */
export function holdExpiryParent(fixture: MachineHttpFixture): ExpiryParentHold {
  const held = holdLifecycleWork(() => getServiceAccount(
    fixture.lifecycle.client.id, fixture.lifecycle.actor,
  ));
  void held.ready.catch(() => {});
  return held;
}

/**
 * Send headers and exactly one JSON byte to the owned loopback application.
 * No response body or native error containing a URL or token is retained.
 * The caller must destroy and settle this request before closing the fixture.
 */
export function startExpiryUpload(
  fixture: MachineHttpFixture, token: string, email: string,
): ExpiryPartialUpload {
  const body = JSON.stringify({ email });
  let request: ClientRequest;
  try {
    const url = new URL(`/api/admin/organizations/${fixture.lifecycle.organization.id}/users/invite`, fixture.baseUrl);
    if (url.origin !== fixture.baseUrl || url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
      throw new Error('The expiry fixture requires its owned loopback listener');
    }
    request = httpRequest(url, {
      method: 'POST', agent: false,
      headers: {
        Authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'content-length': Buffer.byteLength(body, 'utf8'),
      },
    });
  } catch {
    throw new Error('Expiry invitation transport could not start');
  }
  const result = new Promise<number>((resolve, reject) => {
    let settled = false;
    let responseStarted = false;
    const failed = (): void => {
      if (settled) return;
      settled = true;
      reject(new Error('Expiry invitation transport failed'));
    };
    request.once('error', failed);
    request.once('close', () => { if (!responseStarted) failed(); });
    request.once('response', (response) => {
      responseStarted = true;
      response.once('error', failed);
      response.once('aborted', failed);
      response.once('close', () => { if (!response.complete) failed(); });
      response.once('end', () => {
        if (settled) return;
        if (typeof response.statusCode !== 'number') { failed(); return; }
        settled = true;
        resolve(response.statusCode);
      });
      response.resume();
    });
  });
  // This observer prevents an unhandled rejection without changing the result awaited by the test.
  void result.catch(() => {});
  try {
    request.flushHeaders();
    request.write('{');
  } catch {
    request.destroy(new Error('Expiry invitation transport failed'));
  }
  return { request, result, remainder: body.slice(1) };
}

/** Bound asynchronous fixture failure using real timers; Date-only changes cannot stop this deadline. */
export async function withinExpiryDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Expiry fixture did not reach its asynchronous boundary')), 5_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Read only exact known parent statements participating in this owned blocking chain. */
async function readExpiryWaiters(
  observer: PoolClient, firstBlocker: number, secondBlocker = firstBlocker,
): Promise<ExpiryParentWait[]> {
  const result = await observer.query<ExpiryParentWait>(`
    SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
    WHERE query = $1 AND wait_event_type = 'Lock'
      AND ($2::integer = ANY(pg_blocking_pids(pid)) OR $3::integer = ANY(pg_blocking_pids(pid)))
  `, [PARENT_LOCK_QUERY, firstBlocker, secondBlocker]);
  return result.rows;
}

/** Observe one real request waiting on its identified holder, never a sleep-based approximation. */
export async function waitForExpiryParent(
  observer: PoolClient, blockerPid: number,
): Promise<ExpiryParentWait> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const rows = await readExpiryWaiters(observer, blockerPid);
    const waiter = rows.length === 1 ? rows[0] : undefined;
    if (waiter) return waiter;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Expiry fixture did not observe its unique parent-lock waiter');
}

/**
 * Witness the initial authentication commit while the upload is still incomplete.
 * A separately reserved observer cannot overwrite the authentication backend's last query.
 */
export async function waitForExpiryUploadCommit(observer: PoolClient, authPid: number): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const result = await observer.query<{ committed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND state = 'idle' AND query = 'COMMIT'
      ) AS committed
    `, [authPid]);
    if (result.rows[0]?.committed) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Expiry fixture did not observe the initial authentication commit');
}

/**
 * Prove the native authentication waiter precedes the queued binding read while their holder stays locked.
 * PostgreSQL must report the native PID as a hard or soft blocker of that second waiter.
 */
export async function waitForExpiryQueuedHandoff(
  observer: PoolClient, holderPid: number, authPid: number,
): Promise<ExpiryParentWait> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const rows = await readExpiryWaiters(observer, holderPid, authPid);
    const authentication = rows.find((row) => row.pid === authPid);
    const queued = rows.find((row) => row.pid !== authPid && row.blockers.includes(authPid));
    if (rows.length === 2 && authentication?.blockers.includes(holderPid) && queued) return queued;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Expiry fixture did not observe the ordered two-waiter handoff');
}
