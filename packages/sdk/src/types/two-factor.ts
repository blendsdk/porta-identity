/**
 * Two-factor authentication types for the Porta SDK.
 *
 * @module types/two-factor
 */

export type TwoFactorMethod = 'email' | 'totp';

/**
 * A user's current 2FA status — mirrors the server `TwoFactorStatus`
 * (src/two-factor/types.ts). The old `userId`/`emailEnabled`/`totpEnabled`/
 * `enforcedBy` fields were SDK drift (AR-18) and have been removed.
 */
export interface TwoFactorStatus {
  /** Whether 2FA is enabled for the user */
  enabled: boolean;
  /** The configured 2FA method, or null if not enabled */
  method: TwoFactorMethod | null;
  /** Whether a TOTP authenticator is configured */
  totpConfigured: boolean;
  /** Number of unused recovery codes remaining */
  recoveryCodesRemaining: number;
}

/**
 * Organization 2FA policy values — mirrors the server `TwoFactorPolicy`
 * (src/two-factor/types.ts).
 */
export type TwoFactorPolicy = 'optional' | 'required_email' | 'required_totp' | 'required_any';

/**
 * Response from the org 2FA policy endpoints (GET/PUT `.../two-factor/policy`).
 * Mirrors the server `{ twoFactorPolicy, validPolicies }` shape.
 */
export interface TwoFactorPolicyResult {
  twoFactorPolicy: TwoFactorPolicy;
  validPolicies: TwoFactorPolicy[];
}

/**
 * Org 2FA enrollment summary — mirrors the server `TwoFactorSummary`
 * (src/two-factor/service.ts), returned by GET `.../two-factor/summary`.
 */
export interface TwoFactorSummary {
  totalUsers: number;
  enabledCount: number;
  disabledCount: number;
  totpCount: number;
  emailCount: number;
  complianceRate: number;
}

/**
 * Result of regenerating a user's recovery codes — mirrors the server
 * response from POST `.../two-factor/recovery-codes/regenerate`.
 */
export interface RegenerateRecoveryCodesResult {
  recoveryCodes: string[];
  count: number;
  warning: string;
}


