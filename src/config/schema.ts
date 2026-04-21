import { z } from 'zod';

// ---------------------------------------------------------------------------
// Base schema — structural validation (types, formats, defaults).
// The superRefine below adds production-specific safety checks.
// ---------------------------------------------------------------------------
const baseSchema = z.object({
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
  // Allowed origins for the admin API CORS policy.
  // Empty array (default) = deny all cross-origin requests.
  // Only needed when a web admin dashboard runs on a different origin.
  adminCorsOrigins: z.array(z.string().url()).default([]),
  // Prometheus metrics endpoint — default OFF.
  // When true, GET /metrics exposes process and HTTP request counters
  // in Prometheus text format. Operators must restrict access via network
  // policy or reverse proxy since the endpoint is unauthenticated.
  metricsEnabled: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((val) => (typeof val === 'string' ? val === 'true' || val === '1' : val)),
});

// ---------------------------------------------------------------------------
// Production safety rules — superRefine that only fires in production.
// Rejects well-known dev placeholders and insecure defaults so that
// deploying with .env.example values is impossible.
//
// Escape hatch: PORTA_SKIP_PROD_SAFETY=true skips these checks (incident
// response only — the config loader logs an ERROR when the hatch is used).
// ---------------------------------------------------------------------------

/** Placeholder pattern matching "change-me", "change_me", "changeme" etc. */
const PLACEHOLDER_RE = /change[-_]?me/i;

/** The .env.example 2FA placeholder — 0123456789abcdef repeated 4×. */
const TWO_FACTOR_DEV_PLACEHOLDER =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** The .env.example signing-key placeholder — fedcba…3210 repeated 4×. */
const SIGNING_KEY_DEV_PLACEHOLDER =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

export const configSchema = baseSchema.superRefine((data, ctx) => {
  // Only enforce in production
  if (data.nodeEnv !== 'production') return;

  // Escape hatch for incident response — caller logs a loud error
  if (process.env.PORTA_SKIP_PROD_SAFETY === 'true') return;

  // ── R1 + R2: Cookie key strength ──────────────────────────────────
  data.cookieKeys.forEach((key, i) => {
    if (PLACEHOLDER_RE.test(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cookieKeys', i],
        message:
          'COOKIE_KEYS contains a dev placeholder ("change-me" pattern); ' +
          'generate with `openssl rand -base64 32`',
      });
    }
    if (key.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['cookieKeys', i],
        message: `COOKIE_KEYS[${i}] is shorter than 32 chars; production requires >= 32 chars of entropy`,
      });
    }
  });

  // ── R3 + R4: 2FA encryption key ──────────────────────────────────
  // Any org that ever enables 2FA needs this key to decrypt existing
  // TOTP secrets, so it is unconditionally required in production.
  const tfe = data.twoFactorEncryptionKey;
  if (!tfe) {
    ctx.addIssue({
      code: 'custom',
      path: ['twoFactorEncryptionKey'],
      message: 'TWO_FACTOR_ENCRYPTION_KEY is required in production',
    });
  } else if (tfe === TWO_FACTOR_DEV_PLACEHOLDER) {
    ctx.addIssue({
      code: 'custom',
      path: ['twoFactorEncryptionKey'],
      message: 'TWO_FACTOR_ENCRYPTION_KEY still set to the dev placeholder',
    });
  }

  // ── R5: Signing key encryption key placeholder ────────────────────
  if (data.signingKeyEncryptionKey === SIGNING_KEY_DEV_PLACEHOLDER) {
    ctx.addIssue({
      code: 'custom',
      path: ['signingKeyEncryptionKey'],
      message: 'SIGNING_KEY_ENCRYPTION_KEY still set to the dev placeholder',
    });
  }

  // ── R6: Database dev password ─────────────────────────────────────
  if (/:porta_dev@/.test(data.databaseUrl)) {
    ctx.addIssue({
      code: 'custom',
      path: ['databaseUrl'],
      message: 'DATABASE_URL still contains the dev password "porta_dev"',
    });
  }

  // ── R7: Issuer must use HTTPS in production (unless localhost) ────
  if (/^http:\/\//.test(data.issuerBaseUrl)) {
    try {
      const url = new URL(data.issuerBaseUrl);
      const localHosts = ['localhost', '127.0.0.1', '::1'];
      if (!localHosts.includes(url.hostname)) {
        ctx.addIssue({
          code: 'custom',
          path: ['issuerBaseUrl'],
          message: 'ISSUER_BASE_URL must use HTTPS in production',
        });
      }
    } catch {
      // URL parse failure — already caught by the .url() validator above
    }
  }

  // ── R8: Log level too verbose ─────────────────────────────────────
  if (data.logLevel === 'debug') {
    ctx.addIssue({
      code: 'custom',
      path: ['logLevel'],
      message: `LOG_LEVEL=${data.logLevel} is too verbose for production; use info, warn, or error`,
    });
  }

  // ── R9: SMTP pointing at dev inbox ────────────────────────────────
  const smtpHost = data.smtp.host;
  if (smtpHost === 'localhost' || /^127\./.test(smtpHost)) {
    ctx.addIssue({
      code: 'custom',
      path: ['smtp', 'host'],
      message: 'SMTP_HOST points at a dev inbox (MailHog); configure a real SMTP relay for production',
    });
  }
});

export type AppConfig = z.infer<typeof configSchema>;
