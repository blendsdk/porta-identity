/** Native bodies and restart results survive the SDK HTTP boundary unchanged. */
import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '../../src/transport/types.js';
import { createConfigDomain } from '../../src/domains/config.js';
import { createPortaClient } from '../../src/client.js';
import { executeTool } from '../../src/agent.js';

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
  return { request, config: createConfigDomain(transport), transport };
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

describe('configuration mutation endpoint confinement', () => {
  const hostileKeys = [
    '../applications/app/claims/claim/users/user',
    '%2e%2e/applications/app/claims/claim/users/user',
    '..%2Fapplications%2Fapp',
    '..\\applications\\app',
    'magic_link_ttl?value=forged',
    'magic_link_ttl#fragment',
    '%2e%2e',
  ];

  for (const mode of ['runtime domain', 'real agent'] as const) {
    it.each(hostileKeys)(
      `should confine ${mode} key %s to one configuration URL segment`,
      async (key) => {
        const { request, config, transport } = fixture({ data: ENTRY, restartRequired: false });
        if (mode === 'runtime domain') {
          // JavaScript callers and agent arguments are not protected by compile-time key unions.
          await Reflect.apply(config.set, config, [key, 1200]);
        } else {
          await executeTool(createPortaClient({ transport }), 'config.set', { key, value: 1200 });
        }
        expect(request).toHaveBeenCalledExactlyOnceWith({
          method: 'PUT',
          path: `/config/${encodeURIComponent(key)}`,
          body: { value: 1200 },
        });
        const call = request.mock.calls[0]?.[0];
        if (typeof call?.path !== 'string') throw new Error('Expected one HTTP request path');
        // Fetch uses URL normalization, so checking the unnormalized request string alone is insufficient.
        const destination = new URL(`https://porta.example/api/admin${call.path}`);
        expect(destination.pathname).toBe(`/api/admin/config/${encodeURIComponent(key)}`);
        expect(destination.pathname).toMatch(/^\/api\/admin\/config\/[^/]+$/);
        expect(destination.search).toBe('');
        expect(destination.hash).toBe('');
      },
    );

    it.each(['.', '..'])(
      `should reject bare dot key %s from ${mode} before transport`,
      async (key) => {
        const { request, config, transport } = fixture({ data: ENTRY, restartRequired: false });
        if (mode === 'runtime domain') {
          await expect(Reflect.apply(config.set, config, [key, 1200])).rejects.toThrow();
        } else {
          expect(
            await executeTool(createPortaClient({ transport }), 'config.set', { key, value: 1200 }),
          ).toEqual(expect.objectContaining({ success: false }));
        }
        expect(request).not.toHaveBeenCalled();
      },
    );
  }
});
