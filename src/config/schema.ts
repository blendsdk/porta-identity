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
});

export type AppConfig = z.infer<typeof configSchema>;
