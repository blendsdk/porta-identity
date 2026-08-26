/**
 * Keys domain — signing key management.
 *
 * @module domains/keys
 */

import type { HttpTransport } from '../transport/types.js';
import type { SigningKey } from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface KeysDomain {
  list(): Promise<SigningKey[]>;
  generate(): Promise<SigningKey>;
  rotate(): Promise<SigningKey>;
}

export function createKeysDomain(transport: HttpTransport): KeysDomain {
  return {
    async list() {
      const res = await transport.request({ method: 'GET', path: '/keys' });
      return unwrapData<SigningKey[]>(res.body);
    },
    async generate() {
      const res = await transport.request({ method: 'POST', path: '/keys/generate' });
      return unwrapData<SigningKey>(res.body);
    },
    async rotate() {
      const res = await transport.request({ method: 'POST', path: '/keys/rotate' });
      return unwrapData<SigningKey>(res.body);
    },
  };
}
