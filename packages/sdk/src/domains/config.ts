/**
 * Config domain — system configuration management.
 *
 * @module domains/config
 */

import type { HttpTransport } from '../transport/types.js';
import type { ConfigEntry } from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface ConfigDomain {
  list(): Promise<ConfigEntry[]>;
  get(key: string): Promise<ConfigEntry>;
  set(key: string, value: string): Promise<ConfigEntry>;
}

export function createConfigDomain(transport: HttpTransport): ConfigDomain {
  return {
    async list() {
      const res = await transport.request({ method: 'GET', path: '/config' });
      return unwrapData<ConfigEntry[]>(res.body);
    },
    async get(key) {
      const res = await transport.request({ method: 'GET', path: `/config/${key}` });
      return unwrapData<ConfigEntry>(res.body);
    },
    async set(key, value) {
      const res = await transport.request({ method: 'PUT', path: `/config/${key}`, body: { value } });
      return unwrapData<ConfigEntry>(res.body);
    },
  };
}
