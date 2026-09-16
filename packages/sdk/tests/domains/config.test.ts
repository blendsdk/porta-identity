import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '../../src/transport/types.js';
import { createConfigDomain } from '../../src/domains/config.js';

describe('configuration transport failures', () => {
  it('should propagate HTTP rejection without fabricating a saved value', async () => {
    const failure = new Error('Transport unavailable');
    const transport: HttpTransport = { request: vi.fn().mockRejectedValue(failure) };
    await expect(createConfigDomain(transport).get('magic_link_ttl')).rejects.toBe(failure);
  });
});
