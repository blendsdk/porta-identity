/**
 * Bounded dependency probing.
 *
 * Health and readiness probes must never wait indefinitely for a dependency
 * that has stopped responding. An unbounded probe lets a degraded dependency
 * hang an orchestrator check, so every check is raced against a short timeout
 * and the timer is cleared as soon as the probe settles.
 *
 * @module lib/with-timeout
 */

/** Default budget (milliseconds) for a single dependency probe. */
export const DEPENDENCY_PROBE_TIMEOUT_MS = 2000;

/**
 * Resolve with `promise`, or reject with a labeled timeout error when the
 * promise does not settle within `timeoutMs`.
 *
 * The timeout only bounds how long a probe may hold a health response; it does
 * not cancel the underlying operation, which the owning client bounds itself.
 *
 * @param promise - Probe promise to bound.
 * @param label - Short dependency name used in the timeout error message.
 * @param timeoutMs - Maximum wait; defaults to {@link DEPENDENCY_PROBE_TIMEOUT_MS}.
 * @returns The probe result when it settles in time.
 * @throws {Error} When the probe exceeds `timeoutMs`.
 *
 * @example
 * ```ts
 * await withTimeout(getPool().query('SELECT 1'), 'db');
 * ```
 */
export function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = DEPENDENCY_PROBE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
    // Never keep the process alive solely for a pending probe timeout.
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
