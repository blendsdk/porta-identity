import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  encryptPrivateKey: vi.fn(),
  decryptPrivateKey: vi.fn(),
  findSuperAdminOrganization: vi.fn(),
  getApplicationBySlug: vi.fn(),
  afterCommit: [] as Array<() => Promise<void>>,
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => ({ query: mocks.query }),
  connectDatabase: mocks.connectDatabase,
  disconnectDatabase: mocks.disconnectDatabase,
  runDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
  afterDatabaseCommit: vi.fn(async (effect: () => Promise<void>) => {
    mocks.afterCommit.push(effect);
  }),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { signingKeyEncryptionKey: 'deadbeef'.repeat(8), host: '127.0.0.1', port: 0 },
}));

vi.mock('../../../src/lib/logger.js', () => ({ logger: mocks.log }));

vi.mock('../../../src/lib/redis.js', () => ({
  connectRedis: mocks.connectRedis,
  disconnectRedis: mocks.disconnectRedis,
}));

vi.mock('../../../src/server.js', () => ({ createApp: vi.fn() }));
vi.mock('../../../src/lib/system-config.js', () => ({ loadOidcTtlConfig: vi.fn() }));
vi.mock('../../../src/oidc/provider.js', () => ({ createOidcProvider: vi.fn() }));
vi.mock('../../../src/auth/i18n.js', () => ({
  initI18n: vi.fn(),
  registerHandlebarsI18nHelper: vi.fn(),
}));
vi.mock('../../../src/auth/template-engine.js', () => ({ initTemplateEngine: vi.fn() }));
vi.mock('../../../src/auth/recovery-service.js', () => ({
  startAccountRecoveryWorker: vi.fn(),
  stopAccountRecoveryWorker: vi.fn(),
}));
vi.mock('../../../src/users/password.js', () => ({ initializeDummyPasswordHash: vi.fn() }));
vi.mock('../../../src/security/transport-decision.js', () => ({
  attachTransportDecisionHandler: vi.fn(),
}));

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/cli/output.js', () => ({
  error: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../src/cli/bootstrap.js', () => ({
  withBootstrap: vi.fn(async (_argv: unknown, work: () => Promise<unknown>) => work()),
}));

vi.mock('../../../src/organizations/repository.js', () => ({
  findSuperAdminOrganization: mocks.findSuperAdminOrganization,
}));

vi.mock('../../../src/applications/index.js', () => ({
  getApplicationBySlug: mocks.getApplicationBySlug,
  createApplication: vi.fn(),
}));

vi.mock('../../../src/lib/signing-key-crypto.js', () => {
  class SigningKeyCryptoError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SigningKeyCryptoError';
    }
  }

  return {
    SigningKeyCryptoError,
    encryptPrivateKey: mocks.encryptPrivateKey,
    decryptPrivateKey: mocks.decryptPrivateKey,
  };
});

import { error as writeCliError } from '../../../src/cli/output.js';
import { initCommand } from '../../../src/cli/commands/init.js';
import { afterDatabaseCommit, runDatabaseTransaction } from '../../../src/lib/database.js';
import { SigningKeyCryptoError } from '../../../src/lib/signing-key-crypto.js';
import {
  clearJwksCache,
  generateES256KeyPair,
  getActiveJwks,
  loadSigningKeysFromDb,
} from '../../../src/lib/signing-keys.js';
import { ADMIN_PERMISSIONS } from '../../../src/lib/admin-permissions.js';
import { createKeysRouter } from '../../../src/routes/keys.js';

const ACTOR_ID = '10000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000002';
const ENCRYPTED_PRIVATE_KEY = 'ciphertext-without-private-pem';
const PRIVATE_KEY_IV = 'a'.repeat(24);
const PRIVATE_KEY_TAG = 'b'.repeat(32);

/** Database row shape used to express strict signing-key loading expectations. */
interface StoredSigningKeyRow {
  readonly id: string;
  readonly kid: string;
  readonly algorithm: 'ES256';
  readonly public_key: string;
  readonly private_key: string;
  readonly private_key_iv: string | null;
  readonly private_key_tag: string | null;
  readonly encrypted: boolean;
  readonly status: 'active' | 'retired';
  readonly activated_at: Date;
  readonly retired_at: Date | null;
  readonly expires_at: Date | null;
  readonly created_at: Date;
}

/** Builds a valid encrypted-row fixture with optional malformed fields. */
function storedRow(
  privateKeyPem: string,
  overrides: Partial<StoredSigningKeyRow> = {},
): StoredSigningKeyRow {
  const pair = generateES256KeyPair();
  mocks.decryptPrivateKey.mockImplementation((ciphertext: string) => {
    if (ciphertext === ENCRYPTED_PRIVATE_KEY) return privateKeyPem;
    throw new SigningKeyCryptoError('Signing key record is invalid');
  });
  return {
    id: '20000000-0000-4000-8000-000000000001',
    kid: pair.kid,
    algorithm: 'ES256',
    public_key: pair.publicKeyPem,
    private_key: ENCRYPTED_PRIVATE_KEY,
    private_key_iv: PRIVATE_KEY_IV,
    private_key_tag: PRIVATE_KEY_TAG,
    encrypted: true,
    status: 'active',
    activated_at: new Date('2026-09-13T00:00:00.000Z'),
    retired_at: null,
    expires_at: null,
    created_at: new Date('2026-09-13T00:00:00.000Z'),
    ...overrides,
  };
}

/** Creates the smallest Koa-like context required by the key mutation middleware. */
function context(permissions?: readonly string[]) {
  let status = 200;
  let body: unknown;
  return {
    params: {},
    query: {},
    request: { body: {} },
    state: permissions
      ? {
          adminUser: {
            id: ACTOR_ID,
            email: 'operator@example.test',
            organizationId: ORGANIZATION_ID,
            roles: ['porta-super-admin'],
            permissions,
          },
        }
      : {},
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

/** Resolves one key mutation layer from the public router contract. */
function mutationLayer(path: '/generate' | '/rotate') {
  const layer = createKeysRouter().stack.find(
    (candidate) => candidate.methods.includes('POST') && candidate.path.endsWith(path),
  );
  if (!layer) throw new Error(`Missing POST key route ending in ${path}`);
  return layer;
}

/** Runs a key mutation inside the same transaction boundary used by Admin requests. */
async function executeMutation(path: '/generate' | '/rotate', permissions?: readonly string[]) {
  const ctx = context(permissions);
  const layer = mutationLayer(path);
  const dispatch = async (index: number): Promise<void> => {
    const middleware = layer.stack[index];
    if (!middleware) return;
    await Reflect.apply(middleware, undefined, [ctx, () => dispatch(index + 1)]);
  };
  await runDatabaseTransaction(() => dispatch(0));
  return ctx;
}

/** Executes effects registered for the successful-commit boundary. */
async function runAfterCommitEffects(): Promise<void> {
  for (const effect of mocks.afterCommit.splice(0)) await effect();
}

describe('signing-key security specification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCommit.length = 0;
    mocks.encryptPrivateKey.mockReturnValue({
      encrypted: ENCRYPTED_PRIVATE_KEY,
      iv: PRIVATE_KEY_IV,
      tag: PRIVATE_KEY_TAG,
    });
    mocks.decryptPrivateKey.mockReset();
    mocks.findSuperAdminOrganization.mockResolvedValue({
      id: ORGANIZATION_ID,
      name: 'Porta Admin',
      slug: 'porta-admin',
    });
    mocks.getApplicationBySlug.mockResolvedValue(null);
    clearJwksCache();
  });

  // An authorized generation stores only encrypted private material and preserves the public API.
  it('creates an encrypted ES256 key without disclosing private material', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: '20000000-0000-4000-8000-000000000003',
          kid: '0123456789abcdef',
          algorithm: 'ES256',
          status: 'active',
          created_at: new Date('2026-09-13T00:00:00.000Z'),
        },
      ],
    });

    const ctx = await executeMutation('/generate', [ADMIN_PERMISSIONS.KEY_GENERATE]);

    expect(ctx.status).toBe(201);
    expect(mocks.encryptPrivateKey).toHaveBeenCalledOnce();
    const privatePem = mocks.encryptPrivateKey.mock.calls[0]?.[0] as string;
    const insert = mocks.query.mock.calls.find(([sql]) => /INSERT INTO signing_keys/i.test(sql));
    expect(insert).toBeDefined();
    expect(String(insert?.[0])).toMatch(/private_key_iv[^]*private_key_tag[^]*encrypted/i);
    expect(insert?.[1]).toEqual(
      expect.arrayContaining([ENCRYPTED_PRIVATE_KEY, PRIVATE_KEY_IV, PRIVATE_KEY_TAG]),
    );
    expect(String(insert?.[0])).toMatch(/encrypted[^]*true/i);
    expect(JSON.stringify(ctx.body)).not.toContain(privatePem);
    expect(JSON.stringify(ctx.body)).not.toContain(ENCRYPTED_PRIVATE_KEY);
    const logOutput = JSON.stringify(
      Object.values(mocks.log).flatMap((method) => method.mock.calls),
    );
    for (const secret of [privatePem, ENCRYPTED_PRIVATE_KEY, PRIVATE_KEY_IV, PRIVATE_KEY_TAG]) {
      expect(logOutput).not.toContain(secret);
    }
    expect(afterDatabaseCommit).toHaveBeenCalledOnce();
  });

  // Retirement and insertion are one mutation: a failed insert cannot invalidate cached state.
  it('does not report or invalidate a rotation whose insertion fails', async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 2, rows: [] })
      .mockRejectedValueOnce(new Error('forced insertion failure'));

    await expect(executeMutation('/rotate', [ADMIN_PERMISSIONS.KEY_ROTATE])).rejects.toThrow(
      'forced insertion failure',
    );

    expect(runDatabaseTransaction).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls.some(([sql]) => /UPDATE signing_keys/i.test(sql))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => /INSERT INTO signing_keys/i.test(sql))).toBe(
      true,
    );
    expect(afterDatabaseCommit).not.toHaveBeenCalled();
    expect(mocks.afterCommit).toHaveLength(0);
  });

  // Cache invalidation is registered only after all successful rotation SQL and takes effect at commit.
  it('retires old keys, inserts one encrypted active key, and invalidates only after commit', async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 2, rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 'new-id', kid: 'fedcba9876543210', status: 'active' }],
    });

    const ctx = await executeMutation('/rotate', [ADMIN_PERMISSIONS.KEY_ROTATE]);

    expect(ctx.status).toBe(201);
    expect(mocks.query.mock.calls.filter(([sql]) => /UPDATE signing_keys/i.test(sql))).toHaveLength(
      1,
    );
    expect(
      mocks.query.mock.calls.filter(([sql]) => /INSERT INTO signing_keys/i.test(sql)),
    ).toHaveLength(1);
    expect(afterDatabaseCommit).toHaveBeenCalledOnce();
    expect(mocks.afterCommit).toHaveLength(1);
    expect(mocks.encryptPrivateKey).toHaveBeenCalledOnce();
    await runAfterCommitEffects();
    expect(mocks.afterCommit).toHaveLength(0);
  });

  // A load started before invalidation may finish for its caller but cannot repopulate the cache.
  it('does not install an in-flight JWKS snapshot after invalidation', async () => {
    const oldPair = generateES256KeyPair();
    const currentPair = generateES256KeyPair();
    const oldRow = storedRow(oldPair.privateKeyPem, {
      kid: oldPair.kid,
      public_key: oldPair.publicKeyPem,
    });
    const currentRow = storedRow(currentPair.privateKeyPem, {
      id: '20000000-0000-4000-8000-000000000004',
      kid: currentPair.kid,
      public_key: currentPair.publicKeyPem,
    });
    let releaseOldLoad!: (value: { rows: StoredSigningKeyRow[] }) => void;
    const pendingOldLoad = new Promise<{ rows: StoredSigningKeyRow[] }>((resolve) => {
      releaseOldLoad = resolve;
    });
    mocks.query.mockReturnValueOnce(pendingOldLoad).mockResolvedValueOnce({ rows: [currentRow] });

    const staleRead = getActiveJwks();
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1));
    clearJwksCache();
    releaseOldLoad({ rows: [oldRow] });

    expect((await staleRead).keys.map((key) => key.kid)).toEqual([oldPair.kid]);
    expect((await getActiveJwks()).keys.map((key) => key.kid)).toEqual([currentPair.kid]);
    expect((await getActiveJwks()).keys.map((key) => key.kid)).toEqual([currentPair.kid]);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  // Plaintext and incomplete encrypted rows fail closed with one fixed domain error.
  it.each([
    ['plaintext', { encrypted: false }],
    ['missing initialization vector', { private_key_iv: null }],
    ['missing authentication tag', { private_key_tag: null }],
  ])('rejects a %s signing-key row without returning keys', async (_label, override) => {
    const pair = generateES256KeyPair();
    mocks.query.mockResolvedValueOnce({ rows: [storedRow(pair.privateKeyPem, override)] });

    await expect(loadSigningKeysFromDb()).rejects.toEqual(
      expect.objectContaining({
        name: 'SigningKeyCryptoError',
        message: 'Signing key record is invalid',
      }),
    );
  });

  // Invalid ciphertext and invalid PEM emit only the stable row identifier and fixed diagnostic.
  it.each([
    ['bad ciphertext', 'ciphertext-secret', new Error('auth tag mismatch at decrypt.js:44')],
    ['invalid private PEM', 'invalid-pem-ciphertext', null],
  ])('bounds diagnostics for %s during key loading', async (_label, ciphertext, decryptFailure) => {
    const pair = generateES256KeyPair();
    const row = storedRow(pair.privateKeyPem, {
      kid: 'diagnostic-kid',
      public_key: pair.publicKeyPem,
      private_key: ciphertext,
    });
    mocks.query.mockResolvedValueOnce({ rows: [row] });
    if (decryptFailure)
      mocks.decryptPrivateKey.mockImplementationOnce(() => {
        throw decryptFailure;
      });
    else mocks.decryptPrivateKey.mockReturnValueOnce('not a private PEM');

    await expect(getActiveJwks()).rejects.toEqual(
      expect.objectContaining({
        name: 'SigningKeyCryptoError',
        message: 'Signing key record is invalid',
      }),
    );

    const serializedLog = JSON.stringify(
      Object.values(mocks.log).flatMap((method) => method.mock.calls),
    );
    expect(serializedLog).toContain('signing-key-record-invalid');
    expect(serializedLog).toContain('diagnostic-kid');
    const diagnostic = Object.values(mocks.log)
      .flatMap((method) => method.mock.calls)
      .find(([details]) =>
        Boolean(
          details &&
          typeof details === 'object' &&
          'event' in details &&
          details.event === 'signing-key-record-invalid',
        ),
      );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.[0]).toEqual({
      event: 'signing-key-record-invalid',
      kid: 'diagnostic-kid',
    });
    for (const secret of [ciphertext, 'auth tag mismatch', 'decrypt.js', pair.privateKeyPem]) {
      expect(serializedLog).not.toContain(secret);
    }
  });

  // Verbose initialization still reduces an invalid stored key to the fixed operator-safe message.
  it('does not expose signing-row internals through porta init --verbose', async () => {
    const pair = generateES256KeyPair();
    mocks.query.mockResolvedValueOnce({
      rows: [
        storedRow(pair.privateKeyPem, {
          kid: 'verbose-init-kid',
          public_key: pair.publicKeyPem,
          private_key: 'verbose-init-ciphertext',
        }),
      ],
    });
    mocks.decryptPrivateKey.mockImplementationOnce(() => {
      const failure = new Error('auth tag mismatch for verbose-init-ciphertext');
      failure.stack = 'Error: auth tag mismatch\n at /srv/porta/private.ts:44';
      throw failure;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await (initCommand.handler as (argv: Record<string, unknown>) => Promise<void>)({
      json: false,
      verbose: true,
      force: false,
      'dry-run': false,
      email: 'operator@example.test',
      'given-name': 'Porta',
      'family-name': 'Operator',
      password: 'not-used-before-key-validation',
    });

    expect(writeCliError).toHaveBeenCalledWith('Error: Signing key record is invalid');
    const output = JSON.stringify([
      ...vi.mocked(writeCliError).mock.calls,
      ...consoleError.mock.calls,
    ]);
    expect(output).not.toContain('verbose-init-ciphertext');
    expect(output).not.toContain('auth tag mismatch');
    expect(output).not.toContain('/srv/porta/private.ts');
    expect(output).not.toContain('at /srv');
  });

  // Server startup reports the fixed domain message without passing the caught error to the logger.
  it('does not expose signing-row internals when server startup fails', async () => {
    const pair = generateES256KeyPair();
    mocks.query.mockResolvedValueOnce({
      rows: [
        storedRow(pair.privateKeyPem, {
          kid: 'startup-kid',
          public_key: pair.publicKeyPem,
          private_key: 'startup-ciphertext',
        }),
      ],
    });
    mocks.decryptPrivateKey.mockImplementationOnce(() => {
      const failure = new Error('auth tag mismatch for startup-ciphertext');
      failure.stack = 'Error: auth tag mismatch\n at /srv/porta/private.ts:44';
      throw failure;
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await import('../../../src/index.js');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    const fatalCalls = mocks.log.fatal.mock.calls;
    expect(fatalCalls).toHaveLength(1);
    expect(fatalCalls.flat()).not.toEqual(expect.arrayContaining([expect.any(Error)]));
    const output = JSON.stringify(fatalCalls);
    expect(output).toContain('Signing key record is invalid');
    expect(output).not.toContain('startup-ciphertext');
    expect(output).not.toContain('auth tag mismatch');
    expect(output).not.toContain('/srv/porta/private.ts');
  });

  // Authentication and each exact mutation permission fail before any key or cache change.
  it.each([
    ['/generate', undefined, 401],
    ['/generate', [ADMIN_PERMISSIONS.KEY_ROTATE], 403],
    ['/rotate', undefined, 401],
    ['/rotate', [ADMIN_PERMISSIONS.KEY_GENERATE], 403],
  ] as const)(
    'rejects unauthorized POST %s without mutation',
    async (path, permissions, status) => {
      const ctx = await executeMutation(path, permissions);

      expect(ctx.status).toBe(status);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.encryptPrivateKey).not.toHaveBeenCalled();
      expect(afterDatabaseCommit).not.toHaveBeenCalled();
    },
  );
});
