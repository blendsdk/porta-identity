import { pino, stdSerializers } from 'pino';
import type { DestinationStream, Logger } from 'pino';

import { resolveJsonLogFormat } from './log-format.js';

/** Observer for ephemeral, in-process validation of actual structured logger calls. */
export type OperationalLogObserver = (serializedArguments: string) => void;

const operationalLogObservers = new Set<OperationalLogObserver>();
let levelBeforeOperationalObservation: string | null = null;

/**
 * Observe arguments delivered to the production logger boundary.
 *
 * This is intended for owner-controlled diagnostics and executable privacy validation. Observers
 * are process-local, receive no replay buffer, and must detach immediately after their bounded
 * operation. While at least one observer is attached, the logger accepts every level so the
 * observer can validate calls hidden by a quiet test configuration. The original level is restored
 * after the final observer detaches. Observers cannot alter, suppress, or replace a log write.
 *
 * @param observer - Callback receiving one JSON representation per logger call.
 * @returns A function which removes exactly this observer.
 */
export function observeOperationalLogOutput(observer: OperationalLogObserver): () => void {
  if (operationalLogObservers.size === 0) {
    levelBeforeOperationalObservation = logger.level;
    logger.level = 'trace';
  }
  operationalLogObservers.add(observer);
  return () => {
    operationalLogObservers.delete(observer);
    if (operationalLogObservers.size === 0 && levelBeforeOperationalObservation !== null) {
      logger.level = levelBeforeOperationalObservation;
      levelBeforeOperationalObservation = null;
    }
  };
}

const isTest = process.env.NODE_ENV === 'test';

/**
 * Structured paths that must never reach a log sink.
 *
 * Pino replaces the value at each path with `[Redacted]` before the line is
 * serialized. Device codes and user codes are bearer-like for the lifetime of
 * an authorization, so top-level, nested and request-body forms are covered.
 */
const REDACT_PATHS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'refresh_token',
  'client_secret',
  'urn:porta:internal_application_id',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.refresh_token',
  '*.client_secret',
  '*.urn:porta:internal_application_id',
  '*.authorization',
  'email',
  'userId',
  'organizationId',
  'uid',
  'interactionUid',
  '*.email',
  '*.userId',
  '*.organizationId',
  '*.uid',
  '*.interactionUid',
  'device_code',
  'user_code',
  'deviceCode',
  'userCode',
  '*.device_code',
  '*.user_code',
  '*.deviceCode',
  '*.userCode',
  'req.body.device_code',
  'req.body.user_code',
] as const;

/** Options accepted by the testable logger factory. */
export interface CreateLoggerOptions {
  /** Optional destination stream; when present, the pretty transport is not installed. */
  destination?: DestinationStream;
  /** Optional level override used by focused tests. */
  level?: string;
}

/**
 * Create one structured logger with the production redaction contract.
 *
 * The default export uses the configured transport. Tests can pass a writable
 * destination and assert on the emitted bytes, which is the only way to prove
 * that redaction happened before serialization.
 *
 * @param options - Optional destination stream and level override
 * @returns Configured Pino logger
 * @example
 * const sink = new Writable({ write: (chunk, _encoding, done) => { lines.push(String(chunk)); done(); } });
 * createLogger({ destination: sink, level: 'info' }).info({ device_code: 'secret' });
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const configuration = {
    level: options.level ?? process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
    ...(options.destination === undefined
      ? {
          transport: resolveJsonLogFormat()
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true } },
        }
      : {}),
    serializers: {
      err: stdSerializers.err,
      req: stdSerializers.req,
      res: stdSerializers.res,
    },
    hooks: {
      logMethod(arguments_: unknown[], method: (...args: unknown[]) => void) {
        if (operationalLogObservers.size > 0) {
          const serialized = serializeOperationalLogArguments(arguments_);
          for (const observer of operationalLogObservers) observer(serialized);
        }
        return method.apply(this, arguments_);
      },
    },
    redact: {
      paths: [...REDACT_PATHS],
      censor: '[Redacted]',
    },
  };
  return options.destination === undefined
    ? pino(configuration)
    : pino(configuration, options.destination);
}

/** Process-wide structured logger. */
export const logger = createLogger();

/** Serialize one bounded logger invocation without letting observation break the owning request. */
function serializeOperationalLogArguments(arguments_: unknown[]): string {
  try {
    return JSON.stringify(arguments_, (_key, value: unknown) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      return value;
    });
  } catch {
    return '[unserializable-operational-log]';
  }
}
