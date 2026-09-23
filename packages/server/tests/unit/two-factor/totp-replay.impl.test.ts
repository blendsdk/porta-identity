import { beforeEach, describe, expect, it, vi } from 'vitest';

const MATCHED_STEP = 123;

interface ServiceMocks {
  readonly consume: ReturnType<typeof vi.fn>;
  readonly verifyEnrollment: ReturnType<typeof vi.fn>;
  readonly updateUser: ReturnType<typeof vi.fn>;
  readonly invalidateCache: ReturnType<typeof vi.fn>;
  readonly runTransaction: ReturnType<typeof vi.fn>;
}

/** Load the service with narrow mocks for its TOTP persistence boundary. */
async function loadService(verified: boolean): Promise<{
  service: typeof import('../../../src/two-factor/service.js');
  mocks: ServiceMocks;
}> {
  const consume = vi.fn().mockResolvedValue(true);
  const verifyEnrollment = vi.fn().mockResolvedValue(true);
  const updateUser = vi.fn().mockResolvedValue(undefined);
  const invalidateCache = vi.fn().mockResolvedValue(undefined);
  const runTransaction = vi.fn(async (work: () => Promise<unknown>) => work());

  vi.doMock('../../../src/lib/database.js', () => ({
    getPool: vi.fn(),
    runDatabaseTransaction: runTransaction,
  }));
  vi.doMock('../../../src/two-factor/totp.js', () => ({
    generateTotpSecret: vi.fn(),
    generateTotpUri: vi.fn(),
    generateQrCodeDataUri: vi.fn(),
    verifyTotpCode: vi.fn().mockReturnValue({ timeStep: MATCHED_STEP }),
  }));
  vi.doMock('../../../src/two-factor/repository.js', () => ({
    findTotpByUserId: vi.fn().mockResolvedValue({
      id: 'totp-id',
      userId: 'user-id',
      encryptedSecret: 'ciphertext',
      encryptionIv: 'iv',
      encryptionTag: 'tag',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      verified,
      lastAcceptedTimeStep: null,
    }),
    consumeTotpTimeStep: consume,
    verifyTotpEnrollment: verifyEnrollment,
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
    decryptTotpSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
  }));
  vi.doMock('../../../src/two-factor/cache.js', () => ({
    getCachedTwoFactorStatus: vi.fn(),
    cacheTwoFactorStatus: vi.fn(),
    invalidateTwoFactorCache: invalidateCache,
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
    findUserById: vi.fn().mockResolvedValue({ organizationId: 'org-id' }),
    updateUser,
  }));
  vi.doMock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));
  vi.doMock('../../../src/lib/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock('../../../src/config/index.js', () => ({
    config: { twoFactorEncryptionKey: 'a'.repeat(64) },
  }));

  return {
    service: await import('../../../src/two-factor/service.js'),
    mocks: { consume, verifyEnrollment, updateUser, invalidateCache, runTransaction },
  };
}

describe('TOTP replay implementation branches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('treats a null repository row count as a failed conditional write', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: null });
    vi.doMock('../../../src/lib/database.js', () => ({
      getPool: vi.fn(() => ({ query })),
    }));
    const repository = await import('../../../src/two-factor/repository.js');

    await expect(repository.consumeTotpTimeStep('totp-id', 'user-id', MATCHED_STEP)).resolves.toBe(
      false,
    );
    await expect(repository.verifyTotpEnrollment('totp-id', 'user-id', MATCHED_STEP)).resolves.toBe(
      false,
    );
  });

  it('returns false without enabling the user when enrollment loses the conditional update', async () => {
    const { service, mocks } = await loadService(false);
    mocks.verifyEnrollment.mockResolvedValue(false);

    await expect(service.confirmTotpSetup('user-id', '123456')).resolves.toBe(false);
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });

  it('propagates a user-update failure from inside the enrollment transaction', async () => {
    const { service, mocks } = await loadService(false);
    mocks.updateUser.mockRejectedValue(new Error('user update failed'));

    await expect(service.confirmTotpSetup('user-id', '123456')).rejects.toThrow(
      'user update failed',
    );
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.verifyEnrollment).toHaveBeenCalledWith('totp-id', 'user-id', MATCHED_STEP);
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });

  it('returns false when authentication loses the conditional update', async () => {
    const { service, mocks } = await loadService(true);
    mocks.consume.mockResolvedValue(false);

    await expect(service.verifyTotp('user-id', '123456')).resolves.toBe(false);
    expect(mocks.consume).toHaveBeenCalledWith('totp-id', 'user-id', MATCHED_STEP);
  });
});
