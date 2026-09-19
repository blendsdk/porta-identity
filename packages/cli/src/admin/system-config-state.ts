/** Immutable native-value drafts and duration presentation for global policy editing. */
import type { ConfigEntry, ConfigKey, ConfigValue } from '@portaidentity/sdk';
import { isAdminConfigValue } from './system-config-service.js';
import type { AdminConfigFailure } from './system-config-service.js';

/** Closed actions emitted by the direct configuration form. */
export type AdminSystemConfigIntent =
  | { readonly kind: 'set-draft'; readonly key: ConfigKey; readonly text: string }
  | { readonly kind: 'save' | 'close' };

/** Current authoritative catalog plus raw edits retained across tabs and transient failures. */
export interface AdminSystemConfigReadyState {
  /** Ready projection discriminator. */
  readonly kind: 'ready';
  /** Complete validated entries in catalog order. */
  readonly entries: readonly ConfigEntry[];
  /** Raw input overrides; absent keys use the authoritative value. */
  readonly drafts?: Readonly<Partial<Record<ConfigKey, string>>>;
  /** Whether one remote operation or discard confirmation is active. */
  readonly busy?: boolean;
  /** Fixed safe status after save or failure. */
  readonly message?: string;
  /** Confirmed startup-policy update awaiting operator restart. */
  readonly restartRequired?: boolean;
}

/** Complete states rendered by the configuration workspace. */
export type AdminSystemConfigWorkspaceState =
  | { readonly kind: 'closed' | 'loading' }
  | { readonly kind: 'failure'; readonly failure: AdminConfigFailure }
  | AdminSystemConfigReadyState;

/** Derived dirty and valid batch values; invalid raw drafts never enter the payload. */
export interface AdminSystemConfigDraftProjection {
  /** Changed identifiers, including incomplete or invalid drafts. */
  readonly dirtyKeys: readonly ConfigKey[];
  /** Valid changed native values only. */
  readonly values: Readonly<Partial<Record<ConfigKey, ConfigValue>>>;
  /** Whether every changed draft satisfies its metadata. */
  readonly valid: boolean;
  /** Whether authority, validity, dirty state and operation ownership allow submission. */
  readonly canSave: boolean;
}

/**
 * Parses one raw editor value without coercing blanks, fractions or unsafe integers.
 * @param entry - Authoritative metadata for the field.
 * @param text - Raw single-line text, possibly an incomplete edit.
 * @returns Valid native scalar, or undefined.
 * @example parseAdminConfigDraft(entry, '7200');
 */
export function parseAdminConfigDraft(entry: ConfigEntry, text: string): ConfigValue | undefined {
  if (entry.valueType === 'string') return isAdminConfigValue(entry, text) ? text : undefined;
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const value = Number(text);
  return isAdminConfigValue(entry, value) ? value : undefined;
}

/**
 * Derives an atomic batch without losing incomplete drafts or treating equivalent numbers as dirty.
 * @param state - Loaded catalog and raw edits.
 * @param canUpdate - Verified update capability, never inferred from form contents.
 * @returns Immutable dirty keys, validated values and Save eligibility.
 * @example projectAdminConfigDrafts(state, capabilities.canUpdateConfig);
 */
export function projectAdminConfigDrafts(
  state: AdminSystemConfigReadyState,
  canUpdate: boolean,
): AdminSystemConfigDraftProjection {
  const dirtyKeys: ConfigKey[] = [];
  const values: Partial<Record<ConfigKey, ConfigValue>> = {};
  let valid = true;
  for (const entry of state.entries) {
    const raw = state.drafts?.[entry.key] ?? String(entry.value);
    const value = parseAdminConfigDraft(entry, raw);
    if (value === entry.value) continue;
    dirtyKeys.push(entry.key);
    if (value === undefined) valid = false;
    else values[entry.key] = value;
  }
  return Object.freeze({
    dirtyKeys: Object.freeze(dirtyKeys),
    values: Object.freeze(values),
    valid,
    canSave: canUpdate && dirtyKeys.length > 0 && valid && !state.busy,
  });
}

/**
 * Replaces one raw draft while preserving all other tabs' edits.
 * @param state - Current loaded projection.
 * @param key - Known loaded field identifier.
 * @param text - Raw editor contents.
 * @returns Immutable replacement; busy or unknown-field actions do not change state.
 * @example setAdminConfigDraft(state, 'magic_link_ttl', '1200');
 */
export function setAdminConfigDraft(
  state: AdminSystemConfigReadyState,
  key: ConfigKey,
  text: string,
): AdminSystemConfigReadyState {
  if (state.busy || !state.entries.some((entry) => entry.key === key)) return state;
  return Object.freeze({ ...state, drafts: Object.freeze({ ...state.drafts, [key]: text }) });
}

/**
 * Shows the largest exact whole duration unit while leaving storage and editor values in seconds.
 * @param seconds - Native positive integer seconds.
 * @returns Singular or plural whole-unit text.
 * @example formatAdminConfigDuration(900); // '15 minutes'
 */
export function formatAdminConfigDuration(seconds: number): string {
  for (const [divisor, unit] of [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ] as const) {
    if (seconds > 0 && seconds % divisor === 0) {
      const amount = seconds / divisor;
      return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
    }
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}
