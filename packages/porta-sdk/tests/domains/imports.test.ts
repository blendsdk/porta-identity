import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createImportsDomain } from '../../src/domains/imports.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

describe('domains/imports', () => {
  // ── provision ───────────────────────────────────────────────
  describe('provision', () => {
    it('calls POST /import with manifest', async () => {
      const manifest = {
        manifest: { organizations: [{ name: 'Org A', slug: 'org-a' }] },
        mode: 'merge' as const,
      };

      /** Response shape matching server ImportResult exactly */
      const body = {
        mode: 'merge',
        created: [{ type: 'organization', slug: 'org-a', name: 'Org A' }],
        updated: [],
        skipped: [],
        errors: [],
        credentials: [],
      };
      const transport = mockTransport({ body });
      const imports = createImportsDomain(transport);
      const result = await imports.provision(manifest);

      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST', path: '/import', body: manifest,
      });
      expect(result).toEqual(body);
    });

    it('returns result with created and updated entities', async () => {
      const body = {
        mode: 'overwrite',
        created: [{ type: 'application', slug: 'portal', name: 'Portal' }],
        updated: [{ type: 'organization', slug: 'acme', name: 'Acme Corp', changes: ['name'] }],
        skipped: [],
        errors: [],
        credentials: [],
      };
      const transport = mockTransport({ body });
      const imports = createImportsDomain(transport);
      const result = await imports.provision({ manifest: {}, mode: 'overwrite' });

      expect(result.mode).toBe('overwrite');
      expect(result.created).toHaveLength(1);
      expect(result.updated).toHaveLength(1);
      expect(result.updated[0].changes).toEqual(['name']);
    });

    it('returns result with skipped and error entries', async () => {
      const body = {
        mode: 'merge',
        created: [],
        updated: [],
        skipped: [{ type: 'organization', slug: 'acme', reason: 'Already exists' }],
        errors: [{ type: 'client', slug: 'bad-client', error: 'Invalid redirect URI' }],
        credentials: [],
      };
      const transport = mockTransport({ body });
      const imports = createImportsDomain(transport);
      const result = await imports.provision({ manifest: {}, mode: 'merge' });

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Already exists');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Invalid redirect URI');
    });

    it('returns client credentials for confidential clients', async () => {
      const body = {
        mode: 'merge',
        created: [{ type: 'client', slug: 'api-client', name: 'API Client' }],
        updated: [],
        skipped: [],
        errors: [],
        credentials: [{
          clientName: 'API Client',
          clientId: 'generated-id-123',
          clientType: 'confidential',
          secretPlaintext: 'secret-abc-123',
          secretId: 'secret-row-id',
          secretLabel: 'default',
          secretExpiresAt: '2027-01-01T00:00:00.000Z',
        }],
      };
      const transport = mockTransport({ body });
      const imports = createImportsDomain(transport);
      const result = await imports.provision({ manifest: {} });

      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].clientName).toBe('API Client');
      expect(result.credentials[0].secretPlaintext).toBe('secret-abc-123');
    });

    it('returns dry-run mode in result', async () => {
      const body = {
        mode: 'dry-run',
        created: [{ type: 'organization', slug: 'test-org', name: 'Test Org' }],
        updated: [],
        skipped: [],
        errors: [],
        credentials: [],
      };
      const transport = mockTransport({ body });
      const imports = createImportsDomain(transport);
      const result = await imports.provision({ manifest: {}, dryRun: true });

      expect(result.mode).toBe('dry-run');
    });
  });
});
