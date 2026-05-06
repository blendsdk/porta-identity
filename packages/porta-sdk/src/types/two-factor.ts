/**
 * Two-factor authentication types for the Porta SDK.
 *
 * @module types/two-factor
 */

export type TwoFactorMethod = 'email' | 'totp';

export interface TwoFactorStatus {
  userId: string;
  emailEnabled: boolean;
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
  enforcedBy: string | null;
}
