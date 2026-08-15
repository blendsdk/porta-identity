import type { TenantAdminControlCheckDefinition } from './model.js';

/** Closed registry of defensive tenant/admin control checks. */
export const tenantAdminControlChecks: readonly TenantAdminControlCheckDefinition[] = Object.freeze(
  [
    {
      id: 'tenant-read-scope',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-28',
      targetPath: 'packages/server/src/users/repository.ts',
      originalSha256: 'sha256:36944ebc83caba411bd20373bb5a277a740211a433ea4cb08603f7e74ca5a8df',
      replacements: [
        {
          before:
            "const result = await pool.query<UserRow>(\n    'SELECT * FROM users WHERE organization_id = $1 AND email = $2',\n    [orgId, email],\n  );",
          after:
            "void orgId;\n  const result = await pool.query<UserRow>(\n    'SELECT * FROM users WHERE email = $1',\n    [email],\n  );",
        },
      ],
      subSentinel: 'ST-28_TENANT_READ_SCOPE',
      expectedSignature: 'ST28_TENANT_READ_SCOPE_CONTROL_ABSENCE',
    },
    {
      id: 'tenant-write-scope',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-29',
      targetPath: 'packages/server/src/routes/users.ts',
      originalSha256: 'sha256:2164928c2551efd587d9b5196fb5ff069dd730af68d519bec4f2146dff79d69f',
      replacements: [
        {
          before:
            "router.put(\n    '/:userId',\n    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),\n    requireUserOrganization(),",
          after:
            "router.put(\n    '/:userId',\n    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),",
        },
      ],
      subSentinel: 'ST-29_TENANT_WRITE_SCOPE',
      expectedSignature: 'ST29_TENANT_WRITE_SCOPE_CONTROL_ABSENCE',
    },
    {
      id: 'issuer-separation',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-30',
      targetPath: 'packages/server/src/server.ts',
      originalSha256: 'sha256:3e4b93e362d674669fbf8e255e0124bdd855bd4f931981fd0867ad210fd2a8e5',
      replacements: [
        {
          before:
            'await issuerStore.run(orgIssuer, () => oidcProvider.callback()(ctx.req, ctx.res));',
          after: 'void orgIssuer;\n      await oidcProvider.callback()(ctx.req, ctx.res);',
        },
      ],
      subSentinel: 'ST-30_ISSUER_SEPARATION',
      expectedSignature: 'ST30_ISSUER_SEPARATION_CONTROL_ABSENCE',
    },
    {
      id: 'organization-cache-scope',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-30',
      targetPath: 'packages/server/src/organizations/cache.ts',
      originalSha256: 'sha256:7850cff1c65fea7266c46a11a7b59e4426861cab607627d2bf2e1b6d7b3fa9d3',
      replacements: [
        {
          before: 'const data = await redis.get(`${SLUG_PREFIX}${slug}`);',
          after: 'const data = await redis.get(`${SLUG_PREFIX}shared-control-check`);',
        },
        {
          before: "await redis.set(`${SLUG_PREFIX}${org.slug}`, data, 'EX', CACHE_TTL);",
          after: "await redis.set(`${SLUG_PREFIX}shared-control-check`, data, 'EX', CACHE_TTL);",
        },
      ],
      subSentinel: 'ST-30_ORGANIZATION_CACHE_SEPARATION',
      expectedSignature: 'ST30_ORGANIZATION_CACHE_SEPARATION_CONTROL_ABSENCE',
    },
    {
      id: 'stale-authority-recheck',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-31',
      targetPath: 'packages/server/src/rbac/cache.ts',
      originalSha256: 'sha256:a3dd9eb834cbfb75c10f4941b16cbb1bdb9ce521872d5eee5f28e0d33806ae42',
      replacements: [
        {
          before:
            'await redis.del(\n      `${USER_ROLES_PREFIX}${userId}`,\n      `${USER_PERMISSIONS_PREFIX}${userId}`,\n    );',
          after: 'void redis;\n    await Promise.resolve();',
        },
      ],
      subSentinel: 'ST-31_STALE_AUTHORITY',
      expectedSignature: 'ST31_STALE_AUTHORITY_RECHECK_CONTROL_ABSENCE',
    },
    {
      id: 'admin-organization-membership',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-32',
      targetPath: 'packages/server/src/middleware/admin-auth.ts',
      originalSha256: 'sha256:7ba5bfa3c61578caa7fc4be11b2cd57e39ca92ff30697a4088e3cf0edb75f24e',
      replacements: [
        {
          before: 'if (user.organizationId !== superAdminOrg.id) {',
          after: 'if (user.organizationId.length === 0 && superAdminOrg.id.length === 0) {',
        },
      ],
      subSentinel: 'ST-32_ADMIN_ORGANIZATION_MEMBERSHIP',
      expectedSignature: 'ST32_ADMIN_ORGANIZATION_MEMBERSHIP_CONTROL_ABSENCE',
    },
    {
      id: 'admin-permission-rbac',
      claimId: 'CLAIM-R5-03',
      sentinelId: 'ST-32',
      targetPath: 'packages/server/src/middleware/require-permission.ts',
      originalSha256: 'sha256:89f7e60458fdafe80fd4429620e30ef005304bb18a35c423f2a8cbea7a0ad5d9',
      replacements: [
        {
          before: 'if (!hasPermissions([...adminUser.permissions], requiredPermissions)) {',
          after:
            'void hasPermissions;\n    if (requiredPermissions.length === 0 && adminUser.permissions.length === 0) {',
        },
      ],
      subSentinel: 'ST-32_PERMISSION_RBAC',
      expectedSignature: 'ST32_ADMIN_PERMISSION_RBAC_CONTROL_ABSENCE',
    },
  ],
);

/** Selects one code-owned control check without accepting catalog-provided paths or commands. */
export function tenantAdminControlCheck(id: string): TenantAdminControlCheckDefinition {
  const definition = tenantAdminControlChecks.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new Error('tenant/admin control check is not registered');
  return definition;
}

/** Returns whether an untrusted selector names one closed tenant/admin control check. */
export function isTenantAdminControlCheckId(id: string): boolean {
  return tenantAdminControlChecks.some((candidate) => candidate.id === id);
}
