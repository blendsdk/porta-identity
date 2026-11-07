/**
 * Parses the live harness's structured protocol-security log.
 *
 * The harness runs Porta with `PORTA_LOG_FORMAT=json`, so each log line is one JSON record. A
 * rejection is evidence only when exactly one record exists for the response request ID and its
 * event is the required `protocol-security-rejection`. The parser returns the field names only;
 * values never leave this boundary.
 */

/** Parsed privacy-safe security event metadata. */
export interface ParsedProtocolSecurityLog {
  /** Stable public security-event class. */
  readonly event: string;
  /** Field names present on the event; values are never retained here. */
  readonly fields: readonly string[];
}

/** Returns true for a plain object, never an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse exactly one correlated protocol-security event from captured compose logs.
 *
 * @param logs - Raw `docker compose logs` output.
 * @param requestId - Server-issued request correlation identifier.
 * @param forbiddenValues - Ephemeral artifacts that must not appear anywhere in the logs.
 * @returns The event class and the actual field names on the record.
 * @throws Error when correlation is absent, ambiguous, malformed, or a forbidden value leaked.
 * @example parseProtocolSecurityLog(logs, 'request-1', [code, verifier]);
 */
export function parseProtocolSecurityLog(
  logs: string,
  requestId: string,
  forbiddenValues: readonly string[],
): ParsedProtocolSecurityLog {
  if (requestId.length === 0) throw new Error('protocol response omitted correlation');
  for (const value of forbiddenValues) {
    if (value.length > 0 && logs.includes(value)) {
      throw new Error('protocol logs retained a forbidden artifact');
    }
  }

  const matches = logs
    .split('\n')
    .map((line) => {
      if (!line.includes(requestId)) return undefined;
      const start = line.indexOf('{');
      const end = line.lastIndexOf('}');
      if (start < 0 || end <= start) return undefined;
      try {
        const record: unknown = JSON.parse(line.slice(start, end + 1));
        return isRecord(record) &&
          record.event === 'protocol-security-rejection' &&
          record['synthetic-correlation-id'] === requestId
          ? record
          : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((record): record is Record<string, unknown> => record !== undefined);

  if (matches.length !== 1) {
    throw new Error('correlated protocol rejection event is absent or ambiguous');
  }

  return Object.freeze({
    event: 'protocol-security-rejection',
    fields: Object.freeze(Object.keys(matches[0] ?? {}).sort()),
  });
}
