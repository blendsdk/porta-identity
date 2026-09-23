/** Verifies the closed operational-policy catalog and its native validation boundary. */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { NAMESPACES } from '../../../src/auth/i18n.js';
import {
  SYSTEM_CONFIG_CATALOG,
  SUPPORTED_LOCALES,
  findSystemConfigDefinition,
  validateSystemConfigValue,
} from '../../../src/lib/system-config-catalog.js';

/** Builds independent expected metadata without depending on the live catalog. */
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
const EXPECTED_CATALOG = [
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

/** Every supported authentication locale must contain this complete resource set. */
const REQUIRED_NAMESPACES = [
  'common',
  'login',
  'consent',
  'forgot-password',
  'reset-password',
  'magic-link',
  'invitation',
  'logout',
  'errors',
  'emails',
  'two-factor',
] as const;

describe('system configuration catalog', () => {
  // Metadata and defaults belong to the application, not to editable database descriptions.
  it('should expose exactly the approved definitions in public catalog order', () => {
    expect(SYSTEM_CONFIG_CATALOG).toEqual(EXPECTED_CATALOG);
    expect(new Set(SYSTEM_CONFIG_CATALOG.map((definition) => definition.key)).size).toBe(18);
  });

  it.each(EXPECTED_CATALOG)('should resolve the exact public definition for $key', (expected) => {
    expect(findSystemConfigDefinition(expected.key)).toEqual(expected);
  });

  it.each([
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
  ])('should exclude non-catalog setting %s from public lookup', (key) => {
    expect(findSystemConfigDefinition(key)).toBeUndefined();
  });

  describe.each(EXPECTED_CATALOG.filter((definition) => definition.valueType === 'integer'))(
    '$key native integer validation',
    (expected) => {
      it('should accept its native default and both inclusive boundaries', () => {
        const definition = findSystemConfigDefinition(expected.key);
        expect(definition).toBeDefined();
        if (
          !definition ||
          typeof expected.minimum !== 'number' ||
          typeof expected.maximum !== 'number'
        )
          throw new Error('Numeric definition is missing');
        for (const value of [expected.defaultValue, expected.minimum, expected.maximum]) {
          expect(validateSystemConfigValue(definition, value)).toBe(value);
        }
      });

      it('should reject integers immediately outside its bounds', () => {
        const definition = findSystemConfigDefinition(expected.key);
        if (
          !definition ||
          typeof expected.minimum !== 'number' ||
          typeof expected.maximum !== 'number'
        )
          throw new Error('Numeric definition is missing');
        expect(validateSystemConfigValue(definition, expected.minimum - 1)).toBeUndefined();
        expect(validateSystemConfigValue(definition, expected.maximum + 1)).toBeUndefined();
      });

      // Numeric-looking text and other JSON types must never be coerced into security policy.
      it.each(
        [
          1.5,
          '900',
          true,
          false,
          null,
          undefined,
          [],
          {},
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ].map((value) => [value]),
      )('should reject non-native or non-integer value %j', (value) => {
        const definition = findSystemConfigDefinition(expected.key);
        if (!definition) throw new Error('Numeric definition is missing');
        expect(validateSystemConfigValue(definition, value)).toBeUndefined();
      });
    },
  );

  it('should expose only the complete supported locale en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en']);
    expect(NAMESPACES).toEqual(REQUIRED_NAMESPACES);
    const definition = findSystemConfigDefinition('default_locale');
    if (!definition) throw new Error('Locale definition is missing');
    expect(validateSystemConfigValue(definition, 'en')).toBe('en');
  });

  it.each(['EN', 'nl', ' en ', '', 900, true, null, [], {}].map((value) => [value]))(
    'should reject unsupported or non-string locale %j',
    (value) => {
      const definition = findSystemConfigDefinition('default_locale');
      if (!definition) throw new Error('Locale definition is missing');
      expect(validateSystemConfigValue(definition, value)).toBeUndefined();
    },
  );

  it.each(REQUIRED_NAMESPACES)(
    'should package JSON object resources for namespace %s',
    async (namespace) => {
      expect(NAMESPACES).toContain(namespace);
      for (const locale of SUPPORTED_LOCALES) {
        const path = new URL(
          `../../../locales/default/${locale}/${namespace}.json`,
          import.meta.url,
        );
        const resource: unknown = JSON.parse(await readFile(path, 'utf8'));
        expect(resource).not.toBeNull();
        expect(typeof resource).toBe('object');
        expect(Array.isArray(resource)).toBe(false);
      }
    },
  );

  it('should package every namespace required by authentication initialization', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const namespace of NAMESPACES) {
        const path = new URL(
          `../../../locales/default/${locale}/${namespace}.json`,
          import.meta.url,
        );
        const resource: unknown = JSON.parse(await readFile(path, 'utf8'));
        expect(resource).not.toBeNull();
        expect(typeof resource).toBe('object');
        expect(Array.isArray(resource)).toBe(false);
      }
    }
  });
});
