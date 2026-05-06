import { describe, it, expect, vi } from 'vitest';
import { createPortaClient } from '../../src/client.js';
import type { HttpTransport } from '../../src/transport/types.js';

function mockTransport(): HttpTransport {
  return { request: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: {} }) };
}

describe('createPortaClient', () => {
  it('returns an object with all 19 domain namespaces', () => {
    const client = createPortaClient({ transport: mockTransport() });
    const expectedDomains = [
      'organizations', 'applications', 'clients', 'users',
      'userRoles', 'userClaims', 'roles', 'permissions', 'customClaims',
      'config', 'keys', 'audit', 'stats', 'sessions',
      'bulk', 'branding', 'exports', 'twoFactor', 'imports',
    ];
    for (const domain of expectedDomains) {
      expect(client).toHaveProperty(domain);
      expect(typeof client[domain as keyof typeof client]).toBe('object');
    }
  });

  it('each domain has expected methods', () => {
    const client = createPortaClient({ transport: mockTransport() });

    // Spot-check a few domains
    expect(typeof client.organizations.list).toBe('function');
    expect(typeof client.organizations.get).toBe('function');
    expect(typeof client.organizations.create).toBe('function');

    expect(typeof client.users.list).toBe('function');
    expect(typeof client.users.create).toBe('function');
    expect(typeof client.users.invite).toBe('function');

    expect(typeof client.stats.get).toBe('function');
    expect(typeof client.config.list).toBe('function');
    expect(typeof client.keys.rotate).toBe('function');
    expect(typeof client.audit.list).toBe('function');
    expect(typeof client.bulk.execute).toBe('function');
    expect(typeof client.imports.provision).toBe('function');
  });

  it('all domains share the same transport instance', async () => {
    const transport = mockTransport();
    const client = createPortaClient({ transport });

    // Call different domains — all should use the same transport
    await client.stats.get();
    await client.config.list();
    expect(transport.request).toHaveBeenCalledTimes(2);
  });
});
