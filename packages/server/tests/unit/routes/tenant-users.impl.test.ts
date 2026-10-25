/**
 * Implementation tests for tenant schemas and write/delete rate limiting.
 *
 * The route specification covers end-to-end contracts; this file pins the
 * strict tenant schema boundary and the exact Redis limiter buckets.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { checkRateLimit } from '../../../src/auth/rate-limiter.js';
import {
  tenantCreateUserSchema,
  tenantUpdateUserSchema,
} from '../../../src/users/schemas.js';
import {
  TENANT_USER_DELETE_RATE_LIMIT,
  TENANT_USER_WRITE_RATE_LIMIT,
  tenantUserDeleteRateLimiter,
  tenantUserWriteRateLimiter,
} from '../../../src/middleware/tenant-user-rate-limiter.js';

const ACTOR = {
  kind: 'service' as const,
  clientId: 'bff-client',
  clientName: 'Tenant BFF',
  applicationId: 'app-1',
  organizationId: 'org-1',
  displayName: 'Tenant BFF',
};

function limiterCtx() {
  let statusCode = 200;
  let responseBody: unknown;
  const headers: Record<string, string> = {};
  return {
    state: { tenantActor: ACTOR },
    set(field: string, value: string) {
      headers[field.toLowerCase()] = value;
    },
    get status() {
      return statusCode;
    },
    set status(value: number) {
      statusCode = value;
    },
    get body() {
      return responseBody;
    },
    set body(value: unknown) {
      responseBody = value;
    },
    headers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
    allowed: true,
    remaining: 10,
    retryAfter: 0,
  });
});

describe('tenant request schemas', () => {
  it('rejects a password and unknown fields on tenant create', () => {
    expect(
      tenantCreateUserSchema.safeParse({
        email: 'user@example.test',
        password: 'Password1!',
      }).success,
    ).toBe(false);
    expect(
      tenantCreateUserSchema.safeParse({
        email: 'user@example.test',
        roleIds: ['role-1'],
      }).success,
    ).toBe(false);
  });

  it('rejects email, status, password, and 2FA fields on tenant update', () => {
    for (const field of [
      { email: 'changed@example.test' },
      { status: 'inactive' },
      { password: 'Password1!' },
      { twoFactorEnabled: true },
    ]) {
      expect(tenantUpdateUserSchema.safeParse(field).success).toBe(false);
    }
  });

  it('accepts the additive verification flags', () => {
    expect(
      tenantCreateUserSchema.safeParse({
        email: 'user@example.test',
        emailVerified: true,
        phoneNumber: '+15555550123',
        phoneNumberVerified: true,
      }).success,
    ).toBe(true);
    expect(
      tenantUpdateUserSchema.safeParse({ emailVerified: false, nickname: 'newbie' }).success,
    ).toBe(true);
  });
});

describe('tenant user rate limits', () => {
  it('keys write limiting by organization and client', async () => {
    const ctx = limiterCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await tenantUserWriteRateLimiter()(ctx as never, next);

    expect(checkRateLimit).toHaveBeenCalledWith(
      'ratelimit:tenant-user:write:org-1:bff-client',
      TENANT_USER_WRITE_RATE_LIMIT,
    );
    expect(ctx.headers['x-ratelimit-limit']).toBe('300');
    expect(next).toHaveBeenCalledOnce();
  });

  it('keys delete limiting by organization and client', async () => {
    const ctx = limiterCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await tenantUserDeleteRateLimiter()(ctx as never, next);

    expect(checkRateLimit).toHaveBeenCalledWith(
      'ratelimit:tenant-user:delete:org-1:bff-client',
      TENANT_USER_DELETE_RATE_LIMIT,
    );
    expect(ctx.headers['x-ratelimit-limit']).toBe('60');
  });

  it('returns 429 with Retry-After and does not continue when the budget is exhausted', async () => {
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 42,
    });
    const ctx = limiterCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await tenantUserWriteRateLimiter()(ctx as never, next);

    expect(ctx.status).toBe(429);
    expect(ctx.headers['retry-after']).toBe('42');
    expect(next).not.toHaveBeenCalled();
  });
});
