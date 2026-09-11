/**
 * Organization service — business logic orchestrator.
 *
 * Composes the repository, cache, slug utilities, and audit log
 * to provide the complete organization management API. All write
 * operations follow the pattern:
 *   1. Validate inputs
 *   2. Perform DB operation (via repository)
 *   3. Invalidate + re-cache (via cache)
 *   4. Write audit log (fire-and-forget)
 *
 * Read operations check cache first, fall back to DB on miss.
 *
 * Status lifecycle rules:
 *   - suspend: active → suspended (super-admin blocked)
 *   - activate: suspended → active
 */

import type {
  Organization,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  BrandingInput,
  ListOrganizationsOptions,
  PaginatedResult,
} from './types.js';
import {
  insertOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  updateOrganization as repoUpdate,
  listOrganizations as repoList,
  listOrganizationsCursor as repoListCursor,
  slugExists,
  captureOrganizationForDeletion,
  deleteOrganizationCaptured,
} from './repository.js';
import type { OrganizationDeletionCapture } from './repository.js';
import { getDatabaseTransactionClient } from '../lib/database.js';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { registerDeletionCleanup } from '../lib/deletion-cleanup.js';
import type { ListOrganizationsCursorOptions } from './repository.js';
import type { CursorPaginatedResult } from '../lib/cursor.js';
import {
  getCachedOrganizationById,
  getCachedOrganizationBySlug,
  cacheOrganization,
  invalidateOrganizationCache,
} from './cache.js';
import { generateSlug, validateSlug } from './slugs.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { OrganizationNotFoundError, OrganizationValidationError } from './errors.js';
// Import directly from the type/resolver modules (not the clients barrel)
// to keep the org→clients dependency narrow and avoid pulling the entire
// clients service surface into the organizations module.
import { LOGIN_METHODS, type LoginMethod } from '../clients/types.js';
import { normalizeLoginMethods } from '../clients/resolve-login-methods.js';
import { validateBrandingImageUrl } from './branding-url.js';

// ---------------------------------------------------------------------------
// Validation helpers (private)
// ---------------------------------------------------------------------------

/**
 * Validate + normalize a `defaultLoginMethods` input array.
 *
 * Throws {@link OrganizationValidationError} when:
 *   - the value is not an array
 *   - the array is empty
 *   - any element is not a valid {@link LoginMethod}
 *
 * Returns the normalized (deduplicated, order-preserving) array on success.
 */
function validateDefaultLoginMethods(
  methods: LoginMethod[] | undefined,
): LoginMethod[] | undefined {
  if (methods === undefined) return undefined;
  if (!Array.isArray(methods) || methods.length === 0) {
    throw new OrganizationValidationError('defaultLoginMethods: must be a non-empty array');
  }
  for (const m of methods) {
    if (!LOGIN_METHODS.includes(m)) {
      throw new OrganizationValidationError(`defaultLoginMethods: invalid method "${String(m)}"`);
    }
  }
  return normalizeLoginMethods(methods);
}

/** Preserve absent or cleared URL fields while validating supplied strings. */
function normalizeBrandingImageUrl(value: string | null | undefined): string | null | undefined {
  return typeof value === 'string' ? validateBrandingImageUrl(value) : value;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new organization.
 *
 * 1. Generate slug from name if not provided
 * 2. Validate slug format and reserved words
 * 3. Check slug uniqueness in the database
 * 4. Insert organization via repository
 * 5. Cache the new organization
 * 6. Write audit log entry
 *
 * @param input - Organization creation data
 * @param actorId - UUID of the user performing the action (for audit)
 * @returns Created organization
 * @throws OrganizationValidationError if slug is invalid or already taken
 */
export async function createOrganization(
  input: CreateOrganizationInput,
  actorId?: string,
): Promise<Organization> {
  // Generate or use provided slug
  const slug = input.slug ?? generateSlug(input.name);

  // Validate slug format and reserved words
  const validation = validateSlug(slug);
  if (!validation.isValid) {
    throw new OrganizationValidationError(validation.error!);
  }

  // Check uniqueness
  const taken = await slugExists(slug);
  if (taken) {
    throw new OrganizationValidationError('Slug already in use');
  }

  // Validate + normalize defaultLoginMethods (throws on invalid input).
  // Undefined → fall back to DB DEFAULT in the repository INSERT.
  const defaultLoginMethods = validateDefaultLoginMethods(input.defaultLoginMethods);

  // Insert into database
  const org = await insertOrganization({
    name: input.name,
    slug,
    defaultLocale: input.defaultLocale ?? 'en',
    brandingLogoUrl: normalizeBrandingImageUrl(input.branding?.logoUrl),
    brandingFaviconUrl: normalizeBrandingImageUrl(input.branding?.faviconUrl),
    brandingPrimaryColor: input.branding?.primaryColor,
    brandingCompanyName: input.branding?.companyName,
    brandingCustomCss: input.branding?.customCss,
    defaultLoginMethods,
  });

  // Cache the new organization
  await cacheOrganization(org);

  // Audit log (fire-and-forget) — include the resolved defaults so audit
  // captures the effective configuration even when the caller relied on
  // the DB DEFAULT.
  await writeAuditLog({
    organizationId: org.id,
    actorId,
    eventType: 'org.created',
    eventCategory: 'admin',
    metadata: {
      slug: org.slug,
      name: org.name,
      defaultLoginMethods: org.defaultLoginMethods,
    },
  });

  return org;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Find an organization by ID.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param id - Organization UUID
 * @returns Organization or null if not found
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  // Try cache first
  const cached = await getCachedOrganizationById(id);
  if (cached) return cached;

  // Fall back to database
  const org = await findOrganizationById(id);
  if (org) {
    await cacheOrganization(org);
  }
  return org;
}

/**
 * Find an organization by slug.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param slug - Organization slug
 * @returns Organization or null if not found
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  // Try cache first
  const cached = await getCachedOrganizationBySlug(slug);
  if (cached) return cached;

  // Fall back to database
  const org = await findOrganizationBySlug(slug);
  if (org) {
    await cacheOrganization(org);
  }
  return org;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update an organization's basic fields (name, locale).
 *
 * @param id - Organization UUID
 * @param input - Fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated organization
 * @throws OrganizationNotFoundError if organization not found
 */
export async function updateOrganization(
  id: string,
  input: UpdateOrganizationInput,
  actorId?: string,
): Promise<Organization> {
  // Build update data from input
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.defaultLocale !== undefined) updateData.defaultLocale = input.defaultLocale;
  if (input.twoFactorPolicy !== undefined) updateData.twoFactorPolicy = input.twoFactorPolicy;

  // Validate + normalize defaultLoginMethods if provided (throws on invalid).
  // Capture the previous value (for audit log diff) before the update is
  // applied, so we can record the old → new transition.
  let previousDefaultLoginMethods: LoginMethod[] | undefined;
  if (input.defaultLoginMethods !== undefined) {
    const normalized = validateDefaultLoginMethods(input.defaultLoginMethods);
    updateData.defaultLoginMethods = normalized;

    // Look up the current value for the audit diff. We use the cache-aware
    // accessor so we get a Date-deserialized object back; if the org doesn't
    // exist the repo update will throw OrganizationNotFoundError below.
    const existing = await getOrganizationById(id);
    if (existing) {
      previousDefaultLoginMethods = existing.defaultLoginMethods;
    }
  }

  // Include branding fields if provided
  if (input.branding) {
    if (input.branding.logoUrl !== undefined)
      updateData.brandingLogoUrl = normalizeBrandingImageUrl(input.branding.logoUrl);
    if (input.branding.faviconUrl !== undefined)
      updateData.brandingFaviconUrl = normalizeBrandingImageUrl(input.branding.faviconUrl);
    if (input.branding.primaryColor !== undefined)
      updateData.brandingPrimaryColor = input.branding.primaryColor;
    if (input.branding.companyName !== undefined)
      updateData.brandingCompanyName = input.branding.companyName;
    if (input.branding.customCss !== undefined)
      updateData.brandingCustomCss = input.branding.customCss;
  }

  let org: Organization;
  try {
    org = await repoUpdate(id, updateData);
  } catch (err) {
    if (err instanceof Error && err.message === 'Organization not found') {
      throw new OrganizationNotFoundError(id);
    }
    throw err;
  }

  // Invalidate old cache and re-cache the updated version
  await invalidateOrganizationCache(org.slug, org.id);
  await cacheOrganization(org);

  // Audit log (fire-and-forget) — include old/new login methods when
  // they changed, for forensic traceability.
  const auditMetadata: Record<string, unknown> = {
    fields: Object.keys(updateData),
  };
  if (input.defaultLoginMethods !== undefined) {
    auditMetadata.previousDefaultLoginMethods = previousDefaultLoginMethods ?? null;
    auditMetadata.newDefaultLoginMethods = org.defaultLoginMethods;
  }
  await writeAuditLog({
    organizationId: org.id,
    actorId,
    eventType: 'org.updated',
    eventCategory: 'admin',
    metadata: auditMetadata,
  });

  return org;
}

/**
 * Update an organization's branding configuration.
 *
 * @param id - Organization UUID
 * @param branding - Branding fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated organization
 * @throws OrganizationNotFoundError if organization not found
 */
export async function updateOrganizationBranding(
  id: string,
  branding: BrandingInput,
  actorId?: string,
): Promise<Organization> {
  const updateData: Record<string, unknown> = {};
  if (branding.logoUrl !== undefined)
    updateData.brandingLogoUrl = normalizeBrandingImageUrl(branding.logoUrl);
  if (branding.faviconUrl !== undefined)
    updateData.brandingFaviconUrl = normalizeBrandingImageUrl(branding.faviconUrl);
  if (branding.primaryColor !== undefined) updateData.brandingPrimaryColor = branding.primaryColor;
  if (branding.companyName !== undefined) updateData.brandingCompanyName = branding.companyName;
  if (branding.customCss !== undefined) updateData.brandingCustomCss = branding.customCss;

  let org: Organization;
  try {
    org = await repoUpdate(id, updateData);
  } catch (err) {
    if (err instanceof Error && err.message === 'Organization not found') {
      throw new OrganizationNotFoundError(id);
    }
    throw err;
  }

  await invalidateOrganizationCache(org.slug, org.id);
  await cacheOrganization(org);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: org.id,
    actorId,
    eventType: 'org.branding.updated',
    eventCategory: 'admin',
    metadata: { fields: Object.keys(updateData) },
  });

  return org;
}

// ---------------------------------------------------------------------------
// Status lifecycle
// ---------------------------------------------------------------------------

/**
 * Load and validate an organization exists before a status change.
 * @throws OrganizationNotFoundError if not found
 */
async function loadOrgForStatusChange(id: string): Promise<Organization> {
  const org = await findOrganizationById(id);
  if (!org) throw new OrganizationNotFoundError(id);
  return org;
}

/**
 * Suspend an organization (active → suspended).
 * Super-admin organization cannot be suspended.
 *
 * @param id - Organization UUID
 * @param reason - Optional reason for suspension
 * @param actorId - UUID of the user performing the action
 * @throws OrganizationNotFoundError if not found
 * @throws OrganizationValidationError if super-admin or not active
 */
export async function suspendOrganization(
  id: string,
  reason?: string,
  actorId?: string,
): Promise<void> {
  const org = await loadOrgForStatusChange(id);

  if (org.isSuperAdmin) {
    throw new OrganizationValidationError('Super-admin organization cannot be suspended');
  }
  if (org.status === 'suspended') {
    throw new OrganizationValidationError('Organization is already suspended');
  }
  if (org.status !== 'active') {
    throw new OrganizationValidationError(`Cannot suspend organization from status: ${org.status}`);
  }

  await repoUpdate(id, { status: 'suspended' });
  await invalidateOrganizationCache(org.slug, org.id);

  await writeAuditLog({
    organizationId: org.id,
    actorId,
    eventType: 'org.suspended',
    eventCategory: 'admin',
    metadata: { reason: reason ?? null },
  });
}

/**
 * Activate an organization (suspended → active).
 *
 * @param id - Organization UUID
 * @param actorId - UUID of the user performing the action
 * @throws OrganizationNotFoundError if not found
 * @throws OrganizationValidationError if not currently suspended
 */
export async function activateOrganization(id: string, actorId?: string): Promise<void> {
  const org = await loadOrgForStatusChange(id);

  if (org.status !== 'suspended') {
    throw new OrganizationValidationError(
      `Cannot activate organization from status: ${org.status}`,
    );
  }

  await repoUpdate(id, { status: 'active' });
  await invalidateOrganizationCache(org.slug, org.id);

  await writeAuditLog({
    organizationId: org.id,
    actorId,
    eventType: 'org.activated',
    eventCategory: 'admin',
  });
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List organizations with pagination and filtering.
 * Delegates directly to the repository.
 *
 * @param options - Pagination, filter, and sort options
 * @returns Paginated result
 */
export async function listOrganizations(
  options: ListOrganizationsOptions,
): Promise<PaginatedResult<Organization>> {
  return repoList(options);
}

/**
 * List organizations with cursor-based keyset pagination.
 * Provides stable, efficient pagination without COUNT queries.
 * Delegates directly to the repository cursor implementation.
 *
 * @param options - Cursor, limit, filter, and sort options
 * @returns Cursor-paginated result with nextCursor/hasMore
 */
export async function listOrganizationsCursor(
  options: ListOrganizationsCursorOptions,
): Promise<CursorPaginatedResult<Organization>> {
  return repoListCursor(options);
}

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

/**
 * Validate if a slug is available and valid.
 * Checks both format/reserved words AND database uniqueness.
 *
 * @param slug - Slug to validate
 * @param excludeId - Optional org ID to exclude (for updates)
 * @returns Object with isValid boolean and optional error message
 */
export async function validateSlugAvailability(
  slug: string,
  excludeId?: string,
): Promise<{ isValid: boolean; error?: string }> {
  // Check format and reserved words first
  const validation = validateSlug(slug);
  if (!validation.isValid) {
    return validation;
  }

  // Check database uniqueness
  const taken = await slugExists(slug, excludeId);
  if (taken) {
    return { isValid: false, error: 'Slug already in use' };
  }

  return { isValid: true };
}

/**
 * Physically delete an organization after capturing its affected authority.
 * Audit, session revocation, protocol cleanup, and cache cleanup are composed
 * around this operation by the administrative mutation flow. Cleanup registration
 * delegates to the transaction's `afterDatabaseCommit` boundary.
 *
 * @param idOrSlug - Organization UUID or slug.
 * @param actorId - Actor identifier available for audit attribution.
 * @returns The graph captured immediately before the database cascade.
 * @throws OrganizationNotFoundError when the target does not exist.
 * @throws OrganizationValidationError when the target is the control plane.
 */
export async function deleteOrganization(
  idOrSlug: string,
  actorId?: string,
): Promise<OrganizationDeletionCapture> {
  const client = getDatabaseTransactionClient();
  if (!client) throw new Error('Organization deletion requires an active database transaction');
  const capture = await captureOrganizationForDeletion(idOrSlug);
  if (!capture) throw new OrganizationNotFoundError(idOrSlug);
  if (capture.organization.isSuperAdmin) {
    throw new OrganizationValidationError('The control-plane organization cannot be deleted');
  }
  await client.query(
    `UPDATE admin_sessions SET revoked_at = NOW()
     WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
    [capture.userIds],
  );
  await client.query(
    `DELETE FROM oidc_payloads
     WHERE id = ANY($1::varchar[]) OR grant_id = ANY($1::varchar[])
       OR payload->>'clientId' = ANY($2::text[])
       OR payload->>'accountId' = ANY($3::text[])`,
    [capture.grantIds, capture.publicClientIds, capture.userIds],
  );
  await writeAuditLogInTransaction(client, {
    organizationId: capture.organization.id,
    actorId,
    eventType: 'org.deleted',
    eventCategory: 'admin',
    metadata: {
      organizationId: capture.organization.id,
      slug: capture.organization.slug,
      status: capture.organization.status,
    },
  });
  await deleteOrganizationCaptured(capture.organization.id);
  await registerDeletionCleanup({
    resource: 'organization',
    targetId: capture.organization.id,
    targetSlug: capture.organization.slug,
    userIds: capture.userIds,
    clientIds: capture.clientIds,
    publicClientIds: capture.publicClientIds,
    grantIds: capture.grantIds,
    roleIds: [],
    permissionIds: [],
    claimIds: [],
    applicationIds: [],
  });
  return capture;
}
