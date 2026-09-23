/** Operational writes are closed while untrusted reads reach authoritative server validation. */
import { describe, expectTypeOf, it } from 'vitest';
import type {
  ConfigKey,
  ConfigValue,
  ConfigEntry,
  ConfigDomain,
  ConfigUpdateResult,
  ConfigBatchUpdateResult,
} from '../../src/index.js';

type ExpectedKey =
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
type ExpectedEntry = {
  readonly key: ExpectedKey;
  readonly group: 'lifetimes' | 'rate-limits' | 'lockout' | 'general';
  readonly label: string;
  readonly description: string;
  readonly value: number | string;
  readonly defaultValue: number | string;
  readonly valueType: 'integer' | 'string';
  readonly unit: 'seconds' | 'attempts' | 'days' | 'locale';
  readonly minimum?: number;
  readonly maximum?: number;
  readonly allowedValues?: readonly 'en'[];
  readonly applicationMode: 'runtime' | 'restart-required';
  readonly updatedAt: string;
};
type ExpectedUpdate = { readonly data: ConfigEntry; readonly restartRequired: boolean };
type ExpectedBatch = { readonly data: readonly ConfigEntry[]; readonly restartRequired: boolean };
type ExpectedDomain = {
  list(): Promise<readonly ConfigEntry[]>;
  get(key: string): Promise<ConfigEntry>;
  set(key: ConfigKey, value: ConfigValue): Promise<ConfigUpdateResult>;
  setMany(
    values: Readonly<Partial<Record<ConfigKey, ConfigValue>>>,
  ): Promise<ConfigBatchUpdateResult>;
};

/** Compile real call sites without performing requests at runtime. */
function checkCalls(config: ConfigDomain, untrustedKey: string): void {
  void config.get(untrustedKey);
  void config.set('magic_link_ttl', 1200);
  void config.set('default_locale', 'en');
  void config.setMany({ access_token_ttl: 7200, magic_link_ttl: 1200 });
  // @ts-expect-error Infrastructure names cannot become privileged mutation keys.
  void config.set('DATABASE_URL', 'private');
  // @ts-expect-error Batch writes reject unknown literal properties.
  void config.setMany({ unknown: 1200 });
  // @ts-expect-error Native configuration values cannot be booleans.
  void config.set('magic_link_ttl', true);
}

describe('configuration SDK compiler contract', () => {
  it('should expose exact keys, native values and readonly metadata', () => {
    expectTypeOf<ConfigKey>().toEqualTypeOf<ExpectedKey>();
    expectTypeOf<ConfigValue>().toEqualTypeOf<number | string>();
    expectTypeOf<ConfigEntry>().toEqualTypeOf<ExpectedEntry>();
    expectTypeOf<ConfigUpdateResult>().toEqualTypeOf<ExpectedUpdate>();
    expectTypeOf<ConfigBatchUpdateResult>().toEqualTypeOf<ExpectedBatch>();
  });
  it('should expose arbitrary reads and closed native writes', () => {
    expectTypeOf<ConfigDomain>().toEqualTypeOf<ExpectedDomain>();
    expectTypeOf(checkCalls).toBeFunction();
  });
});
