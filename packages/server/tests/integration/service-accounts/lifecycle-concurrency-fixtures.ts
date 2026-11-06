import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';

/** A transaction held after its real operation so another connection can reach a lock barrier. */
interface HeldWork<T> {
  /** Wait for the operation and expose only its backend identity and result to the owning test. */
  ready: Promise<{ pid: number; value: T }>;
  /** Release the transaction; callers must settle result before fixture teardown. */
  release: () => void;
  /** Actual commit/rollback outcome, never replaced by a timer or a mocked transaction. */
  result: Promise<T>;
}

/**
 * Hold the real transaction after a supplied production operation completes.
 * Every caller releases it in finally and settles both operations before resetting shared rows.
 *
 * @param work - Actual service operation, reusing this existing transaction owner.
 * @returns Readiness, release and result handles for one bounded interleaving.
 */
export function holdLifecycleWork<T>(work: () => Promise<T>): HeldWork<T> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let ready = (_value: { pid: number; value: T }) => {};
  let failed = (_error: unknown) => {};
  const readiness = new Promise<{ pid: number; value: T }>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const result = runDatabaseTransaction(async () => {
    const identity = await getPool().query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const value = await work();
    ready({ pid: identity.rows[0].pid, value });
    await gate;
    return value;
  });
  // Attach the error observer immediately; a setup failure must not leave an unhandled rejection.
  void result.catch(failed);
  return { ready: readiness, release, result };
}

/**
 * Observe PostgreSQL waiting on the exact held transaction, not merely an elapsed delay.
 * The deadline bounds infrastructure failure; no latency threshold is used as a success oracle.
 *
 * @param blockerPid - Backend which must block a separate lifecycle operation's parent lock.
 */
export async function waitForLifecycleParentBlock(blockerPid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const observation = await getPool().query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE query = $1 AND wait_event_type = 'Lock'
           AND $2::integer = ANY(pg_blocking_pids(pid))
       ) AS blocked`,
      ['SELECT id FROM clients WHERE id = $1 FOR UPDATE', blockerPid],
    );
    if (observation.rows[0]?.blocked) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Lifecycle operation did not reach its expected parent-lock barrier');
}
