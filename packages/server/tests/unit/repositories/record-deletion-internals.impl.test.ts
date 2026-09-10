import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Read server source relative to src/. */
function source(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), 'src', relativePath), 'utf8');
}

/** Return source from one exported deletion function through the next section marker. */
function deletionSection(text: string, functionName: string): string {
  const start = text.indexOf(`export async function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf(
    '\n// ---------------------------------------------------------------------------',
    start,
  );
  return text.slice(start, end < 0 ? undefined : end);
}

describe('record deletion repository implementation', () => {
  it('uses set-based capture queries and authoritative parent filters', async () => {
    const [applications, roles, permissions, claims, users] = await Promise.all([
      source('applications/repository.ts'),
      source('rbac/role-repository.ts'),
      source('rbac/permission-repository.ts'),
      source('custom-claims/repository.ts'),
      source('users/repository.ts'),
    ]);

    for (const section of [
      deletionSection(applications, 'captureApplicationForDeletion'),
      deletionSection(applications, 'captureModuleForDeletion'),
      deletionSection(roles, 'captureRoleForDeletion'),
      deletionSection(permissions, 'capturePermissionForDeletion'),
      deletionSection(claims, 'captureDefinitionForDeletion'),
      deletionSection(users, 'deleteUserCapture'),
    ]) {
      expect(section).toMatch(/WITH|ARRAY\(/);
      expect(section).not.toMatch(/for\s*\([^)]*(?:user|role|permission|claim)/);
    }

    expect(deletionSection(applications, 'captureModuleForDeletion')).toMatch(
      /WHERE application_id = \$1 AND id = \$2/,
    );
    expect(deletionSection(roles, 'captureRoleForDeletion')).toMatch(
      /WHERE application_id = \$1 AND id = \$2/,
    );
    expect(deletionSection(permissions, 'capturePermissionForDeletion')).toMatch(
      /WHERE application_id = \$1 AND id = \$2/,
    );
    expect(deletionSection(claims, 'captureDefinitionForDeletion')).toMatch(
      /WHERE application_id = \$1 AND id = \$2/,
    );
    expect(deletionSection(users, 'deleteUserCapture')).toMatch(
      /WHERE organization_id = \$1 AND id = \$2/,
    );
  });

  it('locks the control-plane organization before target and exact-role survivor checks', async () => {
    const users = deletionSection(await source('users/repository.ts'), 'deleteUserCapture');
    const organizationLock = users.indexOf('lockControlPlaneOrganization');
    const targetLock = users.indexOf('SELECT * FROM users');
    const exactRole = users.indexOf("role.slug = 'porta-super-admin'");
    const exactApplication = users.indexOf("application.slug = 'porta-admin'");
    const survivor = users.indexOf('requireActiveSuperAdminSurvivorAfterLock');

    expect(organizationLock).toBeGreaterThan(-1);
    expect(organizationLock).toBeLessThan(targetLock);
    expect(targetLock).toBeLessThan(exactRole);
    expect(exactApplication).toBeGreaterThan(exactRole);
    expect(survivor).toBeGreaterThan(exactApplication);
    const repository = await source('users/repository.ts');
    expect(repository).toContain('candidate.id <> $2');
    expect(repository).toContain("candidate.status = 'active'");
  });
});

describe('record deletion transaction implementation', () => {
  it('orders authority revocation, audit, delete, and cleanup registration', async () => {
    const definitions = [
      ['organizations/service.ts', 'deleteOrganization', 'deleteOrganizationCaptured'],
      ['applications/service.ts', 'deleteApplication', 'deleteCapturedApplication'],
      ['applications/service.ts', 'deleteModule', 'deleteCapturedModule'],
      ['clients/service.ts', 'deleteClient', 'deleteCapturedClient'],
      ['rbac/role-service.ts', 'deleteRole', 'deleteCapturedRole'],
      ['rbac/permission-service.ts', 'deletePermission', 'deleteCapturedPermission'],
      ['custom-claims/service.ts', 'deleteDefinition', 'deleteCapturedDefinition'],
      ['users/service.ts', 'deleteUser', 'deleteCapturedUser'],
    ] as const;

    for (const [file, functionName, deleteCall] of definitions) {
      const section = deletionSection(await source(file), functionName);
      const delegatedRevoke = section.indexOf('revokeAffectedAuthorityInTransaction');
      const directRevoke = section.indexOf('revoked_at');
      const protocol = section.indexOf('DELETE FROM oidc_payloads');
      const audit = section.indexOf('writeAuditLogInTransaction');
      const deletion = section.indexOf(deleteCall);
      const cleanup = section.indexOf('registerDeletionCleanup');

      if (delegatedRevoke >= 0) {
        expect(audit, file).toBeGreaterThan(delegatedRevoke);
      } else if (directRevoke >= 0) {
        expect(protocol, file).toBeGreaterThan(directRevoke);
        expect(audit, file).toBeGreaterThan(protocol);
      } else {
        expect(file).toBe('clients/service.ts');
        expect(protocol, file).toBeGreaterThan(-1);
        expect(audit, file).toBeGreaterThan(protocol);
      }
      expect(deletion, file).toBeGreaterThan(audit);
      expect(cleanup, file).toBeGreaterThan(deletion);
    }
  });

  it('resolves a generic audit actor through a nullable live-user lookup', async () => {
    const middleware = await source('middleware/admin-mutation-audit.ts');
    const lookup = middleware.indexOf('SELECT id, organization_id FROM users WHERE id = $1');
    const audit = middleware.indexOf('writeAuditLogInTransaction', lookup);

    expect(lookup).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(lookup);
    expect(middleware.slice(lookup, audit + 400)).toContain('liveActor.rows[0]?.id');
    expect(middleware.slice(lookup, audit + 400)).toContain('liveActor.rows[0]?.organization_id');
  });
});
