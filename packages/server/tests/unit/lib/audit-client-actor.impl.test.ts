/**
 * Implementation tests for audit actor normalization and writer shape.
 *
 * These tests pin the positional SQL contract, explicit actor precedence,
 * client-field clearing, and metadata serialization used by both writers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
  afterDatabaseCommit: vi.fn(async (effect: () => Promise<void>) => effect()),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { afterDatabaseCommit, getPool } from '../../../src/lib/database.js';
import { writeAuditLog, writeAuditLogInTransaction } from '../../../src/lib/audit-log.js';

function mockPool() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query });
  return query;
}

beforeEach(() => vi.clearAllMocks());

describe('audit writer implementation', () => {
  it('writes the full positional contract for a client actor', async () => {
    const query = mockPool();

    await writeAuditLog({
      organizationId: 'org-1',
      userId: 'user-1',
      actorId: 'ignored-user',
      actorType: 'client',
      actorClientId: 'bff-client',
      actorClientName: 'Acme BFF',
      eventType: 'user.updated',
      eventCategory: 'admin',
      description: 'Updated a user',
      metadata: { fields: ['nickname'] },
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });

    const sql = query.mock.calls[0][0] as string;
    const params = query.mock.calls[0][1] as unknown[];
    expect(sql).toContain('actor_type');
    expect(params).toEqual([
      'org-1',
      'user-1',
      null,
      'client',
      'bff-client',
      'Acme BFF',
      'user.updated',
      'admin',
      'Updated a user',
      '{"fields":["nickname"]}',
      '127.0.0.1',
      'test-agent',
    ]);
    expect(afterDatabaseCommit).toHaveBeenCalledOnce();
  });

  it('clears client fields for an explicit user actor', async () => {
    const query = mockPool();

    await writeAuditLog({
      organizationId: 'org-1',
      actorId: 'admin-1',
      actorType: 'user',
      actorClientId: 'should-clear',
      actorClientName: 'Should Clear',
      eventType: 'user.deleted',
      eventCategory: 'admin',
    });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe('admin-1');
    expect(params[3]).toBe('user');
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });

  it('clears both identities for an explicit system actor', async () => {
    const query = mockPool();

    await writeAuditLog({
      actorId: 'should-clear',
      actorType: 'system',
      actorClientId: 'should-clear',
      eventType: 'user.auto_unlocked',
      eventCategory: 'security',
    });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
    expect(params[3]).toBe('system');
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });

  it('defaults metadata to an empty JSON object', async () => {
    const query = mockPool();

    await writeAuditLog({ eventType: 'system.event', eventCategory: 'security' });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[9]).toBe('{}');
  });

  it('rejects an anonymous client before scheduling the compatibility write', async () => {
    const query = mockPool();

    await expect(
      writeAuditLog({ actorType: 'client', eventType: 'user.created', eventCategory: 'admin' }),
    ).rejects.toThrow('Client audit actor requires a client identifier');

    expect(query).not.toHaveBeenCalled();
    expect(afterDatabaseCommit).not.toHaveBeenCalled();
  });

  it('uses the caller transaction boundary without the compatibility scheduler', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });

    await writeAuditLogInTransaction(
      { query },
      {
        actorType: 'client',
        actorClientId: 'bff-client',
        actorClientName: 'Acme BFF',
        eventType: 'user.created',
        eventCategory: 'admin',
      },
    );

    expect(query).toHaveBeenCalledOnce();
    expect(afterDatabaseCommit).not.toHaveBeenCalled();
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('client');
    expect(params[4]).toBe('bff-client');
  });
});
