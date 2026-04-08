import { z } from 'zod';

export const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  redisUrl: z.string().min(1, 'REDIS_URL is required'),
  issuerBaseUrl: z.string().url('ISSUER_BASE_URL must be a valid URL'),
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
