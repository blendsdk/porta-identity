/**
 * Tests for admin metadata and server discovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAdminMetadata, fetchHealthStatus } from '../../src/auth/metadata.js';

describe('metadata', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchAdminMetadata', () => {
    it('returns admin metadata on successful response', async () => {
      const mockMetadata = {
        issuer: 'https://porta.local:3443/porta-admin',
        clientId: 'test-client-id',
        orgSlug: 'porta-admin',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMetadata),
      });

      const result = await fetchAdminMetadata('https://porta.local:3443');

      expect(result).toEqual(mockMetadata);
      expect(fetch).toHaveBeenCalledWith(
        'https://porta.local:3443/api/admin/metadata',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('throws on connection failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(fetchAdminMetadata('https://unreachable.example.com'))
        .rejects
        .toThrow('Cannot connect to https://unreachable.example.com');
    });

    it('throws on 503 (not initialized)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(fetchAdminMetadata('https://porta.local:3443'))
        .rejects
        .toThrow('Server not initialized');
    });

    it('throws on other HTTP errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(fetchAdminMetadata('https://porta.local:3443'))
        .rejects
        .toThrow('Cannot fetch admin metadata: HTTP 500');
    });
  });

  describe('fetchHealthStatus', () => {
    it('returns health response on success', async () => {
      const mockHealth = { status: 'ok', services: { database: 'ok', redis: 'ok' } };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockHealth),
      });

      const result = await fetchHealthStatus('https://porta.local:3443');
      expect(result).toEqual(mockHealth);
    });

    it('returns null on connection failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await fetchHealthStatus('https://unreachable.example.com');
      expect(result).toBeNull();
    });

    it('returns null on non-OK response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchHealthStatus('https://porta.local:3443');
      expect(result).toBeNull();
    });
  });
});
