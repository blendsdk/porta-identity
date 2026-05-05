/**
 * @porta/sdk — Main entrypoint.
 *
 * Re-exports the client factory, all types, domain interfaces,
 * error classes, and pagination utilities.
 *
 * Transport and auth providers are available from platform-specific entrypoints:
 * - `@porta/sdk/node` — Node.js transport + all auth providers
 * - `@porta/sdk/browser` — Browser (fetch) transport
 * - `@porta/sdk/agent` — AI agent tool definitions
 *
 * @module @porta/sdk
 */

// Client factory
export { createPortaClient } from './client.js';
export type { PortaClient, PortaClientOptions } from './client.js';

// Version
export { SDK_VERSION } from './version.js';

// All entity types
export type * from './types/index.js';

// Domain interfaces (type-only)
export type {
  OrganizationsDomain,
  ApplicationsDomain,
  ClientsDomain,
  UsersDomain,
  RolesDomain,
  PermissionsDomain,
  CustomClaimsDomain,
  UserRolesDomain,
  UserClaimsDomain,
  ConfigDomain,
  KeysDomain,
  AuditDomain,
  StatsDomain,
  SessionsDomain,
  BulkDomain,
  BrandingDomain,
  ExportsDomain,
  TwoFactorDomain,
  ImportsDomain,
  SlugValidation,
  DestroyResult,
} from './domains/index.js';

// Transport types (type-only)
export type {
  HttpTransport,
  TransportRequest,
  TransportResponse,
  HttpMethod,
} from './transport/types.js';

// Auth provider type
export type { AuthProvider } from './auth/index.js';

// Error classes
export {
  PortaError,
  PortaHttpError,
  PortaAuthenticationError,
  PortaForbiddenError,
  PortaNotFoundError,
  PortaConflictError,
  PortaValidationError,
  PortaRateLimitError,
  PortaServerError,
  mapResponseToError,
} from './errors/index.js';

// Pagination
export { listAll } from './pagination/index.js';
export type { PaginatedResult, PaginatedListParams } from './pagination/index.js';
