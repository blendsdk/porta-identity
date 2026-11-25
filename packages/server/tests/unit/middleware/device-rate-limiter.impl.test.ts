/**
 * Implementation tests for device rate-limit keys, predicates and middleware ordering.
 *
 * The key builders and the malformed-body counter are the parts that cannot be
 * observed reliably through HTTP. They must hash identifiers, keep primary and
 * aggregate namespaces separate, and charge malformed traffic to the address.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLogStrict: vi.fn(),
}));

vi.mock('../../../src/oidc/device-pages.js', () => ({
  renderDeviceRateLimitedPage: vi.fn(),
}));

import { checkRateLimit } from '../../../src/auth/rate-limiter.js';
import { getRedis } from '../../../src/lib/redis.js';
import {
  countMalformedDeviceBody,
  deviceTokenRateLimiter,
  deviceUserCodeRateLimiter,
} from '../../../src/middleware/device-rate-limiter.js';
import {
  buildDeviceAuthorizationIpKey,
  buildDeviceAuthorizationKey,
  buildDevicePollIpKey,
  buildDevicePollKey,
  buildUserCodeIpKey,
  buildUserCodeKey,
  DEVICE_AUTHORIZATION_IP_RATE_LIMIT,
  DEVICE_TOKEN_IP_RATE_LIMIT,
  DEVICE_TOKEN_RATE_LIMIT,
  DEVICE_USER_CODE_IP_RATE_LIMIT,
  isBoundedDeviceCode,
  isDeviceGrantBody,
} from '../../../src/middleware/device-rate-limit-keys.js';
import { TOKEN_IP_RATE_LIMIT } from '../../../src/middleware/token-rate-limiter.js';

/** Full RFC 8628 grant value. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Minimal middleware context used by the limiter implementation. */
interface LimiterContext {
  path: string;
  method: string;
  ip: string;
  status: number;
  state: { organization?: { id: string; slug: string } };
  params: { orgSlug: string };
  request: { body: Record<string, unknown> | undefined };
  query: Record<string, unknown>;
  headers: Record<string, string>;
  cookies: { get: ReturnType<typeof vi.fn> };
  set: ReturnType<typeof vi.fn>;
}

/** Build one valid limiter context. */
function createContext(overrides: Partial<LimiterContext> = {}): LimiterContext {
  return {
    path: '/acme/device',
    method: 'POST',
    ip: '127.0.0.1',
    status: 200,
    state: { organization: { id: 'org-1', slug: 'acme' } },
    params: { orgSlug: 'acme' },
    request: { body: { user_code: 'BCDF-GHJK', xsrf: 'value' } },
    query: {},
    headers: {},
    cookies: { get: vi.fn() },
    set: vi.fn(),
    ...overrides,
  };
}

describe('device rate-limit keys', () => {
  it('keeps the per-IP and per-client poll namespaces distinct', () => {
    expect(buildDevicePollKey('ip', '127.0.0.1')).not.toBe(buildDevicePollIpKey('127.0.0.1'));
    expect(buildDevicePollKey('client-a', '127.0.0.1')).not.toBe(
      buildDevicePollKey('client-b', '127.0.0.1'),
    );
  });

  it('hashes IP, session and code material out of every key', () => {
    const keys = [
      buildDeviceAuthorizationKey('org-1', '203.0.113.9', 'client-a'),
      buildDeviceAuthorizationIpKey('203.0.113.9'),
      buildUserCodeKey('org-1', '203.0.113.9', 'session-uid'),
      buildUserCodeIpKey('203.0.113.9'),
      buildDevicePollKey('client-a', '203.0.113.9'),
      buildDevicePollIpKey('203.0.113.9'),
      buildDevicePollKey('client-a', 'device-code'),
    ];
    for (const key of keys) {
      expect(key).not.toContain('203.0.113.9');
      expect(key).not.toContain('session-uid');
      expect(key).not.toContain('device-code');
    }
  });
});

describe('device request predicates', () => {
  it('accepts only a bounded non-empty device code', () => {
    expect(isBoundedDeviceCode('device')).toBe(true);
    expect(isBoundedDeviceCode('')).toBe(false);
    expect(isBoundedDeviceCode('a'.repeat(4_097))).toBe(false);
    expect(isBoundedDeviceCode(undefined)).toBe(false);
  });

  it('recognizes the exact device grant but not a duplicate array', () => {
    expect(isDeviceGrantBody({ grant_type: DEVICE_GRANT })).toBe(true);
    expect(isDeviceGrantBody({ grant_type: [DEVICE_GRANT] })).toBe(false);
    expect(isDeviceGrantBody({ grant_type: 'authorization_code' })).toBe(false);
    expect(isDeviceGrantBody(undefined)).toBe(false);
  });
});

describe('malformed-body address accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfter: 0,
      resetAt: new Date(),
    });
    vi.mocked(getRedis).mockReturnValue({
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
    } as never);
  });

  it('charges the user-code aggregate on /device', async () => {
    await countMalformedDeviceBody(createContext() as never);
    expect(checkRateLimit).toHaveBeenCalledWith(
      buildUserCodeIpKey('127.0.0.1'),
      DEVICE_USER_CODE_IP_RATE_LIMIT,
    );
  });

  it('charges the device-authorization aggregate on /device/auth', async () => {
    await countMalformedDeviceBody(createContext({ path: '/acme/device/auth' }) as never);
    expect(checkRateLimit).toHaveBeenCalledWith(
      buildDeviceAuthorizationIpKey('127.0.0.1'),
      DEVICE_AUTHORIZATION_IP_RATE_LIMIT,
    );
  });

  it('charges the generic token aggregate on /token', async () => {
    await countMalformedDeviceBody(createContext({ path: '/acme/token' }) as never);
    expect(checkRateLimit).toHaveBeenCalledWith(
      'ratelimit:token:ip:127.0.0.1',
      TOKEN_IP_RATE_LIMIT,
    );
  });

  it('ignores non-POST or unrelated paths', async () => {
    await countMalformedDeviceBody(createContext({ method: 'GET' }) as never);
    await countMalformedDeviceBody(createContext({ path: '/health' }) as never);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});

describe('device token hard-counter ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfter: 0,
      resetAt: new Date(),
    });
    vi.mocked(getRedis).mockReturnValue({
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
    } as never);
  });

  it('charges both hard counters for an overlong device code before rejecting it', async () => {
    const next = vi.fn();
    const ctx = createContext({
      path: '/acme/token',
      request: {
        body: { grant_type: DEVICE_GRANT, device_code: 'a'.repeat(4_097), client_id: 'client-a' },
      },
    });
    await deviceTokenRateLimiter()(ctx as never, next);

    expect(checkRateLimit).toHaveBeenCalledWith(
      buildDevicePollIpKey('127.0.0.1'),
      DEVICE_TOKEN_IP_RATE_LIMIT,
    );
    expect(checkRateLimit).toHaveBeenCalledWith(
      buildDevicePollKey('client-a', '127.0.0.1'),
      DEVICE_TOKEN_RATE_LIMIT,
    );
    expect(next).toHaveBeenCalledOnce();
    // A malformed code never reaches the soft interval Lua check.
    expect(vi.mocked(getRedis)().eval).not.toHaveBeenCalled();
  });
});

describe('device user-code primary key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfter: 0,
      resetAt: new Date(),
    });
  });

  it('resolves the provider session UID for the primary key', async () => {
    const next = vi.fn();
    const ctx = createContext();
    ctx.cookies.get.mockReturnValue('session-cookie-id');
    const provider = {
      cookieName: vi.fn().mockReturnValue('_session'),
      Session: { find: vi.fn().mockResolvedValue({ uid: 'provider-session-uid' }) },
    };
    await deviceUserCodeRateLimiter(provider as never)(ctx as never, next);

    expect(checkRateLimit).toHaveBeenCalledWith(
      buildUserCodeKey('org-1', '127.0.0.1', 'provider-session-uid'),
      expect.objectContaining({ max: 10, windowSeconds: 600 }),
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
