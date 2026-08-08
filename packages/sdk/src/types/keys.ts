/**
 * Signing key types for the Porta SDK.
 *
 * @module types/keys
 */

export interface SigningKey {
  id: string;
  kid: string;
  algorithm: string;
  isActive: boolean;
  createdAt: string;
  rotatedAt: string | null;
}
