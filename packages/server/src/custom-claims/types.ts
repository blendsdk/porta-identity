/**
 * Custom claims types and interfaces.
 *
 * Defines the data structures for custom claim definitions and values.
 * Definitions are per-application (which claims exist and where to include
 * them), values are per-user (actual claim data stored as JSONB).
 *
 * Includes database row interfaces, input types for create/update, a
 * convenience joined type, and mapping functions to convert snake_case
 * database rows to camelCase TypeScript objects.
 *
 * Database tables: custom_claim_definitions, custom_claim_values
 * (see migration 007_custom_claims.sql)
 */

// ---------------------------------------------------------------------------
// Enums / literal types
// ---------------------------------------------------------------------------

/** Supported custom claim value types (stored in claim_type column) */
export type ClaimType = 'string' | 'number' | 'boolean' | 'json';

/** Token types where a claim can be included — used for filtering at issuance */
export type TokenType = 'id_token' | 'access_token' | 'userinfo';

// ---------------------------------------------------------------------------
// Claim definition types
// ---------------------------------------------------------------------------

/**
 * Full claim definition record as stored in the database.
 * Maps to the `custom_claim_definitions` table columns (see migration 007).
 * Definitions are scoped to an application — each app can have its own set
 * of custom claims with independent inclusion rules.
 */
export interface CustomClaimDefinition {
  id: string;
  applicationId: string;
  claimName: string;
  claimType: ClaimType;
  description: string | null;
  includeInIdToken: boolean;
  includeInAccessToken: boolean;
  includeInUserinfo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raw database row from the custom_claim_definitions table (snake_case columns).
 * Used by the repository layer; mapped to CustomClaimDefinition via mapRowToDefinition().
 */
export interface CustomClaimDefinitionRow {
  id: string;
  application_id: string;
  claim_name: string;
  claim_type: string;
  description: string | null;
  include_in_id_token: boolean;
  include_in_access_token: boolean;
  include_in_userinfo: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new claim definition.
 * claimName and claimType are required and immutable once created.
 * Token inclusion flags default to: id_token=false, access_token=true, userinfo=true.
 */
export interface CreateClaimDefinitionInput {
  applicationId: string;
  claimName: string;
  claimType: ClaimType;
  description?: string;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
}

/**
 * Input for updating an existing claim definition (partial).
 * Only description and token inclusion flags are updatable — claimName
 * and claimType define the claim identity and cannot be changed.
 */
export interface UpdateClaimDefinitionInput {
  description?: string | null;
  includeInIdToken?: boolean;
  includeInAccessToken?: boolean;
  includeInUserinfo?: boolean;
}

// ---------------------------------------------------------------------------
// Claim value types
// ---------------------------------------------------------------------------

/**
 * Full claim value record as stored in the database.
 * Maps to the `custom_claim_values` table columns (see migration 007).
 * Values are per-user, per-claim — stored as JSONB to support any type.
 */
export interface CustomClaimValue {
  id: string;
  userId: string;
  claimId: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raw database row from the custom_claim_values table (snake_case columns).
 * Used by the repository layer; mapped to CustomClaimValue via mapRowToValue().
 */
export interface CustomClaimValueRow {
  id: string;
  user_id: string;
  claim_id: string;
  value: unknown;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Composite types (joined query results)
// ---------------------------------------------------------------------------

/**
 * A claim definition joined with its user value.
 * Used when resolving all claims for a user (e.g., for token building).
 */
export interface CustomClaimWithValue {
  definition: CustomClaimDefinition;
  value: CustomClaimValue;
}

// ---------------------------------------------------------------------------
// Database row mapping functions
// ---------------------------------------------------------------------------

/**
 * Map a database row to a CustomClaimDefinition object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties. The claim_type column is cast to ClaimType.
 *
 * @param row - Raw database row from the custom_claim_definitions table
 * @returns Mapped definition with camelCase properties
 */
export function mapRowToDefinition(row: CustomClaimDefinitionRow): CustomClaimDefinition {
  return {
    id: row.id,
    applicationId: row.application_id,
    claimName: row.claim_name,
    claimType: row.claim_type as ClaimType,
    description: row.description,
    includeInIdToken: row.include_in_id_token,
    includeInAccessToken: row.include_in_access_token,
    includeInUserinfo: row.include_in_userinfo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a database row to a CustomClaimValue object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties. The value field is preserved as-is (JSONB
 * already parsed by the pg driver).
 *
 * @param row - Raw database row from the custom_claim_values table
 * @returns Mapped value with camelCase properties
 */
export function mapRowToValue(row: CustomClaimValueRow): CustomClaimValue {
  return {
    id: row.id,
    userId: row.user_id,
    claimId: row.claim_id,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
