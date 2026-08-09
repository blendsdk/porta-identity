/**
 * Barrel export for all domain factories and their interface types.
 *
 * @module domains
 */

// Helpers
export { unwrapData, unwrapWithEtag, etagHeaders, toQueryParams } from './helpers.js';

// Organizations
export { createOrganizationsDomain } from './organizations.js';
export type { OrganizationsDomain, SlugValidation, DestroyResult } from './organizations.js';

// Applications
export { createApplicationsDomain } from './applications.js';
export type { ApplicationsDomain } from './applications.js';

// Clients
export { createClientsDomain } from './clients.js';
export type { ClientsDomain } from './clients.js';

// Users
export { createUsersDomain, createStandaloneUsersDomain } from './users.js';
export type { UsersDomain, StandaloneUsersDomain } from './users.js';


// Roles
export { createRolesDomain } from './roles.js';
export type { RolesDomain } from './roles.js';

// Permissions
export { createPermissionsDomain } from './permissions.js';
export type { PermissionsDomain } from './permissions.js';

// Custom Claims
export { createCustomClaimsDomain } from './custom-claims.js';
export type { CustomClaimsDomain } from './custom-claims.js';

// User Roles
export { createUserRolesDomain } from './user-roles.js';
export type { UserRolesDomain } from './user-roles.js';

// User Claims
export { createUserClaimsDomain } from './user-claims.js';
export type { UserClaimsDomain } from './user-claims.js';

// Config
export { createConfigDomain } from './config.js';
export type { ConfigDomain } from './config.js';

// Keys
export { createKeysDomain } from './keys.js';
export type { KeysDomain } from './keys.js';

// Audit
export { createAuditDomain } from './audit.js';
export type { AuditDomain } from './audit.js';

// Stats
export { createStatsDomain } from './stats.js';
export type { StatsDomain } from './stats.js';

// Sessions
export { createSessionsDomain } from './sessions.js';
export type { SessionsDomain } from './sessions.js';

// Bulk
export { createBulkDomain } from './bulk.js';
export type { BulkDomain } from './bulk.js';

// Branding
export { createBrandingDomain } from './branding.js';
export type { BrandingDomain } from './branding.js';

// Exports
export { createExportsDomain } from './exports.js';
export type { ExportsDomain } from './exports.js';

// Two-Factor
export { createTwoFactorDomain } from './two-factor.js';
export type { TwoFactorDomain } from './two-factor.js';

// Imports
export { createImportsDomain } from './imports.js';
export type { ImportsDomain } from './imports.js';
