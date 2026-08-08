/**
 * User claim value types for the Porta SDK.
 *
 * @module types/user-claims
 */

export interface UserClaimEntry {
  claimDefinitionId: string;
  claimName: string;
  claimSlug: string;
  value: unknown;
  updatedAt: string;
}

export interface SetUserClaimValueInput {
  value: unknown;
}
