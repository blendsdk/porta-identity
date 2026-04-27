import { z } from 'zod';

/**
 * Zod schema for BFF configuration.
 * Validates all environment variables at startup.
 * Fails fast with descriptive error messages.
 */
const configSchema = z.object({
  /** BFF server port */
  port: z.coerce.number().default(4002),

  /** URL of the Porta server (internal) */
  portaUrl: z.string().url('PORTA_ADMIN_PORTA_URL must be a valid URL'),

  /** Public URL of the admin GUI (for OIDC redirect URIs) */
  publicUrl: z.string().url().default('http://localhost:4002'),

  /** OIDC client ID for admin GUI */
  clientId: z.string().min(1, 'PORTA_ADMIN_CLIENT_ID is required'),

  /** OIDC client secret for admin GUI */
  clientSecret: z.string().min(1, 'PORTA_ADMIN_CLIENT_SECRET is required'),

  /** Session encryption key (min 32 characters for security) */
  sessionSecret: z
    .string()
    .min(32, 'PORTA_ADMIN_SESSION_SECRET must be at least 32 characters'),

  /** Super-admin org slug (optional — auto-detected from Porta metadata) */
  orgSlug: z.string().optional(),

  /** Redis URL for session storage */
  redisUrl: z.string().url('REDIS_URL must be a valid Redis URL'),

  /** Environment name */
  nodeEnv: z
    .enum(['production', 'staging', 'development', 'test'])
    .default('production'),

  /** Log level */
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error', 'silent'])
    .default('info'),
});

export type BffConfig = z.infer<typeof configSchema>;

/**
 * Load and validate BFF configuration from environment variables.
 * Fails fast with clear error messages if validation fails.
 *
 * @returns Validated BFF configuration
 */
export function loadConfig(): BffConfig {
  const result = configSchema.safeParse({
    port: process.env.PORTA_ADMIN_PORT,
    portaUrl: process.env.PORTA_ADMIN_PORTA_URL,
    publicUrl: process.env.PORTA_ADMIN_PUBLIC_URL,
    clientId: process.env.PORTA_ADMIN_CLIENT_ID,
    clientSecret: process.env.PORTA_ADMIN_CLIENT_SECRET,
    sessionSecret: process.env.PORTA_ADMIN_SESSION_SECRET,
    orgSlug: process.env.PORTA_ADMIN_ORG_SLUG || undefined,
    redisUrl: process.env.REDIS_URL,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    console.error('❌ Admin GUI configuration error:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
