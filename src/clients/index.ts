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
  ClientRow,
  ClientSecretRow,
  CreateClientInput,
  UpdateClientInput,
  CreateSecretInput,
  ListClientsOptions,
  PaginatedResult,
} from './types.js';

// Service functions — Client CRUD
export {
  createClient,
  getClientById,
  getClientByClientId,
  updateClient,
  listClientsByOrganization,
  listClientsByApplication,
} from './service.js';

// Service functions — Status lifecycle
export {
  deactivateClient,
  activateClient,
  revokeClient,
} from './service.js';

// Service functions — OIDC integration
export { findForOidc } from './service.js';

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
