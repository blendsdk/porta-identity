import { describe, it, expect, vi } from 'vitest';
import { generateCsrfToken, verifyCsrfToken, setCsrfCookie, getCsrfFromCookie } from '../../../src/auth/csrf.js';
import type { Context } from 'koa';

describe('generateCsrfToken', () => {
  it('should return a non-empty string', () => {
    const token = generateCsrfToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('should return a base64url-encoded string', () => {
    const token = generateCsrfToken();
    // base64url uses only [A-Za-z0-9_-] characters (no +, /, or =)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should generate a 43-character string (32 bytes base64url)', () => {
    const token = generateCsrfToken();
    // 32 bytes → 43 base64url characters (no padding)
    expect(token.length).toBe(43);
  });

  it('should produce different tokens on each call', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });
});

describe('verifyCsrfToken', () => {
  it('should return true when tokens match', () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it('should return false when tokens do not match', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(verifyCsrfToken(token1, token2)).toBe(false);
  });

  it('should return false when expected is undefined', () => {
    expect(verifyCsrfToken(undefined, 'some-token')).toBe(false);
  });

  it('should return false when actual is undefined', () => {
    expect(verifyCsrfToken('some-token', undefined)).toBe(false);
  });

  it('should return false when both are undefined', () => {
    expect(verifyCsrfToken(undefined, undefined)).toBe(false);
  });

  it('should return false when expected is empty string', () => {
    expect(verifyCsrfToken('', 'some-token')).toBe(false);
  });

  it('should return false when actual is empty string', () => {
    expect(verifyCsrfToken('some-token', '')).toBe(false);
  });

  it('should return false when both are empty strings', () => {
    expect(verifyCsrfToken('', '')).toBe(false);
  });

  it('should return false for tokens with different lengths', () => {
    expect(verifyCsrfToken('short', 'much-longer-token')).toBe(false);
  });

  it('should use constant-time comparison (no early exit on partial match)', () => {
    // This test verifies the function works correctly with similar tokens —
    // actual timing attack resistance is a property of crypto.timingSafeEqual
    const token = generateCsrfToken();
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyCsrfToken(token, tampered)).toBe(false);
  });

  it('should handle unicode strings correctly', () => {
    // Both strings are the same unicode — should match
    expect(verifyCsrfToken('token-with-émojis', 'token-with-émojis')).toBe(true);
  });

  it('should reject different unicode strings', () => {
    expect(verifyCsrfToken('token-α', 'token-β')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setCsrfCookie
// ---------------------------------------------------------------------------

describe('setCsrfCookie', () => {
  function createMockCtx(secure = false): Context {
    const setCookie = vi.fn();
    return { secure, cookies: { set: setCookie, get: vi.fn() } } as unknown as Context;
  }

  it('should set an HttpOnly SameSite=Lax cookie named _csrf', () => {
    const ctx = createMockCtx();
    setCsrfCookie(ctx, 'test-token-abc');

    expect(ctx.cookies.set).toHaveBeenCalledOnce();
    expect(ctx.cookies.set).toHaveBeenCalledWith('_csrf', 'test-token-abc', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      overwrite: true,
    });
  });

  it('should set secure=true when ctx.secure is true (HTTPS connection)', () => {
    const ctx = createMockCtx(true);
    setCsrfCookie(ctx, 'secure-token');

    expect(ctx.cookies.set).toHaveBeenCalledWith('_csrf', 'secure-token', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      overwrite: true,
    });
  });

  it('should set secure=false when ctx.secure is false (HTTP connection)', () => {
    const ctx = createMockCtx(false);
    setCsrfCookie(ctx, 'http-token');

    expect(ctx.cookies.set).toHaveBeenCalledWith(
      '_csrf',
      'http-token',
      expect.objectContaining({ secure: false }),
    );
  });
});

// ---------------------------------------------------------------------------
// getCsrfFromCookie
// ---------------------------------------------------------------------------

describe('getCsrfFromCookie', () => {
  it('should return the cookie value when _csrf cookie is set', () => {
    const ctx = {
      cookies: { get: vi.fn().mockReturnValue('my-csrf-token') },
    } as unknown as Context;

    expect(getCsrfFromCookie(ctx)).toBe('my-csrf-token');
    expect(ctx.cookies.get).toHaveBeenCalledWith('_csrf');
  });

  it('should return undefined when _csrf cookie is not set', () => {
    const ctx = {
      cookies: { get: vi.fn().mockReturnValue(undefined) },
    } as unknown as Context;

    expect(getCsrfFromCookie(ctx)).toBeUndefined();
  });

  it('should return undefined when cookies.get returns null-ish', () => {
    // Koa cookies.get can return undefined when the cookie does not exist
    const ctx = {
      cookies: { get: vi.fn().mockReturnValue(null) },
    } as unknown as Context;

    // Our ?? undefined normalizes null to undefined
    expect(getCsrfFromCookie(ctx)).toBeUndefined();
  });

  it('should return the token as-is (no transformation)', () => {
    const token = generateCsrfToken();
    const ctx = {
      cookies: { get: vi.fn().mockReturnValue(token) },
    } as unknown as Context;

    expect(getCsrfFromCookie(ctx)).toBe(token);
  });
});
