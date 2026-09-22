/**
 * Log output format selection for the process logger.
 *
 * Production always emits structured JSON so an external collector can parse each event without
 * guessing at human formatting. An owner-controlled non-production runtime may request the same
 * format through the `PORTA_LOG_FORMAT` environment variable. Only the exact value `json` is
 * recognized; any other value keeps the human-readable development default.
 *
 * @module lib/log-format
 */

/** Exact `PORTA_LOG_FORMAT` value which requests structured JSON logs outside production. */
export const JSON_LOG_FORMAT_VALUE = 'json';

/**
 * Decide whether the process logger must emit structured JSON.
 *
 * @param environment - Process environment to read, defaulting to the running process.
 * @returns True when structured JSON logging is required.
 */
export function resolveJsonLogFormat(environment: NodeJS.ProcessEnv = process.env): boolean {
  return (
    environment.NODE_ENV === 'production' || environment.PORTA_LOG_FORMAT === JSON_LOG_FORMAT_VALUE
  );
}
