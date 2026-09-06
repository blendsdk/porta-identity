import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Read a package-relative implementation file. */
function read(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), relativePath), 'utf8');
}

describe('record deletion lifecycle implementation', () => {
  it('defines only retained lifecycle values and the module permission cascade', async () => {
    const migration = await read('migrations/025_record_deletion_lifecycle.sql');
    const up = migration.split('-- Down Migration')[0]!;

    expect(up).toMatch(/organizations_status_check[\s\S]*'active', 'suspended'/);
    expect(up).toMatch(/applications_status_check[\s\S]*'active', 'inactive'/);
    expect(up).toMatch(/clients_status_check[\s\S]*'active', 'inactive'/);
    expect(up).toMatch(
      /permissions_module_id_fkey[\s\S]*REFERENCES application_modules\(id\) ON DELETE CASCADE/,
    );
    expect(up).not.toMatch(/'archived'|'revoked'/);
  });

  it('keeps initialization repeat-safe before creating permissions or role mappings', async () => {
    const init = await read('src/cli/commands/init.ts');
    const guard = init.indexOf("getApplicationBySlug('porta-admin')");
    const permissionLoop = init.indexOf('for (const permSlug of ALL_ADMIN_PERMISSIONS)');
    const roleLoop = init.indexOf('for (const roleDef of ALL_ADMIN_ROLES)');
    const mapping = init.indexOf('await assignPermissionsToRole');

    expect(guard).toBeGreaterThan(-1);
    expect(init.slice(guard, permissionLoop)).toContain('System already initialized');
    expect(guard).toBeLessThan(permissionLoop);
    expect(permissionLoop).toBeLessThan(roleLoop);
    expect(roleLoop).toBeLessThan(mapping);
  });
});
