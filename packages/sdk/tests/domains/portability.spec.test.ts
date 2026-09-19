import { describe, expect, it, vi } from 'vitest';
import { createExportsDomain } from '../../src/domains/exports.js';
import { createImportsDomain } from '../../src/domains/imports.js';
import { PortaConflictError } from '../../src/errors/index.js';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';

const manifest = {
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
} as const;

const zeroCounts = { created: 0, updated: 0, skipped: 0, rejected: 0 } as const;

function result(mode: 'dry-run' | 'keep-existing' | 'update-existing') {
  return {
    mode,
    summary: {
      organizations: zeroCounts,
      applications: zeroCounts,
      application_modules: zeroCounts,
      roles: zeroCounts,
      permissions: zeroCounts,
      claim_definitions: zeroCounts,
      role_permission_mappings: zeroCounts,
      users: zeroCounts,
      user_role_assignments: zeroCounts,
      user_claim_values: zeroCounts,
      clients: zeroCounts,
    },
    items: [],
    errors: [],
  } as const;
}

function resolvingTransport(response: Partial<TransportResponse>): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({ status: 200, headers: {}, body: {}, ...response }),
  };
}

function rejectingTransport(error: unknown): HttpTransport {
  return { request: vi.fn().mockRejectedValue(error) };
}

describe('portability SDK wire contract', () => {
  // A manifest export sends the caller's closed selection unchanged and returns attachment metadata without writing a file.
  it('posts an exact export request and returns the parsed manifest with its safe filename', async () => {
    const request = {
      scope: { kind: 'organization' as const, organization_slug: 'acme' },
      categories: ['organizations' as const],
      application_selection: { all_applications: false, application_slugs: [] },
    };
    const transport = resolvingTransport({
      headers: { 'content-disposition': 'attachment; filename="selected-porta-data.json"' },
      body: manifest,
    });

    await expect(createExportsDomain(transport).manifest(request)).resolves.toStrictEqual({
      manifest,
      filename: 'selected-porta-data.json',
    });
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/export/manifest',
      body: request,
    });
  });

  // Missing or path-bearing attachment names are replaced with one path-free UTC fallback name.
  it.each([
    ['missing', undefined],
    ['absolute', 'attachment; filename="/tmp/export.json"'],
    ['traversal', 'attachment; filename="../private/export.json"'],
  ])('uses a safe fallback for an %s attachment filename', async (_case, disposition) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T10:11:12.345Z'));
    const headers = disposition === undefined ? {} : { 'content-disposition': disposition };
    const transport = resolvingTransport({ headers, body: manifest });

    try {
      const response = await createExportsDomain(transport).manifest({
        scope: { kind: 'environment' },
        categories: ['organizations'],
        application_selection: { all_applications: false, application_slugs: [] },
      });

      expect(response.filename).toBe('porta-manifest-2026-09-14T10-11-12-345Z.json');
      expect(response.filename).not.toMatch(/[\\/]/);
    } finally {
      vi.useRealTimers();
    }
  });

  // Preview always sends dry-run mode and returns the server's validated ordered result.
  it('posts a dry-run preview request and returns its typed result', async () => {
    const preview = result('dry-run');
    const transport = resolvingTransport({ body: preview });

    await expect(createImportsDomain(transport).preview(manifest)).resolves.toStrictEqual(preview);
    expect(transport.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/import',
      body: { manifest, mode: 'dry-run' },
    });
  });

  // An exact rejected-plan conflict remains renderable by returning its validated preview result.
  it('returns the bounded result from an exact preview rejection envelope', async () => {
    const preview = result('dry-run');
    const conflict = new PortaConflictError({
      error: 'Import plan rejected',
      code: 'import_plan_rejected',
      result: preview,
    });

    await expect(createImportsDomain(rejectingTransport(conflict)).preview(manifest)).resolves.toBe(
      preview,
    );
  });

  // A conflict that does not exactly match the safe rejected-plan envelope follows normal SDK error behavior.
  it('does not convert a malformed rejection envelope into a portability result', async () => {
    const conflict = new PortaConflictError({
      error: 'Different conflict',
      code: 'import_plan_rejected',
      result: result('dry-run'),
    });

    await expect(createImportsDomain(rejectingTransport(conflict)).preview(manifest)).rejects.toBe(
      conflict,
    );
  });

  // Apply sends only the original manifest and selected closed mode, preserving one-time credentials in the result.
  it.each(['keep-existing', 'update-existing'] as const)(
    'posts an exact %s apply request and returns committed credentials',
    async (mode) => {
      const applied = {
        ...result(mode),
        credentials: [
          {
            client_id: 'portal-client',
            label: 'Imported',
            secret: 'one-time-secret',
            expires_at: '2027-09-14T10:11:12.345Z',
          },
        ],
      };
      const transport = resolvingTransport({ body: applied });

      await expect(createImportsDomain(transport).apply(manifest, mode)).resolves.toStrictEqual(
        applied,
      );
      expect(transport.request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/import',
        body: { manifest, mode },
      });
    },
  );

  // An exact rejected apply returns its bounded result without manufacturing credential material.
  it('returns the bounded result from an exact apply rejection envelope', async () => {
    const rejected = result('update-existing');
    const conflict = new PortaConflictError({
      error: 'Import plan rejected',
      code: 'import_plan_rejected',
      result: rejected,
    });

    await expect(
      createImportsDomain(rejectingTransport(conflict)).apply(manifest, 'update-existing'),
    ).resolves.toBe(rejected);
    expect(rejected).not.toHaveProperty('credentials');
  });
});
