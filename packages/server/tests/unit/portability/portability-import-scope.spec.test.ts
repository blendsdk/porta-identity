import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as portability from '../../../src/portability/index.js';
import {
  alphaOrganization,
  alphaUser,
  confidentialClient,
  importManifest,
  installImportRows,
  portableApplication,
  portableUser,
  type ImportRows,
} from './portability-import-fixtures.js';

const mocks = vi.hoisted(() => ({ query: vi.fn(), runTransaction: vi.fn() }));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  runDatabaseTransaction: mocks.runTransaction,
}));

/** Install destination rows for one planner example. */
function useRows(rows: ImportRows): void {
  installImportRows(mocks.query, rows);
}

/** Return the safe error codes produced by a rejected plan. */
function errorCodes(result: Awaited<ReturnType<typeof portability.buildPortabilityPlan>>) {
  return result.errors.map(({ code }) => code);
}

beforeEach(() => {
  vi.clearAllMocks();
  useRows({});
  mocks.runTransaction.mockImplementation(async (work: () => Promise<unknown>) => work());
});

describe('portability import scope specification', () => {
  // Duplicate records do not prevent reporting independent graph errors.
  it('should count every rejected record when duplicate and dependency errors coexist', async () => {
    useRows({ organizations: [alphaOrganization] });
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['applications_authorization', 'users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        roles: [
          {
            application_slug: 'missing-app',
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
        users: [
          portableUser,
          { ...portableUser, email: '  MEMBER@ALPHA.EXAMPLE  ', given_name: 'Duplicate' },
        ],
      }),
      'dry-run',
    );

    expect(result.summary.users).toStrictEqual({
      created: 0,
      updated: 0,
      skipped: 0,
      rejected: 2,
    });
    expect(result.summary.roles.rejected).toBe(1);
    expect(new Set(errorCodes(result))).toStrictEqual(
      new Set(['duplicate_natural_key', 'missing_dependency']),
    );
    expect(result.items).toStrictEqual([]);
  });

  // Organization scope must resolve even when only global records are transferred.
  it.each([
    {
      name: 'missing destination organization',
      organizations: [],
      code: 'missing_dependency',
    },
    {
      name: 'destination control plane',
      organizations: [{ ...alphaOrganization, is_super_admin: true }],
      code: 'control_plane_record',
    },
  ] as const)(
    'should reject $name before planning global records',
    async ({ organizations, code }) => {
      useRows({ organizations });
      const result = await portability.buildPortabilityPlan(
        importManifest({
          categories: ['applications_authorization'],
          application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
          applications: [portableApplication],
        }),
        'dry-run',
      );

      expect(errorCodes(result)).toContain(code);
      expect(result.items).toStrictEqual([]);
    },
  );

  // Every application-qualified collection must stay inside the declared selection.
  it('should reject records outside the explicit application selection', async () => {
    useRows({ organizations: [alphaOrganization], users: [alphaUser] });
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['applications_authorization', 'users_assignments', 'oidc_clients'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        applications: [{ ...portableApplication, slug: 'beta-app' }],
        application_modules: [
          {
            application_slug: 'beta-app',
            slug: 'orders',
            name: 'Orders',
            description: null,
            status: 'active',
          },
        ],
        roles: [
          {
            application_slug: 'beta-app',
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
        permissions: [
          {
            application_slug: 'beta-app',
            slug: 'orders:read',
            module_slug: 'orders',
            name: 'Read orders',
            description: null,
          },
        ],
        claim_definitions: [
          {
            application_slug: 'beta-app',
            claim_name: 'department',
            claim_type: 'string',
            description: null,
            include_in_id_token: true,
            include_in_access_token: true,
            include_in_userinfo: true,
          },
        ],
        role_permission_mappings: [
          {
            application_slug: 'beta-app',
            role_slug: 'operator',
            permission_slugs: ['orders:read'],
          },
        ],
        users: [portableUser],
        user_role_assignments: [
          {
            organization_slug: 'alpha',
            email: portableUser.email,
            application_slug: 'beta-app',
            role_slug: 'operator',
          },
        ],
        user_claim_values: [
          {
            organization_slug: 'alpha',
            email: portableUser.email,
            application_slug: 'beta-app',
            claim_name: 'department',
            value: 'operations',
          },
        ],
        clients: [{ ...confidentialClient, application_slug: 'beta-app' }],
      }),
      'dry-run',
    );

    const expectedTypes = [
      'applications',
      'application_modules',
      'roles',
      'permissions',
      'claim_definitions',
      'role_permission_mappings',
      'user_role_assignments',
      'user_claim_values',
      'clients',
    ];
    expect(result.errors).toHaveLength(expectedTypes.length);
    expect(result.errors.map(({ entity_type }) => entity_type)).toStrictEqual(expectedTypes);
    expect(new Set(errorCodes(result))).toStrictEqual(new Set(['cross_scope_reference']));
  });
});
