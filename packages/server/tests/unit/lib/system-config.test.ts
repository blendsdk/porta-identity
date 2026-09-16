/** Regression coverage for safe catalog reads and the separately named internal setting boundary. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, warn } = vi.hoisted(() => ({ query: vi.fn(), warn: vi.fn() }));
vi.mock('../../../src/lib/database.js', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../src/lib/logger.js', () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));

import {
  clearSystemConfigCache,
  getInternalSystemConfigString,
  getSystemConfigNumber,
  getSystemConfigString,
  loadOidcTtlConfig,
} from '../../../src/lib/system-config.js';

describe('system configuration safety regressions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearSystemConfigCache();
  });

  it('should return and cache a valid native number', async () => {
    query.mockResolvedValue({ rows: [{ value: 1200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('should reject numeric text instead of coercing it', async () => {
    query.mockResolvedValue({ rows: [{ value: '1200' }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
  });

  it('should reject numbers instead of coercing them to a locale string', async () => {
    query.mockResolvedValue({ rows: [{ value: 42 }] });
    expect(await getSystemConfigString('default_locale')).toBe('en');
  });

  it('should retain safe default provider lifetimes when rows are missing', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await loadOidcTtlConfig()).toEqual({
      accessToken: 3600,
      idToken: 3600,
      refreshToken: 2592000,
      authorizationCode: 600,
      session: 86400,
      interaction: 3600,
      grant: 2592000,
    });
  });

  it('should use a safe default after database failure without logging its raw exception', async () => {
    query.mockRejectedValue(new Error('private-database-details'));
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-database-details');
  });

  it('should read an internal string only through the separate internal reader', async () => {
    query.mockResolvedValue({ rows: [{ value: 'internal-user' }] });
    expect(await getInternalSystemConfigString('super_admin_user_id', '')).toBe('internal-user');
  });

  it('should preserve internal fallback when its row is missing or unavailable', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('internal-store-details'));
    expect(await getInternalSystemConfigString('super_admin_user_id', '')).toBe('');
    clearSystemConfigCache();
    expect(await getInternalSystemConfigString('super_admin_user_id', '')).toBe('');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('internal-store-details');
  });
});
