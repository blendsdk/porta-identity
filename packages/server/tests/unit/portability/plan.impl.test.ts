import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildResolvedPortabilityPlan } from '../../../src/portability/plan.js';
import {
  alphaOrganization,
  confidentialClient,
  importManifest,
  installImportRows,
  portableOrganization,
} from './portability-import-fixtures.js';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  runDatabaseTransaction: async (work: () => Promise<unknown>) => work(),
}));

describe('portability planner implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installImportRows(mocks.query, {});
  });

  it('retains destination identifiers only in the private resolved snapshot', async () => {
    installImportRows(mocks.query, { organizations: [alphaOrganization] });

    const plan = await buildResolvedPortabilityPlan(
      importManifest({ organizations: [portableOrganization] }),
      'keep-existing',
    );

    expect(plan.snapshot.organizations[0]?.id).toBe(alphaOrganization.id);
    expect(JSON.stringify(plan.result)).not.toContain(alphaOrganization.id);
    expect(plan.result.items).toContainEqual({
      entity_type: 'organizations',
      action: 'skipped',
      natural_key: { slug: 'alpha' },
    });
  });

  it('caps public errors at 100 while counting every rejected record', async () => {
    const roles = Array.from({ length: 101 }, (_, index) => ({
      application_slug: `missing-app-${index}`,
      slug: `ROLE_${index}`,
      name: `Role ${index}`,
      description: null,
    }));

    const plan = await buildResolvedPortabilityPlan(
      importManifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: true, application_slugs: [] },
        roles,
      }),
      'dry-run',
    );

    expect(plan.result.errors).toHaveLength(100);
    expect(plan.result.summary.roles.rejected).toBe(101);
    expect(plan.result.items).toStrictEqual([]);
  });

  it('reads only organization tables for an organization-only manifest', async () => {
    await buildResolvedPortabilityPlan(
      importManifest({ organizations: [portableOrganization] }),
      'keep-existing',
    );

    const calls = mocks.query.mock.calls.map(([sql, values]) => ({ sql: String(sql), values }));
    expect(calls.map(({ sql }) => sql).join('\n')).not.toMatch(
      /FROM (?:applications|application_modules|roles|permissions|users|clients)\b/i,
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringMatching(/FROM organizations o\s+WHERE LOWER\(BTRIM\(slug\)\) = \$1/i),
          values: ['alpha'],
        }),
        expect.objectContaining({
          sql: expect.stringMatching(
            /FROM branding_assets b[^]*WHERE LOWER\(BTRIM\(o\.slug\)\) = \$1/i,
          ),
          values: ['alpha'],
        }),
      ]),
    );
  });

  it('binds organization, application, and client snapshot boundaries', async () => {
    await buildResolvedPortabilityPlan(
      importManifest({
        categories: ['users_assignments', 'oidc_clients'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        clients: [
          {
            ...confidentialClient,
            client_type: 'public',
            token_endpoint_auth_method: 'none',
          },
        ],
      }),
      'keep-existing',
    );

    const calls = mocks.query.mock.calls.map(([sql, values]) => ({ sql: String(sql), values }));
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringMatching(/FROM users u[^]*WHERE LOWER\(BTRIM\(o\.slug\)\) = \$1/i),
          values: ['alpha'],
        }),
        expect.objectContaining({
          sql: expect.stringMatching(
            /FROM user_roles ur[^]*LOWER\(BTRIM\(a\.slug\)\) = ANY\(\$2::text\[\]\)/i,
          ),
          values: ['alpha', ['alpha-app']],
        }),
        expect.objectContaining({
          sql: expect.stringMatching(
            /FROM clients c[^]*WHERE c\.client_id = ANY\(\$1::text\[\]\)/i,
          ),
          values: [['alpha-web']],
        }),
      ]),
    );
  });
});
