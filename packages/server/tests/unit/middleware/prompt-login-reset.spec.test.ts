/**
 * Specification tests for the prompt=login session-reset middleware helpers.
 *
 * Source: plans/auth-session-token-fixes/07-testing-strategy.md (ST-9, ST-10),
 * 03-02-prompt-login-session-reset.md, AR-1/AR-2/AR-3/AR-5, PF-004/PF-005.
 *
 * These define behavior BEFORE implementation. The pure helpers are tested
 * directly; the middleware behavior (cookie clear) is covered in impl tests.
 */

import { describe, it, expect } from 'vitest';
import {
  promptHasLogin,
  isInitialAuthorize,
} from '../../../src/middleware/prompt-login-reset.js';

describe('promptHasLogin (spec ST-9)', () => {
  it('returns true for "login"', () => {
    expect(promptHasLogin('login')).toBe(true);
  });

  it('returns true for "login consent" (space-delimited, login present)', () => {
    expect(promptHasLogin('login consent')).toBe(true);
  });

  it('returns false for "consent"', () => {
    expect(promptHasLogin('consent')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(promptHasLogin('')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(promptHasLogin(undefined)).toBe(false);
  });

  it('does not match a substring like "login_hint" value', () => {
    // 'logins' is not the token 'login'
    expect(promptHasLogin('logins')).toBe(false);
  });
});

describe('isInitialAuthorize (spec ST-10)', () => {
  it('matches GET /{slug}/auth', () => {
    expect(isInitialAuthorize('GET', '/acme/auth')).toBe(true);
  });

  it('matches POST /{slug}/auth', () => {
    expect(isInitialAuthorize('POST', '/acme/auth')).toBe(true);
  });

  it('matches GET /{slug}/auth/ (trailing slash)', () => {
    expect(isInitialAuthorize('GET', '/acme/auth/')).toBe(true);
  });

  it('does NOT match the resume route /{slug}/auth/{uid}', () => {
    expect(isInitialAuthorize('GET', '/acme/auth/uid123')).toBe(false);
  });

  it('does NOT match /{slug}/token', () => {
    expect(isInitialAuthorize('POST', '/acme/token')).toBe(false);
  });

  it('does NOT match /{slug}/jwks', () => {
    expect(isInitialAuthorize('GET', '/acme/jwks')).toBe(false);
  });

  it('does NOT match a non-OIDC method like DELETE', () => {
    expect(isInitialAuthorize('DELETE', '/acme/auth')).toBe(false);
  });
});
