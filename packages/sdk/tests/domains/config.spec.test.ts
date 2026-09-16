/** Native bodies and restart results survive the SDK HTTP boundary unchanged. */
import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '../../src/transport/types.js';
import { createConfigDomain } from '../../src/domains/config.js';

const ENTRY = {
  key: 'magic_link_ttl',
  group: 'lifetimes',
  label: 'Magic-link lifetime',
  description: 'How long a newly created magic-link token remains valid.',
  value: 1200,
  defaultValue: 900,
  valueType: 'integer',
  unit: 'seconds',
  minimum: 60,
  maximum: 3600,
  applicationMode: 'runtime',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

/** Replace only external HTTP, keeping real domain projection behavior. */
function fixture(body: unknown) {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, body });
  const transport: HttpTransport = { request };
  return { request, config: createConfigDomain(transport) };
}

describe('configuration SDK transport contract', () => {
  it('should list metadata and native scalars unchanged', async () => {
    const { request, config } = fixture({ data: [ENTRY] });
    expect(await config.list()).toEqual([ENTRY]);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'GET', path: '/config' });
  });
  it.each(['magic_link_ttl', 'unknown/name?x=1#fragment'])(
    'should encode arbitrary read key %s into one segment',
    async (key) => {
      const { request, config } = fixture({ data: ENTRY });
      expect(await config.get(key)).toEqual(ENTRY);
      expect(request).toHaveBeenCalledExactlyOnceWith({
        method: 'GET',
        path: `/config/${encodeURIComponent(key)}`,
      });
    },
  );
  it.each([false, true])(
    'should retain native single writes and restartRequired=%s',
    async (restartRequired) => {
      const result = { data: ENTRY, restartRequired };
      const { request, config } = fixture(result);
      expect(await config.set('magic_link_ttl', 1200)).toEqual(result);
      expect(request).toHaveBeenCalledExactlyOnceWith({
        method: 'PUT',
        path: '/config/magic_link_ttl',
        body: { value: 1200 },
      });
    },
  );
  it('should retain native locale strings and the update envelope', async () => {
    const result = {
      data: { ...ENTRY, key: 'default_locale', value: 'en', valueType: 'string' },
      restartRequired: false,
    };
    const { request, config } = fixture(result);
    expect(await config.set('default_locale', 'en')).toEqual(result);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'PUT',
      path: '/config/default_locale',
      body: { value: 'en' },
    });
  });
  it('should send a native batch unchanged and retain restart state', async () => {
    const result = { data: [ENTRY], restartRequired: true };
    const { request, config } = fixture(result);
    const values = { magic_link_ttl: 1200, access_token_ttl: 7200 };
    expect(await config.setMany(values)).toEqual(result);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'PUT',
      path: '/config',
      body: { values },
    });
  });
});
