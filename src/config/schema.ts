import { z } from 'zod';

export const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  redisUrl: z.string().min(1, 'REDIS_URL is required'),
  issuerBaseUrl: z.string().url('ISSUER_BASE_URL must be a valid URL'),
  // Cookie signing keys for OIDC sessions — array of secrets for key rotation.
  // First key is used for signing; subsequent keys are used for verification only.
  cookieKeys: z.array(z.string().min(16)).min(1, 'At least one COOKIE_KEY is required'),
  smtp: z.object({
    host: z.string().min(1, 'SMTP_HOST is required'),
    port: z.coerce.number().default(587),
    user: z.string().optional(),
    pass: z.string().optional(),
    from: z.string().min(1, 'SMTP_FROM is required'),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  // AES-256-GCM encryption key for TOTP secrets — must be exactly 32 hex bytes (64 chars).
  // Optional in dev/test (a default is used); required in production for security.
  // Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For, etc.).
  // Enable when running behind a TLS-terminating reverse proxy (nginx, Traefik, etc.)
  // so that ctx.secure correctly reflects the client's HTTPS connection.
  trustProxy: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((val) => (typeof val === 'string' ? val === 'true' || val === '1' : val)),
  twoFactorEncryptionKey: z
    .string()
    .length(64, 'TWO_FACTOR_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    .regex(/^[0-9a-f]+$/i, 'TWO_FACTOR_ENCRYPTION_KEY must be hex-encoded')
    .optional(),
  // AES-256-GCM encryption key for signing key private keys at rest.
  // Must be exactly 32 hex bytes (64 characters). Always required —
  // Porta will not start without it.
  signingKeyEncryptionKey: z
    .string()
    .length(64, 'SIGNING_KEY_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    .regex(/^[0-9a-f]+$/i, 'SIGNING_KEY_ENCRYPTION_KEY must be hex-encoded'),
});

export type AppConfig = z.infer<typeof configSchema>;
