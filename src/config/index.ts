import dotenv from 'dotenv';
import { configSchema, type AppConfig } from './schema.js';

dotenv.config();

function loadConfig(): AppConfig {
  const result = configSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    issuerBaseUrl: process.env.ISSUER_BASE_URL,
    // COOKIE_KEYS is a comma-separated list of secrets for OIDC cookie signing.
    // Supports key rotation: first key signs, subsequent keys verify old cookies.
    cookieKeys: process.env.COOKIE_KEYS?.split(',') ?? [],
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM,
    },
    logLevel: process.env.LOG_LEVEL,
    twoFactorEncryptionKey: process.env.TWO_FACTOR_ENCRYPTION_KEY,
  });

  if (!result.success) {
    console.error('❌ Invalid configuration:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
