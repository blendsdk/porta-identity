/** Stable replacement used for every detected sensitive value. */
const redactedValue = '[REDACTED]';

/** Key fragments whose values must never enter retained evidence. */
const sensitiveKeyFragments = [
  'authorization',
  'clientsecret',
  'connectionstring',
  'cookie',
  'password',
  'privatekey',
  'recoverycode',
  'signingkey',
  'token',
  'totp',
] as const;

/** Patterns that identify secret-bearing content even when its containing key looks harmless. */
const sensitiveValuePatterns = [
  /\b(?:TOKEN|PASSWORD|COOKIE|CLIENT-SECRET)-CANARY-[A-Za-z0-9-]+\b/giu,
  /\bBearer\s+[^\s,;]+/giu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
  /\b(?:postgres(?:ql)?|redis):\/\/[^\s/@:]+:[^\s/@]+@/giu,
] as const;

/** Query parameters whose values must be removed while retaining the parameter name. */
const sensitiveQueryPattern = /([?&](?:code|token|secret|password)=)[^&#\s]*/giu;

/** Returns whether a property name identifies a secret-bearing field. */
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}

/** Redacts recognizable secret patterns embedded in otherwise ordinary text. */
function redactString(value: string): string {
  const sanitized = sensitiveValuePatterns.reduce(
    (current, pattern) => current.replace(pattern, redactedValue),
    value,
  );
  return sanitized.replace(
    sensitiveQueryPattern,
    (_match, prefix: string) => `${prefix}${redactedValue}`,
  );
}

/** Returns whether a value is a plain JSON-like record safe to enumerate. */
function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Recursively creates a sanitized JSON-like copy without invoking custom object behavior. */
function redactUnknown(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return '[REDACTED:UNSUPPORTED_VALUE]';
  if (ancestors.has(value)) return '[REDACTED:CIRCULAR_REFERENCE]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => redactUnknown(entry, ancestors));
    }
    if (!isPlainRecord(value)) return '[REDACTED:UNSUPPORTED_OBJECT]';

    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = isSensitiveKey(key) ? redactedValue : redactUnknown(entry, ancestors);
    }
    return sanitized;
  } finally {
    ancestors.delete(value);
  }
}

/** Recursively removes sensitive fields and values before evidence is rendered or persisted. */
export function redactEvidence(value: unknown): unknown {
  return redactUnknown(value, new WeakSet<object>());
}
