/** Verifies native policy defaults, safe fallback, bounded local caching and provider startup values. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, warn } = vi.hoisted(() => ({ query: vi.fn(), warn: vi.fn() }));
vi.mock('../../../src/lib/database.js', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  clearSystemConfigCache,
  getSystemConfigNumber,
  getSystemConfigString,
  loadOidcTtlConfig,
} from '../../../src/lib/system-config.js';

/** Independent native defaults prevent a runtime reader from inventing a caller-owned fallback. */
const NUMERIC_DEFAULTS = [
  ['access_token_ttl', 3600],
  ['id_token_ttl', 3600],
  ['refresh_token_ttl', 2592000],
  ['authorization_code_ttl', 600],
  ['session_ttl', 86400],
  ['magic_link_ttl', 900],
  ['password_reset_ttl', 3600],
  ['invitation_ttl', 604800],
  ['rate_limit_login_max', 10],
  ['rate_limit_login_window', 900],
  ['rate_limit_magic_link_max', 5],
  ['rate_limit_magic_link_window', 900],
  ['rate_limit_password_reset_max', 5],
  ['rate_limit_password_reset_window', 900],
  ['max_failed_logins', 5],
  ['lockout_duration_seconds', 900],
  ['audit_retention_days', 90],
] as const;

describe('system configuration runtime policy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z'));
    clearSystemConfigCache();
  });
  afterEach(() => vi.useRealTimers());

  it.each(NUMERIC_DEFAULTS)(
    'should use catalog default %s when its row is missing',
    async (key, value) => {
      query.mockResolvedValue({ rows: [] });
      expect(await getSystemConfigNumber(key)).toBe(value);
      expect(warn.mock.calls[0]?.[0]).toEqual({
        event: 'system-config-fallback',
        key,
        reason: 'missing',
      });
    },
  );

  it('should return native locale default when its row is missing', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await getSystemConfigString('default_locale')).toBe('en');
    expect(warn.mock.calls[0]?.[0]).toEqual({
      event: 'system-config-fallback',
      key: 'default_locale',
      reason: 'missing',
    });
  });

  it.each([1.5, '900', true, false, null, [], {}, 59, 3601].map((value) => [value]))(
    'should reject invalid native magic-link policy %j without coercion',
    async (value) => {
      query.mockResolvedValue({ rows: [{ value }] });
      expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
      expect(warn.mock.calls[0]?.[0]).toEqual({
        event: 'system-config-fallback',
        key: 'magic_link_ttl',
        reason: 'invalid',
      });
    },
  );

  it.each(['EN', 'nl', ' en ', 900, true, null, [], {}].map((value) => [value]))(
    'should use native locale fallback for invalid stored value %j',
    async (value) => {
      query.mockResolvedValue({ rows: [{ value }] });
      expect(await getSystemConfigString('default_locale')).toBe('en');
      expect(warn.mock.calls[0]?.[0]).toEqual({
        event: 'system-config-fallback',
        key: 'default_locale',
        reason: 'invalid',
      });
    },
  );

  // Neither database exceptions nor corrupt content may enter warning output.
  it('should return the safe default and fixed reason without logging infrastructure details', async () => {
    query.mockRejectedValue(new Error('private-host/password=private-value'));
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(warn.mock.calls[0]?.[0]).toEqual({
      event: 'system-config-fallback',
      key: 'magic_link_ttl',
      reason: 'unavailable',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-host');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-value');
  });

  it('should return valid native policy without emitting fallback warnings', async () => {
    query.mockResolvedValue({ rows: [{ value: 1200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(warn).not.toHaveBeenCalled();
  });

  it('should preserve a valid value until exactly the 60-second cache boundary', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: 900 }] })
      .mockResolvedValueOnce({ rows: [{ value: 1200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    vi.advanceTimersByTime(59999);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('should query immediately after explicit local cache clearing', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: 900 }] })
      .mockResolvedValueOnce({ rows: [{ value: 1200 }] });
    await getSystemConfigNumber('magic_link_ttl');
    clearSystemConfigCache();
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('should never refill the current cache from a read started before clearing', async () => {
    let completeOldRead: (result: { rows: Array<{ value: unknown }> }) => void = () => {
      throw new Error('Old read was not arranged');
    };
    const pending = new Promise<{ rows: Array<{ value: unknown }> }>((resolve) => {
      completeOldRead = resolve;
    });
    query.mockReturnValueOnce(pending).mockResolvedValueOnce({ rows: [{ value: 1200 }] });
    const oldRead = getSystemConfigNumber('magic_link_ttl');
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    clearSystemConfigCache();
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    completeOldRead({ rows: [{ value: 900 }] });
    await oldRead;
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('should read native startup lifetimes while keeping interaction fixed and grant tied to refresh', async () => {
    const values = new Map<string, number>([
      ['access_token_ttl', 7200],
      ['id_token_ttl', 1800],
      ['refresh_token_ttl', 5184000],
      ['authorization_code_ttl', 300],
      ['session_ttl', 172800],
    ]);
    query.mockImplementation((_sql: string, parameters: readonly string[]) =>
      Promise.resolve({ rows: [{ value: values.get(parameters[0] ?? '') }] }),
    );
    expect(await loadOidcTtlConfig()).toEqual({
      accessToken: 7200,
      idToken: 1800,
      refreshToken: 5184000,
      authorizationCode: 300,
      session: 172800,
      interaction: 3600,
      grant: 5184000,
    });
  });
});
