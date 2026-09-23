import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations/024_application_client_correction.sql'),
  'utf8',
);
const upMigration = migration.split('-- Down Migration')[0] ?? migration;
const downMigration = migration.split('-- Down Migration')[1] ?? '';

describe('application/client correction migration mechanics', () => {
  it('checks the active unexpired cap before applying the role correction', () => {
    const lockIndex = upMigration.indexOf('LOCK TABLE client_secrets IN SHARE ROW EXCLUSIVE MODE');
    const preconditionIndex = upMigration.indexOf('HAVING COUNT(*) > 10');
    const correctionIndex = upMigration.indexOf('INSERT INTO role_permissions');

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(preconditionIndex).toBeGreaterThan(lockIndex);
    expect(preconditionIndex).toBeGreaterThanOrEqual(0);
    expect(correctionIndex).toBeGreaterThan(preconditionIndex);
    expect(upMigration).toContain("WHERE status = 'active'");
    expect(upMigration).toContain('(expires_at IS NULL OR expires_at > NOW())');
  });

  it('never rewrites or deletes existing secret rows during the precondition', () => {
    expect(upMigration).not.toMatch(/UPDATE\s+client_secrets/i);
    expect(upMigration).not.toMatch(/DELETE\s+FROM\s+client_secrets/i);
    expect(upMigration).toContain(
      'Client has more than 10 active secrets; revoke excess secrets before upgrading',
    );
  });

  it('uses stable role and permission slugs with conflict-safe mapping insertion', () => {
    expect(upMigration).toContain("role_row.slug = 'porta-app-admin'");
    expect(upMigration).toContain("permission_row.slug = 'admin:org:read'");
    expect(upMigration).toContain('ON CONFLICT (role_id, permission_id) DO NOTHING');
  });

  it('keeps the role correction forward-only because mapping provenance is unavailable', () => {
    expect(downMigration).toContain('Forward-only data correction');
    expect(downMigration).not.toMatch(/DELETE\s+FROM\s+role_permissions/i);
    expect(downMigration).toContain('SELECT 1;');
  });
});
