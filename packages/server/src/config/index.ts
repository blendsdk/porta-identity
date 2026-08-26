import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { configSchema, type AppConfig } from './schema.js';

dotenv.config();

function loadConfig(): AppConfig {
  // Log a loud warning when the production safety escape hatch is active.
  // This runs before parsing so the message always appears, even if config
  // is otherwise invalid. The escape hatch exists for incident response only.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.PORTA_SKIP_PROD_SAFETY === 'true'
  ) {
    logger.error(
      { event: 'config.safety_skipped' },
      'PORTA_SKIP_PROD_SAFETY=true — production safety checks bypassed',
    );
  }

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
    trustProxy: process.env.TRUST_PROXY,
    twoFactorEncryptionKey: process.env.TWO_FACTOR_ENCRYPTION_KEY,
    signingKeyEncryptionKey: process.env.SIGNING_KEY_ENCRYPTION_KEY,
    // ADMIN_CORS_ORIGINS is a comma-separated list of allowed origins for the admin API.
    // Empty or unset = deny all cross-origin requests (secure default).
    adminCorsOrigins: process.env.ADMIN_CORS_ORIGINS
      ? process.env.ADMIN_CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    metricsEnabled: process.env.METRICS_ENABLED,
  });

  if (!result.success) {
    // Log each validation issue on its own line for clear operator diagnosis.
    logger.fatal({ event: 'config.invalid' }, '❌ Invalid configuration — refusing to start');
    for (const issue of result.error.issues) {
      logger.fatal(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
