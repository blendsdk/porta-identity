import { Secret, TOTP } from 'otpauth';

/** Closed outcome vocabulary safe to emit from human-authentication assurance commands. */
export type HumanAuthDiagnosticOutcome =
  | 'mail-unavailable'
  | 'mail-cardinality-invalid'
  | 'mail-value-invalid'
  | 'public-state-unavailable'
  | 'configured-window-invalid';

/** Bounded mailbox record used by the generic polling observer. */
export interface HumanAuthMailInventory {
  readonly count: number;
  readonly bodies: readonly string[];
}

/** Polling controls keep service-backed waits deterministic and bounded. */
export interface HumanAuthMailPollingOptions {
  readonly timeoutMilliseconds: number;
  readonly intervalMilliseconds: number;
  readonly read: () => Promise<HumanAuthMailInventory>;
  readonly extract: (body: string) => readonly string[];
}

/** Secret-free result of one exact mailbox poll. */
export interface HumanAuthMailPollingResult {
  readonly value: string;
  readonly deliveryCount: 1;
}

/**
 * Polls until exactly one message contains exactly one distinct value.
 *
 * The raw value stays in the caller's local scope and is never interpolated into errors.
 */
export async function pollForExactHumanAuthMailValue(
  options: HumanAuthMailPollingOptions,
): Promise<HumanAuthMailPollingResult> {
  if (
    !Number.isInteger(options.timeoutMilliseconds) ||
    options.timeoutMilliseconds < 1 ||
    !Number.isInteger(options.intervalMilliseconds) ||
    options.intervalMilliseconds < 1
  ) {
    throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: configured-window-invalid');
  }
  const deadline = Date.now() + options.timeoutMilliseconds;
  do {
    const inventory = await options.read();
    if (inventory.count > 1 || inventory.bodies.length > 1) {
      throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: mail-cardinality-invalid');
    }
    if (inventory.count === 1 && inventory.bodies.length === 1) {
      const values = [...new Set(options.extract(inventory.bodies[0] ?? ''))];
      if (values.length !== 1) {
        throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: mail-value-invalid');
      }
      return Object.freeze({ value: values[0] ?? '', deliveryCount: 1 });
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, options.intervalMilliseconds));
  } while (Date.now() < deadline);
  throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: mail-unavailable');
}

/** Compares two canonical public-state fingerprints without exposing their source data. */
export function publicStateUnchanged(before: string, after: string): boolean {
  if (!/^sha256:[a-f0-9]{64}$/u.test(before) || !/^sha256:[a-f0-9]{64}$/u.test(after)) {
    throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: public-state-unavailable');
  }
  return before === after;
}

/** Validates an issued lifetime against a predeclared duration and bounded clock tolerance. */
export function configuredLifetimeObserved(
  issuedAtMilliseconds: number,
  expiresAtMilliseconds: number,
  configuredSeconds: number,
  toleranceSeconds: number,
): boolean {
  if (
    !Number.isFinite(issuedAtMilliseconds) ||
    !Number.isFinite(expiresAtMilliseconds) ||
    !Number.isInteger(configuredSeconds) ||
    configuredSeconds < 1 ||
    !Number.isInteger(toleranceSeconds) ||
    toleranceSeconds < 0
  ) {
    throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: configured-window-invalid');
  }
  const observedSeconds = (expiresAtMilliseconds - issuedAtMilliseconds) / 1_000;
  return Math.abs(observedSeconds - configuredSeconds) <= toleranceSeconds;
}

/** Generates an independent RFC 6238 value for a declared observation timestamp. */
export function independentTotpValue(secret: string, timestampMilliseconds: number): string {
  if (!Number.isFinite(timestampMilliseconds)) {
    throw new Error('HUMAN_AUTH_LIVE_OBSERVER_FAILED: configured-window-invalid');
  }
  return new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate({ timestamp: timestampMilliseconds });
}

/** Formats one allowlisted diagnostic without accepting arbitrary detail or protected values. */
export function humanAuthDiagnostic(outcome: HumanAuthDiagnosticOutcome): string {
  return `HUMAN_AUTH_LIVE_OBSERVER_FAILED: ${outcome}`;
}
