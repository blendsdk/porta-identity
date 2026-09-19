/** Public operational configuration contracts; the server owns validation and display metadata. */

/** Closed operational policy keys accepted by configuration mutations. */
export type ConfigKey =
  | 'access_token_ttl'
  | 'id_token_ttl'
  | 'refresh_token_ttl'
  | 'authorization_code_ttl'
  | 'session_ttl'
  | 'magic_link_ttl'
  | 'password_reset_ttl'
  | 'invitation_ttl'
  | 'rate_limit_login_max'
  | 'rate_limit_login_window'
  | 'rate_limit_magic_link_max'
  | 'rate_limit_magic_link_window'
  | 'rate_limit_password_reset_max'
  | 'rate_limit_password_reset_window'
  | 'max_failed_logins'
  | 'lockout_duration_seconds'
  | 'audit_retention_days'
  | 'default_locale';

/** Native JSON scalars; key-specific bounds and supported strings remain server-authoritative. */
export type ConfigValue = number | string;

/** Logical tab grouping provided by the server catalog. */
export type ConfigGroup = 'lifetimes' | 'rate-limits' | 'lockout' | 'general';

/** Native scalar category used by metadata-driven editors. */
export type ConfigValueType = 'integer' | 'string';

/** Display unit for a stored scalar, without conversion of its wire value. */
export type ConfigUnit = 'seconds' | 'attempts' | 'days' | 'locale';

/** Whether running consumers converge or every server instance must restart. */
export type ConfigApplicationMode = 'runtime' | 'restart-required';

/** Complete authoritative entry; bootstrap settings and secrets are not part of this surface. */
export interface ConfigEntry {
  /** Closed catalog identifier. */
  readonly key: ConfigKey;
  /** Logical editor group. */
  readonly group: ConfigGroup;
  /** Human-readable field caption. */
  readonly label: string;
  /** Explanation of the policy's effect. */
  readonly description: string;
  /** Current native stored value. */
  readonly value: ConfigValue;
  /** Safe catalog fallback used by runtime readers. */
  readonly defaultValue: ConfigValue;
  /** Expected native scalar category. */
  readonly valueType: ConfigValueType;
  /** Unit used for bounds and current value. */
  readonly unit: ConfigUnit;
  /** Inclusive lower bound for integer values. */
  readonly minimum?: number;
  /** Inclusive upper bound for integer values. */
  readonly maximum?: number;
  /** Exact supported strings for locale values. */
  readonly allowedValues?: readonly 'en'[];
  /** Required operational action after a successful update. */
  readonly applicationMode: ConfigApplicationMode;
  /** Last successful database update, in ISO 8601 format. */
  readonly updatedAt: string;
}

/** Native single-value request body. */
export interface SetConfigInput {
  /** Value validated against the targeted server catalog definition. */
  readonly value: ConfigValue;
}

/** Confirmed single update, preserving the server's restart decision. */
export interface ConfigUpdateResult {
  /** Fresh authoritative entry. */
  readonly data: ConfigEntry;
  /** True when every Porta server instance must restart. */
  readonly restartRequired: boolean;
}

/** Confirmed atomic batch update, in server catalog order. */
export interface ConfigBatchUpdateResult {
  /** Fresh authoritative entries for the changed keys. */
  readonly data: readonly ConfigEntry[];
  /** True when any changed policy requires every server instance to restart. */
  readonly restartRequired: boolean;
}
