import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  runDatabaseTransaction: vi.fn(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  runDatabaseTransaction: mocks.runDatabaseTransaction,
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { signingKeyEncryptionKey: 'a'.repeat(64) },
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { encryptPrivateKey } from '../../../src/lib/signing-key-crypto.js';
import {
  clearJwksCache,
  ensureSigningKeys,
  generateES256KeyPair,
  getActiveJwks,
} from '../../../src/lib/signing-keys.js';

/** Database row shape used by the signing-key loader in these implementation tests. */
interface SigningKeyRow {
  readonly id: string;
  readonly kid: string;
  readonly algorithm: string;
  readonly public_key: string;
  readonly private_key: string;
  readonly private_key_iv: string;
  readonly private_key_tag: string;
  readonly encrypted: true;
  readonly status: 'active';
  readonly activated_at: Date;
  readonly retired_at: null;
  readonly expires_at: null;
}

/** Creates one real encrypted signing-key row suitable for JWK conversion. */
function encryptedRow(id: string): SigningKeyRow {
  const pair = generateES256KeyPair();
  const encrypted = encryptPrivateKey(pair.privateKeyPem, 'a'.repeat(64));
  return {
    id,
    kid: pair.kid,
    algorithm: pair.algorithm,
    public_key: pair.publicKeyPem,
    private_key: encrypted.encrypted,
    private_key_iv: encrypted.iv,
    private_key_tag: encrypted.tag,
    encrypted: true,
    status: 'active',
    activated_at: new Date('2026-09-13T00:00:00.000Z'),
    retired_at: null,
    expires_at: null,
  };
}

describe('signing-key cache and bootstrap implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearJwksCache();
    mocks.runDatabaseTransaction.mockImplementation(async (work: () => Promise<unknown>) => work());
  });

  it('does not install a load captured before the generation changed', async () => {
    const oldRow = encryptedRow('old-id');
    const currentRow = encryptedRow('current-id');
    let releaseOldLoad!: (value: { rows: SigningKeyRow[] }) => void;
    const oldLoad = new Promise<{ rows: SigningKeyRow[] }>((resolve) => {
      releaseOldLoad = resolve;
    });
    mocks.query.mockReturnValueOnce(oldLoad).mockResolvedValueOnce({ rows: [currentRow] });

    const staleResult = getActiveJwks();
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledOnce());
    clearJwksCache();
    releaseOldLoad({ rows: [oldRow] });

    expect((await staleResult).keys[0]?.kid).toBe(oldRow.kid);
    expect((await getActiveJwks()).keys[0]?.kid).toBe(currentRow.kid);
    await getActiveJwks();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('locks, rechecks, inserts, commits, and then reloads the bootstrap winner', async () => {
    let storedRow: SigningKeyRow | undefined;
    mocks.query.mockImplementation((sqlValue: unknown, values?: unknown[]) => {
      const sql = String(sqlValue);
      if (/^LOCK TABLE/i.test(sql)) return Promise.resolve({ rows: [] });
      if (/^\s*INSERT INTO signing_keys/i.test(sql)) {
        storedRow = {
          id: 'database-generated-id',
          kid: String(values?.[0]),
          algorithm: String(values?.[1]),
          public_key: String(values?.[2]),
          private_key: String(values?.[3]),
          private_key_iv: String(values?.[4]),
          private_key_tag: String(values?.[5]),
          encrypted: true,
          status: 'active',
          activated_at: new Date('2026-09-13T00:00:00.000Z'),
          retired_at: null,
          expires_at: null,
        };
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: storedRow ? [storedRow] : [] });
    });

    const jwks = await ensureSigningKeys();

    expect(mocks.runDatabaseTransaction).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(String(mocks.query.mock.calls[0]?.[0])).toBe(
      'LOCK TABLE signing_keys IN SHARE ROW EXCLUSIVE MODE',
    );
    expect(String(mocks.query.mock.calls[1]?.[0])).toMatch(/SELECT id, kid/i);
    expect(String(mocks.query.mock.calls[2]?.[0])).toMatch(/INSERT INTO signing_keys/i);
    expect(String(mocks.query.mock.calls[3]?.[0])).toMatch(/SELECT id, kid/i);
    expect(storedRow).toBeDefined();
    expect(jwks.keys[0]?.kid).toBe(storedRow?.kid);
  });
});
