import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Secret, TOTP } from 'otpauth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import * as repository from '../../../src/two-factor/repository.js';
import * as errors from '../../../src/two-factor/errors.js';
import * as totp from '../../../src/two-factor/totp.js';
import * as types from '../../../src/two-factor/types.js';

vi.mock('../../../src/lib/database.js', () => ({ getPool: vi.fn() }));

const FIXED_TIME = Date.parse('2026-09-13T12:00:15.000Z');
const FIXED_STEP = Math.floor(FIXED_TIME / 30_000);
const SECRET = 'JBSWY3DPEHPK3PXP';

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
type Query = ReturnType<typeof vi.fn<(sql: string, values?: unknown[]) => Promise<QueryResult>>>;

interface ReplayRepository {
  consumeTotpTimeStep(id: string, userId: string, timeStep: number): Promise<boolean>;
  verifyTotpEnrollment(id: string, userId: string, timeStep: number): Promise<boolean>;
}

function replayRepository(): ReplayRepository {
  return repository as unknown as ReplayRepository;
}

function mockQuery(rowCount: number): Query {
  const query = vi.fn(async () => ({ rows: [], rowCount }));
  vi.mocked(getPool).mockReturnValue({ query } as never);
  return query;
}

function storedTotpRow(lastAcceptedTimeStep: unknown) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    user_id: '20000000-0000-4000-8000-000000000001',
    encrypted_secret: 'ciphertext',
    encryption_iv: 'iv',
    encryption_tag: 'tag',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    verified: true,
    last_accepted_time_step: lastAcceptedTimeStep,
    created_at: new Date('2026-09-13T00:00:00.000Z'),
    updated_at: new Date('2026-09-13T00:00:00.000Z'),
  };
}

describe('TOTP replay migration SQL', () => {
  it('leaves the original two-factor migration byte-for-byte unchanged', async () => {
    const original = await readFile(join(process.cwd(), 'migrations/012_two_factor.sql'));
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      '31a0e51a22706eb3546c935e142d39037084585867b215352b91add7d91fbb78',
    );
  });

  it('adds one nullable BIGINT and three named fixed-parameter checks', async () => {
    const sql = await readFile(
      join(process.cwd(), 'migrations/028_totp_replay_protection.sql'),
      'utf8',
    );
    const [up = '', down = ''] = sql.split('-- Down Migration');

    expect(up).toMatch(
      /ALTER TABLE\s+user_totp[\s\S]*ADD COLUMN\s+last_accepted_time_step\s+BIGINT(?!\s+NOT NULL)/i,
    );
    expect(up).toMatch(
      /CONSTRAINT\s+user_totp_algorithm_check\s+CHECK\s*\(\s*algorithm\s*=\s*'SHA1'\s*\)/i,
    );
    expect(up).toMatch(/CONSTRAINT\s+user_totp_digits_check\s+CHECK\s*\(\s*digits\s*=\s*6\s*\)/i);
    expect(up).toMatch(/CONSTRAINT\s+user_totp_period_check\s+CHECK\s*\(\s*period\s*=\s*30\s*\)/i);
    expect(up.match(/ADD\s+(?:COLUMN\s+)?last_accepted_time_step/gi)).toHaveLength(1);

    expect(down).toMatch(/DROP CONSTRAINT IF EXISTS\s+user_totp_algorithm_check/i);
    expect(down).toMatch(/DROP CONSTRAINT IF EXISTS\s+user_totp_digits_check/i);
    expect(down).toMatch(/DROP CONSTRAINT IF EXISTS\s+user_totp_period_check/i);
    expect(down).toMatch(/DROP COLUMN IF EXISTS\s+last_accepted_time_step/i);
    expect(down).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)|TRUNCATE|DELETE\s+FROM/i);
  });
});

describe('TOTP time-step validation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ['prior', -1],
    ['current', 0],
    ['next', 1],
  ] as const)(
    'returns the absolute %s matched time step at one exact timestamp',
    (_label, delta) => {
      const validate = vi.spyOn(TOTP.prototype, 'validate').mockReturnValue(delta);

      const match = totp.verifyTotpCode(
        '123456',
        SECRET,
        { algorithm: 'SHA1', digits: 6, period: 30 },
        FIXED_TIME,
      );

      expect(validate).toHaveBeenCalledWith({ token: '123456', timestamp: FIXED_TIME, window: 1 });
      expect(match).toEqual({ timeStep: FIXED_STEP + delta });
    },
  );

  it('returns null when no time step matches', () => {
    vi.spyOn(TOTP.prototype, 'validate').mockReturnValue(null);

    expect(
      totp.verifyTotpCode(
        '000000',
        SECRET,
        { algorithm: 'SHA1', digits: 6, period: 30 },
        FIXED_TIME,
      ),
    ).toBeNull();
  });

  it.each([
    [{ algorithm: 'SHA256', digits: 6, period: 30 }, 'algorithm'],
    [{ algorithm: 'SHA1', digits: 8, period: 30 }, 'digits'],
    [{ algorithm: 'SHA1', digits: 6, period: 60 }, 'period'],
  ])('rejects unsupported $1 before decoding the secret', (parameters) => {
    const decode = vi.spyOn(Secret, 'fromBase32');
    const replayErrors = errors as unknown as {
      UnsupportedTotpConfigurationError?: new (message?: string) => Error;
    };

    expect(() => totp.verifyTotpCode('123456', SECRET, parameters, FIXED_TIME)).toThrow(
      replayErrors.UnsupportedTotpConfigurationError,
    );
    expect(() => totp.verifyTotpCode('123456', SECRET, parameters, FIXED_TIME)).toThrow(
      'TOTP configuration is unsupported',
    );
    expect(decode).not.toHaveBeenCalled();
  });
});

describe('TOTP row mapping', () => {
  it.each([
    [null, null],
    ['0', 0],
    ['187654321', 187654321],
  ])('maps database time step %s to %s', (stored, expected) => {
    const mapped = types.mapRowToUserTotp(storedTotpRow(stored) as never) as unknown as {
      lastAcceptedTimeStep: number | null;
    };
    expect(mapped.lastAcceptedTimeStep).toBe(expected);
  });

  it.each(['NaN', '1.5', '9007199254740992', '-9007199254740992', 'Infinity'])(
    'rejects malformed or unsafe BIGINT value %s',
    (stored) => {
      expect(() => types.mapRowToUserTotp(storedTotpRow(stored) as never)).toThrow();
    },
  );
});

describe('TOTP compare-and-set repository writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consumes a verified row only when its stored step is null or older', async () => {
    const query = mockQuery(1);
    await expect(
      replayRepository().consumeTotpTimeStep('totp-id', 'user-id', FIXED_STEP),
    ).resolves.toBe(true);

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/UPDATE\s+user_totp[\s\S]*SET\s+last_accepted_time_step\s*=\s*\$3/i);
    expect(sql).toMatch(/id\s*=\s*\$1[\s\S]*user_id\s*=\s*\$2[\s\S]*verified\s*=\s*true/i);
    expect(sql).toMatch(
      /last_accepted_time_step\s+IS\s+NULL\s+OR\s+last_accepted_time_step\s*<\s*\$3/i,
    );
    expect(values).toEqual(['totp-id', 'user-id', FIXED_STEP]);
  });

  it('treats a zero-row authentication update as an ordinary failed match', async () => {
    mockQuery(0);
    await expect(
      replayRepository().consumeTotpTimeStep('totp-id', 'user-id', FIXED_STEP),
    ).resolves.toBe(false);
  });

  it('verifies only the exact pending enrollment row while storing its matched step', async () => {
    const query = mockQuery(1);
    await expect(
      replayRepository().verifyTotpEnrollment('totp-id', 'user-id', FIXED_STEP),
    ).resolves.toBe(true);

    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toMatch(/UPDATE\s+user_totp[\s\S]*verified\s*=\s*true/i);
    expect(sql).toMatch(/last_accepted_time_step\s*=\s*\$3/i);
    expect(sql).toMatch(/id\s*=\s*\$1[\s\S]*user_id\s*=\s*\$2[\s\S]*verified\s*=\s*false/i);
    expect(values).toEqual(['totp-id', 'user-id', FIXED_STEP]);
  });

  it('mutates nothing for a wrong row, user, state, equal step, or older step', async () => {
    const query = mockQuery(0);
    const replay = replayRepository();

    await expect(replay.consumeTotpTimeStep('wrong-row', 'user-id', FIXED_STEP)).resolves.toBe(
      false,
    );
    await expect(replay.consumeTotpTimeStep('totp-id', 'wrong-user', FIXED_STEP)).resolves.toBe(
      false,
    );
    await expect(replay.consumeTotpTimeStep('totp-id', 'user-id', FIXED_STEP)).resolves.toBe(false);
    await expect(replay.consumeTotpTimeStep('totp-id', 'user-id', FIXED_STEP - 1)).resolves.toBe(
      false,
    );
    await expect(replay.verifyTotpEnrollment('totp-id', 'user-id', FIXED_STEP)).resolves.toBe(
      false,
    );
    expect(query).toHaveBeenCalledTimes(5);
  });
});

describe('TOTP service validation boundary', () => {
  it('samples time once and validates with the stored parameters before consuming the exact row', async () => {
    vi.resetModules();
    const verifyCode = vi.fn().mockReturnValue({ timeStep: FIXED_STEP });
    const consume = vi.fn().mockResolvedValue(true);
    const find = vi.fn().mockResolvedValue({
      id: 'totp-id',
      userId: 'user-id',
      encryptedSecret: 'ciphertext',
      encryptionIv: 'iv',
      encryptionTag: 'tag',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      verified: true,
      lastAcceptedTimeStep: null,
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME);

    vi.doMock('../../../src/two-factor/totp.js', () => ({
      generateTotpSecret: vi.fn(),
      generateTotpUri: vi.fn(),
      generateQrCodeDataUri: vi.fn(),
      verifyTotpCode: verifyCode,
    }));
    vi.doMock('../../../src/two-factor/repository.js', () => ({
      findTotpByUserId: find,
      consumeTotpTimeStep: consume,
      verifyTotpEnrollment: vi.fn(),
      insertTotp: vi.fn(),
      deleteTotp: vi.fn(),
      insertOtpCode: vi.fn(),
      findActiveOtpCodes: vi.fn(),
      markOtpCodeUsed: vi.fn(),
      deleteExpiredOtpCodes: vi.fn(),
      countActiveOtpCodes: vi.fn(),
      insertRecoveryCodes: vi.fn(),
      findUnusedRecoveryCodes: vi.fn(),
      markRecoveryCodeUsed: vi.fn(),
      deleteAllRecoveryCodes: vi.fn(),
      countUnusedRecoveryCodes: vi.fn(),
    }));
    vi.doMock('../../../src/two-factor/crypto.js', () => ({
      encryptTotpSecret: vi.fn(),
      decryptTotpSecret: vi.fn().mockReturnValue(SECRET),
    }));
    vi.doMock('../../../src/two-factor/cache.js', () => ({
      getCachedTwoFactorStatus: vi.fn(),
      cacheTwoFactorStatus: vi.fn(),
      invalidateTwoFactorCache: vi.fn(),
    }));
    vi.doMock('../../../src/two-factor/otp.js', () => ({
      generateOtpCode: vi.fn(),
      hashOtpCode: vi.fn(),
      verifyOtpCode: vi.fn(),
    }));
    vi.doMock('../../../src/two-factor/recovery.js', () => ({
      generateRecoveryCodes: vi.fn(),
      hashRecoveryCode: vi.fn(),
      verifyRecoveryCode: vi.fn(),
    }));
    vi.doMock('../../../src/users/repository.js', () => ({
      findUserById: vi.fn(),
      updateUser: vi.fn(),
    }));
    vi.doMock('../../../src/lib/database.js', () => ({
      runDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
    }));
    vi.doMock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../../../src/lib/logger.js', () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock('../../../src/config/index.js', () => ({
      config: { twoFactorEncryptionKey: 'a'.repeat(64) },
    }));

    const service = await import('../../../src/two-factor/service.js');
    await expect(service.verifyTotp('user-id', '123456')).resolves.toBe(true);

    expect(now).toHaveBeenCalledTimes(1);
    expect(verifyCode).toHaveBeenCalledWith(
      '123456',
      SECRET,
      { algorithm: 'SHA1', digits: 6, period: 30 },
      FIXED_TIME,
    );
    expect(consume).toHaveBeenCalledWith('totp-id', 'user-id', FIXED_STEP);
  });
});

describe('password login interaction boundary', () => {
  it('passes the organization-scoped pending user to the TOTP policy before creating the interaction', async () => {
    vi.resetModules();
    const organizationId = '10000000-0000-4000-8000-000000000001';
    const user = {
      id: '20000000-0000-4000-8000-000000000001',
      email: 'person@example.test',
      status: 'active',
      hasPassword: true,
      twoFactorEnabled: false,
      twoFactorMethod: null,
    };
    const prepare = vi.fn().mockResolvedValue(user);
    const verifyPassword = vi.fn().mockResolvedValue(true);
    const requires = vi.fn().mockReturnValue(true);
    const determine = vi.fn().mockReturnValue('totp');
    const events: string[] = [];
    prepare.mockImplementation(async () => {
      events.push('prepare');
      return user;
    });
    requires.mockImplementation(() => {
      events.push('policy');
      return true;
    });

    vi.doMock('../../../src/users/service.js', () => ({
      prepareUserForPasswordLogin: prepare,
      verifyLoginPassword: verifyPassword,
      recordLogin: vi.fn(),
      recordPasswordFailure: vi.fn(),
    }));
    vi.doMock('../../../src/two-factor/service.js', () => ({
      requiresTwoFactor: requires,
      determineTwoFactorMethod: determine,
      sendOtpCode: vi.fn(),
    }));
    vi.doMock('../../../src/auth/csrf.js', () => ({
      generateCsrfToken: vi.fn(),
      verifyCsrfToken: vi.fn().mockReturnValue(true),
      setCsrfCookie: vi.fn(),
      getCsrfFromCookie: vi.fn().mockReturnValue('csrf-token'),
    }));
    vi.doMock('../../../src/auth/rate-limiter.js', () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 }),
      resetRateLimit: vi.fn(),
      buildLoginRateLimitKey: vi.fn().mockReturnValue('login-key'),
      buildMagicLinkRateLimitKey: vi.fn(),
      loadLoginRateLimitConfig: vi.fn().mockResolvedValue({ maxAttempts: 5, windowSeconds: 300 }),
      loadMagicLinkRateLimitConfig: vi.fn(),
    }));
    vi.doMock('../../../src/auth/email-service.js', () => ({
      sendMagicLinkEmail: vi.fn(),
      sendOtpCodeEmail: vi.fn(),
    }));
    vi.doMock('../../../src/auth/recovery-service.js', () => ({ enqueueAccountRecovery: vi.fn() }));
    vi.doMock('../../../src/auth/i18n.js', () => ({
      resolveLocale: vi.fn().mockResolvedValue('en'),
      getTranslationFunction: vi.fn().mockReturnValue((key: string) => key),
    }));
    vi.doMock('../../../src/auth/template-engine.js', () => ({ renderPage: vi.fn() }));
    vi.doMock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../../../src/lib/logger.js', () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock('../../../src/organizations/service.js', () => ({ getOrganizationById: vi.fn() }));
    vi.doMock('../../../src/lib/redis.js', () => ({
      getRedis: vi.fn(() => ({ get: vi.fn() })),
    }));
    vi.doMock('../../../src/auth/magic-link-session.js', () => ({
      hasMagicLinkSession: vi.fn().mockReturnValue(false),
      consumeMagicLinkSession: vi.fn(),
    }));
    vi.doMock('../../../src/auth/token-repository.js', () => ({
      insertToken: vi.fn(),
      invalidateUserTokens: vi.fn(),
    }));
    vi.doMock('../../../src/auth/tokens.js', () => ({ generateToken: vi.fn() }));
    vi.doMock('../../../src/oidc/postgres-adapter.js', () => ({ purgeExpired: vi.fn() }));
    vi.doMock('../../../src/config/index.js', () => ({
      config: { issuerBaseUrl: 'https://identity.example.test' },
    }));

    const { createInteractionRouter } = await import('../../../src/routes/interactions.js');
    const provider = {
      interactionDetails: vi.fn().mockResolvedValue({
        uid: 'interaction-id',
        prompt: { name: 'login', reasons: [], details: {} },
        params: { client_id: 'client-id', scope: 'openid' },
        session: {},
      }),
      interactionFinished: vi.fn(),
      interactionResult: vi.fn(),
      Client: {
        find: vi.fn().mockResolvedValue({
          metadata: () => ({
            organizationId,
            'urn:porta:login_methods': ['password'],
          }),
        }),
      },
    };
    const router = createInteractionRouter(provider as never);
    const layer = router.stack.find(
      (candidate) =>
        candidate.methods.includes('POST') && candidate.path === '/interaction/:uid/login',
    );
    const context = {
      params: { uid: 'interaction-id' },
      query: {},
      request: {
        body: { email: user.email, password: 'valid-password', _csrf: 'csrf-token' },
      },
      req: {},
      res: {},
      ip: '127.0.0.1',
      state: {
        organization: {
          id: organizationId,
          slug: 'example',
          defaultLoginMethods: ['password'],
          twoFactorPolicy: 'required_totp',
        },
      },
      cookies: { get: vi.fn().mockReturnValue('csrf-token'), set: vi.fn() },
      get: vi.fn().mockReturnValue(''),
      set: vi.fn(),
      redirect: vi.fn(),
      status: 200,
      body: undefined,
      type: '',
    };

    await layer!.stack[layer!.stack.length - 1]!(context as never, vi.fn());

    expect(prepare).toHaveBeenCalledWith(organizationId, user.email);
    expect(verifyPassword).toHaveBeenCalledWith(user.id, 'valid-password');
    expect(requires).toHaveBeenCalledWith(context.state.organization, user);
    expect(determine).toHaveBeenCalledWith(context.state.organization, user);
    expect(events).toEqual(['prepare', 'policy']);
    expect(provider.interactionResult).toHaveBeenCalledWith(
      context.req,
      context.res,
      { twoFactor: { pendingAccountId: user.id, method: 'totp', email: user.email } },
      { mergeWithLastSubmission: true },
    );
  });
});
