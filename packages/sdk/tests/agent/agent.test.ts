import { describe, it, expect, vi } from 'vitest';
import { getToolDefinitions, executeTool } from '../../src/agent.js';
import type { PortaClient } from '../../src/client.js';

describe('agent', () => {
  describe('getToolDefinitions', () => {
    it('returns an array of tool definitions', () => {
      const tools = getToolDefinitions();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('each tool has required properties', () => {
      for (const tool of getToolDefinitions()) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool).toHaveProperty('returns');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(Array.isArray(tool.parameters)).toBe(true);
      }
    });

    it('tool names are dot-notation (domain.method)', () => {
      for (const tool of getToolDefinitions()) {
        expect(tool.name).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
      }
    });

    it('includes key domain tools', () => {
      const names = getToolDefinitions().map((t) => t.name);
      expect(names).toContain('organizations.list');
      expect(names).toContain('organizations.create');
      expect(names).toContain('users.list');
      expect(names).toContain('users.create');
      expect(names).toContain('clients.list');
      expect(names).toContain('config.list');
      expect(names).toContain('stats.get');
      expect(names).toContain('audit.list');
    });

    it('describes the exact user list, lifecycle, invitation, and history contracts', () => {
      const tools = getToolDefinitions();
      const byName = (name: string) => tools.find((tool) => tool.name === name);

      expect(byName('users.list')?.parameters).toEqual([
        expect.objectContaining({ name: 'orgId', required: true }),
        expect.objectContaining({ name: 'params', type: 'object', required: false }),
      ]);
      expect(byName('users.invite')?.returns).toBe('InviteUserResult');
      expect(byName('users.deactivate')?.parameters.map((parameter) => parameter.name)).toEqual([
        'orgId',
        'userId',
      ]);
      expect(byName('users.activate')?.parameters.map((parameter) => parameter.name)).toEqual([
        'orgId',
        'userId',
      ]);
      expect(byName('users.suspend')).toBeUndefined();
      expect(byName('users.lock')).toBeUndefined();
      expect(byName('users.getHistory')).toEqual(
        expect.objectContaining({
          parameters: [
            expect.objectContaining({ name: 'orgId' }),
            expect.objectContaining({ name: 'userId' }),
          ],
          returns: 'HistoryResult',
        }),
      );
    });

    it('parameters have required properties', () => {
      for (const tool of getToolDefinitions()) {
        for (const param of tool.parameters) {
          expect(param).toHaveProperty('name');
          expect(param).toHaveProperty('type');
          expect(param).toHaveProperty('description');
          expect(param).toHaveProperty('required');
          expect(['string', 'number', 'boolean', 'object', 'array']).toContain(param.type);
        }
      }
    });
  });

  describe('executeTool', () => {
    function mockClient(): PortaClient {
      return {
        organizations: { list: vi.fn().mockResolvedValue({ data: [], total: 0 }) },
        users: {
          list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
          deactivate: vi.fn().mockResolvedValue(undefined),
          activate: vi.fn().mockResolvedValue(undefined),
          getHistory: vi.fn().mockResolvedValue({ data: [], hasMore: false, nextCursor: null }),
        },
        stats: { get: vi.fn().mockResolvedValue({ orgs: 5 }) },
        config: { list: vi.fn().mockResolvedValue([]) },
        userRoles: {
          assign: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue({ reauthenticationRequired: false }),
        },
      } as unknown as PortaClient;
    }

    it('dispatches to correct domain and method', async () => {
      const client = mockClient();
      const result = await executeTool(client, 'stats.get', {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ orgs: 5 });
    });

    it('passes arguments based on tool definition', async () => {
      const client = mockClient();
      await executeTool(client, 'organizations.list', { page: 2, pageSize: 10 });
      expect(client.organizations.list as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });

    it('passes user parameters as exact positional domain arguments', async () => {
      const client = mockClient();
      const params = { page: 2, pageSize: 10 };

      await executeTool(client, 'users.list', { orgId: 'org-1', params });
      await executeTool(client, 'users.deactivate', { orgId: 'org-1', userId: 'user-1' });
      await executeTool(client, 'users.activate', { orgId: 'org-1', userId: 'user-1' });
      await executeTool(client, 'users.getHistory', { orgId: 'org-1', userId: 'user-1' });

      expect(vi.mocked(client.users.list)).toHaveBeenCalledWith('org-1', params);
      expect(vi.mocked(client.users.deactivate)).toHaveBeenCalledWith('org-1', 'user-1');
      expect(vi.mocked(client.users.activate)).toHaveBeenCalledWith('org-1', 'user-1');
      expect(vi.mocked(client.users.getHistory)).toHaveBeenCalledWith('org-1', 'user-1');
    });

    it('passes role ID arrays to user-role collection methods', async () => {
      const client = mockClient();
      const roleIds = ['role-1', 'role-2'];

      await executeTool(client, 'userRoles.assign', { orgId: 'org-1', userId: 'user-1', roleIds });
      const result = await executeTool(client, 'userRoles.remove', {
        orgId: 'org-1',
        userId: 'user-1',
        roleIds,
      });

      expect(vi.mocked(client.userRoles.assign)).toHaveBeenCalledWith('org-1', 'user-1', roleIds);
      expect(vi.mocked(client.userRoles.remove)).toHaveBeenCalledWith('org-1', 'user-1', roleIds);
      expect(result).toEqual({
        success: true,
        data: { reauthenticationRequired: false },
      });
    });

    it('returns error for invalid tool name', async () => {
      const client = mockClient();
      const result = await executeTool(client, 'invalid', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid tool name');
    });

    it('returns error for unknown domain', async () => {
      const client = mockClient();
      const result = await executeTool(client, 'nonexistent.list', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown domain');
    });

    it('returns error for unknown method', async () => {
      const client = mockClient();
      const result = await executeTool(client, 'organizations.nonexistent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown method');
    });

    it('catches thrown errors and returns them', async () => {
      const client = mockClient();
      (client.organizations.list as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network failure'),
      );
      const result = await executeTool(client, 'organizations.list', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool execution failed.');
    });
  });
});
