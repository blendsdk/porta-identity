/** Maximum public body retained in memory for one production-exposure observation. */
const maximumBodyBytes = 256 * 1024;

/** Sanitized bounded response used by production-exposure classifiers. */
export interface BoundedPublicResponse {
  /** Actual public status. */
  readonly status: number;
  /** Lowercase response headers. */
  readonly headers: Readonly<Record<string, string>>;
  /** Bounded response text retained only for in-process classification. */
  readonly body: string;
}

/** Rejects response bodies that exceed the in-process evidence bound. */
export function boundedPublicResponse(
  status: number,
  headers: Readonly<Record<string, string>>,
  body: string,
): BoundedPublicResponse {
  if (Buffer.byteLength(body, 'utf8') > maximumBodyBytes) {
    throw new Error('production exposure response exceeded the evidence bound');
  }
  return Object.freeze({ status, headers: Object.freeze({ ...headers }), body });
}

/** Returns whether the public response contains internal or protected implementation detail. */
export function exposesInternalDetail(response: BoundedPublicResponse): boolean {
  const material = `${response.body}\n${Object.entries(response.headers)
    .map(([name, value]) => `${name}:${value}`)
    .join('\n')}`;
  return /(?:postgres(?:ql)?:\/\/|redis:\/\/|smtp:\/\/|ECONN(?:REFUSED|RESET)|node_modules|\/app\/|\bat\s+[\w.<>]+\s*\(|select\s+.+\s+from|password=|bearer\s+[a-z0-9._~-]+|nginx\/\d|porta\/\d)/isu.test(
    material,
  );
}

/** Returns whether bounded public body bytes disclose internal implementation detail. */
export function exposesBodyInternalDetail(response: BoundedPublicResponse): boolean {
  return /(?:postgres(?:ql)?:\/\/|redis:\/\/|smtp:\/\/|ECONN(?:REFUSED|RESET)|node_modules|\/app\/|\bat\s+[\w.<>]+\s*\(|select\s+.+\s+from|password=|bearer\s+[a-z0-9._~-]+|nginx\/\d|porta\/\d)/isu.test(
    response.body,
  );
}

/** Classifies one response body from observed bytes without consulting Porta implementation code. */
export function classifyBody(response: BoundedPublicResponse): string {
  const contentType = response.headers['content-type'] ?? '';
  const trimmed = response.body.trim();
  if (trimmed.length === 0) return 'empty-preflight-body';
  if (response.headers['x-assurance-observation'] === 'transport-failure') {
    return 'transport-failure-before-public-response';
  }
  if (exposesBodyInternalDetail(response)) return 'public-response-exposes-internal-detail';
  if (contentType.includes('text/html')) {
    if (/<form\b/iu.test(trimmed) && /<html\b/iu.test(trimmed)) {
      return 'real-login-interaction-without-secret-or-product-version';
    }
    return 'generic-stable-response-without-dependency-or-product-detail';
  }
  if (contentType.includes('application/json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return 'invalid-json-response';
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'status' in parsed &&
      (parsed.status === 'ok' || parsed.status === 'healthy')
    ) {
      return 'stable-health-response-without-product-version';
    }
    if (response.status >= 200 && response.status < 300) {
      return 'ordinary-endpoint-body-without-origin-dependent-detail';
    }
    return 'generic-stable-response-without-dependency-or-product-detail';
  }
  return 'generic-stable-response-without-dependency-or-product-detail';
}

/** Evaluates one immutable header contract against concrete response headers. */
export function headerContractObserved(contract: string, response: BoundedPublicResponse): boolean {
  const headers = response.headers;
  const corsOrigin = headers['access-control-allow-origin'];
  const corsMethods = headers['access-control-allow-methods'] ?? '';
  const corsHeaders = headers['access-control-allow-headers'] ?? '';
  const contentSecurityPolicy = headers['content-security-policy'] ?? '';
  const setCookie = headers['set-cookie'] ?? '';
  switch (contract) {
    case 'access-control-allow-origin-absent':
      return corsOrigin === undefined;
    case 'access-control-allow-credentials-absent':
      return headers['access-control-allow-credentials'] === undefined;
    case 'access-control-allow-origin-exactly-echoes-the-configured-origin':
      return corsOrigin === 'https://app-harness.ci.portaidentity.com';
    case 'access-control-allow-methods-does-not-contain-trace':
      return !corsMethods.split(',').some((value) => value.trim().toUpperCase() === 'TRACE');
    case 'access-control-allow-headers-does-not-contain-x-assurance-unconfigured':
      return !corsHeaders
        .split(',')
        .some((value) => value.trim().toLowerCase() === 'x-assurance-unconfigured');
    case 'strict-transport-security:max-age=31536000; includeSubDomains':
      return headers['strict-transport-security'] === 'max-age=31536000; includeSubDomains';
    case "content-security-policy:default-src 'none'":
      return contentSecurityPolicy === "default-src 'none'";
    case "content-security-policy-includes:default-src 'none'":
      return contentSecurityPolicy.includes("default-src 'none'");
    case "content-security-policy-includes:frame-ancestors 'none'":
      return contentSecurityPolicy.includes("frame-ancestors 'none'");
    case 'x-content-type-options:nosniff':
      return headers['x-content-type-options'] === 'nosniff';
    case 'referrer-policy:strict-origin-when-cross-origin':
      return headers['referrer-policy'] === 'strict-origin-when-cross-origin';
    case 'x-frame-options:DENY':
      return headers['x-frame-options'] === 'DENY';
    case 'server-version-header-absent':
      return headers.server === undefined || !/\d/u.test(headers.server);
    case 'internal-debug-headers-absent':
      return !Object.keys(headers).some((name) =>
        /^(?:x-debug|x-runtime|x-powered-by)/u.test(name),
      );
    case 'attacker-forwarded-value-not-reflected':
      return !/(?:attacker\.invalid|198\.51\.100\.77)/u.test(
        `${response.body}\n${Object.values(headers).join('\n')}`,
      );
    case 'set-cookie-secure':
      return /(?:^|;)\s*secure(?:;|$)/iu.test(setCookie);
    case 'set-cookie-httponly':
      return /(?:^|;)\s*httponly(?:;|$)/iu.test(setCookie);
    case 'set-cookie-samesite-declared-production-policy':
      return /(?:^|;)\s*samesite=(?:lax|strict)(?:;|$)/iu.test(setCookie);
    case 'set-cookie-host-only-without-domain':
      return setCookie.length > 0 && !/(?:^|;)\s*domain=/iu.test(setCookie);
    default:
      throw new Error('unsupported production exposure header contract');
  }
}
