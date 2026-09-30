/**
 * Custom claims entity types for the Porta SDK.
 *
 * These types mirror the server's custom-claim resource: a definition is owned
 * by one application and holds the metadata for claim values assigned to users.
 *
 * @module types/custom-claims
 */

/** Supported custom claim value types. */
export type ClaimValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Custom claim definition owned by one application.
 * Mirrors the server's `CustomClaimDefinition`.
 */
export interface CustomClaimDefinition {
  id: string;
  applicationId: string;
  claimName: string;
  claimType: ClaimValueType;
  description: string | null;
  includeInIdToken: boolean;
  includeInAccessToken: boolean;
  includeInUserinfo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a claim definition (claimName and claimType are immutable). */
export interface CreateCustomClaimInput {
  claimName: string;
  claimType: ClaimValueType;
  description?: string;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
}

/** Input for updating a claim definition (metadata and inclusion flags only). */
export interface UpdateCustomClaimInput {
  description?: string | null;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
}
