import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
} from '../helpers/factories.js';
import {
  clientRecord,
  durableCounts,
  getBuildPlanFunction,
  manifest,
  organizationRecord,
  seedDestination,
  userRecord,
} from './portability-import-live-fixtures.js';

beforeEach(async () => {
  await truncateAllTables();
});

describe('live portability import planning specification', () => {
  // Natural keys normalize before duplicate detection and planning never mutates durable state.
  it('should reject normalized duplicate users without mutation', async () => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const before = await durableCounts();
    const result = await buildPlan(
      manifest({
        categories: ['users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        users: [
          userRecord(),
          { ...userRecord(), email: '  MEMBER@ALPHA.EXAMPLE  ', given_name: 'Duplicate' },
        ],
      }),
      'dry-run',
    );

    expect(result.errors.map(({ code }) => code)).toContain('duplicate_natural_key');
    expect(await durableCounts()).toStrictEqual(before);
  });

  // Permission slugs trim their outer spaces but preserve arbitrary inner application content.
  it('should preserve permission inner content after outer trimming', async () => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const result = await buildPlan(
      manifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        permissions: [
          {
            application_slug: 'alpha-app',
            slug: '  orders:read / delegated  ',
            module_slug: null,
            name: 'Delegated order read',
            description: null,
          },
        ],
      }),
      'dry-run',
    );

    expect(result.errors).toStrictEqual([]);
    expect(result.items).toContainEqual(
      expect.objectContaining({
        entity_type: 'permissions',
        natural_key: { application_slug: 'alpha-app', slug: 'orders:read / delegated' },
      }),
    );
  });

  // Missing and cross-parent relationships reject the whole live plan with fixed safe codes.
  it.each([
    {
      name: 'missing application',
      code: 'missing_dependency',
      records: {
        roles: [
          {
            application_slug: 'missing-app',
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
      },
    },
    {
      name: 'cross-application permission',
      code: 'cross_scope_reference',
      records: {
        roles: [
          {
            application_slug: 'alpha-app',
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
        permissions: [
          {
            application_slug: 'other-app',
            slug: 'orders:read',
            module_slug: null,
            name: 'Read orders',
            description: null,
          },
        ],
        role_permission_mappings: [
          {
            application_slug: 'alpha-app',
            role_slug: 'operator',
            permission_slugs: ['orders:read'],
          },
        ],
      },
    },
    {
      name: 'cross-organization user',
      code: 'cross_scope_reference',
      records: {
        users: [userRecord()],
        user_role_assignments: [
          {
            organization_slug: 'other-org',
            email: 'member@alpha.example',
            application_slug: 'alpha-app',
            role_slug: 'OPERATOR',
          },
        ],
      },
    },
  ] as const)('should reject a $name without mutation', async ({ code, records }) => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const before = await durableCounts();
    const result = await buildPlan(
      manifest({
        categories: ['applications_authorization', 'users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        ...records,
      }),
      'dry-run',
    );

    expect(result.errors.map((error) => error.code)).toContain(code);
    expect(result.errors.length).toBeLessThanOrEqual(100);
    expect(JSON.stringify(result)).not.toMatch(/database|sql|uuid|stack|internal-/i);
    expect(await durableCounts()).toStrictEqual(before);
  });

  // Destination parents that collide after ordinary normalization reject as ambiguous.
  it('should reject an ambiguous normalized destination parent', async () => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    await getPool().query('INSERT INTO applications (name, slug) VALUES ($1, $2)', [
      'Case Variant',
      'ALPHA-APP',
    ]);
    const result = await buildPlan(
      manifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        roles: [
          {
            application_slug: 'alpha-app',
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
      }),
      'dry-run',
    );

    expect(result.errors.map(({ code }) => code)).toContain('ambiguous_dependency');
  });

  // Oversized missing-parent error sets remain bounded while counts stay complete.
  it('should bound dependency errors at one hundred', async () => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const roles = Array.from({ length: 105 }, (_, index) => ({
      application_slug: `missing-${String(index).padStart(3, '0')}`,
      slug: 'operator',
      name: 'Operator',
      description: null,
    }));
    const result = await buildPlan(
      manifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: true, application_slugs: [] },
        roles,
      }),
      'dry-run',
    );

    expect(result.errors).toHaveLength(100);
    expect(result.summary.roles.rejected).toBe(105);
    expect(new Set(result.errors.map(({ code }) => code))).toEqual(new Set(['missing_dependency']));
  });

  // Control-plane identities are rejected before content or mutation can enter the destination.
  it.each([
    ['organization', { organizations: [{ ...organizationRecord(), slug: 'porta-admin' }] }],
    [
      'application',
      {
        applications: [
          { slug: 'porta-admin', name: 'Porta Admin', description: null, status: 'active' },
        ],
      },
    ],
  ] as const)('should reject a protected control-plane %s', async (_name, records) => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const before = await durableCounts();
    const result = await buildPlan(
      manifest({
        scope: { kind: 'environment' },
        categories: ['organizations', 'applications_authorization'],
        application_selection: { all_applications: true, application_slugs: [] },
        ...records,
      }),
      'dry-run',
    );

    expect(result.errors.map(({ code }) => code)).toContain('control_plane_record');
    expect(await durableCounts()).toStrictEqual(before);
  });

  // Existing Client IDs cannot be moved across owner boundaries and reveal no destination details.
  it('should reject a cross-owner Client ID collision safely', async () => {
    const buildPlan = getBuildPlanFunction();
    const fixture = await seedDestination();
    const otherOrganization = await createTestOrganization({ name: 'Other', slug: 'other-org' });
    const otherApplication = await createTestApplication({ name: 'Other', slug: 'other-app' });
    await createTestClient(otherOrganization.id, otherApplication.id, {
      clientId: 'portable-client',
    });
    const before = await durableCounts();
    const result = await buildPlan(
      manifest({
        categories: ['oidc_clients'],
        application_selection: { all_applications: true, application_slugs: [] },
        clients: [clientRecord()],
      }),
      'dry-run',
    );

    expect(result.errors.map(({ code }) => code)).toContain('client_id_collision');
    expect(JSON.stringify(result)).not.toContain(otherOrganization.id);
    expect(JSON.stringify(result)).not.toContain(otherApplication.id);
    expect(JSON.stringify(result)).not.toContain(fixture.applicationId);
    expect(await durableCounts()).toStrictEqual(before);
  });

  // Immutable client mismatches reject instead of creating a second record or modifying the match.
  it('should reject an immutable mismatch without mutation', async () => {
    const buildPlan = getBuildPlanFunction();
    const fixture = await seedDestination();
    await createTestClient(fixture.organizationId, fixture.applicationId, {
      clientId: 'portable-client',
      applicationType: 'native',
    });
    const before = await durableCounts();
    const result = await buildPlan(
      manifest({
        categories: ['oidc_clients'],
        application_selection: { all_applications: true, application_slugs: [] },
        clients: [clientRecord()],
      }),
      'update-existing',
    );

    expect(result.errors.map(({ code }) => code)).toContain('incompatible_record');
    expect(await durableCounts()).toStrictEqual(before);
  });

  // Dry-run uses live destination state for ordered create/update/skip and credential intent only.
  it('should produce an ordered mutation-free mixed preview', async () => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const before = await durableCounts();
    const result = await buildPlan(
      manifest({
        categories: [
          'organizations',
          'applications_authorization',
          'users_assignments',
          'oidc_clients',
        ],
        application_selection: { all_applications: true, application_slugs: [] },
        organizations: [organizationRecord()],
        applications: [
          { slug: 'alpha-app', name: 'Updated Alpha', description: null, status: 'active' },
        ],
        users: [userRecord()],
        clients: [clientRecord()],
      }),
      'dry-run',
    );

    expect(new Set(result.items.map(({ action }) => action))).toEqual(
      new Set(['created', 'updated', 'skipped']),
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({ credential_will_be_generated: true }),
    );
    expect(result).not.toHaveProperty('credentials');
    expect(await durableCounts()).toStrictEqual(before);
  });

  // Complete plans expose every entity group in dependency order and sort normalized keys within groups.
  it('should order all eleven entity groups and their natural keys', async () => {
    const buildPlan = getBuildPlanFunction();
    await seedDestination();
    const result = await buildPlan(
      manifest({
        scope: { kind: 'environment' },
        categories: [
          'organizations',
          'applications_authorization',
          'users_assignments',
          'oidc_clients',
        ],
        application_selection: { all_applications: true, application_slugs: [] },
        organizations: [
          { ...organizationRecord(), slug: 'zulu-org', name: 'Zulu' },
          organizationRecord(),
        ],
        applications: [
          { slug: 'alpha-app', name: 'Alpha Application', description: null, status: 'active' },
        ],
        application_modules: [
          {
            application_slug: 'alpha-app',
            slug: 'orders',
            name: 'Orders',
            description: null,
            status: 'active',
          },
        ],
        roles: [
          {
            application_slug: 'alpha-app',
            slug: 'OPERATOR',
            name: 'Operator',
            description: null,
          },
        ],
        permissions: [
          {
            application_slug: 'alpha-app',
            slug: 'orders:read / delegated',
            module_slug: 'orders',
            name: 'Read orders',
            description: null,
          },
        ],
        claim_definitions: [
          {
            application_slug: 'alpha-app',
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
            application_slug: 'alpha-app',
            role_slug: 'OPERATOR',
            permission_slugs: ['orders:read / delegated'],
          },
        ],
        users: [userRecord()],
        user_role_assignments: [
          {
            organization_slug: 'alpha-org',
            email: 'member@alpha.example',
            application_slug: 'alpha-app',
            role_slug: 'OPERATOR',
          },
        ],
        user_claim_values: [
          {
            organization_slug: 'alpha-org',
            email: 'member@alpha.example',
            application_slug: 'alpha-app',
            claim_name: 'department',
            value: 'operations',
          },
        ],
        clients: [clientRecord('public')],
      }),
      'dry-run',
    );

    expect([...new Set(result.items.map(({ entity_type }) => entity_type))]).toStrictEqual([
      'organizations',
      'applications',
      'application_modules',
      'roles',
      'permissions',
      'claim_definitions',
      'role_permission_mappings',
      'users',
      'user_role_assignments',
      'user_claim_values',
      'clients',
    ]);
    expect(result.items.slice(0, 2).map(({ natural_key }) => natural_key)).toStrictEqual([
      { slug: 'alpha-org' },
      { slug: 'zulu-org' },
    ]);
  });
});
