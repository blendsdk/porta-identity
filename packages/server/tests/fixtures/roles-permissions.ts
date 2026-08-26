/**
 * Static RBAC fixtures for predictable test scenarios.
 *
 * These provide role and permission input shapes — they do NOT insert
 * into the database and do NOT include applicationId (which must be
 * provided at creation time).
 *
 * Fixtures cover the most common role archetypes (admin, viewer) and
 * permission types (read, write, delete) used across test scenarios.
 */

import type { CreateRoleInput, CreatePermissionInput } from '../../src/rbac/types.js';

/** Keys that must be provided at creation time */
type RoleFixtureKeys = 'applicationId';
type PermissionFixtureKeys = 'applicationId';

// ---------------------------------------------------------------------------
// Role fixtures
// ---------------------------------------------------------------------------

/** Administrator role — full access to all resources */
export const ADMIN_ROLE: Omit<CreateRoleInput, RoleFixtureKeys> = {
  name: 'Admin',
  slug: 'admin',
  description: 'Full administrative access',
};

/** Viewer role — read-only access to resources */
export const VIEWER_ROLE: Omit<CreateRoleInput, RoleFixtureKeys> = {
  name: 'Viewer',
  slug: 'viewer',
  description: 'Read-only access',
};

// ---------------------------------------------------------------------------
// Permission fixtures
// ---------------------------------------------------------------------------

/** Read permission — allows reading resources */
export const READ_PERMISSION: Omit<CreatePermissionInput, PermissionFixtureKeys> = {
  name: 'Read',
  slug: 'read',
  description: 'Read access to resources',
};

/** Write permission — allows creating and updating resources */
export const WRITE_PERMISSION: Omit<CreatePermissionInput, PermissionFixtureKeys> = {
  name: 'Write',
  slug: 'write',
  description: 'Write access to resources',
};

/** Delete permission — allows removing resources */
export const DELETE_PERMISSION: Omit<CreatePermissionInput, PermissionFixtureKeys> = {
  name: 'Delete',
  slug: 'delete',
  description: 'Delete access to resources',
};
