/** Independent public-policy metadata used by administrative API specifications. */
/** Builds expected numeric metadata without reading the application catalog. */
function integerDefinition(
  key: string,
  group: 'lifetimes' | 'rate-limits' | 'lockout' | 'general',
  label: string,
  description: string,
  unit: 'seconds' | 'attempts' | 'days',
  defaultValue: number,
  minimum: number,
  maximum: number,
  applicationMode: 'runtime' | 'restart-required' = 'runtime',
) {
  return {
    key,
    group,
    label,
    description,
    valueType: 'integer',
    unit,
    defaultValue,
    minimum,
    maximum,
    applicationMode,
  };
}

/** Exact public policy; internal identifiers and bootstrap secrets cannot join this list. */
export const TEST_CONFIG_DEFINITIONS = [
  integerDefinition(
    'access_token_ttl',
    'lifetimes',
    'Access token lifetime',
    'How long newly issued access tokens remain valid.',
    'seconds',
    3600,
    60,
    86400,
    'restart-required',
  ),
  integerDefinition(
    'id_token_ttl',
    'lifetimes',
    'ID token lifetime',
    'How long newly issued ID tokens remain valid.',
    'seconds',
    3600,
    60,
    86400,
    'restart-required',
  ),
  integerDefinition(
    'refresh_token_ttl',
    'lifetimes',
    'Refresh token lifetime',
    'How long newly issued refresh tokens remain valid.',
    'seconds',
    2592000,
    300,
    31536000,
    'restart-required',
  ),
  integerDefinition(
    'authorization_code_ttl',
    'lifetimes',
    'Authorization code lifetime',
    'How long a newly issued authorization code remains valid.',
    'seconds',
    600,
    30,
    3600,
    'restart-required',
  ),
  integerDefinition(
    'session_ttl',
    'lifetimes',
    'Session lifetime',
    'How long newly created OIDC sessions remain valid.',
    'seconds',
    86400,
    300,
    2592000,
    'restart-required',
  ),
  integerDefinition(
    'magic_link_ttl',
    'lifetimes',
    'Magic-link lifetime',
    'How long a newly created magic-link token remains valid.',
    'seconds',
    900,
    60,
    3600,
  ),
  integerDefinition(
    'password_reset_ttl',
    'lifetimes',
    'Password-reset lifetime',
    'How long a newly created password-reset token remains valid.',
    'seconds',
    3600,
    300,
    86400,
  ),
  integerDefinition(
    'invitation_ttl',
    'lifetimes',
    'Invitation lifetime',
    'How long a newly created user invitation remains valid.',
    'seconds',
    604800,
    300,
    2592000,
  ),
  integerDefinition(
    'rate_limit_login_max',
    'rate-limits',
    'Login attempt limit',
    'Maximum login attempts allowed in one login window.',
    'attempts',
    10,
    1,
    100,
  ),
  integerDefinition(
    'rate_limit_login_window',
    'rate-limits',
    'Login window',
    'Window used to count login attempts.',
    'seconds',
    900,
    60,
    86400,
  ),
  integerDefinition(
    'rate_limit_magic_link_max',
    'rate-limits',
    'Magic-link request limit',
    'Maximum magic-link requests allowed in one window.',
    'attempts',
    5,
    1,
    100,
  ),
  integerDefinition(
    'rate_limit_magic_link_window',
    'rate-limits',
    'Magic-link request window',
    'Window used to count magic-link requests.',
    'seconds',
    900,
    60,
    86400,
  ),
  integerDefinition(
    'rate_limit_password_reset_max',
    'rate-limits',
    'Password-reset request limit',
    'Maximum password-reset requests allowed in one window.',
    'attempts',
    5,
    1,
    100,
  ),
  integerDefinition(
    'rate_limit_password_reset_window',
    'rate-limits',
    'Password-reset request window',
    'Window used to count password-reset requests.',
    'seconds',
    900,
    60,
    86400,
  ),
  integerDefinition(
    'max_failed_logins',
    'lockout',
    'Failed login limit',
    'Failed login count that activates automatic lockout.',
    'attempts',
    5,
    1,
    100,
  ),
  integerDefinition(
    'lockout_duration_seconds',
    'lockout',
    'Lockout duration',
    'Duration applied when automatic lockout eligibility is checked.',
    'seconds',
    900,
    60,
    604800,
  ),
  integerDefinition(
    'audit_retention_days',
    'general',
    'Audit retention',
    'Default number of days retained by audit cleanup.',
    'days',
    90,
    1,
    3650,
  ),
  {
    key: 'default_locale',
    group: 'general',
    label: 'Default locale',
    description: 'Final locale fallback used by the authentication UI.',
    valueType: 'string',
    unit: 'locale',
    defaultValue: 'en',
    allowedValues: ['en'],
    applicationMode: 'runtime',
  },
];

/** Stable persisted timestamp projected by the public API. */
export const CONFIG_UPDATED_AT = '2026-09-16T00:00:00.000Z';

/** Non-catalog categories must share one response regardless of database existence. */
export const CONFIG_UNKNOWN_KEYS = [
  'unknown',
  'super_admin_user_id',
  'login_rate_limit',
  'lockout_duration',
  'api_rate_limit',
  'cookie_secure',
  'magic_link_length',
  'require_pkce',
  'cors_max_age',
  'DATABASE_URL',
  'REDIS_URL',
  'COOKIE_KEYS',
  'SIGNING_KEY_ENCRYPTION_KEY',
  'TWO_FACTOR_ENCRYPTION_KEY',
  'SMTP_PASSWORD',
] as const;

/** Builds native stored rows with deliberately untrusted metadata. */
export function configRows() {
  return TEST_CONFIG_DEFINITIONS.map((definition) => ({
    key: definition.key,
    value: definition.defaultValue,
    value_type:
      definition.unit === 'seconds'
        ? 'duration'
        : definition.valueType === 'integer'
          ? 'number'
          : 'string',
    description: 'untrusted-database-description',
    is_sensitive: false,
    updated_at: new Date(CONFIG_UPDATED_AT),
  }));
}

/** Public metadata and scalar defaults expected independently of editable database descriptions. */
export function expectedConfigEntries() {
  return TEST_CONFIG_DEFINITIONS.map((definition) => ({
    ...definition,
    value: definition.defaultValue,
    updatedAt: CONFIG_UPDATED_AT,
  }));
}
