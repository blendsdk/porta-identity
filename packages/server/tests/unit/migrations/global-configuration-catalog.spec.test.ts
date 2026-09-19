/** Verifies that the operational-policy upgrade is forward-only and keeps applied history intact. */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/** Reads the specifically ordered new migration, rather than accepting a historical seed file. */
async function migrationSql(): Promise<string> {
  return readFile(
    new URL('../../../migrations/030_global_configuration_catalog.sql', import.meta.url),
    'utf8',
  );
}

describe('global configuration migration contract', () => {
  it('should provide an ordered forward migration with an explicit Down section', async () => {
    const sql = await migrationSql();
    expect(sql).toContain('-- Up Migration');
    expect(sql).toContain('-- Down Migration');
    expect(sql.split('-- Down Migration')).toHaveLength(2);
  });

  // Reverting policy defaults cannot recreate earlier values; recovery uses a development reset.
  it('should document reset recovery without executing Down reversal statements', async () => {
    const sql = await migrationSql();
    const down = sql.split('-- Down Migration')[1];
    expect(down).toBeDefined();
    if (down === undefined) throw new Error('Down migration is missing');
    expect(down).toMatch(/no[- ]op/i);
    expect(down).toMatch(/reset/i);
    const statements = down
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .trim();
    expect(statements).toBe('');
  });
});
