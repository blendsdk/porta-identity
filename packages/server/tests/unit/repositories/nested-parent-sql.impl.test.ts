import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationModuleRow } from '../../../src/applications/types.js';
import type { ClientSecretRow } from '../../../src/clients/types.js';

const query = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query }),
}));

import { findModuleById, updateModule } from '../../../src/applications/repository.js';
import { findSecretById, revokeSecret } from '../../../src/clients/secret-repository.js';

const APPLICATION_ID = 'application-id';
const MODULE_ID = 'module-id';
const CLIENT_ID = 'client-id';
const SECRET_ID = 'secret-id';

/** Normalize SQL solely to make predicate assertions independent of formatting. */
function normalizedSql(value: unknown): string {
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Return a complete database module row. */
function moduleRow(): ApplicationModuleRow {
  return {
    id: MODULE_ID,
    application_id: APPLICATION_ID,
    name: 'Module',
    slug: 'module',
    description: null,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };
}

/** Return a complete database secret row. */
function secretRow(): ClientSecretRow {
  return {
    id: SECRET_ID,
    client_id: CLIENT_ID,
    secret_hash: 'not-returned-by-mapper',
    secret_sha256: null,
    label: null,
    expires_at: null,
    status: 'active',
    last_used_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('parent-qualified repository SQL mechanics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('qualifies module lookup by application and child IDs in that parameter order', async () => {
    query.mockResolvedValue({ rows: [moduleRow()] });

    await findModuleById(APPLICATION_ID, MODULE_ID);

    expect(normalizedSql(query.mock.calls[0]?.[0])).toContain(
      'WHERE application_id = $1 AND id = $2',
    );
    expect(query.mock.calls[0]?.[1]).toEqual([APPLICATION_ID, MODULE_ID]);
  });

  it('keeps parent and child IDs ahead of dynamic module update values', async () => {
    query.mockResolvedValue({ rows: [moduleRow()] });

    await updateModule(APPLICATION_ID, MODULE_ID, { name: 'Renamed' });

    const sql = normalizedSql(query.mock.calls[0]?.[0]);
    expect(sql).toContain('name = $3');
    expect(sql).toContain('WHERE application_id = $1 AND id = $2');
    expect(query.mock.calls[0]?.[1]).toEqual([APPLICATION_ID, MODULE_ID, 'Renamed']);
  });

  it('qualifies secret lookup by client and child IDs in that parameter order', async () => {
    query.mockResolvedValue({ rows: [secretRow()] });

    await findSecretById(CLIENT_ID, SECRET_ID);

    expect(normalizedSql(query.mock.calls[0]?.[0])).toContain('WHERE client_id = $1 AND id = $2');
    expect(query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, SECRET_ID]);
  });

  it('qualifies secret revocation by client and child IDs in that parameter order', async () => {
    query.mockResolvedValue({ rows: [{ ...secretRow(), status: 'revoked' }] });

    await revokeSecret(CLIENT_ID, SECRET_ID);

    expect(normalizedSql(query.mock.calls[0]?.[0])).toContain(
      "UPDATE client_secrets SET status = 'revoked' WHERE client_id = $1 AND id = $2",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, SECRET_ID]);
  });
});
