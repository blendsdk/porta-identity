import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSecret } from '../../../src/clients/types.js';

vi.mock('../../../src/clients/secret-repository.js', () => ({
  insertSecret: vi.fn(),
  listSecretsByClient: vi.fn(),
  findSecretById: vi.fn(),
  getActiveSecretHashes: vi.fn(),
  revokeSecret: vi.fn(),
  updateLastUsedAt: vi.fn(),
  cleanupExpiredSecrets: vi.fn(),
  getLatestActiveSha256: vi.fn(),
  countActiveSecrets: vi.fn(),
}));

vi.mock('../../../src/clients/crypto.js', () => ({
  generateSecret: vi.fn(),
  hashSecret: vi.fn(),
  sha256Secret: vi.fn(),
  verifySecretHash: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  findSecretById,
  revokeSecret as revokeSecretRow,
} from '../../../src/clients/secret-repository.js';
import { revoke } from '../../../src/clients/secret-service.js';
import { ClientNotFoundError } from '../../../src/clients/errors.js';

const CLIENT_A = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CLIENT_B = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const SECRET_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

/** Return an active secret owned by client B. */
function foreignSecret(): ClientSecret {
  return {
    id: SECRET_ID,
    clientId: CLIENT_B,
    label: 'foreign secret',
    expiresAt: null,
    status: 'active',
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('client secret parent-integrity specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findSecretById).mockResolvedValue(foreignSecret());
  });

  it('ST-07 rejects revoking a secret through a different client without mutation', async () => {
    const operation = Reflect.apply(revoke, undefined, [CLIENT_A, SECRET_ID]);

    await expect(operation).rejects.toBeInstanceOf(ClientNotFoundError);
    expect(revokeSecretRow).not.toHaveBeenCalled();
  });
});
