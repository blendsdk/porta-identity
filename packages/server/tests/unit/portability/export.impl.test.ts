import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportPortabilityManifest } from '../../../src/portability/export.js';
import { PortabilityError, type PortabilityActor } from '../../../src/portability/types.js';

const database = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ connect: database.connect }),
}));

const actor: PortabilityActor = {
  userId: '00000000-0000-4000-8000-000000000001',
  controlPlaneOrganizationId: '00000000-0000-4000-8000-000000000002',
};

/** Build one database-shaped organization without installation-only fields in its result. */
function organization(id: string, slug: string) {
  return {
    id,
    slug,
    name: `${slug} organization`,
    status: 'active',
    is_super_admin: false,
    default_locale: 'en',
    default_login_methods: ['password'],
    two_factor_policy: 'optional',
    branding_logo_url: null,
    branding_favicon_url: null,
    branding_primary_color: null,
    branding_company_name: null,
    branding_custom_css: null,
  };
}

/** Return the SQL text from a recorded query call. */
function sqlAt(index: number): string {
  return String(database.query.mock.calls[index]?.[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  database.connect.mockResolvedValue({ query: database.query, release: database.release });
  database.query.mockImplementation((sqlValue: unknown, parametersValue: unknown) => {
    const sql = String(sqlValue).toLowerCase();
    if (/\bfrom\s+organizations\b/.test(sql)) {
      const parameters = Array.isArray(parametersValue) ? parametersValue : [];
      return Promise.resolve({
        rows:
          parameters.length === 2
            ? [organization('org-alpha', 'alpha')]
            : [organization('org-zulu', 'zulu'), organization('org-alpha', 'alpha')],
      });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
});

describe('portability export implementation', () => {
  it('should use a parameterized organization scope read', async () => {
    const result = await exportPortabilityManifest(
      {
        scope: { kind: 'organization', organization_slug: 'alpha' },
        categories: ['organizations'],
        application_selection: { all_applications: false, application_slugs: [] },
      },
      actor,
    );

    const organizationQueryIndex = database.query.mock.calls.findIndex(([sql]) =>
      /\bfrom\s+organizations\b/i.test(String(sql)),
    );
    expect(sqlAt(organizationQueryIndex)).not.toContain("slug = 'alpha'");
    expect(database.query.mock.calls[organizationQueryIndex]?.[1]).toEqual([
      actor.controlPlaneOrganizationId,
      'alpha',
    ]);
    expect(result.manifest.organizations.map(({ slug }) => slug)).toEqual(['alpha']);
    expect(result.manifest.organizations[0]).not.toHaveProperty('id');
  });

  it('should trim and sort application authorization natural keys', async () => {
    database.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue).toLowerCase();
      if (/\bfrom\s+organizations\b/.test(sql)) {
        return Promise.resolve({ rows: [organization('org-alpha', 'alpha')] });
      }
      if (/\bfrom\s+applications\b/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: 'app-alpha',
              slug: 'alpha-app',
              name: 'Alpha',
              description: null,
              status: 'active',
            },
          ],
        });
      }
      if (/\bfrom\s+roles\b/.test(sql)) {
        return Promise.resolve({
          rows: [
            { application_slug: 'alpha-app', slug: ' Z_ROLE ', name: 'Z', description: null },
            { application_slug: 'alpha-app', slug: 'A_ROLE', name: 'A', description: null },
          ],
        });
      }
      if (/\bfrom\s+permissions\b/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              application_slug: 'alpha-app',
              slug: ' z-permission ',
              module_slug: null,
              name: 'Z',
              description: null,
            },
            {
              application_slug: 'alpha-app',
              slug: 'a-permission',
              module_slug: null,
              name: 'A',
              description: null,
            },
          ],
        });
      }
      if (/\bfrom\s+role_permissions\b/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              application_slug: 'alpha-app',
              role_slug: ' Z_ROLE ',
              permission_slugs: [' z-permission ', 'a-permission'],
            },
          ],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const { manifest } = await exportPortabilityManifest(
      {
        scope: { kind: 'organization', organization_slug: 'alpha' },
        categories: ['applications_authorization'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
      },
      actor,
    );

    expect(manifest.roles.map(({ slug }) => slug)).toEqual(['A_ROLE', 'Z_ROLE']);
    expect(manifest.permissions.map(({ slug }) => slug)).toEqual(['a-permission', 'z-permission']);
    expect(manifest.role_permission_mappings[0]).toMatchObject({
      role_slug: 'Z_ROLE',
      permission_slugs: ['a-permission', 'z-permission'],
    });
  });

  it('should reject and roll back when an explicit application is missing', async () => {
    database.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue).toLowerCase();
      if (/\bfrom\s+organizations\b/.test(sql)) {
        return Promise.resolve({ rows: [organization('org-alpha', 'alpha')] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    await expect(
      exportPortabilityManifest(
        {
          scope: { kind: 'organization', organization_slug: 'alpha' },
          categories: ['applications_authorization'],
          application_selection: { all_applications: false, application_slugs: ['missing-app'] },
        },
        actor,
      ),
    ).rejects.toMatchObject<Partial<PortabilityError>>({
      status: 409,
      code: 'export_scope_rejected',
    });
    expect(database.query.mock.calls.some(([sql]) => /^\s*rollback\b/i.test(String(sql)))).toBe(
      true,
    );
    expect(database.release).toHaveBeenCalledOnce();
  });

  it('should reject more than 64 MiB before audit and roll back', async () => {
    const image = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(2 * 1024 * 1024 - 8),
    ]);
    const organizations = Array.from({ length: 25 }, (_, index) =>
      organization(`organization-${index}`, `organization-${index}`),
    );
    database.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue).toLowerCase();
      if (/\bfrom\s+organizations\b/.test(sql)) return Promise.resolve({ rows: organizations });
      if (/\bfrom\s+branding_assets\b/.test(sql)) {
        return Promise.resolve({
          rows: organizations.map(({ slug }) => ({
            organization_slug: slug,
            asset_type: 'logo',
            content_type: 'image/png',
            data: image,
          })),
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    await expect(
      exportPortabilityManifest(
        {
          scope: { kind: 'environment' },
          categories: ['organizations'],
          application_selection: { all_applications: false, application_slugs: [] },
        },
        actor,
      ),
    ).rejects.toMatchObject<Partial<PortabilityError>>({
      status: 413,
      code: 'export_manifest_too_large',
    });
    expect(
      database.query.mock.calls.some(([sql]) => /insert\s+into\s+audit_log/i.test(String(sql))),
    ).toBe(false);
    expect(database.query.mock.calls.some(([sql]) => /^\s*rollback\b/i.test(String(sql)))).toBe(
      true,
    );
  });
});
