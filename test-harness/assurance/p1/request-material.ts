import type { RawRequestRequirement } from '../tests/validation-exposure-case-model.js';

/** One exact header line retained in insertion order for a conformance request. */
export interface MaterializedRequestHeader {
  /** Header name before transport serialization. */
  readonly name: string;
  /** Header value with requirement-owned test octets preserved. */
  readonly value: string;
}

/** Bounded request material that contains no destination or network capability. */
export interface MaterializedRawRequest {
  /** Exact HTTP method from the requirement. */
  readonly method: string;
  /** Exact origin-form request target after fixture substitution. */
  readonly path: string;
  /** Ordered headers after fixture substitution. */
  readonly headers: readonly MaterializedRequestHeader[];
  /** Exact body bytes, including a generated limit-plus-one payload when requested. */
  readonly body: Buffer;
}

const placeholderPattern = /\{([A-Za-z][A-Za-z0-9-]*)\}/gu;
const methodPattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const authorityPattern = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u;

/** Returns whether fixture-controlled text contains bytes that can alter request framing. */
function containsFramingControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code === 0 || code === 10 || code === 13;
  });
}

/** Replaces every declared fixture placeholder and rejects incomplete request material. */
function substituteFixtureValues(
  template: string,
  replacements: Readonly<Record<string, string>>,
): string {
  const replaced = template.replace(placeholderPattern, (_match, name: string) => {
    const value = replacements[name];
    if (value === undefined || containsFramingControl(value)) {
      throw new Error('P1 request fixture replacement is absent or unsafe');
    }
    return value;
  });
  if (placeholderPattern.test(replaced)) {
    throw new Error('P1 request contains an unresolved fixture placeholder');
  }
  placeholderPattern.lastIndex = 0;
  return replaced;
}

/** Builds valid JSON whose UTF-8 byte length is exactly one byte above the configured limit. */
function oversizedJsonBody(configuredBodyLimitBytes: number): Buffer {
  if (!Number.isSafeInteger(configuredBodyLimitBytes) || configuredBodyLimitBytes < 16) {
    throw new Error('P1 configured body limit is invalid');
  }
  const targetBytes = configuredBodyLimitBytes + 1;
  const prefix = '{"name":"';
  const suffix = '"}';
  const fillLength = targetBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  if (fillLength < 1) throw new Error('P1 configured body limit cannot hold the test envelope');
  return Buffer.from(`${prefix}${'x'.repeat(fillLength)}${suffix}`, 'utf8');
}

/**
 * Converts one immutable request requirement into exact bounded bytes without sending it.
 *
 * This helper deliberately has no socket or URL input. Network ownership remains with the retained
 * harness, while implementation tests can still prove that client normalization did not alter the
 * request material.
 */
export function materializeRawRequest(
  requirement: RawRequestRequirement,
  replacements: Readonly<Record<string, string>>,
  configuredBodyLimitBytes: number,
): MaterializedRawRequest {
  if (requirement.transport !== 'raw-http' || requirement.clientNormalization !== 'forbidden') {
    throw new Error('P1 request does not permit exact raw materialization');
  }
  if (!methodPattern.test(requirement.method)) throw new Error('P1 request method is invalid');
  const path = substituteFixtureValues(requirement.path, replacements);
  if (
    !path.startsWith('/') ||
    containsFramingControl(path) ||
    path.includes(' ') ||
    path.length > 16 * 1024
  ) {
    throw new Error('P1 request path is invalid');
  }
  const headers = Object.entries(requirement.headers).map(([name, template]) => {
    if (!headerNamePattern.test(name)) throw new Error('P1 request header name is invalid');
    const value = substituteFixtureValues(template, replacements);
    if (value.includes('\u0000') || Buffer.byteLength(value) > 16 * 1024) {
      throw new Error('P1 request header value is invalid');
    }
    return Object.freeze({ name, value });
  });
  const body =
    requirement.bodyByteLength === 'configured-limit-plus-one'
      ? oversizedJsonBody(configuredBodyLimitBytes)
      : Buffer.from(
          requirement.body === null ? '' : substituteFixtureValues(requirement.body, replacements),
          'utf8',
        );
  if (
    typeof requirement.bodyByteLength === 'number' &&
    body.byteLength !== requirement.bodyByteLength
  ) {
    throw new Error('P1 request body length differs from its declaration');
  }
  return Object.freeze({ method: requirement.method, path, headers: Object.freeze(headers), body });
}

/**
 * Renders exact HTTP/1.1 bytes for an already materialized request without opening a connection.
 *
 * The authority is independently allowlisted and framing headers are owned by this function. This
 * prevents requirement data from redirecting a later owner-fenced transport or changing framing.
 */
export function renderRawHttpRequest(request: MaterializedRawRequest, authority: string): Buffer {
  if (!authorityPattern.test(authority)) throw new Error('P1 request authority is invalid');
  const reserved = new Set(['host', 'content-length', 'connection']);
  if (request.headers.some((header) => reserved.has(header.name.toLowerCase()))) {
    throw new Error('P1 request cannot override transport-owned framing headers');
  }
  const lines = [
    `${request.method} ${request.path} HTTP/1.1`,
    `Host: ${authority}`,
    ...request.headers.map((header) => `${header.name}: ${header.value}`),
    `Content-Length: ${request.body.byteLength}`,
    'Connection: close',
    '',
    '',
  ];
  return Buffer.concat([Buffer.from(lines.join('\r\n'), 'utf8'), request.body]);
}
