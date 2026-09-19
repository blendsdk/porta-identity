/** Validated, non-retrying operational configuration calls for terminal administration. */
import {
  PortaAuthenticationError,
  PortaForbiddenError,
  PortaValidationError,
} from '@portaidentity/sdk';
import type { ConfigEntry, ConfigKey, ConfigValue, ConfigDomain } from '@portaidentity/sdk';

/** Exact public identifiers; display policy and bounds remain server metadata. */
export const ADMIN_CONFIG_KEYS: readonly ConfigKey[] = Object.freeze([
  'access_token_ttl',
  'id_token_ttl',
  'refresh_token_ttl',
  'authorization_code_ttl',
  'session_ttl',
  'magic_link_ttl',
  'password_reset_ttl',
  'invitation_ttl',
  'rate_limit_login_max',
  'rate_limit_login_window',
  'rate_limit_magic_link_max',
  'rate_limit_magic_link_window',
  'rate_limit_password_reset_max',
  'rate_limit_password_reset_window',
  'max_failed_logins',
  'lockout_duration_seconds',
  'audit_retention_days',
  'default_locale',
]);

/** Fixed categories that never render remote error details. */
export type AdminConfigFailure = 'validation' | 'unauthorized' | 'unavailable' | 'invalid-response';
/** Sanitized authoritative read result. */
export type AdminConfigReadResult =
  | { readonly kind: 'success'; readonly value: readonly ConfigEntry[] }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'failure'; readonly failure: AdminConfigFailure };
/** A mutation distinguishes confirmed rejection from an unknown network outcome. */
export type AdminConfigMutationResult =
  | { readonly kind: 'success'; readonly restartRequired: boolean }
  | { readonly kind: 'session-invalid' }
  | { readonly kind: 'outcome-unknown' }
  | { readonly kind: 'failure'; readonly failure: AdminConfigFailure };
/** Two direct session-bound operations used by the configuration controller. */
export interface AdminSystemConfigOperations {
  /** Reads the complete validated public catalog. */
  readonly listConfig: () => Promise<AdminConfigReadResult>;
  /** Sends one atomic changed-key batch without retrying. */
  readonly setConfigMany: (
    values: Readonly<Partial<Record<ConfigKey, ConfigValue>>>,
  ) => Promise<AdminConfigMutationResult>;
}

/** Narrows one public identifier without permitting arbitrary runtime keys. */
export function isAdminConfigKey(value: unknown): value is ConfigKey {
  return typeof value === 'string' && ADMIN_CONFIG_KEYS.some((key) => key === value);
}

/** Bounds text and rejects terminal controls before it reaches widgets. */
function safeText(value: unknown, maximum: number): value is string {
  if (typeof value !== 'string' || !value.length || value.length > maximum) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return false;
  }
  return true;
}

/** Validates the native scalar using authoritative metadata, with no coercion. */
export function isAdminConfigValue(entry: ConfigEntry, value: unknown): value is ConfigValue {
  return entry.valueType === 'integer'
    ? typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        typeof entry.minimum === 'number' &&
        typeof entry.maximum === 'number' &&
        value >= entry.minimum &&
        value <= entry.maximum
    : typeof value === 'string' &&
        entry.allowedValues?.some((allowed) => allowed === value) === true;
}

/** Rejects incomplete metadata rather than rendering a partially trusted form. */
function isEntry(value: unknown): value is ConfigEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (
    !isAdminConfigKey(candidate.key) ||
    !safeText(candidate.label, 80) ||
    !safeText(candidate.description, 512) ||
    typeof candidate.group !== 'string' ||
    !['lifetimes', 'rate-limits', 'lockout', 'general'].includes(candidate.group) ||
    typeof candidate.applicationMode !== 'string' ||
    !['runtime', 'restart-required'].includes(candidate.applicationMode) ||
    !safeText(candidate.updatedAt, 40) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(candidate.updatedAt) ||
    !Number.isFinite(Date.parse(candidate.updatedAt))
  )
    return false;
  if (candidate.valueType === 'integer') {
    return (
      candidate.key !== 'default_locale' &&
      typeof candidate.unit === 'string' &&
      ['seconds', 'attempts', 'days'].includes(candidate.unit) &&
      typeof candidate.minimum === 'number' &&
      Number.isSafeInteger(candidate.minimum) &&
      typeof candidate.maximum === 'number' &&
      Number.isSafeInteger(candidate.maximum) &&
      candidate.minimum <= candidate.maximum &&
      typeof candidate.value === 'number' &&
      Number.isSafeInteger(candidate.value) &&
      candidate.value >= candidate.minimum &&
      candidate.value <= candidate.maximum &&
      typeof candidate.defaultValue === 'number' &&
      Number.isSafeInteger(candidate.defaultValue) &&
      candidate.defaultValue >= candidate.minimum &&
      candidate.defaultValue <= candidate.maximum
    );
  }
  return (
    candidate.key === 'default_locale' &&
    candidate.valueType === 'string' &&
    candidate.unit === 'locale' &&
    Array.isArray(candidate.allowedValues) &&
    candidate.allowedValues.length === 1 &&
    candidate.allowedValues[0] === 'en' &&
    candidate.value === 'en' &&
    candidate.defaultValue === 'en'
  );
}

/**
 * Validates a complete response and returns an immutable catalog-ordered projection.
 * @param value - Untrusted SDK response.
 * @returns Safe entries, or undefined when any entry is missing, duplicate or invalid.
 * @example validateAdminConfigEntries(await client.config.list());
 */
export function validateAdminConfigEntries(value: unknown): readonly ConfigEntry[] | undefined {
  if (!Array.isArray(value) || value.length !== ADMIN_CONFIG_KEYS.length || !value.every(isEntry))
    return undefined;
  const entries: ConfigEntry[] = [];
  for (const key of ADMIN_CONFIG_KEYS) {
    const matches = value.filter((entry) => entry.key === key);
    if (matches.length !== 1 || !matches[0]) return undefined;
    const entry = matches[0];
    entries.push(
      Object.freeze({
        ...entry,
        ...(entry.allowedValues ? { allowedValues: Object.freeze([...entry.allowedValues]) } : {}),
      }),
    );
  }
  return Object.freeze(entries);
}

/**
 * Creates direct operations over the verified session's existing configuration domain.
 * Invalid mutation readback is an unknown outcome, never a reason to replay the batch.
 * @param domain - Lazy session-bound SDK domain.
 * @returns Sanitized list and batch operations.
 * @example createAdminSystemConfigOperations(() => client.config);
 */
export function createAdminSystemConfigOperations(
  domain: () => Pick<ConfigDomain, 'list' | 'setMany'>,
): AdminSystemConfigOperations {
  return {
    async listConfig() {
      try {
        const entries = validateAdminConfigEntries(await domain().list());
        return entries
          ? { kind: 'success', value: entries }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
        return {
          kind: 'failure',
          failure: error instanceof PortaForbiddenError ? 'unauthorized' : 'unavailable',
        };
      }
    },
    async setConfigMany(values) {
      const keys = Object.keys(values);
      if (
        !keys.length ||
        !keys.every(isAdminConfigKey) ||
        Object.values(values).some(
          (value) =>
            !(
              typeof value === 'string' ||
              (typeof value === 'number' && Number.isSafeInteger(value))
            ),
        )
      ) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const result: unknown = await domain().setMany(values);
        if (
          !result ||
          typeof result !== 'object' ||
          !('data' in result) ||
          !('restartRequired' in result) ||
          typeof result.restartRequired !== 'boolean' ||
          !Array.isArray(result.data) ||
          result.data.length !== keys.length ||
          !result.data.every(isEntry)
        ) {
          return { kind: 'outcome-unknown' };
        }
        const entries = result.data;
        if (
          keys.some(
            (key) =>
              entries.filter((entry) => entry.key === key && entry.value === values[entry.key])
                .length !== 1,
          )
        ) {
          return { kind: 'outcome-unknown' };
        }
        return { kind: 'success', restartRequired: result.restartRequired };
      } catch (error) {
        if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
        if (error instanceof PortaForbiddenError)
          return { kind: 'failure', failure: 'unauthorized' };
        if (error instanceof PortaValidationError)
          return { kind: 'failure', failure: 'validation' };
        return { kind: 'outcome-unknown' };
      }
    },
  };
}
