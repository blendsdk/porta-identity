/**
 * Static organization fixtures for predictable test scenarios.
 *
 * These provide input shapes for common organization states — they do NOT
 * insert into the database. Use with factory `createTestOrganization()`
 * or directly with repository `insertOrganization()`.
 *
 * Each fixture represents a well-known test scenario (super-admin, active,
 * suspended) that tests can reference by name for clarity.
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
