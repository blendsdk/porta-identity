/**
 * Implementation tests for the prompt=login session-reset middleware.
 *
 * Covers the middleware behavior (cookie clearing, no-op paths) and the
 * signing-free `clearSessionCookies` helper. Source:
 * plans/auth-session-token-fixes/07-testing-strategy.md (impl tests),
 * ST-11/ST-12/ST-13.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  promptLoginReset,
  clearSessionCookies,
} from '../../../src/middleware/prompt-login-reset.js';

// Audit log is fire-and-forget; stub it so tests don't hit the DB.
vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

/** Minimal fake provider exposing cookieName('session') → '_session'. */
function fakeProvider(cookieName = '_session') {
  return {
    cookieName: (_type: string) => cookieName,
  } as never;
}

/** Build a fake Koa ctx with a recording cookies.set. */
function makeCtx(options: {
  method: string;
  path: string;
  query?: Record<string, unknown>;
}) {
  const setCalls: Array<{ name: string; value: unknown; opts: Record<string, unknown> }> = [];
  const ctx = {
    method: options.method,
    path: options.path,
    query: options.query ?? {},
    ip: '127.0.0.1',
    cookies: {
      set: (name: string, value: unknown, opts: Record<string, unknown>) => {
        setCalls.push({ name, value, opts });
      },
    },
  };
  return { ctx, setCalls };
}

describe('clearSessionCookies (impl)', () => {
  it('expires BOTH _session and _session.sig at path / with correct attributes', () => {
    const { ctx, setCalls } = makeCtx({ method: 'GET', path: '/acme/auth' });

    clearSessionCookies(ctx as never, '_session');

    expect(setCalls).toHaveLength(2);
    const names = setCalls.map((c) => c.name);
    expect(names).toContain('_session');
    expect(names).toContain('_session.sig');

    for (const call of setCalls) {
      expect(call.value).toBeNull();
      expect(call.opts.path).toBe('/');
      expect(call.opts.httpOnly).toBe(true);
      expect(call.opts.sameSite).toBe('lax');
      // signing-free clear — must not rely on Koa signed cookies (PF-001)
      expect(call.opts.signed).toBe(false);
      expect(call.opts.maxAge).toBe(0);
    }
  });
});

describe('promptLoginReset middleware (impl)', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn(async () => undefined);
  });

  // ST-11
  it('ST-11: clears the session cookie pair on GET /{slug}/auth?prompt=login', async () => {
    const { ctx, setCalls } = makeCtx({
      method: 'GET',
      path: '/acme/auth',
      query: { prompt: 'login' },
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, next);

    expect(setCalls.map((c) => c.name)).toEqual(['_session', '_session.sig']);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // ST-13
  it('ST-13: does NOT clear cookies on authorize WITHOUT prompt=login (SSO preserved)', async () => {
    const { ctx, setCalls } = makeCtx({
      method: 'GET',
      path: '/acme/auth',
      query: { prompt: 'consent' },
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, next);

    expect(setCalls).toHaveLength(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear cookies on the resume route /{slug}/auth/{uid} even with prompt=login', async () => {
    const { ctx, setCalls } = makeCtx({
      method: 'GET',
      path: '/acme/auth/uid123',
      query: { prompt: 'login' },
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, next);

    expect(setCalls).toHaveLength(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear cookies on a non-authorize path like /{slug}/token', async () => {
    const { ctx, setCalls } = makeCtx({
      method: 'POST',
      path: '/acme/token',
      query: { prompt: 'login' },
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, next);

    expect(setCalls).toHaveLength(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles prompt provided as an array (e.g., repeated query param)', async () => {
    const { ctx, setCalls } = makeCtx({
      method: 'GET',
      path: '/acme/auth',
      query: { prompt: ['login', 'consent'] },
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, next);

    expect(setCalls.map((c) => c.name)).toEqual(['_session', '_session.sig']);
  });

  it('uses the provider-resolved session cookie name', async () => {
    const { ctx, setCalls } = makeCtx({
      method: 'GET',
      path: '/acme/auth',
      query: { prompt: 'login' },
    });

    const mw = promptLoginReset(fakeProvider('_customsession'));
    await mw(ctx as never, next);

    expect(setCalls.map((c) => c.name)).toEqual(['_customsession', '_customsession.sig']);
  });
});
