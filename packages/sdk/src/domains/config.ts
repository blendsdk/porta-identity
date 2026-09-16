/**
 * Config domain — system configuration management.
 *
 * @module domains/config
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  ConfigEntry,
  ConfigKey,
  ConfigValue,
  ConfigUpdateResult,
  ConfigBatchUpdateResult,
} from '../types/index.js';
import { unwrapData } from './helpers.js';
import { PortaError } from '../errors/index.js';

/** Metadata-driven access to the closed operational configuration catalog. */
export interface ConfigDomain {
  /** Read all authoritative entries, preserving server catalog order. */
  list(): Promise<readonly ConfigEntry[]>;
  /** Read an untrusted name; non-catalog names receive the server's uniform 404. */
  get(key: string): Promise<ConfigEntry>;
  /**
   * Update one native scalar and retain the required restart action.
   * @throws {PortaError} If a JavaScript caller supplies a bare dot path segment
   */
  set(key: ConfigKey, value: ConfigValue): Promise<ConfigUpdateResult>;
  /** Atomically update selected catalog keys; the server validates the entire batch. */
  setMany(
    values: Readonly<Partial<Record<ConfigKey, ConfigValue>>>,
  ): Promise<ConfigBatchUpdateResult>;
}

/**
 * Bind configuration operations to the existing authenticated HTTP transport.
 * Transport errors propagate unchanged; the server remains the validation authority.
 * @param transport - Authenticated Admin API transport
 * @returns Configuration operations without local policy metadata copies
 * @example
 * await createConfigDomain(transport).set('magic_link_ttl', 1200);
 */
export function createConfigDomain(transport: HttpTransport): ConfigDomain {
  return {
    async list() {
      const res = await transport.request({ method: 'GET', path: '/config' });
      return unwrapData<readonly ConfigEntry[]>(res.body);
    },
    async get(key) {
      const res = await transport.request({
        method: 'GET',
        path: `/config/${encodeURIComponent(key)}`,
      });
      return unwrapData<ConfigEntry>(res.body);
    },
    async set(key, value) {
      const encodedKey = encodeURIComponent(key);
      // JavaScript and agent callers bypass compile-time keys. Bare dots survive encoding and
      // are normalized by fetch, so reject them before they can leave the configuration route.
      if (encodedKey === '.' || encodedKey === '..') {
        throw new PortaError('Configuration key is invalid.');
      }
      const res = await transport.request({
        method: 'PUT',
        path: `/config/${encodedKey}`,
        body: { value },
      });
      // Updates intentionally retain the envelope: unwrapping would lose the restart decision.
      return res.body as ConfigUpdateResult;
    },
    async setMany(values) {
      const res = await transport.request({ method: 'PUT', path: '/config', body: { values } });
      return res.body as ConfigBatchUpdateResult;
    },
  };
}
