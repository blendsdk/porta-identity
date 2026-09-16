/** Verifies the closed administrative policy projection, native validation and safe failure envelopes. */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG_UNKNOWN_KEYS,
  CONFIG_UPDATED_AT,
  TEST_CONFIG_DEFINITIONS,
  configRows,
  expectedConfigEntries,
} from './system-config-api-fixtures.js';

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
  committed: false,
  effects: [] as Array<() => Promise<void>>,
}));
vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: boundary.query }),
  getDatabaseTransactionClient: () => ({ query: boundary.query }),
  runDatabaseTransaction: async (work: () => Promise<unknown>) => {
    boundary.committed = false;
    boundary.effects.length = 0;
    const result = await work();
    boundary.committed = true;
    for (const effect of boundary.effects) await effect();
    return result;
  },
  afterDatabaseCommit: async (effect: () => Promise<void>) => {
    boundary.effects.push(effect);
  },
}));
vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createConfigRouter } from '../../../src/routes/config.js';
import * as runtime from '../../../src/lib/system-config.js';

/** Stored content remains unknown until the route validates its declared native type. */
type StoredRow = Omit<ReturnType<typeof configRows>[number], 'value'> & {
  value: unknown;
};
const INVALID_ERROR = {
  error: 'Configuration value is invalid',
  code: 'config_value_invalid',
};
const NOT_FOUND = {
  error: 'Configuration entry not found',
  code: 'config_entry_not_found',
};

describe('system configuration administrative API contract', () => {
  let rows: StoredRow[];
  let submitted: Record<string, unknown>;
  const clearStates: boolean[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    boundary.committed = false;
    boundary.effects.length = 0;
    rows = configRows();
    submitted = {};
    clearStates.length = 0;
    const originalClear = runtime.clearSystemConfigCache;
    vi.spyOn(runtime, 'clearSystemConfigCache').mockImplementation(() => {
      clearStates.push(boundary.committed);
      originalClear();
    });
    boundary.query.mockImplementation(async (sql: string, parameters: readonly unknown[] = []) => {
      if (/system_config/i.test(sql)) {
        const key = parameters.find(
          (value) =>
            typeof value === 'string' &&
            TEST_CONFIG_DEFINITIONS.some((definition) => definition.key === value),
        );
        const selectedKeys = parameters.find((value) => Array.isArray(value));
        const matches =
          typeof key === 'string'
            ? rows.filter((row) => row.key === key)
            : Array.isArray(selectedKeys)
              ? rows.filter((row) => selectedKeys.includes(row.key))
              : rows;
        if (/^\s*UPDATE\b/i.test(sql))
          return {
            rows: matches.map((row) => ({
              ...row,
              value: submitted[row.key],
              updated_at: new Date(CONFIG_UPDATED_AT),
            })),
            rowCount: matches.length,
          };
        return { rows: matches, rowCount: matches.length };
      }
      if (/audit_log/i.test(sql)) return { rows: [], rowCount: 1 };
      return {
        rows: [
          {
            id: '00000000-0000-4000-8000-000000000601',
            organization_id: '00000000-0000-4000-8000-000000000501',
          },
        ],
        rowCount: 1,
      };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** Real Koa routing supplies decoded params while authentication itself is tested through live security requests. */
  async function request(method: string, key: string | undefined, body: unknown = {}) {
    submitted =
      typeof body === 'object' &&
      body !== null &&
      'values' in body &&
      typeof body.values === 'object' &&
      body.values !== null &&
      !Array.isArray(body.values)
        ? Object.fromEntries(Object.entries(body.values))
        : key !== undefined && typeof body === 'object' && body !== null && 'value' in body
          ? { [key]: body.value }
          : {};
    const incoming = new IncomingMessage(new Socket());
    incoming.method = method;
    incoming.url = `/api/admin/config${key === undefined ? '' : `/${encodeURIComponent(key)}`}`;
    const context = new Koa().createContext(incoming, new ServerResponse(incoming));
    context.request.body = body;
    context.state = {
      requestId: 'config-spec-request',
      adminUser: {
        id: '00000000-0000-4000-8000-000000000601',
        email: 'admin@example.com',
        organizationId: '00000000-0000-4000-8000-000000000501',
        roles: [],
        permissions: ['admin:config:read', 'admin:config:update'],
      },
    };
    await createConfigRouter().routes()(context, async () => undefined);
    return context;
  }

  it('should project all 18 entries in catalog order using code metadata, not raw row metadata', async () => {
    rows.reverse();
    rows.push({
      key: 'super_admin_user_id',
      value: 'protected-internal-marker',
      value_type: 'string',
      description: 'internal',
      is_sensitive: true,
      updated_at: new Date(CONFIG_UPDATED_AT),
    });
    const response = await request('GET', undefined);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: expectedConfigEntries() });
    expect(JSON.stringify(response.body)).not.toContain('untrusted-database-description');
    expect(JSON.stringify(response.body)).not.toContain('protected-internal-marker');
    expect(
      boundary.query.mock.calls.some(
        (args) =>
          Array.isArray(args[1]) &&
          args[1].some((value: unknown) => Array.isArray(value) && value.length === 18),
      ),
    ).toBe(true);
  });

  it('should return a native scalar and metadata for one catalog key', async () => {
    const response = await request('GET', 'magic_link_ttl');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: expectedConfigEntries().find((entry) => entry.key === 'magic_link_ttl'),
    });
  });

  it.each(CONFIG_UNKNOWN_KEYS)(
    'should return the identical safe 404 without looking up %s',
    async (key) => {
      const response = await request('GET', key);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'invalid', 'unavailable'] as const)(
    'should fail authoritative reads safely when storage is %s',
    async (reason) => {
      if (reason === 'missing') rows = rows.filter((row) => row.key !== 'magic_link_ttl');
      if (reason === 'invalid')
        rows = rows.map((row) =>
          row.key === 'magic_link_ttl' ? { ...row, value: 'private-corrupt-value' } : row,
        );
      if (reason === 'unavailable')
        boundary.query.mockRejectedValue(new Error('private-database-details'));
      for (const key of [undefined, 'magic_link_ttl']) {
        const response = await request('GET', key);
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
          error: 'Configuration store is unavailable',
          code: 'config_store_unavailable',
          requestId: expect.any(String),
        });
        expect(JSON.stringify(response.body)).not.toContain('private-');
      }
    },
  );

  it.each(TEST_CONFIG_DEFINITIONS.filter((definition) => definition.valueType === 'integer'))(
    'should store both inclusive numeric boundaries for $key',
    async (definition) => {
      if (typeof definition.minimum !== 'number' || typeof definition.maximum !== 'number')
        throw new Error('Numeric boundaries are missing');
      for (const value of [definition.minimum, definition.maximum]) {
        const response = await request('PUT', definition.key, { value });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: { ...definition, value, updatedAt: CONFIG_UPDATED_AT },
          restartRequired: definition.applicationMode === 'restart-required',
        });
      }
      expect(clearStates).toEqual([true, true]);
    },
  );

  it('should replace corrupt targeted content without reading its old value', async () => {
    rows = rows.map((row) =>
      row.key === 'magic_link_ttl' ? { ...row, value: 'corrupt-old-content' } : row,
    );
    const response = await request('PUT', 'magic_link_ttl', { value: 1200 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        ...TEST_CONFIG_DEFINITIONS.find((entry) => entry.key === 'magic_link_ttl'),
        value: 1200,
        updatedAt: CONFIG_UPDATED_AT,
      },
      restartRequired: false,
    });
    const policyQueries = boundary.query.mock.calls.filter(([sql]) =>
      /system_config/i.test(String(sql)),
    );
    expect(policyQueries).toHaveLength(1);
    expect(policyQueries[0]?.[0]).toMatch(/^\s*UPDATE\b/i);
  });

  it.each(
    [1.5, '900', true, false, undefined, NaN, Infinity, -Infinity, null, [], {}, 59, 3601].map(
      (value) => [value],
    ),
  )('should reject invalid numeric value %j before any mutation', async (value) => {
    const response = await request('PUT', 'magic_link_ttl', { value });
    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_ERROR);
    expect(boundary.query).not.toHaveBeenCalled();
    expect(runtime.clearSystemConfigCache).not.toHaveBeenCalled();
  });

  it.each(TEST_CONFIG_DEFINITIONS.filter((definition) => definition.valueType === 'integer'))(
    'should reject each numeric range violation for $key',
    async (definition) => {
      if (typeof definition.minimum !== 'number' || typeof definition.maximum !== 'number')
        throw new Error('Numeric boundaries are missing');
      for (const value of [
        definition.minimum - 1,
        definition.maximum + 1,
        String(definition.defaultValue),
      ]) {
        const response = await request('PUT', definition.key, { value });
        expect(response.status).toBe(400);
        expect(response.body).toEqual(INVALID_ERROR);
      }
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { value: 900, extra: true },
    {},
    { values: {} },
    { values: { magic_link_ttl: 900 }, extra: true },
  ])('should reject extra fields or an empty body without mutation', async (body) => {
    const key = 'values' in body ? undefined : 'magic_link_ttl';
    const response = await request('PUT', key, body);
    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_ERROR);
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it.each(CONFIG_UNKNOWN_KEYS)(
    'should prioritize unknown-key 404 over forged values for %s',
    async (key) => {
      for (const target of [key, undefined]) {
        const body =
          target === undefined
            ? { values: { [key]: null, magic_link_ttl: '900' } }
            : { value: null };
        const response = await request('PUT', target, body);
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      }
      expect(boundary.query).not.toHaveBeenCalled();
      expect(runtime.clearSystemConfigCache).not.toHaveBeenCalled();
    },
  );

  it('should reject unsupported locales exactly and accept native en', async () => {
    for (const value of ['EN', 'nl', ' en ', 1, true, null, [], {}]) {
      const response = await request('PUT', 'default_locale', { value });
      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_ERROR);
    }
    expect((await request('PUT', 'default_locale', { value: 'en' })).status).toBe(200);
  });
});
