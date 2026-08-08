/**
 * Custom claims module — public API barrel export.
 *
 * Re-exports the types, error classes, validators, and service
 * functions that other modules need. Internal implementation details
 * (repository, cache) are NOT exported — they are consumed only by
 * the service layer.
 */

// Types
export type {
  ClaimType,
  TokenType,
  CustomClaimDefinition,
  CustomClaimValue,
  CreateClaimDefinitionInput,
  UpdateClaimDefinitionInput,
  CustomClaimWithValue,
} from './types.js';

// Row mappers
export {
  mapRowToDefinition,
  mapRowToValue,
} from './types.js';

// Errors
export { ClaimNotFoundError, ClaimValidationError } from './errors.js';

// Validators
export {
  RESERVED_CLAIM_NAMES,
  isReservedClaimName,
  validateClaimName,
  validateClaimValue,
} from './validators.js';

// Service (public API)
export {
  createDefinition,
  updateDefinition,
  deleteDefinition,
  findDefinitionById,
  listDefinitions,
  setValue,
  getValue,
  deleteValue,
  getValuesForUser,
  buildCustomClaims,
} from './service.js';
