/** Internal query and audit boundaries supplement the real persistence specifications. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  query: vi.fn<(...args: unknown[]) => Promise<{ rows: Array<{ id: string }> }>>(),
  transaction: vi.fn(async (work: () => Promise<void>) => work()),
  client: vi.fn<() => object | null>(),
  audit: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: database.query }),
  runDatabaseTransaction: database.transaction,
  getDatabaseTransactionClient: database.client,
}));
vi.mock('../../../src/lib/audit-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/audit-log.js')>();
  return { ...actual, writeAuditLogInTransaction: database.audit };
});

import { revokeInvitation } from '../../../src/users/invitation-revocation-service.js';

/** Trusted service input; identifiers stay parameters, never SQL fragments. */
const input = {
  organizationId: 'org-id',
  applicationId: 'application-id',
  invitationId: 'invitation-id',
  actor: { kind: 'service' as const, clientId: 'client-id', clientName: 'Tenant BFF' },
};

beforeEach(() => {
  vi.clearAllMocks();
  database.query.mockResolvedValue({ rows: [] });
  database.client.mockReturnValue({ query: database.query });
  database.audit.mockResolvedValue(undefined);
});

describe('revocation transaction implementation', () => {
  it('keeps every authority fact parameterized and uses the existing transaction boundary', async () => {
    await revokeInvitation(input);
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('AND application_id = $3'),
      [input.invitationId, input.organizationId, input.applicationId],
    );
    expect(database.query.mock.calls[0]?.[0]).not.toContain(input.invitationId);
    expect(database.audit).not.toHaveBeenCalled();
    expect(database.client).not.toHaveBeenCalled();
  });

  it('propagates the original storage failure without attempting audit', async () => {
    const failure = new Error('Synthetic storage unavailable');
    database.query.mockRejectedValueOnce(failure);
    await expect(revokeInvitation(input)).rejects.toBe(failure);
    expect(database.audit).not.toHaveBeenCalled();
  });

  it('fails closed if the transaction client disappears before audit', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: input.invitationId }] });
    database.client.mockReturnValueOnce(null);
    await expect(revokeInvitation(input)).rejects.toThrow('active database transaction');
    expect(database.audit).not.toHaveBeenCalled();
  });

  it('propagates audit failure to the transaction owner without retrying the mutation', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: input.invitationId }] });
    const failure = new Error('Synthetic audit unavailable');
    database.audit.mockRejectedValueOnce(failure);
    await expect(revokeInvitation(input)).rejects.toBe(failure);
    expect(database.query).toHaveBeenCalledOnce();
    expect(database.audit).toHaveBeenCalledOnce();
  });
});
