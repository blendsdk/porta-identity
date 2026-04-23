/**
 * Organizations module — public API barrel export.
 *
 * Re-exports the types, service functions, error classes, and slug
 * utilities that other modules need. Internal implementation details
 * (repository, cache) are NOT exported — they are consumed only by
 * the service layer and tenant resolver.
 */

// Types
export type {
  Organization,
  OrganizationRow,
  OrganizationStatus,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  BrandingInput,
  ListOrganizationsOptions,
  PaginatedResult,
} from './types.js';

// Service functions
export {
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  updateOrganizationBranding,
  suspendOrganization,
  activateOrganization,
  archiveOrganization,
  restoreOrganization,
  listOrganizations,
  listOrganizationsCursor,
  validateSlugAvailability,
} from './service.js';

// Cursor pagination types (re-exported for route consumers)
export type { ListOrganizationsCursorOptions } from './repository.js';
export type { CursorPaginatedResult } from '../lib/cursor.js';

// Error types
export {
  OrganizationNotFoundError,
  OrganizationValidationError,
} from './errors.js';

// Slug utilities (for external consumers like CLI)
export {
  generateSlug,
  validateSlug,
} from './slugs.js';
