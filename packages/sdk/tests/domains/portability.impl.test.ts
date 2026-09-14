import { describe, expect, it, vi } from 'vitest';
import { createExportsDomain } from '../../src/domains/exports.js';
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

/** Build a valid empty portability result for one operation mode. */
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

describe('portability SDK implementation edges', () => {
  it.each([
    'attachment; filename="..\\private.json"',
    'attachment; filename="manifest name.json"',
    `attachment; filename="${'a'.repeat(256)}"`,
  ])('replaces an unsafe attachment filename: %s', async (contentDisposition) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T10:11:12.345Z'));
    const transport = resolvingTransport({
      headers: { 'content-disposition': contentDisposition },
      body: manifest,
    });

    try {
      await expect(
        createExportsDomain(transport).manifest({
          scope: { kind: 'environment' },
          categories: ['organizations'],
          application_selection: { all_applications: false, application_slugs: [] },
        }),
      ).resolves.toMatchObject({ filename: 'porta-manifest-2026-09-14T10-11-12-345Z.json' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a rejected-plan conflict whose bounded error limit is exceeded', async () => {
    const rejected = {
      ...result('dry-run'),
      errors: Array.from({ length: 101 }, () => ({
        entity_type: 'organizations',
        natural_key: { slug: 'acme' },
        code: 'invalid_record',
      })),
    };
    const conflict = new PortaConflictError({
      error: 'Import plan rejected',
      code: 'import_plan_rejected',
      result: rejected,
    });
    const transport: HttpTransport = { request: vi.fn().mockRejectedValue(conflict) };

    await expect(createImportsDomain(transport).preview(manifest)).rejects.toBe(conflict);
  });

  it('preserves a rejected preview that contains credential material', async () => {
    const rejected = { ...result('dry-run'), credentials: [] };
    const conflict = new PortaConflictError({
      error: 'Import plan rejected',
      code: 'import_plan_rejected',
      result: rejected,
    });
    const transport: HttpTransport = { request: vi.fn().mockRejectedValue(conflict) };

    await expect(createImportsDomain(transport).preview(manifest)).rejects.toBe(conflict);
  });
});
