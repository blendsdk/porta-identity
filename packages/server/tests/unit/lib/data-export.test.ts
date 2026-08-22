import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { ExportOperationError, exportData } from '../../../src/lib/data-export.js';

function createMockPool() {
  const client = { query: vi.fn(), release: vi.fn() };
  return { connect: vi.fn().mockResolvedValue(client), client };
}

describe('data-export', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
  });

  it('should export users as JSON', async () => {
    mockPool.client.query.mockResolvedValue({
      rows: [
        {
          id: 'u1',
          email: 'a@b.com',
          status: 'active',
          given_name: 'Test',
          family_name: 'User',
          created_at: new Date('2026-01-01'),
        },
      ],
    });

    const result = await exportData({
      entityType: 'users',
      format: 'json',
      organizationId: 'org-1',
    });

    expect(result.contentType).toBe('application/json');
    expect(result.filename).toContain('users-export');
    expect(result.filename).toMatch(/\.json$/);
    expect(result.rowCount).toBe(1);
    const parsed = JSON.parse(result.data);
    expect(parsed.data[0].email).toBe('a@b.com');
  });

  it('should export users as CSV', async () => {
    mockPool.client.query.mockResolvedValue({
      rows: [
        { id: 'u1', email: 'a@b.com', status: 'active', given_name: 'Test', family_name: 'User' },
      ],
    });

    const result = await exportData({
      entityType: 'users',
      format: 'csv',
      organizationId: 'org-1',
    });

    expect(result.contentType).toBe('text/csv');
    expect(result.filename).toMatch(/\.csv$/);
    expect(result.data).toContain('id,email,status');
    expect(result.data).toContain('a@b.com');
  });

  it('should escape CSV values with commas', async () => {
    mockPool.client.query.mockResolvedValue({
      rows: [
        {
          id: 'u1',
          email: 'a@b.com',
          status: 'active',
          given_name: 'Hello, World',
          family_name: 'User',
        },
      ],
    });

    const result = await exportData({
      entityType: 'users',
      format: 'csv',
      organizationId: 'org-1',
    });

    expect(result.data).toContain('"Hello, World"');
  });

  it('should require organizationId for user export', async () => {
    await expect(exportData({ entityType: 'users', format: 'json' })).rejects.toMatchObject({
      code: 'export_scope_required',
    } satisfies Partial<ExportOperationError>);
  });

  it('should require applicationId for roles export', async () => {
    await expect(exportData({ entityType: 'roles', format: 'json' })).rejects.toMatchObject({
      code: 'export_scope_required',
    } satisfies Partial<ExportOperationError>);
  });

  it('should export organizations without orgId', async () => {
    mockPool.client.query.mockResolvedValue({
      rows: [{ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' }],
    });

    const result = await exportData({
      entityType: 'organizations',
      format: 'json',
    });

    expect(result.rowCount).toBe(1);
  });

  it('should use parameterized queries', async () => {
    mockPool.client.query.mockResolvedValue({ rows: [] });

    await exportData({
      entityType: 'users',
      format: 'json',
      organizationId: 'org-1',
    });

    const [sql, params] = mockPool.client.query.mock.calls[1];
    expect(sql).toContain('$1');
    expect(params).toEqual(['org-1']);
  });

  it('should not include sensitive fields in user export', async () => {
    mockPool.client.query.mockResolvedValue({ rows: [] });

    await exportData({
      entityType: 'users',
      format: 'json',
      organizationId: 'org-1',
    });

    const sql = String(mockPool.client.query.mock.calls[1][0]);
    expect(sql.toLowerCase()).not.toContain('password');
    expect(sql.toLowerCase()).not.toContain('secret');
  });
});
