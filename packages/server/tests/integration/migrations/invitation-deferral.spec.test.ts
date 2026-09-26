/**
 * Migration specification for deferred invitation storage (ST-1).
 *
 * The migration must let an invitation exist without a user, carry its own tenant authority, and
 * keep exactly one live invitation per organization and email. The invitation lifetime default is
 * unchanged, so this test also pins the configured value.
 *
 * These expectations derive from the feature requirements and the invitation data-model design, not
 * from the migration's implementation details.
 */

import { describe, it, expect } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { SYSTEM_CONFIG_CATALOG } from '../../../src/lib/system-config-catalog.js';

/** Column metadata needed to assert nullability and the concrete Postgres type. */
interface ColumnInfo {
  column_name: string;
  is_nullable: string;
  udt_name: string;
}

/** Read invitation_tokens column metadata from the live test schema. */
async function invitationColumns(): Promise<Map<string, ColumnInfo>> {
  const result = await getPool().query<ColumnInfo>(
    `SELECT column_name, is_nullable, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invitation_tokens'`,
  );
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

describe('deferred invitation migration', () => {
  it('should make the invited user optional while requiring organization, email, and profile columns', async () => {
    const columns = await invitationColumns();

    expect(columns.get('user_id')?.is_nullable).toBe('YES');
    expect(columns.get('organization_id')).toMatchObject({ is_nullable: 'NO', udt_name: 'uuid' });
    expect(columns.get('email')).toMatchObject({ is_nullable: 'NO', udt_name: 'citext' });
    expect(columns.get('given_name')?.is_nullable).toBe('YES');
    expect(columns.get('family_name')?.is_nullable).toBe('YES');
    expect(columns.get('locale')?.is_nullable).toBe('YES');
  });

  it('should allow exactly one live invitation per organization and email', async () => {
    const result = await getPool().query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_invitation_active_email'`,
    );

    expect(result.rowCount).toBe(1);
    const definition = result.rows[0].indexdef;
    expect(definition).toContain('UNIQUE');
    expect(definition).toContain('organization_id');
    expect(definition).toContain('email');
    expect(definition).toContain('used_at IS NULL');
  });

  it('should keep the invitation lifetime default at seven days', async () => {
    const result = await getPool().query<{ value: number }>(
      `SELECT value FROM system_config WHERE key = 'invitation_ttl'`,
    );

    expect(result.rows[0]?.value).toBe(604800);
    expect(SYSTEM_CONFIG_CATALOG.find((entry) => entry.key === 'invitation_ttl')?.defaultValue).toBe(
      604800,
    );
  });
});
