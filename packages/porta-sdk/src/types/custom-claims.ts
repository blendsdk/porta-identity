/**
 * Custom claims entity types for the Porta SDK.
 *
 * @module types/custom-claims
 */

export type ClaimValueType = 'string' | 'number' | 'boolean' | 'json';

export interface ClaimDefinition {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  valueType: ClaimValueType;
  isRequired: boolean;
  defaultValue: unknown;
  validationRules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClaimDefinitionInput {
  applicationId: string;
  name: string;
  slug?: string;
  description?: string;
  valueType: ClaimValueType;
  isRequired?: boolean;
  defaultValue?: unknown;
  validationRules?: Record<string, unknown>;
}

export interface UpdateClaimDefinitionInput {
  name?: string;
  description?: string | null;
  isRequired?: boolean;
  defaultValue?: unknown;
  validationRules?: Record<string, unknown> | null;
}

export interface UserClaimValue {
  id: string;
  userId: string;
  claimDefinitionId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SetUserClaimInput {
  value: unknown;
}
