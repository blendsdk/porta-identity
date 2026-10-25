/**
 * Specification tests for first-class client actor attribution.
 *
 * Durable audit rows must identify a tenant service client without inventing
 * a user. The compatibility writer stays best-effort; the transaction writer
 * propagates failures so a mutation cannot commit without its audit row.
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
import { logger } from '../../../src/lib/logger.js';
import {
  auditActorColumns,
  inviteActorToAuditActor,
  tenantActorToAuditActor,
  writeAuditLog,
  writeAuditLogInTransaction,
} from '../../../src/lib/audit-log.js';

function mockPool() {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

const CLIENT_ACTOR = {
  organizationId: 'org-1',
  actorType: 'client' as const,
  actorClientId: 'bff-client',
  actorClientName: 'Acme BFF',
  eventType: 'user.created',
  eventCategory: 'admin',
  metadata: { userId: 'user-1' },
};

describe('client audit actor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should write first-class client columns with a null user actor', async () => {
    const mockQuery = mockPool();

    await writeAuditLog(CLIENT_ACTOR);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('actor_type');
    expect(sql).toContain('actor_client_id');
    expect(sql).toContain('actor_client_name');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull(); // actor_id
    expect(params[3]).toBe('client'); // actor_type
    expect(params[4]).toBe('bff-client'); // actor_client_id
    expect(params[5]).toBe('Acme BFF'); // actor_client_name
  });

  it('should infer a user actor from actorId and clear the client columns', async () => {
    const mockQuery = mockPool();

    await writeAuditLog({
      organizationId: 'org-1',
      userId: 'target-1',
      actorId: 'admin-1',
      eventType: 'user.updated',
      eventCategory: 'admin',
    });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe('admin-1');
    expect(params[3]).toBe('user');
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });

  it('should infer a system actor when no actor fields are present', async () => {
    const mockQuery = mockPool();

    await writeAuditLog({ eventType: 'user.auto_unlocked', eventCategory: 'security' });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
    expect(params[3]).toBe('system');
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });

  it('should reject a client actor without a client identifier', async () => {
    const mockQuery = mockPool();

    await expect(
      writeAuditLog({
        eventType: 'user.created',
        eventCategory: 'admin',
        actorType: 'client',
      }),
    ).rejects.toThrow();

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should keep the compatibility writer best-effort when the database fails', async () => {
    const mockQuery = mockPool();
    mockQuery.mockRejectedValue(new Error('database unavailable'));

    await expect(writeAuditLog(CLIENT_ACTOR)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
  });

  it('should propagate a transaction writer failure so the mutation rolls back', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('audit unavailable')) };

    await expect(writeAuditLogInTransaction(client, CLIENT_ACTOR)).rejects.toThrow(
      'audit unavailable',
    );
  });

  it('should use the same normalized columns through the transaction writer', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };

    await writeAuditLogInTransaction(client, CLIENT_ACTOR);

    const params = client.query.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull();
    expect(params[3]).toBe('client');
    expect(params[4]).toBe('bff-client');
    expect(params[5]).toBe('Acme BFF');
    expect(afterDatabaseCommit).not.toHaveBeenCalled();
  });

  it('should map a tenant service actor to a client audit actor', () => {
    expect(
      tenantActorToAuditActor({
        kind: 'service',
        clientId: 'bff-client',
        clientName: 'Acme BFF',
        applicationId: 'app-1',
        organizationId: 'org-1',
        displayName: 'Acme BFF',
      }),
    ).toEqual({ kind: 'service', clientId: 'bff-client', clientName: 'Acme BFF' });
  });

  it('should map a tenant user actor to a user audit actor', () => {
    expect(
      tenantActorToAuditActor({
        kind: 'user',
        userId: 'user-1',
        applicationId: 'app-1',
        organizationId: 'org-1',
        displayName: 'Tenant Admin',
        permissions: new Set(),
      }),
    ).toEqual({ kind: 'user', userId: 'user-1' });
  });

  it('should map a service audit actor to exact client columns', () => {
    expect(
      auditActorColumns({ kind: 'service', clientId: 'bff-client', clientName: 'Acme BFF' }),
    ).toEqual({
      actorId: undefined,
      actorType: 'client',
      actorClientId: 'bff-client',
      actorClientName: 'Acme BFF',
    });
  });

  it('should map a user audit actor to exact user columns', () => {
    expect(auditActorColumns({ kind: 'user', userId: 'user-1' })).toEqual({
      actorId: 'user-1',
      actorType: 'user',
      actorClientId: null,
      actorClientName: null,
    });
  });

  it('should map a system audit actor to exact system columns', () => {
    expect(auditActorColumns({ kind: 'system' })).toEqual({
      actorId: undefined,
      actorType: 'system',
      actorClientId: null,
      actorClientName: null,
    });
  });

  it('should map invitation actors without forcing AuditActor onto the workflow', () => {
    expect(
      inviteActorToAuditActor({
        kind: 'service',
        clientId: 'bff-client',
        displayName: 'Acme BFF',
      }),
    ).toEqual({ kind: 'service', clientId: 'bff-client', clientName: 'Acme BFF' });

    expect(
      inviteActorToAuditActor({ kind: 'admin', userId: 'admin-1', displayName: 'Admin' }),
    ).toEqual({ kind: 'user', userId: 'admin-1' });

    expect(inviteActorToAuditActor({ kind: 'user', displayName: 'Unknown' })).toEqual({
      kind: 'system',
    });
  });
});
