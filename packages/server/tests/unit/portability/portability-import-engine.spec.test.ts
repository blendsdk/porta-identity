import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as portability from '../../../src/portability/index.js';
import {
  actor,
  alphaApplication,
  alphaOrganization,
  alphaUser,
  confidentialClient,
  importManifest,
  installImportRows,
  portableApplication,
  portableOrganization,
  portableUser,
  type ImportRows,
} from './portability-import-fixtures.js';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  runTransaction: vi.fn(),
  afterCommit: vi.fn(),
  generateSecret: vi.fn(() => 'one-time-import-secret'),
  hashSecret: vi.fn(() => Promise.resolve('$argon2id$imported-secret-hash')),
  authorityCleanup: vi.fn(() => Promise.resolve()),
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  runDatabaseTransaction: mocks.runTransaction,
  afterDatabaseCommit: mocks.afterCommit,
}));
vi.mock('../../../src/lib/logger.js', () => ({ logger: mocks.log }));
vi.mock('../../../src/clients/crypto.js', () => ({
  generateSecret: mocks.generateSecret,
  hashSecret: mocks.hashSecret,
}));
vi.mock('../../../src/lib/deletion-cleanup.js', () => ({
  registerAuthorityCleanup: mocks.authorityCleanup,
}));

/** Install destination rows for one planner or apply example. */
function useRows(rows: ImportRows): void {
  installImportRows(mocks.query, rows);
}

/** Return every SQL statement observed by the database double. */
function observedSql(): readonly string[] {
  return mocks.query.mock.calls.map(([sql]) => String(sql));
}

/** Assert that planning performed no product, relationship, secret, or audit mutation. */
function expectNoImportMutation(): void {
  expect(observedSql().join('\n')).not.toMatch(/\b(?:insert|update|delete)\b/i);
  expect(mocks.generateSecret).not.toHaveBeenCalled();
  expect(mocks.hashSecret).not.toHaveBeenCalled();
}

/** Find the public error codes returned by a rejected portability plan. */
function errorCodes(result: Awaited<ReturnType<typeof portability.buildPortabilityPlan>>) {
  return result.errors.map(({ code }) => code);
}

beforeEach(() => {
  vi.clearAllMocks();
  useRows({});
  mocks.runTransaction.mockImplementation(async (work: () => Promise<unknown>) => {
    await mocks.query('BEGIN');
    try {
      const result = await work();
      await mocks.query('COMMIT');
      return result;
    } catch (error) {
      await mocks.query('ROLLBACK');
      throw error;
    }
  });
});

describe('portability import planning specification', () => {
  // Equivalent natural keys reject after ordinary normalization and before mutation.
  it('should reject duplicate normalized natural keys without mutation', async () => {
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        users: [
          portableUser,
          { ...portableUser, email: '  MEMBER@ALPHA.EXAMPLE  ', given_name: 'Duplicate' },
        ],
      }),
      'dry-run',
    );

    expect(errorCodes(result)).toContain('duplicate_natural_key');
    expect(result.items).toStrictEqual([]);
    expectNoImportMutation();
  });

  // Permission slugs lose outer whitespace without changing arbitrary inner content.
  it('should trim only the outside of arbitrary permission slugs', async () => {
    useRows({ applications: [alphaApplication] });
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        applications: [portableApplication],
        permissions: [
          {
            application_slug: 'alpha-app',
            slug: '  reports:read / delegated  ',
            module_slug: null,
            name: 'Delegated reports',
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
        natural_key: { application_slug: 'alpha-app', slug: 'reports:read / delegated' },
      }),
    );
  });

  // Missing, ambiguous, and cross-parent references reject as bounded safe results.
  it.each([
    {
      name: 'missing',
      code: 'missing_dependency',
      rows: {},
      overrides: {
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
      name: 'ambiguous',
      code: 'ambiguous_dependency',
      rows: {
        applications: [alphaApplication, { ...alphaApplication, id: 'internal-app-duplicate' }],
      },
      overrides: {
        roles: [
          {
            application_slug: 'alpha-app',
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
      },
    },
    {
      name: 'cross-application',
      code: 'cross_scope_reference',
      rows: {},
      overrides: {
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
            application_slug: 'beta-app',
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
      name: 'cross-organization',
      code: 'cross_scope_reference',
      rows: {},
      overrides: {
        users: [portableUser],
        user_role_assignments: [
          {
            organization_slug: 'bravo',
            email: portableUser.email,
            application_slug: 'alpha-app',
            role_slug: 'operator',
          },
        ],
      },
    },
  ] as const)('should reject a $name parent before mutation', async ({ code, rows, overrides }) => {
    useRows(rows);
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['applications_authorization', 'users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        ...overrides,
      }),
      'dry-run',
    );

    expect(errorCodes(result)).toContain(code);
    expect(result.errors.length).toBeLessThanOrEqual(100);
    expect(JSON.stringify(result)).not.toMatch(/internal-|database|sql|query/i);
    expectNoImportMutation();
  });

  // The public error list is capped while complete rejected counts remain available.
  it('should cap dependency errors without undercounting rejected records', async () => {
    const roles = Array.from({ length: 105 }, (_, index) => ({
      application_slug: `missing-${String(index).padStart(3, '0')}`,
      slug: 'operator',
      name: 'Operator',
      description: null,
    }));
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: true, application_slugs: [] },
        roles,
      }),
      'dry-run',
    );

    expect(result.errors).toHaveLength(100);
    expect(result.summary.roles.rejected).toBe(105);
    expect(new Set(errorCodes(result))).toStrictEqual(new Set(['missing_dependency']));
  });

  // Dry-run reports creates, updates, skips, and pending credentials without durable effects.
  it('should produce a mutation-free mixed dry-run plan', async () => {
    useRows({
      organizations: [alphaOrganization],
      applications: [alphaApplication],
      users: [alphaUser],
    });
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: [
          'organizations',
          'applications_authorization',
          'users_assignments',
          'oidc_clients',
        ],
        application_selection: { all_applications: true, application_slugs: [] },
        organizations: [portableOrganization],
        applications: [{ ...portableApplication, name: 'Updated Alpha App' }],
        users: [portableUser],
        clients: [confidentialClient],
      }),
      'dry-run',
    );

    expect(new Set(result.items.map(({ action }) => action))).toEqual(
      new Set(['created', 'updated', 'skipped']),
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({
        entity_type: 'clients',
        action: 'created',
        credential_will_be_generated: true,
      }),
    );
    expect(result).not.toHaveProperty('credentials');
    expectNoImportMutation();
  });

  // Every entity group follows dependency order and normalized keys sort within a group.
  it('should order all groups and normalized natural keys deterministically', async () => {
    const result = await portability.buildPortabilityPlan(
      importManifest({
        scope: { kind: 'environment' },
        categories: [
          'organizations',
          'applications_authorization',
          'users_assignments',
          'oidc_clients',
        ],
        application_selection: { all_applications: true, application_slugs: [] },
        organizations: [{ ...portableOrganization, slug: 'zulu' }, portableOrganization],
        applications: [portableApplication],
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
            slug: 'operator',
            name: 'Operator',
            description: null,
          },
        ],
        permissions: [
          {
            application_slug: 'alpha-app',
            slug: 'orders:read',
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
            role_slug: 'operator',
            permission_slugs: ['orders:read'],
          },
        ],
        users: [portableUser],
        user_role_assignments: [
          {
            organization_slug: 'alpha',
            email: portableUser.email,
            application_slug: 'alpha-app',
            role_slug: 'operator',
          },
        ],
        user_claim_values: [
          {
            organization_slug: 'alpha',
            email: portableUser.email,
            application_slug: 'alpha-app',
            claim_name: 'department',
            value: 'operations',
          },
        ],
        clients: [
          { ...confidentialClient, client_type: 'public', token_endpoint_auth_method: 'none' },
        ],
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
      { slug: 'alpha' },
      { slug: 'zulu' },
    ]);
  });
});

describe('portability atomic apply specification', () => {
  // Every apply independently rebuilds its plan without preview tokens or retained state.
  it('should rebuild the plan for each apply', async () => {
    const manifest = importManifest({ organizations: [portableOrganization] });
    await portability.applyPortabilityManifest(manifest, 'keep-existing', actor);
    mocks.query.mockClear();
    await portability.applyPortabilityManifest(manifest, 'keep-existing', actor);

    expect(observedSql().some((sql) => /select/i.test(sql))).toBe(true);
    expect(manifest).not.toHaveProperty('preview_token');
  });

  // Relationship actions summarize all-existing, none-existing, and mixed edge sets.
  it.each([
    ['skipped', ['orders:read', 'orders:write']],
    ['created', []],
    ['updated', ['orders:read']],
  ] as const)('should report aggregate mapping action %s', async (action, existing) => {
    useRows({
      applications: [alphaApplication],
      roles: [{ id: 'role-id', application_slug: 'alpha-app', slug: 'operator' }],
      permissions: ['orders:read', 'orders:write'].map((slug) => ({
        id: `permission-${slug}`,
        application_slug: 'alpha-app',
        slug,
      })),
      role_permissions: [
        {
          application_slug: 'alpha-app',
          role_slug: 'operator',
          permission_slugs: existing,
        },
      ],
    });
    const result = await portability.applyPortabilityManifest(
      importManifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: false, application_slugs: ['alpha-app'] },
        role_permission_mappings: [
          {
            application_slug: 'alpha-app',
            role_slug: 'operator',
            permission_slugs: ['orders:read', 'orders:write'],
          },
        ],
      }),
      'keep-existing',
      actor,
    );

    expect(result.items).toContainEqual(
      expect.objectContaining({ entity_type: 'role_permission_mappings', action }),
    );
    expect(observedSql().join('\n')).not.toMatch(/\bdelete\b/i);
  });

  // Keep mode preserves matched fields; update mode changes only approved listed values; neither deletes.
  it.each(['keep-existing', 'update-existing'] as const)(
    'should preserve destination-only data in %s mode',
    async (mode) => {
      useRows({
        organizations: [{ ...alphaOrganization, name: 'Destination Name' }],
        applications: [],
        users: [{ ...alphaUser, password_hash: 'destination-password-hash' }],
        custom_claim_values: [
          {
            organization_slug: 'alpha',
            email: portableUser.email,
            application_slug: 'alpha-app',
            claim_name: 'destination_only',
            value: 'retain',
          },
        ],
      });
      const result = await portability.applyPortabilityManifest(
        importManifest({
          categories: ['organizations', 'applications_authorization', 'users_assignments'],
          application_selection: { all_applications: true, application_slugs: [] },
          organizations: [{ ...portableOrganization, name: 'Manifest Name' }],
          applications: [portableApplication],
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
          users: [{ ...portableUser, given_name: 'Imported Name' }],
          user_claim_values: [
            {
              organization_slug: 'alpha',
              email: portableUser.email,
              application_slug: 'alpha-app',
              claim_name: 'department',
              value: 'operations',
            },
          ],
        }),
        mode,
        actor,
      );
      const calls = JSON.stringify(mocks.query.mock.calls);

      expect(result.items).toContainEqual(
        expect.objectContaining({ entity_type: 'applications', action: 'created' }),
      );
      if (mode === 'keep-existing')
        expect(calls).not.toMatch(/update organizations[^]*Manifest Name/i);
      else expect(calls).toContain('Imported Name');
      expect(calls).not.toContain('destination-password-hash');
      expect(observedSql().join('\n')).not.toMatch(/\bdelete\b/i);
    },
  );

  // Immutable conflicts reject without creating or modifying a second record.
  it('should reject an immutable mismatch without mutation', async () => {
    useRows({ clients: [{ ...confidentialClient, id: 'client-id', application_type: 'native' }] });
    const result = await portability.buildPortabilityPlan(
      importManifest({
        categories: ['oidc_clients'],
        application_selection: { all_applications: true, application_slugs: [] },
        clients: [confidentialClient],
      }),
      'update-existing',
    );

    expect(errorCodes(result)).toContain('incompatible_record');
    expectNoImportMutation();
  });

  // Confidential client creation returns one hashed Imported secret with clamped UTC expiry.
  it('should create one committed confidential-client credential', async () => {
    useRows({ organizations: [alphaOrganization], applications: [alphaApplication] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T23:45:12.345Z'));
    try {
      const result = await portability.applyPortabilityManifest(
        importManifest({
          categories: ['oidc_clients'],
          application_selection: { all_applications: true, application_slugs: [] },
          clients: [confidentialClient],
        }),
        'keep-existing',
        actor,
      );

      expect(mocks.generateSecret).toHaveBeenCalledOnce();
      expect(mocks.hashSecret).toHaveBeenCalledWith('one-time-import-secret');
      expect(result.credentials).toStrictEqual([
        {
          client_id: 'alpha-web',
          label: 'Imported',
          secret: 'one-time-import-secret',
          expires_at: '2027-02-28T23:45:12.345Z',
        },
      ]);
      expect(JSON.stringify(mocks.query.mock.calls)).toContain('$argon2id$imported-secret-hash');
      expect(JSON.stringify(mocks.query.mock.calls)).not.toContain('one-time-import-secret');
    } finally {
      vi.useRealTimers();
    }
  });

  // Public and already-matched confidential clients never receive replacement secrets.
  it.each([
    [
      'public',
      { ...confidentialClient, client_type: 'public', token_endpoint_auth_method: 'none' },
      [],
    ],
    ['matched confidential', confidentialClient, [{ ...confidentialClient, id: 'client-id' }]],
  ] as const)('should return no secret for a %s client', async (_name, client, clients) => {
    useRows({
      organizations: [alphaOrganization],
      applications: [alphaApplication],
      clients,
    });
    const result = await portability.applyPortabilityManifest(
      importManifest({
        categories: ['oidc_clients'],
        application_selection: { all_applications: true, application_slugs: [] },
        clients: [client],
      }),
      'keep-existing',
      actor,
    );

    expect(mocks.generateSecret).not.toHaveBeenCalled();
    expect(result.credentials ?? []).toStrictEqual([]);
  });

  // Final write failure rolls back and exposes no credential or internal content.
  it('should roll back when the final audit write fails', async () => {
    useRows({ organizations: [alphaOrganization], applications: [alphaApplication] });
    const queryDestination = mocks.query.getMockImplementation();
    mocks.query.mockImplementation((sqlValue: unknown, values?: readonly unknown[]) => {
      const sql = String(sqlValue);
      if (/insert\s+into\s+audit_log/i.test(sql)) return Promise.reject(new Error('private SQL'));
      return queryDestination?.(sqlValue, values);
    });

    await expect(
      portability.applyPortabilityManifest(
        importManifest({
          categories: ['oidc_clients'],
          application_selection: { all_applications: true, application_slugs: [] },
          clients: [confidentialClient],
        }),
        'keep-existing',
        actor,
      ),
    ).rejects.toMatchObject({ code: 'import_execution_failed', status: 503 });
    expect(observedSql().some((sql) => /^\s*rollback\b/i.test(sql))).toBe(true);
    expect(JSON.stringify(Object.values(mocks.log).flatMap((log) => log.mock.calls))).not.toMatch(
      /private SQL|one-time-import-secret|alpha-web/i,
    );
  });

  // Locked users retain failure state; deactivation and authority loss schedule targeted post-commit cleanup.
  it.each(['active', 'inactive'] as const)(
    'should import %s lifecycle without restoring lock state',
    async (status) => {
      useRows({
        organizations: [alphaOrganization],
        users: [
          {
            ...alphaUser,
            status: 'locked',
            locked_at: '2026-09-13T10:00:00.000Z',
            failed_login_count: 5,
          },
        ],
      });
      await portability.applyPortabilityManifest(
        importManifest({
          categories: ['users_assignments'],
          application_selection: { all_applications: true, application_slugs: [] },
          users: [{ ...portableUser, status }],
        }),
        'update-existing',
        actor,
      );
      const calls = JSON.stringify(mocks.query.mock.calls);

      expect(calls).not.toMatch(/locked_at[^]*null|failed_login_count[^]*0/i);
      if (status === 'active') expect(calls).not.toMatch(/update users[^]*status[^]*active/i);
      else expect(mocks.afterCommit).toHaveBeenCalled();
      expect(mocks.authorityCleanup).not.toHaveBeenCalled();
      expect(observedSql().join('\n')).not.toMatch(/redis|session|token|grant/i);
    },
  );

  // Authority cleanup is targeted and registered after commit rather than awaited in SQL work.
  it('should schedule only affected-user authority cleanup after commit', async () => {
    useRows({ organizations: [alphaOrganization], users: [alphaUser] });
    await portability.applyPortabilityManifest(
      importManifest({
        categories: ['users_assignments'],
        application_selection: { all_applications: true, application_slugs: [] },
        users: [{ ...portableUser, status: 'inactive' }],
      }),
      'update-existing',
      actor,
    );

    expect(mocks.afterCommit).toHaveBeenCalled();
    expect(mocks.authorityCleanup).not.toHaveBeenCalled();
    expect(observedSql().join('\n')).not.toMatch(/redis|session|token|grant/i);
  });

  // Durable audit, logs, ordinary results, and later reads retain no one-time or internal content.
  it('should isolate the one-time credential from durable surfaces', async () => {
    useRows({ organizations: [alphaOrganization], applications: [alphaApplication] });
    const result = await portability.applyPortabilityManifest(
      importManifest({
        categories: ['oidc_clients'],
        application_selection: { all_applications: true, application_slugs: [] },
        clients: [confidentialClient],
      }),
      'keep-existing',
      actor,
    );
    const audit = mocks.query.mock.calls.find(([sql]) =>
      /insert\s+into\s+audit_log/i.test(String(sql)),
    );
    const durable = JSON.stringify({
      auditMetadata: Array.isArray(audit?.[1]) ? audit[1][6] : undefined,
      logs: Object.values(mocks.log).flatMap((log) => log.mock.calls),
    });
    const { credentials, ...repeatableResult } = result;

    expect(credentials?.[0]?.secret).toBe('one-time-import-secret');
    expect(durable).not.toMatch(
      /one-time-import-secret|\$argon2id|alpha-web|internal-|private SQL/i,
    );
    expect(JSON.stringify(repeatableResult)).not.toContain('one-time-import-secret');
    for (const item of result.items) expect(item).not.toHaveProperty('resolved_id');
  });
});
