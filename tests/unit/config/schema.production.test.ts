import { describe, it, expect, afterEach } from 'vitest';
import { configSchema } from '../../../src/config/schema.js';

// ---------------------------------------------------------------------------
// A fully valid production config — all fields set to non-placeholder,
// production-safe values. Individual tests override one field at a time
// to verify that specific rules fire.
// ---------------------------------------------------------------------------
const validProdConfig = {
  nodeEnv: 'production' as const,
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: 'postgresql://porta:s3cur3P@ss!@db.prod.internal:5432/porta',
  redisUrl: 'redis://redis.prod.internal:6379',
  issuerBaseUrl: 'https://auth.example.com',
  cookieKeys: ['a-very-strong-production-cookie-key-with-32-chars-or-more!!'],
  smtp: {
    host: 'smtp.sendgrid.net',
    port: 587,
    user: 'apikey',
    pass: 'SG.xxxxxx',
    from: 'noreply@example.com',
  },
  logLevel: 'info' as const,
  trustProxy: true,
  twoFactorEncryptionKey: 'aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44',
  signingKeyEncryptionKey: 'ff11ee22dd33cc44bb55aa66ff11ee22dd33cc44bb55aa66ff11ee22dd33cc44',
  adminCorsOrigins: [],
};

/**
 * Helper: parse the config and extract all issue messages.
 * Returns { success, messages } for easy assertion.
 */
function parseAndGetMessages(overrides: Record<string, unknown>) {
  const result = configSchema.safeParse({ ...validProdConfig, ...overrides });
  if (result.success) {
    return { success: true, messages: [] as string[] };
  }
  return {
    success: false,
    messages: result.error.issues.map((i) => i.message),
  };
}

describe('config schema — production safety rules', () => {
  // ── Baseline ────────────────────────────────────────────────────────

  it('should accept a fully valid production configuration', () => {
    const result = configSchema.safeParse(validProdConfig);
    expect(result.success).toBe(true);
  });

  it('should accept .env.example values when NODE_ENV=development', () => {
    // This is the exact config you'd get from .env.example — all dev defaults.
    // Must pass because safety rules only fire in production.
    const devConfig = {
      nodeEnv: 'development',
      port: 3000,
      host: '0.0.0.0',
      databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta',
      redisUrl: 'redis://localhost:6379',
      issuerBaseUrl: 'https://porta.local:3443',
      cookieKeys: ['dev-cookie-key-change-me-in-production'],
      smtp: {
        host: 'localhost',
        port: 1025,
        from: 'noreply@porta.local',
      },
      logLevel: 'debug',
      twoFactorEncryptionKey:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      signingKeyEncryptionKey:
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    };
    const result = configSchema.safeParse(devConfig);
    expect(result.success).toBe(true);
  });

  it('should accept .env.example values when NODE_ENV=test', () => {
    const testConfig = {
      nodeEnv: 'test',
      databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta_test',
      redisUrl: 'redis://localhost:6379/1',
      issuerBaseUrl: 'https://porta.local:3443',
      cookieKeys: ['dev-cookie-key-change-me-in-production'],
      smtp: { host: 'localhost', port: 1025, from: 'test@test.com' },
      logLevel: 'debug',
      twoFactorEncryptionKey:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      signingKeyEncryptionKey:
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    };
    const result = configSchema.safeParse(testConfig);
    expect(result.success).toBe(true);
  });

  // ── R1: Cookie key placeholder ──────────────────────────────────────

  describe('R1 — COOKIE_KEYS placeholder detection', () => {
    it('should reject cookie key with "change-me" pattern', () => {
      const { success, messages } = parseAndGetMessages({
        cookieKeys: ['a-long-key-with-change-me-in-it-that-is-32-chars-plus'],
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev placeholder'),
      );
    });

    it('should reject cookie key with "change_me" variant', () => {
      const { success, messages } = parseAndGetMessages({
        cookieKeys: ['this-key-has-change_me-inside-it-and-is-long-enough!!'],
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev placeholder'),
      );
    });

    it('should reject cookie key with "changeme" (no separator)', () => {
      const { success, messages } = parseAndGetMessages({
        cookieKeys: ['a-production-key-with-changeme-that-is-32-chars-long!'],
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev placeholder'),
      );
    });

    it('should reject the exact .env.example default', () => {
      const { success, messages } = parseAndGetMessages({
        cookieKeys: ['dev-cookie-key-change-me-in-production'],
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev placeholder'),
      );
    });
  });

  // ── R2: Cookie key length ───────────────────────────────────────────

  describe('R2 — COOKIE_KEYS minimum length', () => {
    it('should reject cookie key shorter than 32 chars', () => {
      const { success, messages } = parseAndGetMessages({
        cookieKeys: ['short-but-valid-16ch!'], // 20 chars, >16 (base) but <32 (prod)
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('shorter than 32 chars'),
      );
    });

    it('should accept cookie key of exactly 32 chars', () => {
      const key32 = 'abcdefghijklmnopqrstuvwxyz123456'; // exactly 32
      const { success } = parseAndGetMessages({ cookieKeys: [key32] });
      expect(success).toBe(true);
    });

    it('should check each key independently', () => {
      const { success, messages } = parseAndGetMessages({
        cookieKeys: [
          'a-very-strong-production-key-with-enough-length!!!',
          'too-short-key-here!!', // only 20 chars
        ],
      });
      expect(success).toBe(false);
      // Should mention COOKIE_KEYS[1] specifically
      expect(messages).toContainEqual(
        expect.stringContaining('COOKIE_KEYS[1]'),
      );
    });
  });

  // ── R3: 2FA key required ────────────────────────────────────────────

  describe('R3 — TWO_FACTOR_ENCRYPTION_KEY required in production', () => {
    it('should reject when 2FA key is missing', () => {
      const { success, messages } = parseAndGetMessages({
        twoFactorEncryptionKey: undefined,
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('TWO_FACTOR_ENCRYPTION_KEY is required in production'),
      );
    });
  });

  // ── R4: 2FA key placeholder ─────────────────────────────────────────

  describe('R4 — TWO_FACTOR_ENCRYPTION_KEY placeholder detection', () => {
    it('should reject the .env.example 2FA placeholder', () => {
      const { success, messages } = parseAndGetMessages({
        twoFactorEncryptionKey:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev placeholder'),
      );
    });

    it('should accept a non-placeholder 2FA key', () => {
      const { success } = parseAndGetMessages({
        twoFactorEncryptionKey:
          'aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44',
      });
      expect(success).toBe(true);
    });
  });

  // ── R5: Signing key encryption key placeholder ──────────────────────

  describe('R5 — SIGNING_KEY_ENCRYPTION_KEY placeholder detection', () => {
    it('should reject the .env.example signing key placeholder', () => {
      const { success, messages } = parseAndGetMessages({
        signingKeyEncryptionKey:
          'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('SIGNING_KEY_ENCRYPTION_KEY still set to the dev placeholder'),
      );
    });

    it('should accept a non-placeholder signing key', () => {
      const { success } = parseAndGetMessages({
        signingKeyEncryptionKey:
          'ff11ee22dd33cc44bb55aa66ff11ee22dd33cc44bb55aa66ff11ee22dd33cc44',
      });
      expect(success).toBe(true);
    });
  });

  // ── R6: Database dev password ───────────────────────────────────────

  describe('R6 — DATABASE_URL dev password detection', () => {
    it('should reject DATABASE_URL containing ":porta_dev@"', () => {
      const { success, messages } = parseAndGetMessages({
        databaseUrl: 'postgresql://porta:porta_dev@db.prod.internal:5432/porta',
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev password "porta_dev"'),
      );
    });

    it('should accept DATABASE_URL with a real password', () => {
      const { success } = parseAndGetMessages({
        databaseUrl: 'postgresql://porta:xK9$mZqR2!@db.prod.internal:5432/porta',
      });
      expect(success).toBe(true);
    });
  });

  // ── R7: Issuer HTTPS ────────────────────────────────────────────────

  describe('R7 — ISSUER_BASE_URL HTTPS requirement', () => {
    it('should reject HTTP issuer on a non-localhost host', () => {
      const { success, messages } = parseAndGetMessages({
        issuerBaseUrl: 'http://auth.example.com',
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('must use HTTPS in production'),
      );
    });

    it('should accept HTTP issuer on localhost (dev convenience)', () => {
      const { success } = parseAndGetMessages({
        issuerBaseUrl: 'https://porta.local:3443',
      });
      expect(success).toBe(true);
    });

    it('should accept HTTP issuer on 127.0.0.1', () => {
      const { success } = parseAndGetMessages({
        issuerBaseUrl: 'http://127.0.0.1:3000',
      });
      expect(success).toBe(true);
    });

    it('should accept HTTPS issuer (the normal production case)', () => {
      const { success } = parseAndGetMessages({
        issuerBaseUrl: 'https://auth.example.com',
      });
      expect(success).toBe(true);
    });
  });

  // ── R8: Log level ───────────────────────────────────────────────────

  describe('R8 — LOG_LEVEL too verbose', () => {
    it('should reject debug log level in production', () => {
      const { success, messages } = parseAndGetMessages({
        logLevel: 'debug',
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('too verbose for production'),
      );
    });

    it('should accept info log level', () => {
      const { success } = parseAndGetMessages({ logLevel: 'info' });
      expect(success).toBe(true);
    });

    it('should accept warn log level', () => {
      const { success } = parseAndGetMessages({ logLevel: 'warn' });
      expect(success).toBe(true);
    });

    it('should accept error log level', () => {
      const { success } = parseAndGetMessages({ logLevel: 'error' });
      expect(success).toBe(true);
    });
  });

  // ── R9: SMTP dev inbox ──────────────────────────────────────────────

  describe('R9 — SMTP_HOST dev inbox detection', () => {
    it('should reject SMTP_HOST=localhost', () => {
      const { success, messages } = parseAndGetMessages({
        smtp: { ...validProdConfig.smtp, host: 'localhost' },
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev inbox'),
      );
    });

    it('should reject SMTP_HOST=127.0.0.1', () => {
      const { success, messages } = parseAndGetMessages({
        smtp: { ...validProdConfig.smtp, host: '127.0.0.1' },
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev inbox'),
      );
    });

    it('should reject SMTP_HOST=127.0.1.1', () => {
      const { success, messages } = parseAndGetMessages({
        smtp: { ...validProdConfig.smtp, host: '127.0.1.1' },
      });
      expect(success).toBe(false);
      expect(messages).toContainEqual(
        expect.stringContaining('dev inbox'),
      );
    });

    it('should accept a real SMTP relay host', () => {
      const { success } = parseAndGetMessages({
        smtp: { ...validProdConfig.smtp, host: 'smtp.sendgrid.net' },
      });
      expect(success).toBe(true);
    });
  });

  // ── Escape hatch ────────────────────────────────────────────────────

  describe('PORTA_SKIP_PROD_SAFETY escape hatch', () => {
    const originalEnv = process.env.PORTA_SKIP_PROD_SAFETY;

    afterEach(() => {
      // Restore original env value after each test
      if (originalEnv === undefined) {
        delete process.env.PORTA_SKIP_PROD_SAFETY;
      } else {
        process.env.PORTA_SKIP_PROD_SAFETY = originalEnv;
      }
    });

    it('should pass with all .env.example values when escape hatch is active', () => {
      process.env.PORTA_SKIP_PROD_SAFETY = 'true';

      const insecureConfig = {
        nodeEnv: 'production',
        databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta',
        redisUrl: 'redis://localhost:6379',
        issuerBaseUrl: 'https://porta.local:3443',
        cookieKeys: ['dev-cookie-key-change-me-in-production'],
        smtp: { host: 'localhost', port: 1025, from: 'noreply@porta.local' },
        logLevel: 'debug',
        twoFactorEncryptionKey:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        signingKeyEncryptionKey:
          'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      };
      const result = configSchema.safeParse(insecureConfig);
      expect(result.success).toBe(true);
    });

    it('should NOT skip safety checks when escape hatch is not "true"', () => {
      process.env.PORTA_SKIP_PROD_SAFETY = 'false';

      const { success } = parseAndGetMessages({
        databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta',
      });
      expect(success).toBe(false);
    });
  });

  // ── Multiple violations ─────────────────────────────────────────────

  describe('multiple violations reported together', () => {
    it('should report all violations at once, not just the first', () => {
      const result = configSchema.safeParse({
        nodeEnv: 'production',
        databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta',
        redisUrl: 'redis://localhost:6379',
        issuerBaseUrl: 'http://auth.example.com', // HTTP on non-localhost
        cookieKeys: ['short-change-me!!'], // placeholder + too short
        smtp: { host: 'localhost', port: 1025, from: 'noreply@porta.local' },
        logLevel: 'debug',
        signingKeyEncryptionKey:
          'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        // Should contain at least: placeholder, short key, no 2FA key,
        // signing key placeholder, dev password, HTTP issuer, debug log, SMTP localhost
        expect(messages.length).toBeGreaterThanOrEqual(7);
        expect(messages).toContainEqual(expect.stringContaining('dev placeholder'));
        expect(messages).toContainEqual(expect.stringContaining('shorter than 32'));
        expect(messages).toContainEqual(expect.stringContaining('TWO_FACTOR_ENCRYPTION_KEY is required'));
        expect(messages).toContainEqual(expect.stringContaining('SIGNING_KEY_ENCRYPTION_KEY'));
        expect(messages).toContainEqual(expect.stringContaining('porta_dev'));
        expect(messages).toContainEqual(expect.stringContaining('HTTPS'));
        expect(messages).toContainEqual(expect.stringContaining('too verbose'));
        expect(messages).toContainEqual(expect.stringContaining('dev inbox'));
      }
    });
  });
});
