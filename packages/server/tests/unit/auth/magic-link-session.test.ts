/**
 * Unit tests for magic link session management (Redis-backed, single-use).
 *
 * Tests the _ml_session cookie + Redis session creation, consumption,
 * detection, and cookie clearing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() to avoid "Cannot access before initialization"
// ---------------------------------------------------------------------------

const { mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(-2),
  };
  return { mockRedis };
});

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(mockRedis),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createMagicLinkSession,
  consumeMagicLinkSession,
  hasMagicLinkSession,
  clearMagicLinkSessionCookie,
} from '../../../src/auth/magic-link-session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCtx(cookieValue: string | null = null) {
  const cookieStore: Record<string, string> = {};
  if (cookieValue) cookieStore['_ml_session'] = cookieValue;

  return {
    cookies: {
      get: vi.fn((name: string) => cookieStore[name] ?? undefined),
      set: vi.fn((name: string, value: string) => {
        if (value === '' || value === null) {
          delete cookieStore[name];
        } else {
          cookieStore[name] = value;
        }
      }),
    },
    _cookieStore: cookieStore,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('magic-link-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // createMagicLinkSession
  // =========================================================================

  describe('createMagicLinkSession', () => {
    it('should store session data in Redis with 5-minute TTL', async () => {
      const ctx = createMockCtx();
      const data = {
        userId: 'user-1',
        interactionUid: 'int-1',
        organizationId: 'org-1',
      };

      await createMagicLinkSession(ctx as never, data);

      // Should call Redis SET with EX 300
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('ml_session:'),
        JSON.stringify(data),
        'EX',
        300,
      );
    });

    it('should set an HttpOnly cookie with the session token', async () => {
      const ctx = createMockCtx();
      const data = {
        userId: 'user-1',
        interactionUid: 'int-1',
        organizationId: 'org-1',
      };

      await createMagicLinkSession(ctx as never, data);

      // Should set _ml_session cookie
      expect(ctx.cookies.set).toHaveBeenCalledWith(
        '_ml_session',
        expect.any(String), // random token
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          overwrite: true,
        }),
      );

      // The token set in cookie should match the Redis key
      const setCalls = ctx.cookies.set.mock.calls;
      const cookieToken = setCalls[0][1];
      expect(cookieToken).toHaveLength(64); // 32 bytes = 64 hex chars

      const redisKey = mockRedis.set.mock.calls[0][0];
      expect(redisKey).toBe(`ml_session:${cookieToken}`);
    });
  });

  // =========================================================================
  // consumeMagicLinkSession
  // =========================================================================

  describe('consumeMagicLinkSession', () => {
    const authority = { organizationId: 'org-1', interactionUid: 'int-1' };

    it('should return null when no cookie is present', async () => {
      const ctx = createMockCtx(null);
      const result = await consumeMagicLinkSession(ctx as never, authority);
      expect(result).toBeNull();
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });

    it('should atomically return and consume session data for exact authority', async () => {
      const sessionData = {
        userId: 'user-1',
        interactionUid: 'int-1',
        organizationId: 'org-1',
      };
      mockRedis.eval.mockResolvedValue(JSON.stringify(sessionData));

      const ctx = createMockCtx('session-token-abc');
      const result = await consumeMagicLinkSession(ctx as never, authority);

      expect(result).toEqual(sessionData);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('DEL', KEYS[1])"),
        2,
        'ml_session:session-token-abc',
        'interaction:org:int-1',
        'org-1',
        'int-1',
      );
      expect(ctx.cookies.set).toHaveBeenCalledWith(
        '_ml_session',
        '',
        expect.objectContaining({ maxAge: 0 }),
      );
    });

    it('should return null when session has expired (not in Redis)', async () => {
      mockRedis.eval.mockResolvedValue(-2);

      const ctx = createMockCtx('expired-token');
      const result = await consumeMagicLinkSession(ctx as never, authority);

      expect(result).toBeNull();
      // Should still clear the cookie
      expect(ctx.cookies.set).toHaveBeenCalledWith(
        '_ml_session',
        '',
        expect.objectContaining({ maxAge: 0 }),
      );
    });

    it('should preserve the cookie when tenant or interaction authority mismatches', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const ctx = createMockCtx('bound-token');
      const result = await consumeMagicLinkSession(ctx as never, {
        organizationId: 'org-foreign',
        interactionUid: 'int-changed',
      });

      expect(result).toBeNull();
      expect(ctx.cookies.set).not.toHaveBeenCalled();
      expect(ctx._cookieStore._ml_session).toBe('bound-token');
    });

    it('should clear the cookie when Redis rejects malformed stored data', async () => {
      mockRedis.eval.mockResolvedValue(-1);

      const ctx = createMockCtx('bad-token');
      const result = await consumeMagicLinkSession(ctx as never, authority);

      expect(result).toBeNull();
      expect(ctx._cookieStore._ml_session).toBeUndefined();
    });
  });

  // =========================================================================
  // hasMagicLinkSession
  // =========================================================================

  describe('hasMagicLinkSession', () => {
    it('should return true when _ml_session cookie exists', () => {
      const ctx = createMockCtx('some-token');
      expect(hasMagicLinkSession(ctx as never)).toBe(true);
    });

    it('should return false when no _ml_session cookie', () => {
      const ctx = createMockCtx(null);
      expect(hasMagicLinkSession(ctx as never)).toBe(false);
    });
  });

  // =========================================================================
  // clearMagicLinkSessionCookie
  // =========================================================================

  describe('clearMagicLinkSessionCookie', () => {
    it('should set _ml_session cookie to empty with maxAge 0', () => {
      const ctx = createMockCtx('token-to-clear');
      clearMagicLinkSessionCookie(ctx as never);

      expect(ctx.cookies.set).toHaveBeenCalledWith(
        '_ml_session',
        '',
        expect.objectContaining({
          httpOnly: true,
          maxAge: 0,
          overwrite: true,
        }),
      );
    });
  });
});
