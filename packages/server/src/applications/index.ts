/**
 * Applications module — public API barrel export.
 *
 * Re-exports the types, service functions, error classes, and slug
 * utilities that other modules need. Internal implementation details
 * (repository, cache) are NOT exported — they are consumed only by
 * the service layer.
 */

// Types
export type {
  Application,
  ApplicationModule,
  ApplicationStatus,
  ModuleStatus,
  ApplicationRow,
  ApplicationModuleRow,
  CreateApplicationInput,
  UpdateApplicationInput,
  CreateModuleInput,
  UpdateModuleInput,
  ListApplicationsOptions,
  PaginatedResult,
} from './types.js';

// Service functions — Application CRUD
export {
  createApplication,
  getApplicationById,
  getApplicationBySlug,
  updateApplication,
  listApplications,
  listApplicationsCursor,
} from './service.js';

// Cursor pagination types (re-exported for route consumers)
export type { ListApplicationsCursorOptions } from './repository.js';
export type { CursorPaginatedResult } from '../lib/cursor.js';

// Service functions — Status lifecycle
export {
  deactivateApplication,
  activateApplication,
  archiveApplication,
} from './service.js';

// Service functions — Module management
export {
  createModule,
  updateModule,
  deactivateModule,
  listModules,
} from './service.js';

// Error types
export {
  ApplicationNotFoundError,
  ApplicationValidationError,
} from './errors.js';

// Slug utilities (for external consumers like CLI or routes)
export {
  generateSlug,
  validateSlug,
} from './slugs.js';
