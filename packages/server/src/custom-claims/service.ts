/**
 * Custom claims service — business logic layer.
 *
 * Orchestrates claim definition CRUD, value management, and token claims
 * building. This is the primary public interface for the custom-claims
 * module — callers should use these functions instead of accessing the
 * repository or cache directly.
 *
 * Responsibilities:
 * - Validate claim names (reserved, format) before create
 * - Enforce uniqueness (application_id + claim_name)
 * - Validate value types against definition types before set
 * - Cache orchestration for definitions (cache-first reads, invalidation on writes)
 * - Audit logging for all write operations (fire-and-forget)
 * - Build custom claims for token issuance (filtered by token type)
 *
 * @see repository.ts — Database operations
 * @see cache.ts — Redis cache for definitions
 * @see validators.ts — Name and value validation
 */

import {
  insertDefinition as repoInsertDefinition,
  findDefinitionById as repoFindDefinitionById,
  updateDefinition as repoUpdateDefinition,
  deleteDefinition as repoDeleteDefinition,
  listDefinitionsByApplication as repoListDefinitions,
  claimNameExists,
  upsertValue as repoUpsertValue,
  findValue as repoFindValue,
  deleteValue as repoDeleteValue,
  getValuesForUser as repoGetValuesForUser,
  getValuesForUserByApp,
} from './repository.js';
import {
  getCachedDefinitions,
  setCachedDefinitions,
  invalidateDefinitionsCache,
} from './cache.js';
import { validateClaimName, validateClaimValue } from './validators.js';
import { ClaimNotFoundError, ClaimValidationError } from './errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import type {
  CustomClaimDefinition,
  CreateClaimDefinitionInput,
  UpdateClaimDefinitionInput,
  CustomClaimValue,
  CustomClaimWithValue,
  TokenType,
} from './types.js';

// ===========================================================================
// Definition Management
// ===========================================================================

/**
 * Create a custom claim definition for an application.
 *
 * Validates the claim name is not reserved, matches the required format,
 * and is unique within the application. Invalidates the definitions cache
 * after successful creation.
 *
 * @param input - Definition data to create
 * @returns The newly created definition
 * @throws ClaimValidationError if name is reserved, invalid format, or duplicate
 */
export async function createDefinition(
  input: CreateClaimDefinitionInput,
): Promise<CustomClaimDefinition> {
  // 1. Validate claim name format and reserved names
  const nameValidation = validateClaimName(input.claimName);
  if (!nameValidation.valid) {
    throw new ClaimValidationError(nameValidation.reason!);
  }

  // 2. Check uniqueness within the application
  const exists = await claimNameExists(input.applicationId, input.claimName);
  if (exists) {
    throw new ClaimValidationError(
      `Claim name '${input.claimName}' already exists for this application`,
    );
  }

  // 3. Insert into database
  const definition = await repoInsertDefinition(input);

  // 4. Invalidate definitions cache for this application
  await invalidateDefinitionsCache(input.applicationId);

  // 5. Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'claim.defined',
    eventCategory: 'admin',
    metadata: {
      definitionId: definition.id,
      applicationId: definition.applicationId,
      claimName: definition.claimName,
      claimType: definition.claimType,
    },
  });

  return definition;
}

/**
 * Update a claim definition (inclusion flags and description only).
 *
 * claimName and claimType cannot be changed — they define the claim's
 * identity. Invalidates the definitions cache after update.
 *
 * @param id - Definition UUID
 * @param input - Fields to update
 * @returns Updated definition
 * @throws ClaimNotFoundError if definition not found
 */
export async function updateDefinition(
  id: string,
  input: UpdateClaimDefinitionInput,
): Promise<CustomClaimDefinition> {
  // 1. Verify definition exists (needed to get applicationId for cache invalidation)
  const existing = await repoFindDefinitionById(id);
  if (!existing) {
    throw new ClaimNotFoundError(id);
  }

  // 2. Update in database
  const updated = await repoUpdateDefinition(id, input);

  // 3. Invalidate definitions cache for this application
  await invalidateDefinitionsCache(existing.applicationId);

  // 4. Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'claim.updated',
    eventCategory: 'admin',
    metadata: {
      definitionId: id,
      applicationId: existing.applicationId,
      claimName: existing.claimName,
      changes: input,
    },
  });

  return updated;
}

/**
 * Delete a claim definition (cascades to all associated values).
 *
 * Invalidates the definitions cache after deletion.
 *
 * @param id - Definition UUID
 * @throws ClaimNotFoundError if definition not found
 */
export async function deleteDefinition(id: string): Promise<void> {
  // 1. Verify definition exists (needed for cache invalidation and audit)
  const existing = await repoFindDefinitionById(id);
  if (!existing) {
    throw new ClaimNotFoundError(id);
  }

  // 2. Delete from database (CASCADE removes values)
  await repoDeleteDefinition(id);

  // 3. Invalidate definitions cache for this application
  await invalidateDefinitionsCache(existing.applicationId);

  // 4. Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'claim.deleted',
    eventCategory: 'admin',
    metadata: {
      definitionId: id,
      applicationId: existing.applicationId,
      claimName: existing.claimName,
    },
  });
}

/**
 * Find a claim definition by ID.
 *
 * @param id - Definition UUID
 * @returns Definition or null if not found
 */
export async function findDefinitionById(id: string): Promise<CustomClaimDefinition | null> {
  return repoFindDefinitionById(id);
}

/**
 * List all claim definitions for an application. Cache-first.
 *
 * Checks Redis cache first. On cache miss, queries the database
 * and populates the cache for subsequent requests.
 *
 * @param applicationId - Application UUID
 * @returns Array of definitions
 */
export async function listDefinitions(applicationId: string): Promise<CustomClaimDefinition[]> {
  // 1. Check cache
  const cached = await getCachedDefinitions(applicationId);
  if (cached !== null) {
    return cached;
  }

  // 2. Cache miss — query database
  const definitions = await repoListDefinitions(applicationId);

  // 3. Cache the result
  await setCachedDefinitions(applicationId, definitions);

  return definitions;
}

// ===========================================================================
// Value Management
// ===========================================================================

/**
 * Set a custom claim value for a user.
 *
 * Validates that the claim definition exists and the value matches
 * the definition's claim type. Uses upsert semantics (insert or update).
 *
 * @param userId - User UUID
 * @param claimId - Definition UUID
 * @param value - The value to set (must match definition's claimType)
 * @returns The upserted claim value
 * @throws ClaimNotFoundError if definition not found
 * @throws ClaimValidationError if value type mismatch
 */
export async function setValue(
  userId: string,
  claimId: string,
  value: unknown,
): Promise<CustomClaimValue> {
  // 1. Verify definition exists and get its type
  const definition = await repoFindDefinitionById(claimId);
  if (!definition) {
    throw new ClaimNotFoundError(claimId);
  }

  // 2. Validate value matches definition type
  const valueValidation = validateClaimValue(definition.claimType, value);
  if (!valueValidation.valid) {
    throw new ClaimValidationError(valueValidation.reason!);
  }

  // 3. Upsert the value
  const result = await repoUpsertValue(userId, claimId, value);

  // 4. Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'claim.value.set',
    eventCategory: 'admin',
    userId,
    metadata: {
      definitionId: claimId,
      claimName: definition.claimName,
    },
  });

  return result;
}

/**
 * Get a specific claim value for a user.
 *
 * @param userId - User UUID
 * @param claimId - Definition UUID
 * @returns Claim value or null if not set
 */
export async function getValue(
  userId: string,
  claimId: string,
): Promise<CustomClaimValue | null> {
  return repoFindValue(userId, claimId);
}

/**
 * Delete a claim value for a user.
 *
 * @param userId - User UUID
 * @param claimId - Definition UUID
 * @throws ClaimNotFoundError if value not found
 */
export async function deleteValue(userId: string, claimId: string): Promise<void> {
  const deleted = await repoDeleteValue(userId, claimId);
  if (!deleted) {
    throw new ClaimNotFoundError(`value for user ${userId}, claim ${claimId}`);
  }

  // Audit log (fire-and-forget)
  void writeAuditLog({
    eventType: 'claim.value.deleted',
    eventCategory: 'admin',
    userId,
    metadata: { definitionId: claimId },
  });
}

/**
 * Get all claim values for a user (across all applications).
 *
 * Returns joined definition+value pairs for admin views.
 *
 * @param userId - User UUID
 * @returns Array of definition+value pairs
 */
export async function getValuesForUser(userId: string): Promise<CustomClaimWithValue[]> {
  return repoGetValuesForUser(userId);
}

// ===========================================================================
// Token Claims Building
// ===========================================================================

/**
 * Build custom claims for inclusion in a token.
 *
 * Resolves the user's custom claim values for the specified application,
 * filtered by the token type (id_token, access_token, or userinfo).
 * Returns a flat object: { claimName: value, ... }
 *
 * Token type filtering:
 * - id_token → only claims where includeInIdToken is true
 * - access_token → only claims where includeInAccessToken is true
 * - userinfo → only claims where includeInUserinfo is true
 *
 * @param userId - The user whose claims to resolve
 * @param applicationId - The application whose claim definitions to use
 * @param tokenType - Which token type is being built
 * @returns Flat object with claim names as keys and values
 */
export async function buildCustomClaims(
  userId: string,
  applicationId: string,
  tokenType: TokenType,
): Promise<Record<string, unknown>> {
  // 1. Query all user's claim values for this application (with definitions)
  const claimsWithValues = await getValuesForUserByApp(userId, applicationId);

  // 2. Filter by token type inclusion flag and build result
  const result: Record<string, unknown> = {};

  for (const { definition, value } of claimsWithValues) {
    // Check the appropriate inclusion flag based on token type
    const included = isClaimIncluded(definition, tokenType);
    if (included) {
      result[definition.claimName] = value.value;
    }
  }

  return result;
}

/**
 * Check whether a claim definition should be included for a specific token type.
 *
 * @param definition - The claim definition with inclusion flags
 * @param tokenType - The token type being built
 * @returns true if the claim should be included
 */
function isClaimIncluded(definition: CustomClaimDefinition, tokenType: TokenType): boolean {
  switch (tokenType) {
    case 'id_token':
      return definition.includeInIdToken;
    case 'access_token':
      return definition.includeInAccessToken;
    case 'userinfo':
      return definition.includeInUserinfo;
    default:
      return false;
  }
}
