import { pino, stdSerializers } from 'pino';

/** Observer for ephemeral, in-process validation of actual structured logger calls. */
export type OperationalLogObserver = (serializedArguments: string) => void;

const operationalLogObservers = new Set<OperationalLogObserver>();

/**
 * Observe arguments delivered to the production logger boundary.
 *
 * This is intended for owner-controlled diagnostics and executable privacy validation. Observers
 * are process-local, receive no replay buffer, and must detach immediately after their bounded
 * operation. They cannot alter, suppress, or replace the actual log write.
 *
 * @param observer - Callback receiving one JSON representation per logger call.
 * @returns A function which removes exactly this observer.
 */
export function observeOperationalLogOutput(observer: OperationalLogObserver): () => void {
  operationalLogObservers.add(observer);
  return () => operationalLogObservers.delete(observer);
}

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  transport: !isProduction ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  serializers: {
    err: stdSerializers.err,
    req: stdSerializers.req,
    res: stdSerializers.res,
  },
  hooks: {
    logMethod(arguments_, method) {
      if (operationalLogObservers.size > 0) {
        const serialized = serializeOperationalLogArguments(arguments_);
        for (const observer of operationalLogObservers) observer(serialized);
      }
      return method.apply(this, arguments_);
    },
  },
  // Redact PII and sensitive fields from log output to prevent accidental
  // exposure of credentials, tokens, and personal data. Pino replaces the
  // value at each path with "[Redacted]" before the log line is serialized.
  // Paths use dot-notation with wildcards so nested objects are also covered.
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'refresh_token',
      'client_secret',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.refresh_token',
      '*.client_secret',
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
    ],
    censor: '[Redacted]',
  },
});

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
