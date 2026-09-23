import { describe, expect, it, vi } from 'vitest';
import { createImportsDomain } from '../../src/domains/imports.js';
import { PortaConflictError } from '../../src/errors/index.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import type { PortabilityManifest, PortabilityResult } from '../../src/types/index.js';

const manifest: PortabilityManifest = {
  version: '1.0',
  exported_at: '2026-09-14T10:11:12.345Z',
  scope: { kind: 'organization', organization_slug: 'acme' },
  categories: ['organizations'],
  application_selection: { all_applications: false, application_slugs: [] },
  organizations: [],
  applications: [],
  application_modules: [],
  roles: [],
  permissions: [],
  claim_definitions: [],
  role_permission_mappings: [],
  users: [],
  user_role_assignments: [],
  user_claim_values: [],
  clients: [],
};

const counts = { created: 0, updated: 0, skipped: 0, rejected: 0 } as const;

/** Create a valid result for the requested preview or apply mode. */
function result(mode: PortabilityResult['mode']): PortabilityResult {
  return {
    mode,
    summary: {
      organizations: counts,
      applications: counts,
      application_modules: counts,
      roles: counts,
      permissions: counts,
      claim_definitions: counts,
      role_permission_mappings: counts,
      users: counts,
      user_role_assignments: counts,
      user_claim_values: counts,
      clients: counts,
    },
    items: [],
    errors: [],
  };
}

/** Create a transport that resolves with one response. */
function resolvingTransport(response: Partial<TransportResponse>): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: {}, ...response }),
  };
}

describe('domains/imports', () => {
  it('previews the manifest in dry-run mode', async () => {
    const body = result('dry-run');
    const transport = resolvingTransport({ body });

    await expect(createImportsDomain(transport).preview(manifest)).resolves.toBe(body);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/import',
      body: { manifest, mode: 'dry-run' },
    });
  });

  it('applies the manifest with the selected conflict policy', async () => {
    const body = result('update-existing');
    const transport = resolvingTransport({ body });

    await expect(createImportsDomain(transport).apply(manifest, 'update-existing')).resolves.toBe(
      body,
    );
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/import',
      body: { manifest, mode: 'update-existing' },
    });
  });

  it('returns a validated rejected plan', async () => {
    const rejected = result('dry-run');
    const transport: HttpTransport = {
      request: vi.fn().mockRejectedValue(
        new PortaConflictError({
          error: 'Import plan rejected',
          code: 'import_plan_rejected',
          result: rejected,
        }),
      ),
    };

    await expect(createImportsDomain(transport).preview(manifest)).resolves.toBe(rejected);
  });

  it('preserves normal conflict handling for a malformed rejection', async () => {
    const conflict = new PortaConflictError({
      error: 'Different conflict',
      code: 'import_plan_rejected',
      result: result('dry-run'),
    });
    const transport: HttpTransport = { request: vi.fn().mockRejectedValue(conflict) };

    await expect(createImportsDomain(transport).preview(manifest)).rejects.toBe(conflict);
  });
});
