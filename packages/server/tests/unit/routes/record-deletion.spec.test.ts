import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** One required permanent-deletion route and its dedicated permission. */
interface DeleteRouteContract {
  readonly file: string;
  readonly prefix: string;
  readonly path: string;
  readonly permission: string;
  readonly parentParam?: string;
  readonly childParam: string;
  readonly notFoundMessage: string;
  readonly returnsAuthorityResult?: boolean;
}

/** The eight direct deletion endpoints exposed by the Admin API. */
const DELETE_ROUTES: readonly DeleteRouteContract[] = [
  {
    file: 'routes/organizations.ts',
    prefix: '/api/admin/organizations',
    path: '/:idOrSlug',
    permission: 'ORG_DELETE',
    childParam: 'idOrSlug',
    notFoundMessage: 'Organization not found',
  },
  {
    file: 'routes/applications.ts',
    prefix: '/api/admin/applications',
    path: '/:id',
    permission: 'APP_DELETE',
    childParam: 'id',
    notFoundMessage: 'Application not found',
  },
  {
    file: 'routes/applications.ts',
    prefix: '/api/admin/applications',
    path: '/:appId/modules/:moduleId',
    permission: 'MODULE_DELETE',
    parentParam: 'appId',
    childParam: 'moduleId',
    notFoundMessage: 'Module not found',
  },
  {
    file: 'routes/clients.ts',
    prefix: '/api/admin/clients',
    path: '/:id',
    permission: 'CLIENT_DELETE',
    childParam: 'id',
    notFoundMessage: 'Client not found',
  },
  {
    file: 'routes/roles.ts',
    prefix: '/api/admin/applications/:appId/roles',
    path: '/:roleId',
    permission: 'ROLE_DELETE',
    parentParam: 'appId',
    childParam: 'roleId',
    notFoundMessage: 'Role not found',
    returnsAuthorityResult: true,
  },
  {
    file: 'routes/permissions.ts',
    prefix: '/api/admin/applications/:appId/permissions',
    path: '/:permissionId',
    permission: 'PERMISSION_DELETE',
    parentParam: 'appId',
    childParam: 'permissionId',
    notFoundMessage: 'Permission not found',
    returnsAuthorityResult: true,
  },
  {
    file: 'routes/custom-claims.ts',
    prefix: '/api/admin/applications/:appId/claims',
    path: '/:claimId',
    permission: 'CLAIM_DELETE',
    parentParam: 'appId',
    childParam: 'claimId',
    notFoundMessage: 'Claim not found',
  },
  {
    file: 'routes/users.ts',
    prefix: '/api/admin/organizations/:orgId/users',
    path: '/:userId',
    permission: 'USER_DELETE',
    parentParam: 'orgId',
    childParam: 'userId',
    notFoundMessage: 'User not found',
  },
];

/** Resource-specific audit events written inside the deletion transaction. */
const DELETE_AUDIT_EVENTS = [
  'org.deleted',
  'app.deleted',
  'app.module.deleted',
  'client.deleted',
  'role.deleted',
  'permission.deleted',
  'claim.deleted',
  'user.deleted',
] as const;

/** Read one server source file relative to src/. */
async function source(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), 'src', relativePath), 'utf8');
}

/** Collapse whitespace so route declarations can be checked independently of formatting. */
function compact(value: string): string {
  return value.replace(/\s+/g, ' ');
}

/** Escape a literal string before embedding it in a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract one DELETE declaration through the next router declaration. */
function deleteRouteSection(routeSource: string, path: string): string {
  const startPattern = new RegExp(`router\\.delete\\(\\s*['"]${escapeRegExp(path)}['"]`);
  const match = startPattern.exec(routeSource);
  if (match?.index === undefined) return '';
  const nextRoute = routeSource
    .slice(match.index + match[0].length)
    .search(/router\.(?:get|post|put|patch|delete)\(/);
  return nextRoute < 0
    ? routeSource.slice(match.index)
    : routeSource.slice(match.index, match.index + match[0].length + nextRoute);
}

/** Read every production TypeScript file beneath src/. */
async function allProductionSources(): Promise<
  Array<{ readonly path: string; readonly text: string }>
> {
  const root = join(process.cwd(), 'src');
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
    }
  }

  await visit(root);
  return Promise.all(files.map(async (path) => ({ path, text: await readFile(path, 'utf8') })));
}

describe('record deletion Admin API specification', () => {
  // Delete replaces terminal lifecycle aliases, but security artifacts retain Revoke operations.
  it('ST-02 removes obsolete lifecycle routes while retaining artifact revocation routes', async () => {
    const routeSources = await Promise.all(
      [
        'routes/organizations.ts',
        'routes/applications.ts',
        'routes/clients.ts',
        'routes/roles.ts',
        'routes/permissions.ts',
        'routes/custom-claims.ts',
        'routes/users.ts',
        'routes/sessions.ts',
      ].map(source),
    );
    const routes = compact(routeSources.join('\n'));

    for (const obsoletePath of [
      '/:id/archive',
      '/:id/restore',
      '/:id/revoke',
      '/:userId/purge',
      '/:roleId/archive',
      '/:permissionId/archive',
      '/:claimId/archive',
    ]) {
      expect(routes).not.toContain(`'${obsoletePath}'`);
    }

    expect(routes).toMatch(/router\.post\(\s*'\/:id\/secrets\/:secretId\/revoke'/);
    expect(routes).toContain('ADMIN_PERMISSIONS.CLIENT_REVOKE');
    expect(routes).toMatch(/router\.delete\(\s*'\/:sessionId'/);
    expect(routes).toContain('ADMIN_PERMISSIONS.SESSION_REVOKE');
  });

  for (const contract of DELETE_ROUTES) {
    // Every deletion endpoint stays behind bearer authentication and one exact capability.
    it(`ST-06 registers authenticated DELETE ${contract.prefix}${contract.path} with ${contract.permission}`, async () => {
      const routeSource = compact(await source(contract.file));
      const prefix = new RegExp(
        `new Router\\(\\{ prefix: ['"]${escapeRegExp(contract.prefix)}['"] \\}\\)`,
      );
      const route = new RegExp(
        `router\\.delete\\( *['"]${escapeRegExp(contract.path)}['"], *requirePermission\\( *ADMIN_PERMISSIONS\\.${contract.permission} *\\)`,
      );

      expect(routeSource).toMatch(prefix);
      expect(routeSource).toContain('router.use(requireAdminAuth())');
      expect(routeSource).toMatch(route);
    });
  }

  // Route parameters are validated before a deletion service can receive them.
  it('ST-06 validates every delete identifier with an allowlist or Zod parser', async () => {
    const files = [...new Set(DELETE_ROUTES.map((contract) => contract.file))];
    for (const file of files) {
      const routeSource = await source(file);
      expect(routeSource).toMatch(/\.parse\(ctx\.params\)|safeParse\(ctx\.params\)/);
      expect(routeSource).toMatch(/\.uuid\(\)|identifierSchema|idOrSlugSchema/);
    }
  });

  // Nested deletes must pass both identifiers so a child from another parent is indistinguishable
  // from a missing record.
  it('ST-07 passes both parent and child identifiers for nested deletion', async () => {
    for (const contract of DELETE_ROUTES.filter(
      (candidate): candidate is DeleteRouteContract & { parentParam: string } =>
        candidate.parentParam !== undefined,
    )) {
      const routeSource = compact(await source(contract.file));
      const parent = `ctx.params.${contract.parentParam}`;
      const child = `ctx.params.${contract.childParam}`;
      const call = new RegExp(
        `delete[A-Za-z]+\\([^)]*${escapeRegExp(parent)}[^)]*${escapeRegExp(child)}[^)]*\\)`,
      );
      expect(routeSource).toMatch(call);
    }
  });

  // Authority-reducing deletes report whether the actor must authenticate again. Other record
  // deletes remain bodyless. Missing or mismatched records always use one fixed 404.
  it('ST-06 returns the resource success contract and fixed resource-specific 404 errors', async () => {
    for (const contract of DELETE_ROUTES) {
      const completeSource = await source(contract.file);
      const routeSource = compact(completeSource);
      const handler = compact(deleteRouteSection(completeSource, contract.path));
      expect(handler.length).toBeGreaterThan(0);
      expect(routeSource).toContain(`ctx.throw(404, '${contract.notFoundMessage}')`);
      if (contract.returnsAuthorityResult) {
        expect(handler).toContain('ctx.status = 200');
        expect(handler).toMatch(/ctx\.body\s*=\s*\{\s*data:\s*result\s*\}/);
      } else {
        expect(handler).toContain('ctx.status = 204');
        expect(handler).not.toMatch(/ctx\.body\s*=/);
      }
    }
  });

  // The control-plane organization and last capable administrator are guarded in both layers.
  it('ST-14 exposes control-plane deletion guards at service and repository boundaries', async () => {
    const organizationService = compact(await source('organizations/service.ts'));
    const organizationRepository = compact(await source('organizations/repository.ts'));
    const userService = compact(await source('users/service.ts'));
    const userRepository = compact(await source('users/repository.ts'));

    expect(organizationService).toMatch(/deleteOrganization[^]*isSuperAdmin/);
    expect(organizationRepository).toMatch(/deleteOrganization[^]*is_super_admin\s*=\s*FALSE/i);
    expect(userService).toMatch(/deleteUser[^]*porta-super-admin/);
    expect(userRepository).toMatch(/deleteUser[^]*FOR UPDATE[^]*porta-super-admin/);
  });

  // One transaction contains authority changes, a safe resource audit, and target deletion.
  it('ST-15–ST-17 keeps resource audit and post-commit registration inside deletion services', async () => {
    const production = await allProductionSources();
    const deletionSources = production.filter(({ text }) =>
      DELETE_AUDIT_EVENTS.some((event) => text.includes(`'${event}'`)),
    );
    const combined = compact(deletionSources.map(({ text }) => text).join('\n'));

    for (const event of DELETE_AUDIT_EVENTS) {
      expect(combined.match(new RegExp(escapeRegExp(`'${event}'`), 'g')) ?? []).toHaveLength(1);
    }
    expect(combined).toContain('writeAuditLogInTransaction');
    expect(combined).toContain('afterDatabaseCommit');
    expect(combined).toContain('revoked_at');
    expect(combined).toContain('oidc_payloads');
    expect(combined).not.toMatch(
      /metadata\s*:\s*\{[^}]*(?:grantIds|sessionIds|affectedUserIds|redisKeys)/,
    );
  });

  // A failed database step rolls back and cannot reach effects registered for after commit.
  it('ST-16 runs registered effects only after COMMIT and preserves the rollback path', async () => {
    const database = compact(await source('lib/database.ts'));

    expect(database).toMatch(
      /await client\.query\('COMMIT'\)[^]*for \(const effect of state\.afterCommit\)/,
    );
    expect(database).toMatch(
      /catch \(error\)[^]*if \(!committed\)[^]*await client\.query\('ROLLBACK'\)/,
    );
    expect(database.indexOf("await client.query('COMMIT')")).toBeLessThan(
      database.indexOf('for (const effect of state.afterCommit)'),
    );
  });

  // The generic mutation audit must tolerate deletion of its own actor without fabricating one.
  it('ST-18 resolves a deleted generic audit actor to null through a live-user subquery', async () => {
    const auditBoundary = compact(await source('middleware/admin-mutation-audit.ts'));

    expect(auditBoundary).toMatch(/admin\.mutation\.committed/);
    expect(auditBoundary).toMatch(/SELECT[^]*FROM users[^]*WHERE[^]*(?:actor|user)/i);
    expect(auditBoundary).toMatch(/actor_id|actorId/);
  });

  // Deletion cleanup schedules one detached Redis pass after commit and absorbs its own failure.
  it('ST-25 schedules identifier-free Redis cleanup with setImmediate and does not await it', async () => {
    const production = await allProductionSources();
    const cleanupSources = production.filter(
      ({ text }) =>
        text.includes('setImmediate') &&
        text.includes('afterDatabaseCommit') &&
        /redis/i.test(text) &&
        /delet|cleanup/i.test(text),
    );
    expect(cleanupSources).toHaveLength(1);

    const cleanup = compact(cleanupSources[0]?.text ?? '');
    expect(cleanup).toMatch(/afterDatabaseCommit\([^]*setImmediate\(/);
    expect(cleanup).toMatch(/setImmediate\([^]*(?:catch|try)[^]*(?:catch|warn)/);
    expect(cleanup).not.toMatch(/await\s+setImmediate/);
    expect(cleanup).not.toMatch(/setTimeout\s*\(/);
    expect(cleanup).not.toMatch(
      /logger\.(?:warn|error)\([^)]*(?:descriptor|grantIds|userIds|clientIds|redisKeys)/,
    );
  });
});
