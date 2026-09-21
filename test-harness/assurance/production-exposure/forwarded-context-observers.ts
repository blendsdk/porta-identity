import type { APIRequestContext } from '@playwright/test';

/**
 * Tenant whose public discovery and browser-facing endpoints are observed for
 * forwarding-context safety.
 */
export const FORWARDED_CONTEXT_TENANT = 'alpha';

/**
 * Two distinct documentation-range addresses used as client-supplied
 * `X-Forwarded-For` values. If the rate limiter trusts the client value, each
 * request opens its own counter and the observed remaining budget never falls.
 */
const SPOOFED_FORWARDED_FOR = Object.freeze(['203.0.113.201', '203.0.113.202']);

/** Cookie policy whose presence and flags are compared across observations. */
const NORMALIZED_PUBLIC_COOKIE_POLICY = 'secure=true;httponly=true;samesite-lax=true;domain=false';

/** The stable normalized policy a public secure cookie must keep. */
export const expectedPublicCookiePolicy = NORMALIZED_PUBLIC_COOKIE_POLICY;

/**
 * One token-endpoint reading of the remaining rate-limit budget.
 *
 * `remaining` is `undefined` when the response did not carry the informational
 * header, which makes the reading unusable for the identity decision.
 */
export interface TokenBudgetReading {
  readonly status: number;
  readonly remaining: number | undefined;
}

/**
 * Normalize the security-relevant attributes of one `Set-Cookie` value.
 *
 * The cookie value itself changes on every response, so only the attributes
 * that must remain stable are retained: `Secure`, `HttpOnly`, `SameSite=Lax`,
 * and the absence of a `Domain` attribute. The result is a comparable string,
 * or `absent` when the response did not set the cookie at all.
 *
 * @param setCookie - Raw `Set-Cookie` value for the cookie under observation
 * @returns A stable attribute key, or `absent` when no value was supplied
 */
export function cookiePolicyKey(setCookie: string): string {
  if (setCookie.length === 0) return 'absent';
  const attributes = setCookie.split(';').map((attribute) => attribute.trim().toLowerCase());
  const hasAttribute = (name: string): boolean => attributes.includes(name);
  const hasDomain = attributes.some((attribute) => attribute.startsWith('domain='));
  return `secure=${hasAttribute('secure')};httponly=${hasAttribute(
    'httponly',
  )};samesite-lax=${hasAttribute('samesite=lax')};domain=${hasDomain}`;
}

/**
 * Decide whether two token-budget readings prove that the direct peer, and not
 * the client-supplied forwarded value, drives the rate-limit budget.
 *
 * Both requests come from the same peer but present different forwarded
 * values. When the peer drives the key, the second reading is lower than the
 * first. When the client value drives the key, the second reading restarts and
 * is equal. A throttled, header-less, or rolled-over reading cannot distinguish
 * the two cases, so it is reported as inconclusive instead of a failure.
 *
 * @param first - Reading captured for the first forwarded value
 * @param second - Reading captured for the second forwarded value
 * @returns `true` when only the peer drives the budget, `false` when the client
 * value does, or `null` when the readings are inconclusive
 */
export function directPeerBudgetDecision(
  first: TokenBudgetReading,
  second: TokenBudgetReading,
): boolean | null {
  if (first.status === 429 || second.status === 429) return null;
  if (first.remaining === undefined || second.remaining === undefined) return null;
  if (first.remaining <= 0) return null;
  if (second.remaining > first.remaining) return null;
  return second.remaining < first.remaining;
}

/**
 * Read the configured public origin from a tenant's OIDC discovery document
 * while presenting the attacker-controlled forwarding header.
 *
 * The issuer is derived from the deployment's fixed public base URL, never from
 * the request `Host` or `X-Forwarded-Host` header, so an untrusted forwarding
 * value must not change this value.
 *
 * @param api - Request context bound to the active harness lifecycle
 * @param portaUrl - Public base URL of the identity server
 * @param tenant - Tenant whose discovery document is read
 * @param headers - Attacker-controlled headers presented with the request
 * @returns The discovered issuer, or an empty string when it is unavailable
 */
export async function readConfiguredOrigin(
  api: APIRequestContext,
  portaUrl: string,
  tenant: string,
  headers: Readonly<Record<string, string>>,
): Promise<string> {
  const response = await api.get(`${portaUrl}/${tenant}/.well-known/openid-configuration`, {
    headers: { ...headers },
    failOnStatusCode: false,
  });
  const body = (await response.json()) as { issuer?: unknown };
  return typeof body.issuer === 'string' ? body.issuer : '';
}

/**
 * Read the normalized policy of the public CSRF cookie while presenting the
 * attacker-controlled forwarding header.
 *
 * The forgot-password form sets the CSRF cookie on a plain GET, so this reads a
 * real public cookie without authenticating. Its `Secure` flag follows the
 * request protocol, so an untrusted `X-Forwarded-Proto` value would weaken it.
 *
 * @param api - Request context bound to the active harness lifecycle
 * @param portaUrl - Public base URL of the identity server
 * @param tenant - Tenant whose forgot-password form is read
 * @param headers - Attacker-controlled headers presented with the request
 * @returns The normalized cookie policy key, or `absent` when unset
 */
export async function readPublicCookiePolicy(
  api: APIRequestContext,
  portaUrl: string,
  tenant: string,
  headers: Readonly<Record<string, string>>,
): Promise<string> {
  const response = await api.get(`${portaUrl}/${tenant}/auth/forgot-password`, {
    headers: { ...headers },
    failOnStatusCode: false,
  });
  const setCookieHeader = response.headers()['set-cookie'] ?? '';
  const csrfCookie =
    setCookieHeader
      .split('\n')
      .find((value) => value.trimStart().toLowerCase().startsWith('_csrf=')) ?? '';
  return cookiePolicyKey(csrfCookie);
}

/**
 * Determine whether the token rate limiter keys on the direct peer rather than
 * the client-supplied `X-Forwarded-For` value.
 *
 * @param api - Request context bound to the active harness lifecycle
 * @param portaUrl - Public base URL of the identity server
 * @param tenant - Tenant whose token endpoint is exercised
 * @returns `true` when only the peer drives the budget, `false` when the client
 * value drives it, or `null` when the limiter did not report a usable budget
 */
export async function rateLimitKeyUsesDirectPeer(
  api: APIRequestContext,
  portaUrl: string,
  tenant: string,
): Promise<boolean | null> {
  const selector = `${portaUrl}/${tenant}/token`;
  const readings: TokenBudgetReading[] = [];
  for (const forwardedFor of SPOOFED_FORWARDED_FOR) {
    const response = await api.post(selector, {
      form: { grant_type: 'authorization_code', code: 'invalid-authorization-code' },
      headers: { 'x-forwarded-for': forwardedFor },
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const rawRemaining = response.headers()['x-ratelimit-remaining'];
    const parsedRemaining = rawRemaining === undefined ? undefined : Number(rawRemaining);
    readings.push({
      status: response.status(),
      remaining:
        parsedRemaining !== undefined && Number.isFinite(parsedRemaining)
          ? parsedRemaining
          : undefined,
    });
  }
  const [first, second] = readings;
  if (first === undefined || second === undefined) return null;
  return directPeerBudgetDecision(first, second);
}
