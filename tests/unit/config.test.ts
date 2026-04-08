import { describe, it, expect } from 'vitest';
import { configSchema } from '../../src/config/schema.js';

const validEnv = {
  nodeEnv: 'development',
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta',
  redisUrl: 'redis://localhost:6379',
  issuerBaseUrl: 'http://localhost:3000',
  cookieKeys: ['test-cookie-key-at-least-16-chars'],
  smtp: {
    host: 'localhost',
    port: 1025,
    user: '',
    pass: '',
    from: 'noreply@porta.local',
  },
  logLevel: 'debug',
};

describe('config schema', () => {
  it('accepts valid configuration', () => {
    const result = configSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(3000);
      expect(result.data.nodeEnv).toBe('development');
      expect(result.data.databaseUrl).toBe('postgresql://porta:porta_dev@localhost:5432/porta');
    }
  });

  it('applies defaults when optional fields are omitted', () => {
    const minimal = {
      databaseUrl: 'postgresql://localhost/test',
      redisUrl: 'redis://localhost:6379',
      issuerBaseUrl: 'http://localhost:3000',
      cookieKeys: ['minimal-test-cookie-key-16ch'],
      smtp: {
        host: 'localhost',
        from: 'test@test.com',
      },
    };
    const result = configSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodeEnv).toBe('development');
      expect(result.data.port).toBe(3000);
      expect(result.data.host).toBe('0.0.0.0');
      expect(result.data.logLevel).toBe('info');
      expect(result.data.smtp.port).toBe(587);
    }
  });

  it('rejects missing DATABASE_URL', () => {
    const { databaseUrl: _, ...withoutDb } = validEnv;
    const result = configSchema.safeParse(withoutDb);
    expect(result.success).toBe(false);
    if (!result.success) {
      const dbIssue = result.error.issues.find((i) => i.path.includes('databaseUrl'));
      expect(dbIssue).toBeDefined();
    }
  });

  it('rejects missing REDIS_URL', () => {
    const { redisUrl: _, ...withoutRedis } = validEnv;
    const result = configSchema.safeParse(withoutRedis);
    expect(result.success).toBe(false);
    if (!result.success) {
      const redisIssue = result.error.issues.find((i) => i.path.includes('redisUrl'));
      expect(redisIssue).toBeDefined();
    }
  });

  it('rejects invalid ISSUER_BASE_URL', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      issuerBaseUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const urlIssue = result.error.issues.find((i) => i.path.includes('issuerBaseUrl'));
      expect(urlIssue).toBeDefined();
    }
  });

  it('coerces PORT from string to number', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      port: '8080',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(8080);
    }
  });

  it('rejects invalid PORT (non-numeric)', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      port: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid NODE_ENV', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      nodeEnv: 'staging',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing SMTP_HOST', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      smtp: { ...validEnv.smtp, host: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing SMTP_FROM', () => {
    const result = configSchema.safeParse({
      ...validEnv,
      smtp: { ...validEnv.smtp, from: '' },
    });
    expect(result.success).toBe(false);
  });

  describe('cookieKeys validation', () => {
    it('accepts valid cookieKeys array', () => {
      const result = configSchema.safeParse({
        ...validEnv,
        cookieKeys: ['valid-cookie-key-16chars', 'another-key-at-least-16'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cookieKeys).toHaveLength(2);
      }
    });

    it('rejects empty cookieKeys array', () => {
      const result = configSchema.safeParse({
        ...validEnv,
        cookieKeys: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects cookieKeys with short strings', () => {
      const result = configSchema.safeParse({
        ...validEnv,
        cookieKeys: ['short'],
      });
      expect(result.success).toBe(false);
    });
  });
});
