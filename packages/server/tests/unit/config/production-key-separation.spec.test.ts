import { afterEach, describe, expect, it } from 'vitest';
import { configSchema } from '../../../src/config/schema.js';

const signingKey = 'a91bc23da91bc23da91bc23da91bc23da91bc23da91bc23da91bc23da91bc23d';
const twoFactorKey = '4e56f7804e56f7804e56f7804e56f7804e56f7804e56f7804e56f7804e56f780';
const originalSkipProductionSafety = process.env.PORTA_SKIP_PROD_SAFETY;

const validProductionConfig = {
  nodeEnv: 'production' as const,
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: 'postgresql://porta:production-password@db.prod.internal:5432/porta',
  redisUrl: 'redis://redis.prod.internal:6379',
  issuerBaseUrl: 'https://auth.example.com',
  cookieKeys: ['a-production-cookie-key-that-is-longer-than-thirty-two-characters'],
  smtp: {
    host: 'smtp.example.com',
    port: 587,
    user: 'porta',
    pass: 'production-smtp-password',
    from: 'noreply@example.com',
  },
  logLevel: 'info' as const,
  trustProxy: true,
  signingKeyEncryptionKey: signingKey,
  twoFactorEncryptionKey: twoFactorKey,
  adminCorsOrigins: [],
};

/** Restore the caller's production-safety escape-hatch environment value. */
function restoreSkipProductionSafety() {
  if (originalSkipProductionSafety === undefined) {
    delete process.env.PORTA_SKIP_PROD_SAFETY;
  } else {
    process.env.PORTA_SKIP_PROD_SAFETY = originalSkipProductionSafety;
  }
}

/** Parse a production configuration whose root keys may be byte-equivalent. */
function parseEquivalentKeys(skipProductionSafety: boolean, caseVariant: boolean) {
  if (skipProductionSafety) {
    process.env.PORTA_SKIP_PROD_SAFETY = 'true';
  } else {
    delete process.env.PORTA_SKIP_PROD_SAFETY;
  }

  return configSchema.safeParse({
    ...validProductionConfig,
    signingKeyEncryptionKey: signingKey,
    twoFactorEncryptionKey: caseVariant ? signingKey.toUpperCase() : signingKey,
  });
}

afterEach(restoreSkipProductionSafety);

// Production root encryption keys must be byte-distinct even when ordinary safety checks are bypassed.
describe('production root encryption key separation', () => {
  for (const skipProductionSafety of [false, true]) {
    for (const caseVariant of [false, true]) {
      it(`rejects ${caseVariant ? 'case-different byte-equivalent' : 'identical'} keys when safety bypass is ${skipProductionSafety ? 'enabled' : 'disabled'}`, () => {
        const result = parseEquivalentKeys(skipProductionSafety, caseVariant);

        expect(result.success).toBe(false);
        if (result.success) return;

        const messages = result.error.issues.map((issue) => issue.message).join('\n');
        expect(messages).toMatch(/SIGNING_KEY_ENCRYPTION_KEY/);
        expect(messages).toMatch(/TWO_FACTOR_ENCRYPTION_KEY/);
        expect(messages).toMatch(/different|distinct/i);
        expect(messages).not.toContain(signingKey);
        expect(messages).not.toContain(signingKey.toUpperCase());
      });
    }
  }

  it.each([false, true])(
    'accepts distinct valid keys when safety bypass is %s',
    (skipProductionSafety) => {
      if (skipProductionSafety) {
        process.env.PORTA_SKIP_PROD_SAFETY = 'true';
      } else {
        delete process.env.PORTA_SKIP_PROD_SAFETY;
      }

      expect(configSchema.safeParse(validProductionConfig).success).toBe(true);
    },
  );
});
