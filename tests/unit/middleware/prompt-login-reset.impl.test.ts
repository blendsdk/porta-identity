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
  stripSessionCookiesFromRequest,
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

/** Build a fake Koa ctx with a recording cookies.set and a raw req. */
function makeCtx(options: {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  cookieHeader?: string;
}) {
  const setCalls: Array<{ name: string; value: unknown; opts: Record<string, unknown> }> = [];
  const ctx = {
    method: options.method,
    path: options.path,
    query: options.query ?? {},
    ip: '127.0.0.1',
    // Raw Node request — this is what `provider.callback()(ctx.req, ctx.res)`
    // reads the session cookie from. The middleware must mutate this header.
    req: {
      headers: {
        cookie: options.cookieHeader,
      } as Record<string, string | undefined>,
    },
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

describe('stripSessionCookiesFromRequest (impl)', () => {
  it('removes _session and _session.sig but keeps unrelated cookies', () => {
    const req = {
      headers: {
        cookie: 'theme=dark; _session=abc123; _session.sig=xyz; lang=en',
      } as Record<string, string | undefined>,
    };

    stripSessionCookiesFromRequest({ req } as never, '_session');

    expect(req.headers.cookie).toBe('theme=dark; lang=en');
  });

  it('removes legacy variants (_session.legacy, _session.legacy.sig)', () => {
    const req = {
      headers: {
        cookie: '_session=a; _session.sig=b; _session.legacy=c; _session.legacy.sig=d; keep=1',
      } as Record<string, string | undefined>,
    };

    stripSessionCookiesFromRequest({ req } as never, '_session');

    expect(req.headers.cookie).toBe('keep=1');
  });

  it('deletes the cookie header entirely when only session cookies were present', () => {
    const req = {
      headers: {
        cookie: '_session=abc; _session.sig=def',
      } as Record<string, string | undefined>,
    };

    stripSessionCookiesFromRequest({ req } as never, '_session');

    expect(req.headers.cookie).toBeUndefined();
  });

  it('does NOT strip a cookie whose name merely contains the session name as a substring', () => {
    const req = {
      headers: {
        cookie: 'my_session=keep; _sessionx=keep2; _session=drop',
      } as Record<string, string | undefined>,
    };

    stripSessionCookiesFromRequest({ req } as never, '_session');

    expect(req.headers.cookie).toBe('my_session=keep; _sessionx=keep2');
  });

  it('is a no-op when there is no cookie header', () => {
    const req = { headers: {} as Record<string, string | undefined> };

    expect(() => stripSessionCookiesFromRequest({ req } as never, '_session')).not.toThrow();
    expect(req.headers.cookie).toBeUndefined();
  });

  it('is a no-op when there is no req at all', () => {
    expect(() => stripSessionCookiesFromRequest({} as never, '_session')).not.toThrow();
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

  // The critical fix: the provider reads the cookie from the INBOUND request,
  // so the middleware must strip it from ctx.req.headers.cookie before next().
  it('strips the stale session cookie from the INBOUND request header before next()', async () => {
    const { ctx } = makeCtx({
      method: 'GET',
      path: '/acme/auth',
      query: { prompt: 'login' },
      cookieHeader: 'theme=dark; _session=stale; _session.sig=staleSig',
    });

    let cookieSeenByNext: string | undefined;
    const captureNext = vi.fn(async () => {
      cookieSeenByNext = (ctx as never as { req: { headers: { cookie?: string } } }).req.headers
        .cookie;
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, captureNext);

    // The provider (called inside next) must NOT see the stale _session.
    expect(cookieSeenByNext).toBe('theme=dark');
  });

  it('does NOT strip the inbound cookie header when prompt is not login', async () => {
    const { ctx } = makeCtx({
      method: 'GET',
      path: '/acme/auth',
      query: { prompt: 'consent' },
      cookieHeader: 'theme=dark; _session=keepme; _session.sig=keepsig',
    });

    const mw = promptLoginReset(fakeProvider());
    await mw(ctx as never, next);

    expect(
      (ctx as never as { req: { headers: { cookie?: string } } }).req.headers.cookie,
    ).toBe('theme=dark; _session=keepme; _session.sig=keepsig');
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
