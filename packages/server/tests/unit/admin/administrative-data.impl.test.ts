import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';
import { exportData } from '../../../src/lib/data-export.js';
import { importData, importManifestSchema } from '../../../src/lib/data-import.js';
import { buildImportManifestPlan } from '../../../src/lib/data-import-plan.js';
import { getPool } from '../../../src/lib/database.js';

/** Create the minimum PostgreSQL client surface used by administrative services. */
function createClient() {
  return { query: vi.fn(), release: vi.fn() };
}

/** Install a deterministic mocked pool for one implementation test. */
function useClients(...clients: ReturnType<typeof createClient>[]): void {
  const connect = vi.fn();
  for (const client of clients) connect.mockResolvedValueOnce(client);
  vi.mocked(getPool).mockReturnValue({ connect } as ReturnType<typeof getPool>);
}

describe('administrative data implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should lock, mutate, audit, and commit each accepted bulk item in one transaction', async () => {
    const client = createClient();
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    useClients(client);

    await expect(
      bulkStatusChange({
        entityType: 'user',
        entityIds: ['user-1'],
        action: 'suspend',
        organizationId: 'organization-1',
        actorId: 'actor-1',
      }),
    ).resolves.toMatchObject({ succeeded: 1, failed: 0 });

    expect(
      client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0]),
    ).toStrictEqual(['BEGIN', 'SELECT', 'UPDATE', 'INSERT', 'COMMIT']);
    expect(String(client.query.mock.calls[1][0])).toContain('FOR UPDATE');
    expect(client.query.mock.calls[1][1]).toStrictEqual(['user-1', 'organization-1']);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('should stop after dependency failure and leave every later bulk item unattempted', async () => {
    const committed = createClient();
    committed.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    const failed = createClient();
    failed.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('postgresql://private-host/internal'))
      .mockResolvedValueOnce({});
    useClients(committed, failed);

    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: ['user-1', 'user-2', 'user-3'],
      action: 'deactivate',
      organizationId: 'organization-1',
    });

    expect(result.results.map(({ outcome }) => outcome)).toStrictEqual([
      'succeeded',
      'not_attempted',
      'not_attempted',
    ]);
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(result)).not.toContain('private-host');
    expect(committed.release).toHaveBeenCalledOnce();
    expect(failed.release).toHaveBeenCalledOnce();
  });

  it('should roll back an empty dry-run without committing or returning credentials', async () => {
    const client = createClient();
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    useClients(client);
    const manifest = importManifestSchema.parse({ version: '1.0' });

    const result = await importData(manifest, 'dry-run');

    expect(result).toMatchObject({ mode: 'dry-run', credentials: [] });
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toStrictEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('should mark exactly one confidential client for one-time credential generation', () => {
    const manifest = importManifestSchema.parse({
      version: '1.0',
      organizations: [{ name: 'Alpha', slug: 'alpha' }],
      applications: [{ name: 'Portal', slug: 'portal', organization_slug: 'alpha' }],
      clients: [
        {
          client_name: 'confidential-client',
          application_slug: 'portal',
          organization_slug: 'alpha',
          client_type: 'confidential',
        },
        {
          client_name: 'public-client',
          application_slug: 'portal',
          organization_slug: 'alpha',
          client_type: 'public',
        },
      ],
    });

    const clientEntries = buildImportManifestPlan(manifest).entries.filter(
      (entry) => entry.entityType === 'client',
    );

    expect(
      clientEntries.map(({ credentialWillBeGenerated }) => credentialWillBeGenerated),
    ).toStrictEqual([true, false]);
  });

  it('should export only allowlisted fields and commit the read with its audit record', async () => {
    const client = createClient();
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'alpha@example.test',
            status: 'active',
            given_name: 'Alpha',
            family_name: 'User',
            created_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    useClients(client);

    const result = await exportData({
      entityType: 'users',
      format: 'json',
      organizationId: 'organization-1',
      actorId: 'actor-1',
    });

    expect(result.rowCount).toBe(1);
    const exportQuery = String(client.query.mock.calls[1][0]).toLowerCase();
    expect(exportQuery).not.toContain('password_hash');
    expect(exportQuery).not.toContain('recovery_token');
    expect(
      client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0]),
    ).toStrictEqual(['BEGIN', 'SELECT', 'INSERT', 'COMMIT']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
