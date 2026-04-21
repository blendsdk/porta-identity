/**
 * Shared test constants — URLs, credentials, and defaults.
 *
 * These constants are used across integration, E2E, and pentest test suites
 * to avoid hardcoding environment-specific values in individual test files.
 * Values fall back to sensible defaults when env vars are not set.
 */

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** PostgreSQL connection URL for the test database (porta_test) */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://porta:porta_dev@localhost:5432/porta_test';

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

/** Redis connection URL for tests — uses DB index 1 to isolate from dev (DB 0) */
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

// ---------------------------------------------------------------------------
// SMTP / MailHog
// ---------------------------------------------------------------------------

/** SMTP host for test email delivery (MailHog) */
export const TEST_SMTP_HOST = process.env.TEST_SMTP_HOST ?? 'localhost';

/** SMTP port for test email delivery (MailHog) */
export const TEST_SMTP_PORT = process.env.TEST_SMTP_PORT ?? '1025';

/** MailHog HTTP API URL for verifying sent emails */
export const TEST_MAILHOG_URL = process.env.TEST_MAILHOG_URL ?? 'http://localhost:8025';

// ---------------------------------------------------------------------------
// Server & OIDC
// ---------------------------------------------------------------------------

/** Default SMTP from address used in test emails */
export const TEST_SMTP_FROM = 'test@porta.local';

/** Cookie signing keys for the test OIDC provider */
export const TEST_COOKIE_KEYS = 'test-cookie-key-1,test-cookie-key-2';

// ---------------------------------------------------------------------------
// Encryption keys
// ---------------------------------------------------------------------------

/** AES-256-GCM encryption key for signing key private keys at rest (64-char hex = 32 bytes) */
export const TEST_SIGNING_KEY_ENCRYPTION_KEY = 'deadbeef'.repeat(8);

// ---------------------------------------------------------------------------
// Test credentials
// ---------------------------------------------------------------------------

/** Default password used by user factories when none is specified */
export const DEFAULT_TEST_PASSWORD = 'TestPassword123!';
