/** HTTP failures must not become fabricated configuration success results. */
import { describe, expect, it, vi } from 'vitest';
import { createConfigDomain } from '../../src/domains/config.js';
import { PortaNotFoundError, PortaServerError } from '../../src/errors/index.js';
import type { ConfigDomain } from '../../src/domains/config.js';

/** Real domain calls sharing only an external transport failure. */
const OPERATIONS: readonly ((config: ConfigDomain) => Promise<unknown>)[] = [
  (config) => config.list(),
  (config) => config.get('missing/key'),
  (config) => config.set('magic_link_ttl', 1200),
  (config) => config.setMany({ magic_link_ttl: 1200 }),
];

describe('configuration domain failure propagation', () => {
  it.each(OPERATIONS)('should preserve HTTP errors from each operation', async (invoke) => {
    const failure = new PortaServerError(503, { error: 'Configuration store is unavailable' });
    const request = vi.fn().mockRejectedValue(failure);
    await expect(invoke(createConfigDomain({ request }))).rejects.toBe(failure);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('should encode a non-catalog name and preserve its uniform not-found response', async () => {
    const failure = new PortaNotFoundError({ error: 'Configuration entry not found' });
    const request = vi.fn().mockRejectedValue(failure);
    await expect(createConfigDomain({ request }).get('private/path?query')).rejects.toBe(failure);
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/config/private%2Fpath%3Fquery',
    });
  });
});
