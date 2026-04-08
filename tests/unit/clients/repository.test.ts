import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientRow } from '../../../src/clients/types.js';

// Mock the database module
const mockQuery = vi.fn();
vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import {
  insertClient,
  findClientById,
  findClientByClientId,
  updateClient,
  listClients,
  countClientsByOrg,
  countClientsByApp,
} from '../../../src/clients/repository.js';

/** Standard test client row */
function createClientRow(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'client-uuid-1',
    organization_id: 'org-uuid-1',
    application_id: 'app-uuid-1',
    client_id: 'oidc-client-id-abc123',
    client_name: 'Web App',
    client_type: 'confidential',
    application_type: 'web',
    redirect_uris: ['https://example.com/callback'],
    post_logout_redirect_uris: ['https://example.com/logout'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'client_secret_basic',
    allowed_origins: ['https://example.com'],
    require_pkce: true,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('client repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // insertClient
  // -------------------------------------------------------------------------

  describe('insertClient', () => {
    it('should insert and return mapped client', async () => {
      const row = createClientRow();
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await insertClient({
        organizationId: 'org-uuid-1',
        applicationId: 'app-uuid-1',
        clientId: 'oidc-client-id-abc123',
        clientName: 'Web App',
        clientType: 'confidential',
        applicationType: 'web',
        redirectUris: ['https://example.com/callback'],
        postLogoutRedirectUris: ['https://example.com/logout'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        scope: 'openid profile email',
        tokenEndpointAuthMethod: 'client_secret_basic',
        allowedOrigins: ['https://example.com'],
        requirePkce: true,
      });

      expect(result.clientId).toBe('oidc-client-id-abc123');
      expect(result.clientName).toBe('Web App');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO clients');
    });
  });

  // -------------------------------------------------------------------------
  // findClientById
  // -------------------------------------------------------------------------

  describe('findClientById', () => {
    it('should return client when found', async () => {
      const row = createClientRow();
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await findClientById('client-uuid-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('client-uuid-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await findClientById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findClientByClientId
  // -------------------------------------------------------------------------

  describe('findClientByClientId', () => {
    it('should find by OIDC client_id', async () => {
      const row = createClientRow();
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await findClientByClientId('oidc-client-id-abc123');

      expect(result).not.toBeNull();
      expect(result!.clientId).toBe('oidc-client-id-abc123');
      expect(mockQuery.mock.calls[0][0]).toContain('client_id');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await findClientByClientId('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateClient
  // -------------------------------------------------------------------------

  describe('updateClient', () => {
    it('should update provided fields only', async () => {
      const row = createClientRow({ client_name: 'Updated App' });
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await updateClient('client-uuid-1', { clientName: 'Updated App' });

      expect(result.clientName).toBe('Updated App');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('client_name');
      expect(sql).not.toContain('redirect_uris');
    });

    it('should handle multiple field updates', async () => {
      const row = createClientRow({ client_name: 'Updated', scope: 'openid' });
      mockQuery.mockResolvedValue({ rows: [row] });

      await updateClient('client-uuid-1', { clientName: 'Updated', scope: 'openid' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('client_name');
      expect(sql).toContain('scope');
    });

    it('should throw when no fields provided', async () => {
      await expect(updateClient('client-uuid-1', {})).rejects.toThrow('No fields to update');
    });

    it('should throw when client not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        updateClient('nonexistent', { clientName: 'Test' }),
      ).rejects.toThrow('Client not found');
    });

    it('should update status field', async () => {
      const row = createClientRow({ status: 'revoked' });
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await updateClient('client-uuid-1', { status: 'revoked' });

      expect(result.status).toBe('revoked');
    });

    it('should update array fields', async () => {
      const row = createClientRow({
        redirect_uris: ['https://new.com/cb'],
        allowed_origins: ['https://new.com'],
      });
      mockQuery.mockResolvedValue({ rows: [row] });

      await updateClient('client-uuid-1', {
        redirectUris: ['https://new.com/cb'],
        allowedOrigins: ['https://new.com'],
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('redirect_uris');
      expect(sql).toContain('allowed_origins');
    });
  });

  // -------------------------------------------------------------------------
  // listClients
  // -------------------------------------------------------------------------

  describe('listClients', () => {
    it('should return paginated results', async () => {
      const row = createClientRow();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [row] });

      const result = await listClients({ page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by organizationId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listClients({ page: 1, pageSize: 10, organizationId: 'org-1' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('organization_id');
    });

    it('should filter by applicationId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listClients({ page: 1, pageSize: 10, applicationId: 'app-1' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('application_id');
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listClients({ page: 1, pageSize: 10, status: 'active' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('status');
    });

    it('should filter by search (client_name)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listClients({ page: 1, pageSize: 10, search: 'web' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('ILIKE');
    });

    it('should use whitelisted sort columns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listClients({ page: 1, pageSize: 10, sortBy: 'client_name', sortOrder: 'asc' });

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('client_name');
      expect(dataSql).toContain('ASC');
    });
  });

  // -------------------------------------------------------------------------
  // countClientsByOrg / countClientsByApp
  // -------------------------------------------------------------------------

  describe('countClientsByOrg', () => {
    it('should return count for organization', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '5' }] });

      const result = await countClientsByOrg('org-1');

      expect(result).toBe(5);
      expect(mockQuery.mock.calls[0][0]).toContain('organization_id');
    });
  });

  describe('countClientsByApp', () => {
    it('should return count for application', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '3' }] });

      const result = await countClientsByApp('app-1');

      expect(result).toBe(3);
      expect(mockQuery.mock.calls[0][0]).toContain('application_id');
    });
  });
});
