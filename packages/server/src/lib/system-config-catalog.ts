/** Closed operational policy. Database rows own values, never these definitions or defaults. */

/** Locales for which Porta ships every authentication namespace. */
export const SUPPORTED_LOCALES = Object.freeze(['en'] as const);

/** A completely packaged authentication locale. */
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Administrative tab containing a policy field. */
export type SystemConfigGroup = 'lifetimes' | 'rate-limits' | 'lockout' | 'general';

/** Whether a saved value is read at runtime or only during provider construction. */
export type SystemConfigApplicationMode = 'runtime' | 'restart-required';

/** Native JSON scalar kind accepted by a policy field. */
export type SystemConfigValueType = 'integer' | 'string';

/** Unit used to explain a native policy value without changing its representation. */
export type SystemConfigUnit = 'seconds' | 'attempts' | 'days' | 'locale';

/** Valid native operational policy; locale strings must be completely packaged. */
export type SystemConfigValue = number | SupportedLocale;

/** Build a frozen integer definition while preserving its literal key for typed callers. */
function integerDefinition<Key extends string>(
  key: Key,
  group: SystemConfigGroup,
  label: string,
  description: string,
  unit: 'seconds' | 'attempts' | 'days',
  defaultValue: number,
  minimum: number,
  maximum: number,
  applicationMode: SystemConfigApplicationMode = 'runtime',
) {
  return Object.freeze({
    key,
    group,
    label,
    description,
    valueType: 'integer' as const,
    unit,
    defaultValue,
    minimum,
    maximum,
    applicationMode,
  });
}

/**
 * Immutable public policy in administrative display order. Bootstrap settings and secrets are
 * deliberately absent; adding a field requires an explicit application change and migration.
 *
 * @example
 * const defaults = SYSTEM_CONFIG_CATALOG.map(({ key, defaultValue }) => [key, defaultValue]);
 */
export const SYSTEM_CONFIG_CATALOG = Object.freeze([
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
  Object.freeze({
    key: 'default_locale',
    group: 'general',
    label: 'Default locale',
    description: 'Final locale fallback used by the authentication UI.',
    valueType: 'string',
    unit: 'locale',
    defaultValue: 'en',
    allowedValues: SUPPORTED_LOCALES,
    applicationMode: 'runtime',
  } as const),
] as const);

/** Exact public keys, derived from the same catalog used by runtime and administrative readers. */
export type SystemConfigKey = (typeof SYSTEM_CONFIG_CATALOG)[number]['key'];

/** Public keys whose native values are integers. */
export type NumericSystemConfigKey = Exclude<SystemConfigKey, 'default_locale'>;

/** Application-owned metadata for one editable operational-policy field. */
export interface SystemConfigDefinition {
  /** Closed identifier used in storage and requests. */
  readonly key: SystemConfigKey;
  /** Administrative tab to which this field belongs. */
  readonly group: SystemConfigGroup;
  /** Human-readable field caption. */
  readonly label: string;
  /** Operational effect explained without infrastructure details. */
  readonly description: string;
  /** Accepted native JSON scalar kind. */
  readonly valueType: SystemConfigValueType;
  /** Unit of the stored value. */
  readonly unit: SystemConfigUnit;
  /** Safe runtime fallback when storage is missing, invalid or unavailable. */
  readonly defaultValue: SystemConfigValue;
  /** Inclusive lower bound for integer fields. */
  readonly minimum?: number;
  /** Inclusive upper bound for integer fields. */
  readonly maximum?: number;
  /** Completely supported values for a locale field. */
  readonly allowedValues?: readonly SupportedLocale[];
  /** Whether every provider instance must restart after saving this field. */
  readonly applicationMode: SystemConfigApplicationMode;
}

/**
 * Resolve an untrusted name without querying whether an internal database row exists.
 * @param key - Exact, case-sensitive name; no trimming or normalization is performed.
 * @returns Public definition, or undefined for every non-catalog name.
 * @example
 * findSystemConfigDefinition('magic_link_ttl')?.defaultValue; // 900
 */
export function findSystemConfigDefinition(key: string): SystemConfigDefinition | undefined {
  return SYSTEM_CONFIG_CATALOG.find((definition) => definition.key === key);
}

/**
 * Validate submitted or stored policy without coercion. Numeric text and unsupported locales fail.
 * @param definition - Application-owned public metadata.
 * @param value - Untrusted native value from JSON or PostgreSQL.
 * @returns The same valid scalar, or undefined when its type or bounds are wrong.
 * @example
 * const definition = findSystemConfigDefinition('magic_link_ttl');
 * if (definition) validateSystemConfigValue(definition, 1200); // 1200
 */
export function validateSystemConfigValue(
  definition: SystemConfigDefinition,
  value: unknown,
): SystemConfigValue | undefined {
  if (definition.valueType === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      definition.minimum === undefined ||
      definition.maximum === undefined ||
      value < definition.minimum ||
      value > definition.maximum
    )
      return undefined;
    return value;
  }
  if (typeof value !== 'string') return undefined;
  return definition.allowedValues?.find((locale) => locale === value);
}
