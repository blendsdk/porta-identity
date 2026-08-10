/** Stable replacement used for every detected sensitive value. */
const redactedValue = '[REDACTED]';

/** Key fragments whose values must never enter retained evidence. */
const sensitiveKeyFragments = [
  'address',
  'authorization',
  'clientsecret',
  'connectionstring',
  'cookie',
  'displayname',
  'email',
  'firstname',
  'fullname',
  'lastname',
  'mailingaddress',
  'name',
  'password',
  'phone',
  'postaladdress',
  'privatekey',
  'recoverycode',
  'signingkey',
  'token',
  'totp',
  'userid',
] as const;

/** Patterns that identify secret-bearing content even when its containing key looks harmless. */
const sensitiveValuePatterns = [
  /\b(?:TOKEN|PASSWORD|COOKIE|CLIENT-SECRET)-CANARY-[A-Za-z0-9-]+\b/giu,
  /\bBearer\s+[^\s,;]+/giu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
  /\b(?:postgres(?:ql)?|redis):\/\/[^\s/@:]+:[^\s/@]+@/giu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /\b(?:email|phone|name|address)\s*[:=]\s*[^,;\n]+/giu,
] as const;

/** Residual patterns that make an already-rendered artifact unsafe to persist. */
const residualSensitivePatterns = [
  /\b(?:TOKEN|PASSWORD|COOKIE|CLIENT-SECRET)-CANARY-[A-Za-z0-9-]+\b/giu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /\b(?:email|phone|name|address)\s*[:=]\s*(?!\[REDACTED\])[^,;\n]+/giu,
  /\bBearer\s+(?!\[REDACTED\])[^\s,;]+/giu,
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
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        sanitized[key] = '[REDACTED:ACCESSOR]';
        continue;
      }
      sanitized[key] = isSensitiveKey(key)
        ? redactedValue
        : redactUnknown(descriptor.value, ancestors);
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

/** Refuses persistence when a rendered artifact still contains secret or personal-data patterns. */
export function assertEvidenceSanitized(rendered: string): void {
  if (
    residualSensitivePatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(rendered);
    })
  ) {
    throw new Error('rendered assurance evidence contains residual sensitive or personal data');
  }
}
