/**
 * Static organization fixtures and builder helpers for predictable test scenarios.
 *
 * These provide input shapes for common organization states — they do NOT
 * insert into the database. Use with factory `createTestOrganization()`
 * or directly with repository `insertOrganization()`.
 *
 * Each fixture represents a well-known test scenario (super-admin, active,
 * suspended) that tests can reference by name for clarity.
 *
 * The `buildTestOrganization()` helper merges defaults with overrides so
 * tests can express only the fields they care about. This pattern keeps
 * downstream tests insulated from schema additions: when a new column is
 * added, only this file needs to update its defaults.
 */

import type { InsertOrganizationData } from '../../src/organizations/repository.js';

/** Super-admin organization — the system owner with elevated privileges */
export const SUPER_ADMIN_ORG: InsertOrganizationData & { isSuperAdmin: true } = {
  name: 'Porta Admin',
  slug: 'porta-admin',
  isSuperAdmin: true,
  defaultLocale: 'en',
};

/** Standard active organization — typical tenant in normal operation */
export const ACTIVE_ORG: InsertOrganizationData = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  defaultLocale: 'en',
};

/** Suspended organization — tenant with restricted access */
export const SUSPENDED_ORG: InsertOrganizationData = {
  name: 'Suspended Corp',
  slug: 'suspended-corp',
  defaultLocale: 'en',
};

/**
 * Build a test organization input shape with sensible defaults.
 *
 * Tests should use this helper instead of constructing `InsertOrganizationData`
 * objects manually. Override fields by passing an `overrides` object — only the
 * keys you specify are replaced; everything else uses the defaults below.
 *
 * Used by repository, service, and integration tests across the codebase. When
 * the organization schema gains new fields (e.g., `defaultLoginMethods` from
 * plans/client-login-methods), the defaults are added here and existing call
 * sites continue to work without changes.
 *
 * @param overrides - Partial fields to override the defaults
 * @returns A fully-populated `InsertOrganizationData` object suitable for `insertOrganization()`
 *
 * @example
 *   const data = buildTestOrganization({ slug: 'unique-slug' });
 *   const org = await insertOrganization(data);
 */
export function buildTestOrganization(
  overrides: Partial<InsertOrganizationData> = {},
): InsertOrganizationData {
  return {
    name: 'Test Org',
    slug: `test-org-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    defaultLocale: 'en',
    ...overrides,
  };
}
