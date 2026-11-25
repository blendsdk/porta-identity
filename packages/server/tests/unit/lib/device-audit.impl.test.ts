/**
 * Implementation tests for device audit classification and idempotency keys.
 *
 * The class distinction prevents a server-side abort from being recorded as a
 * user denial. Markers are one-way so the device code never appears in Redis.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
  afterDatabaseCommit: async (effect: () => Promise<void>) => effect(),
}));

import { writeAuditLogStrict } from '../../../src/lib/audit-log.js';
import { getPool } from '../../../src/lib/database.js';
import {
  classifyDeviceDenial,
  deviceAuditMarker,
} from '../../../src/oidc/device-pages.js';

describe('classifyDeviceDenial', () => {
  it('distinguishes a direct abort from a denial with a cause', () => {
    expect(classifyDeviceDenial({ name: 'AbortedError' })).toBe('aborted');
    expect(classifyDeviceDenial({ name: 'AbortedError', cause: { name: 'AccessDenied' } })).toBe(
      'denied',
    );
  });

  it('ignores provider re-render errors that are not user decisions', () => {
    expect(classifyDeviceDenial({ name: 'AlreadyUsedError' })).toBeUndefined();
    expect(classifyDeviceDenial({ name: 'NotFoundError' })).toBeUndefined();
    expect(classifyDeviceDenial(undefined)).toBeUndefined();
    expect(classifyDeviceDenial('AbortedError')).toBeUndefined();
  });
});

describe('writeAuditLogStrict', () => {
  it('propagates a failed insert so the idempotency marker can be removed', async () => {
    const query = vi.fn().mockRejectedValue(new Error('audit database unavailable'));
    vi.mocked(getPool).mockReturnValue({ query } as never);

    await expect(
      writeAuditLogStrict({
        eventType: 'user.device.authorized',
        eventCategory: 'authentication',
      }),
    ).rejects.toThrow('audit database unavailable');
  });
});

describe('deviceAuditMarker', () => {
  it('hashes the device code and separates outcome families', () => {
    const marker = deviceAuditMarker('authorized', 'device-code-value');
    expect(marker).toMatch(/^audit:device-authorized:[a-f0-9]{16}$/);
    expect(marker).not.toContain('device-code-value');
    expect(deviceAuditMarker('denied', 'device-code-value')).not.toBe(marker);
    expect(deviceAuditMarker('authorized', 'other-code')).not.toBe(marker);
  });
});
