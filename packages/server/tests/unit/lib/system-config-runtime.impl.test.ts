/** Covers raw cache recovery and internal-reader branches independently of policy specifications. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, warn, getPool } = vi.hoisted(() => ({
  query: vi.fn(),
  warn: vi.fn(),
  getPool: vi.fn(),
}));
vi.mock('../../../src/lib/database.js', () => ({ getPool }));
vi.mock('../../../src/lib/logger.js', () => ({ logger: { warn } }));

import {
  clearSystemConfigCache,
  getInternalSystemConfigString,
  getSystemConfigNumber,
} from '../../../src/lib/system-config.js';

describe('system configuration raw cache edges', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPool.mockReturnValue({ query });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    clearSystemConfigCache();
  });
  afterEach(() => vi.useRealTimers());

  it('should query immediately after a missing row becomes available', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ value: 1200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('should query immediately after storage recovers from a failed read', async () => {
    query
      .mockRejectedValueOnce(new Error('private storage failure'))
      .mockResolvedValueOnce({ rows: [{ value: 1200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private storage failure');
  });

  it('should classify pool acquisition failure as unavailable without exposing the error', async () => {
    getPool.mockImplementationOnce(() => {
      throw new Error('private connection details');
    });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(warn.mock.calls[0]?.[0]).toEqual({
      event: 'system-config-fallback',
      key: 'magic_link_ttl',
      reason: 'unavailable',
    });
    expect(query).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private connection details');
  });

  it('should retain a valid cached value during an outage only until its expiry', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: 1200 }] })
      .mockRejectedValue(new Error('storage unavailable'));
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    vi.advanceTimersByTime(59999);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('should keep cached policy independent for each key', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: 1200 }] })
      .mockResolvedValueOnce({ rows: [{ value: 7200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(await getSystemConfigNumber('password_reset_ttl')).toBe(7200);
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
    expect(query.mock.calls.map((call) => call[1])).toEqual([
      ['magic_link_ttl'],
      ['password_reset_ttl'],
    ]);
  });

  it.each([null, undefined])(
    'should classify a present %j value as invalid rather than missing',
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

  it('should re-read repaired invalid content after explicit clearing', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: '1200' }] })
      .mockResolvedValueOnce({ rows: [{ value: 1200 }] });
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(900);
    clearSystemConfigCache();
    expect(await getSystemConfigNumber('magic_link_ttl')).toBe(1200);
  });

  it.each([42, false, null, {}])(
    'should not coerce internal stored value %j into a string',
    async (value) => {
      query.mockResolvedValue({ rows: [{ value }] });
      expect(await getInternalSystemConfigString('super_admin_user_id', '')).toBe('');
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('should use the internal fallback during an outage without public-policy warnings', async () => {
    query.mockRejectedValue(new Error('private storage failure'));
    expect(await getInternalSystemConfigString('super_admin_user_id', '')).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('should reject an unknown JavaScript caller key before querying storage', async () => {
    await expect(
      Reflect.apply(getSystemConfigNumber, undefined, ['unknown_private_key']),
    ).rejects.toThrow('Unsupported system configuration key');
    expect(query).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
