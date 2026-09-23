import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  encryptPrivateKey: vi.fn(),
  clearJwksCache: vi.fn(),
  afterCommit: [] as Array<() => Promise<void>>,
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { signingKeyEncryptionKey: 'a'.repeat(64) },
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/require-permission.js', () => ({
  requirePermission: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  afterDatabaseCommit: vi.fn(async (effect: () => Promise<void>) => {
    mocks.afterCommit.push(effect);
  }),
}));

vi.mock('../../../src/lib/signing-key-crypto.js', () => ({
  encryptPrivateKey: mocks.encryptPrivateKey,
}));

vi.mock('../../../src/lib/signing-keys.js', () => ({
  generateES256KeyPair: () => ({
    kid: 'generated-kid',
    algorithm: 'ES256',
    publicKeyPem: 'public-pem',
    privateKeyPem: 'private-pem',
  }),
  clearJwksCache: mocks.clearJwksCache,
}));

import { afterDatabaseCommit } from '../../../src/lib/database.js';
import { createKeysRouter } from '../../../src/routes/keys.js';

/** Executes one POST route through its complete middleware stack. */
async function executePost(path: '/generate' | '/rotate') {
  const layer = createKeysRouter().stack.find(
    (candidate) => candidate.methods.includes('POST') && candidate.path.endsWith(path),
  );
  if (!layer) throw new Error(`Missing POST route ending in ${path}`);

  const ctx: { status: number; body?: unknown } = { status: 200 };
  const dispatch = async (index: number): Promise<void> => {
    const middleware = layer.stack[index];
    if (!middleware) return;
    await Reflect.apply(middleware, undefined, [ctx, () => dispatch(index + 1)]);
  };
  await dispatch(0);
  return ctx;
}

describe('signing-key route implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCommit.length = 0;
    mocks.encryptPrivateKey.mockReturnValue({
      encrypted: 'encrypted-private-key',
      iv: 'a'.repeat(24),
      tag: 'b'.repeat(32),
    });
  });

  it('binds only encrypted private-key fields during generation', async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: 'key-id', kid: 'generated-kid' }] });

    const ctx = await executePost('/generate');

    expect(ctx.status).toBe(201);
    expect(mocks.encryptPrivateKey).toHaveBeenCalledWith('private-pem', 'a'.repeat(64));
    expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, values] = mocks.query.mock.calls[0]!;
    expect(sql).toMatch(/private_key_iv[^]*private_key_tag[^]*encrypted/i);
    expect(values).toEqual([
      'generated-kid',
      'public-pem',
      'encrypted-private-key',
      'a'.repeat(24),
      'b'.repeat(32),
    ]);
    expect(values).not.toContain('private-pem');
    expect(afterDatabaseCommit).toHaveBeenCalledOnce();
    expect(mocks.clearJwksCache).not.toHaveBeenCalled();
    await mocks.afterCommit[0]!();
    expect(mocks.clearJwksCache).toHaveBeenCalledOnce();
  });

  it('uses the same encrypted insert after retiring active keys', async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 2, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'key-id', kid: 'generated-kid' }] });

    const ctx = await executePost('/rotate');

    expect(ctx.status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(/UPDATE signing_keys/i);
    expect(String(mocks.query.mock.calls[1]?.[0])).toMatch(/INSERT INTO signing_keys/i);
    expect(mocks.query.mock.calls[1]?.[1]).not.toContain('private-pem');
    expect(ctx.body).toMatchObject({ data: { retiredCount: 2 } });
    expect(afterDatabaseCommit).toHaveBeenCalledOnce();
  });
});
