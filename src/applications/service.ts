/**
 * Application service — business logic orchestrator.
 *
 * Composes the repository, cache, slug utilities, and audit log
 * to provide the complete application management API. All write
 * operations follow the pattern:
 *   1. Validate inputs
 *   2. Perform DB operation (via repository)
 *   3. Invalidate + re-cache (via cache)
 *   4. Write audit log (fire-and-forget)
 *
 * Read operations check cache first, fall back to DB on miss.
 *
 * Status lifecycle rules (different from organizations):
 *   - deactivate: active → inactive
 *   - activate:   inactive → active
 *   - archive:    active|inactive → archived (permanent, cannot be restored)
 *
 * Module management:
 *   - Modules belong to an application (parent must exist)
 *   - Module slugs are unique within their parent application
 *   - Module deactivation sets status to inactive
 */

import type {
  Application,
  ApplicationModule,
  CreateApplicationInput,
  UpdateApplicationInput,
  CreateModuleInput,
  UpdateModuleInput,
  ListApplicationsOptions,
  PaginatedResult,
} from './types.js';
import {
  insertApplication,
  findApplicationById,
  findApplicationBySlug,
  updateApplication as repoUpdateApp,
  listApplications as repoListApps,
  slugExists,
  insertModule,
  findModuleById,
  updateModule as repoUpdateModule,
  listModules as repoListModules,
  moduleSlugExists,
} from './repository.js';
import {
  getCachedApplicationById,
  getCachedApplicationBySlug,
  cacheApplication,
  invalidateApplicationCache,
} from './cache.js';
import { generateSlug, validateSlug } from './slugs.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { ApplicationNotFoundError, ApplicationValidationError } from './errors.js';

// ===========================================================================
// Application CRUD
// ===========================================================================

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new application.
 *
 * 1. Generate slug from name if not provided
 * 2. Validate slug format and reserved words
 * 3. Check slug uniqueness in the database
 * 4. Insert application via repository
 * 5. Cache the new application
 * 6. Write audit log entry
 *
 * @param input - Application creation data
 * @param actorId - UUID of the user performing the action (for audit)
 * @returns Created application
 * @throws ApplicationValidationError if slug is invalid or already taken
 */
export async function createApplication(
  input: CreateApplicationInput,
  actorId?: string,
): Promise<Application> {
  // Generate or use provided slug
  const slug = input.slug ?? generateSlug(input.name);

  // Validate slug format and reserved words
  const validation = validateSlug(slug);
  if (!validation.isValid) {
    throw new ApplicationValidationError(validation.error!);
  }

  // Check uniqueness
  const taken = await slugExists(slug);
  if (taken) {
    throw new ApplicationValidationError('Slug already in use');
  }

  // Insert into database
  const app = await insertApplication({
    name: input.name,
    slug,
    description: input.description,
  });

  // Cache the new application
  await cacheApplication(app);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    eventType: 'app.created',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId: app.id, slug: app.slug, name: app.name },
  });

  return app;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Find an application by ID.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param id - Application UUID
 * @returns Application or null if not found
 */
export async function getApplicationById(id: string): Promise<Application | null> {
  // Try cache first
  const cached = await getCachedApplicationById(id);
  if (cached) return cached;

  // Fall back to database
  const app = await findApplicationById(id);
  if (app) {
    await cacheApplication(app);
  }
  return app;
}

/**
 * Find an application by slug.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param slug - Application slug
 * @returns Application or null if not found
 */
export async function getApplicationBySlug(slug: string): Promise<Application | null> {
  // Try cache first
  const cached = await getCachedApplicationBySlug(slug);
  if (cached) return cached;

  // Fall back to database
  const app = await findApplicationBySlug(slug);
  if (app) {
    await cacheApplication(app);
  }
  return app;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update an application's basic fields (name, description).
 *
 * @param id - Application UUID
 * @param input - Fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated application
 * @throws ApplicationNotFoundError if application not found
 */
export async function updateApplication(
  id: string,
  input: UpdateApplicationInput,
  actorId?: string,
): Promise<Application> {
  // Build update data from input
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;

  let app: Application;
  try {
    app = await repoUpdateApp(id, updateData);
  } catch (err) {
    if (err instanceof Error && err.message === 'Application not found') {
      throw new ApplicationNotFoundError(id);
    }
    throw err;
  }

  // Invalidate old cache and re-cache the updated version
  await invalidateApplicationCache(app.slug, app.id);
  await cacheApplication(app);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    eventType: 'app.updated',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId: app.id, fields: Object.keys(updateData) },
  });

  return app;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List applications with pagination and filtering.
 * Delegates directly to the repository.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result
 */
export async function listApplications(
  options: ListApplicationsOptions,
): Promise<PaginatedResult<Application>> {
  return repoListApps(options);
}

// ===========================================================================
// Status lifecycle
// ===========================================================================

/**
 * Load and validate an application exists before a status change.
 * @throws ApplicationNotFoundError if not found
 */
async function loadAppForStatusChange(id: string): Promise<Application> {
  const app = await findApplicationById(id);
  if (!app) throw new ApplicationNotFoundError(id);
  return app;
}

/**
 * Deactivate an application (active → inactive).
 *
 * @param id - Application UUID
 * @param actorId - UUID of the user performing the action
 * @throws ApplicationNotFoundError if not found
 * @throws ApplicationValidationError if not currently active
 */
export async function deactivateApplication(
  id: string,
  actorId?: string,
): Promise<void> {
  const app = await loadAppForStatusChange(id);

  if (app.status !== 'active') {
    throw new ApplicationValidationError(
      `Cannot deactivate application from status: ${app.status}`,
    );
  }

  await repoUpdateApp(id, { status: 'inactive' });
  await invalidateApplicationCache(app.slug, app.id);

  await writeAuditLog({
    eventType: 'app.deactivated',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId: app.id },
  });
}

/**
 * Activate an application (inactive → active).
 *
 * @param id - Application UUID
 * @param actorId - UUID of the user performing the action
 * @throws ApplicationNotFoundError if not found
 * @throws ApplicationValidationError if not currently inactive
 */
export async function activateApplication(
  id: string,
  actorId?: string,
): Promise<void> {
  const app = await loadAppForStatusChange(id);

  if (app.status !== 'inactive') {
    throw new ApplicationValidationError(
      `Cannot activate application from status: ${app.status}`,
    );
  }

  await repoUpdateApp(id, { status: 'active' });
  await invalidateApplicationCache(app.slug, app.id);

  await writeAuditLog({
    eventType: 'app.activated',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId: app.id },
  });
}

/**
 * Archive an application (active or inactive → archived).
 *
 * Archive is a permanent soft-delete — archived applications cannot
 * be restored (unlike organizations which support restore).
 *
 * @param id - Application UUID
 * @param actorId - UUID of the user performing the action
 * @throws ApplicationNotFoundError if not found
 * @throws ApplicationValidationError if already archived
 */
export async function archiveApplication(
  id: string,
  actorId?: string,
): Promise<void> {
  const app = await loadAppForStatusChange(id);

  if (app.status === 'archived') {
    throw new ApplicationValidationError('Application is already archived');
  }

  await repoUpdateApp(id, { status: 'archived' });
  await invalidateApplicationCache(app.slug, app.id);

  await writeAuditLog({
    eventType: 'app.archived',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId: app.id, previousStatus: app.status },
  });
}

// ===========================================================================
// Module management
// ===========================================================================

/**
 * Create a new module within an application.
 *
 * 1. Validate the parent application exists
 * 2. Generate slug from name if not provided
 * 3. Validate slug format
 * 4. Check module slug uniqueness within the application
 * 5. Insert module via repository
 * 6. Write audit log entry
 *
 * @param applicationId - Parent application UUID
 * @param input - Module creation data
 * @param actorId - UUID of the user performing the action
 * @returns Created module
 * @throws ApplicationNotFoundError if parent application not found
 * @throws ApplicationValidationError if slug is invalid or taken within app
 */
export async function createModule(
  applicationId: string,
  input: CreateModuleInput,
  actorId?: string,
): Promise<ApplicationModule> {
  // Validate parent application exists
  const app = await findApplicationById(applicationId);
  if (!app) throw new ApplicationNotFoundError(applicationId);

  // Generate or use provided slug
  const slug = input.slug ?? generateSlug(input.name);

  // Validate slug format and reserved words
  const validation = validateSlug(slug);
  if (!validation.isValid) {
    throw new ApplicationValidationError(validation.error!);
  }

  // Check uniqueness within the application
  const taken = await moduleSlugExists(applicationId, slug);
  if (taken) {
    throw new ApplicationValidationError('Module slug already in use within this application');
  }

  // Insert into database
  const mod = await insertModule({
    applicationId,
    name: input.name,
    slug,
    description: input.description,
  });

  // Audit log (fire-and-forget)
  await writeAuditLog({
    eventType: 'app.module.created',
    eventCategory: 'admin',
    actorId,
    metadata: { applicationId, moduleId: mod.id, slug: mod.slug, name: mod.name },
  });

  return mod;
}

/**
 * Update a module's basic fields (name, description).
 *
 * @param moduleId - Module UUID
 * @param input - Fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated module
 * @throws ApplicationNotFoundError if module not found
 */
export async function updateModule(
  moduleId: string,
  input: UpdateModuleInput,
  actorId?: string,
): Promise<ApplicationModule> {
  // Build update data from input
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;

  let mod: ApplicationModule;
  try {
    mod = await repoUpdateModule(moduleId, updateData);
  } catch (err) {
    if (err instanceof Error && err.message === 'Module not found') {
      throw new ApplicationNotFoundError(moduleId);
    }
    throw err;
  }

  // Audit log (fire-and-forget)
  await writeAuditLog({
    eventType: 'app.module.updated',
    eventCategory: 'admin',
    actorId,
    metadata: { moduleId: mod.id, applicationId: mod.applicationId, fields: Object.keys(updateData) },
  });

  return mod;
}

/**
 * Deactivate a module (set status to inactive).
 *
 * @param moduleId - Module UUID
 * @param actorId - UUID of the user performing the action
 * @throws ApplicationNotFoundError if module not found
 * @throws ApplicationValidationError if not currently active
 */
export async function deactivateModule(
  moduleId: string,
  actorId?: string,
): Promise<void> {
  const mod = await findModuleById(moduleId);
  if (!mod) throw new ApplicationNotFoundError(moduleId);

  if (mod.status !== 'active') {
    throw new ApplicationValidationError(
      `Cannot deactivate module from status: ${mod.status}`,
    );
  }

  await repoUpdateModule(moduleId, { status: 'inactive' });

  await writeAuditLog({
    eventType: 'app.module.deactivated',
    eventCategory: 'admin',
    actorId,
    metadata: { moduleId: mod.id, applicationId: mod.applicationId },
  });
}

/**
 * List all modules for an application.
 * Delegates directly to the repository.
 *
 * @param applicationId - Application UUID
 * @returns Array of modules
 */
export async function listModules(applicationId: string): Promise<ApplicationModule[]> {
  return repoListModules(applicationId);
}
