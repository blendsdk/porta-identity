import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

import { TEST_SIGNING_KEY_ENCRYPTION_KEY } from '../../helpers/constants.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { ADMIN_PERMISSIONS } from '../../../src/lib/admin-permissions.js';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { decryptPrivateKey, encryptPrivateKey } from '../../../src/lib/signing-key-crypto.js';
import {
  clearJwksCache,
  ensureSigningKeys,
  generateES256KeyPair,
  getActiveJwks,
} from '../../../src/lib/signing-keys.js';
import { createKeysRouter } from '../../../src/routes/keys.js';

const ACTOR_ID = '10000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000002';
const REJECT_FUNCTION = 'reject_signing_key_insert_after_retirement_spec';
const REJECT_TRIGGER = 'reject_signing_key_insert_after_retirement_spec';

/** Creates the smallest authenticated Koa-like context needed by a key mutation. */
function context(permission: string) {
  let status = 200;
  let body: unknown;
  return {
    params: {},
    query: {},
    request: { body: {} },
    state: {
      adminUser: {
        id: ACTOR_ID,
        email: 'operator@example.test',
        organizationId: ORGANIZATION_ID,
        roles: ['porta-super-admin'],
        permissions: [permission],
      },
    },
    get status() {
      return status;
    },
    set status(value: number) {
      status = value;
    },
    get body() {
      return body;
    },
    set body(value: unknown) {
      body = value;
    },
    throw(code: number, message: string): never {
      status = code;
      const failure = new Error(message) as Error & { status: number };
      failure.status = code;
      throw failure;
    },
  };
}

/** Executes an Admin key mutation within the real request transaction boundary. */
async function executeMutation(path: '/generate' | '/rotate', permission: string) {
  const layer = createKeysRouter().stack.find(
    (candidate) => candidate.methods.includes('POST') && candidate.path.endsWith(path),
  );
  if (!layer) throw new Error(`Missing POST key route ending in ${path}`);
  const ctx = context(permission);
  const dispatch = async (index: number): Promise<void> => {
    const middleware = layer.stack[index];
    if (!middleware) return;
    await Reflect.apply(middleware, undefined, [ctx, () => dispatch(index + 1)]);
  };
  await runDatabaseTransaction(() => dispatch(0));
  return ctx;
}

/** Inserts a known-good encrypted active key for rotation and cache assertions. */
async function insertEncryptedActiveKey(): Promise<{ readonly kid: string }> {
  const pair = generateES256KeyPair();
  const encrypted = encryptPrivateKey(pair.privateKeyPem, TEST_SIGNING_KEY_ENCRYPTION_KEY);
  await getPool().query(
    `INSERT INTO signing_keys
       (kid, algorithm, public_key, private_key, private_key_iv, private_key_tag,
        encrypted, status, activated_at)
     VALUES ($1, 'ES256', $2, $3, $4, $5, TRUE, 'active', NOW())`,
    [pair.kid, pair.publicKeyPem, encrypted.encrypted, encrypted.iv, encrypted.tag],
  );
  return { kid: pair.kid };
}

/** Removes the failure trigger used to prove transaction rollback. */
async function removeFailureTrigger(): Promise<void> {
  const pool = getPool();
  await pool.query(`DROP TRIGGER IF EXISTS ${REJECT_TRIGGER} ON signing_keys`);
  await pool.query(`DROP FUNCTION IF EXISTS ${REJECT_FUNCTION}()`);
}

describe('signing-key storage specification', () => {
  beforeEach(async () => {
    await removeFailureTrigger();
    await truncateAllTables();
    await seedBaseData();
    clearJwksCache();
  });

  afterEach(async () => {
    await removeFailureTrigger();
    clearJwksCache();
  });

  // Admin generation persists authenticated ciphertext and never returns private key material.
  it('stores an authorized generated key encrypted at rest', async () => {
    const ctx = await executeMutation('/generate', ADMIN_PERMISSIONS.KEY_GENERATE);
    const result = await getPool().query<{
      kid: string;
      algorithm: string;
      public_key: string;
      private_key: string;
      private_key_iv: string | null;
      private_key_tag: string | null;
      encrypted: boolean;
    }>(
      `SELECT kid, algorithm, public_key, private_key, private_key_iv, private_key_tag, encrypted
         FROM signing_keys`,
    );

    expect(ctx.status).toBe(201);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.algorithm).toBe('ES256');
    expect(row.encrypted).toBe(true);
    expect(row.private_key_iv).toMatch(/^[0-9a-f]{24}$/);
    expect(row.private_key_tag).toMatch(/^[0-9a-f]{32}$/);
    expect(row.private_key).not.toContain('PRIVATE KEY');
    expect(
      decryptPrivateKey(
        row.private_key,
        row.private_key_iv!,
        row.private_key_tag!,
        TEST_SIGNING_KEY_ENCRYPTION_KEY,
      ),
    ).toContain('BEGIN PRIVATE KEY');
    const response = JSON.stringify(ctx.body);
    expect(response).not.toContain(row.private_key);
    expect(response).not.toContain(row.private_key_iv!);
    expect(response).not.toContain(row.private_key_tag!);
    expect(response).not.toContain('PRIVATE KEY');
  });

  // A database failure after retirement rolls the entire rotation back and retains the cached set.
  it('rolls back retirement when insertion fails and leaves the cache unchanged', async () => {
    const original = await insertEncryptedActiveKey();
    const cachedBefore = await getActiveJwks();
    const pool = getPool();
    await pool.query(`
      CREATE FUNCTION ${REJECT_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'active' AND EXISTS (
          SELECT 1 FROM signing_keys WHERE status = 'retired'
        ) THEN
          RAISE EXCEPTION 'forced signing-key insertion failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER ${REJECT_TRIGGER}
      BEFORE INSERT ON signing_keys
      FOR EACH ROW EXECUTE FUNCTION ${REJECT_FUNCTION}()
    `);

    await expect(executeMutation('/rotate', ADMIN_PERMISSIONS.KEY_ROTATE)).rejects.toThrow();

    const rows = await pool.query<{ kid: string; status: string }>(
      `SELECT kid, status FROM signing_keys ORDER BY created_at`,
    );
    expect(rows.rows).toEqual([{ kid: original.kid, status: 'active' }]);
    expect((await getActiveJwks()).keys.map((key) => key.kid)).toEqual(
      cachedBefore.keys.map((key) => key.kid),
    );
  });

  // Successful rotation commits retirement and one encrypted replacement before cache visibility changes.
  it('atomically retires old keys and exposes one encrypted active replacement', async () => {
    const first = await insertEncryptedActiveKey();
    const second = await insertEncryptedActiveKey();
    await getActiveJwks();

    const ctx = await executeMutation('/rotate', ADMIN_PERMISSIONS.KEY_ROTATE);
    const rows = await getPool().query<{
      kid: string;
      status: string;
      encrypted: boolean;
      private_key_iv: string | null;
      private_key_tag: string | null;
    }>(
      `SELECT kid, status, encrypted, private_key_iv, private_key_tag
         FROM signing_keys
        ORDER BY created_at`,
    );

    expect(ctx.status).toBe(201);
    expect(rows.rows.filter((row) => row.status === 'retired').map((row) => row.kid)).toEqual(
      expect.arrayContaining([first.kid, second.kid]),
    );
    const active = rows.rows.filter((row) => row.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ encrypted: true });
    expect(active[0]?.private_key_iv).not.toBeNull();
    expect(active[0]?.private_key_tag).not.toBeNull();
    expect((await getActiveJwks()).keys.map((key) => key.kid)).toContain(active[0]?.kid);
  });

  // The database lock makes simultaneous empty-table bootstraps share one winning active key.
  it('serializes two concurrent empty-table bootstraps and reloads the winner for both callers', async () => {
    const pool = getPool();
    const blocker = await pool.connect();
    let first!: Awaited<ReturnType<typeof ensureSigningKeys>>;
    let second!: Awaited<ReturnType<typeof ensureSigningKeys>>;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE signing_keys IN ACCESS EXCLUSIVE MODE');
      const bootstraps = Promise.all([ensureSigningKeys(), ensureSigningKeys()]);

      await vi.waitFor(
        async () => {
          const waiting = await blocker.query<{ count: string }>(`
            SELECT COUNT(*)::text AS count
              FROM pg_locks AS lock
              JOIN pg_class AS relation ON relation.oid = lock.relation
             WHERE relation.relname = 'signing_keys'
               AND lock.granted = FALSE
          `);
          expect(Number(waiting.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);
        },
        { timeout: 5_000, interval: 25 },
      );

      await blocker.query('COMMIT');
      [first, second] = await bootstraps;
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
    }

    const rows = await pool.query<{
      kid: string;
      encrypted: boolean;
      private_key: string;
      private_key_iv: string | null;
      private_key_tag: string | null;
    }>(
      `SELECT kid, encrypted, private_key, private_key_iv, private_key_tag
         FROM signing_keys
        WHERE status = 'active'`,
    );

    expect(rows.rows).toHaveLength(1);
    const winner = rows.rows[0]!;
    expect(winner.encrypted).toBe(true);
    expect(winner.private_key).not.toContain('PRIVATE KEY');
    expect(winner.private_key_iv).not.toBeNull();
    expect(winner.private_key_tag).not.toBeNull();
    for (const jwks of [first, second]) {
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0]).toMatchObject({
        kid: winner.kid,
        kty: 'EC',
        crv: 'P-256',
        alg: 'ES256',
        use: 'sig',
      });
      expect(jwks.keys[0]?.d).toBeTruthy();
      expect(jwks.keys[0]?.x).toBeTruthy();
      expect(jwks.keys[0]?.y).toBeTruthy();
    }
  });
});
