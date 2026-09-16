/** Exercises defensive projection and transaction branches beyond the public contract oracle. */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_UPDATED_AT, configRows } from './system-config-api-fixtures.js';

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
  clear: vi.fn(),
  effects: [] as Array<() => Promise<void>>,
  clientAvailable: true,
  failCommit: false,
}));
vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: boundary.query }),
  getDatabaseTransactionClient: () =>
    boundary.clientAvailable ? { query: boundary.query } : null,
  afterDatabaseCommit: async (effect: () => Promise<void>) => boundary.effects.push(effect),
  runDatabaseTransaction: async (work: () => Promise<unknown>) => {
    const result = await work();
    if (boundary.failCommit) throw new Error('private-commit-diagnostic');
    for (const effect of boundary.effects) await effect();
    return result;
  },
}));
vi.mock('../../../src/lib/system-config.js', () => ({
  clearSystemConfigCache: boundary.clear,
}));
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { createConfigRouter } from '../../../src/routes/config.js';

/** Supply a real Koa routing context while substituting only external database behavior. */
async function request(method: 'GET' | 'PUT', key = 'magic_link_ttl', body: unknown = {}) {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = method;
  incoming.url = `/api/admin/config/${encodeURIComponent(key)}`;
  const context = new Koa().createContext(incoming, new ServerResponse(incoming));
  context.request.body = body;
  context.state = {
    requestId: 'config-implementation-request',
    adminUser: {
      id: '00000000-0000-4000-8000-000000000601',
      email: 'admin@implementation.example',
      organizationId: '00000000-0000-4000-8000-000000000501',
      roles: [],
      permissions: ['admin:config:read', 'admin:config:update'],
    },
  };
  await createConfigRouter().routes()(context, async () => undefined);
  return context;
}

describe('configuration projection and failure branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.effects.length = 0;
    boundary.clientAvailable = true;
    boundary.failCommit = false;
    boundary.query.mockImplementation(async (sql: string) => {
      if (/^\s*UPDATE\b/i.test(sql))
        return {
          rows: [{ key: 'magic_link_ttl', value: 1200, updated_at: new Date(CONFIG_UPDATED_AT) }],
          rowCount: 1,
        };
      if (/\bFROM users\b/i.test(sql))
        return {
          rows: [{ id: 'actor', organization_id: 'organization' }],
          rowCount: 1,
        };
      if (/\bINSERT INTO audit_log\b/i.test(sql)) return { rows: [], rowCount: 1 };
      return {
        rows: configRows().filter((row) => row.key === 'magic_link_ttl'),
        rowCount: 1,
      };
    });
  });

  it('should project a valid stored ISO timestamp without raw metadata', async () => {
    boundary.query.mockResolvedValue({
      rows: [{ key: 'magic_link_ttl', value: 900, updated_at: CONFIG_UPDATED_AT }],
      rowCount: 1,
    });
    const response = await request('GET');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: expect.objectContaining({ updatedAt: CONFIG_UPDATED_AT, value: 900 }),
    });
  });

  it.each(['duplicate', 'unexpected key', 'invalid timestamp'])(
    'should reject a defensive read projection with %s',
    async (condition) => {
      const row = { key: 'magic_link_ttl', value: 900, updated_at: new Date(CONFIG_UPDATED_AT) };
      const rows =
        condition === 'duplicate'
          ? [row, row]
          : condition === 'unexpected key'
            ? [{ ...row, key: 'internal-marker' }]
            : [{ ...row, updated_at: new Date(NaN) }];
      boundary.query.mockResolvedValue({ rows, rowCount: rows.length });
      const response = await request('GET');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: 'Configuration store is unavailable',
        code: 'config_store_unavailable',
        requestId: 'config-implementation-request',
      });
    },
  );

  it.each(['count mismatch', 'wrong returned key', 'invalid timestamp', 'empty actor', 'audit failure'])(
    'should leave the cache unchanged after %s',
    async (condition) => {
      const successfulQuery = boundary.query.getMockImplementation();
      boundary.query.mockImplementation(async (sql: string) => {
        if (/^\s*UPDATE\b/i.test(sql)) {
          const row = {
            key: condition === 'wrong returned key' ? 'access_token_ttl' : 'magic_link_ttl',
            value: 1200,
            updated_at: condition === 'invalid timestamp' ? new Date(NaN) : new Date(CONFIG_UPDATED_AT),
          };
          return { rows: [row], rowCount: condition === 'count mismatch' ? 0 : 1 };
        }
        if (condition === 'empty actor' && /\bFROM users\b/i.test(sql))
          return { rows: [], rowCount: 0 };
        if (condition === 'audit failure' && /\bINSERT INTO audit_log\b/i.test(sql))
          throw new Error('private-audit-diagnostic');
        return successfulQuery?.(sql);
      });
      const response = await request('PUT', 'magic_link_ttl', { value: 1200 });
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('private-');
      expect(boundary.clear).not.toHaveBeenCalled();
    },
  );

  it.each(['missing transaction client', 'failed commit'])(
    'should not run cache effects with %s',
    async (condition) => {
      boundary.clientAvailable = condition !== 'missing transaction client';
      boundary.failCommit = condition === 'failed commit';
      const response = await request('PUT', 'magic_link_ttl', { value: 1200 });
      expect(response.status).toBe(503);
      expect(boundary.clear).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], { values: [] }, { values: null }])(
    'should reject malformed single bodies before reaching the database',
    async (body) => {
      const response = await request('PUT', 'magic_link_ttl', body);
      expect(response.status).toBe(400);
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], { values: [] }, { values: null }, { values: 1200 }])(
    'should reject malformed batch bodies before reaching the database',
    async (body) => {
      const response = await request('PUT', '', body);
      expect(response.status).toBe(400);
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );
});
