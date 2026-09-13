import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildResolvedPortabilityPlan } from '../../../src/portability/plan.js';
import {
  alphaOrganization,
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
});
