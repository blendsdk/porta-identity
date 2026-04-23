/**
 * Clients module — public API barrel export.
 *
 * Re-exports the types, service functions, secret service functions,
 * and error classes that other modules need. Internal implementation
 * details (repository, cache, crypto, validators) are NOT exported —
 * they are consumed only by the service layer.
 */

// Types
export type {
  Client,
  ClientSecret,
  SecretWithPlaintext,
  ClientWithSecret,
  ClientType,
  ApplicationType,
  ClientStatus,
  SecretStatus,
  LoginMethod,
  ClientRow,
  ClientSecretRow,
  CreateClientInput,
  UpdateClientInput,
  CreateSecretInput,
  ListClientsOptions,
  PaginatedResult,
} from './types.js';

// Runtime constants
export { LOGIN_METHODS } from './types.js';

// Login-method resolution helpers
export {
  resolveLoginMethods,
  normalizeLoginMethods,
} from './resolve-login-methods.js';

// Service functions — Client CRUD
export {
  createClient,
  getClientById,
  getClientByClientId,
  updateClient,
  listClientsByOrganization,
  listClientsByApplication,
  listClientsCursor,
} from './service.js';

// Cursor pagination types (re-exported for route consumers)
export type { ListClientsCursorOptions } from './repository.js';
export type { CursorPaginatedResult } from '../lib/cursor.js';

// Service functions — Status lifecycle
export {
  deactivateClient,
  activateClient,
  revokeClient,
} from './service.js';

// Service functions — OIDC integration
export { findForOidc, verifyClientSecret } from './service.js';

// Secret service functions
export {
  generateAndStore as generateSecret,
  verify as verifySecret,
  revoke as revokeSecret,
  listByClient as listSecretsByClient,
  cleanupExpired as cleanupExpiredSecrets,
} from './secret-service.js';

// Error types
export {
  ClientNotFoundError,
  ClientValidationError,
} from './errors.js';
