/**
 * Static user fixtures for predictable test scenarios.
 *
 * These provide partial user input shapes — they do NOT insert into the
 * database and do NOT include organizationId (which must be provided at
 * creation time). Use with factory `createTestUser()` or repository.
 *
 * Each fixture represents a well-known user state that tests can
 * reference by name for clarity.
 */

import type { InsertUserData } from '../../src/users/repository.js';

/** Active user with verified email — standard happy-path user */
export const ACTIVE_USER: Omit<InsertUserData, 'organizationId'> = {
  email: 'active@test.example.com',
  givenName: 'Active',
  familyName: 'User',
  emailVerified: true,
};

/** Suspended user — account temporarily disabled by admin */
export const SUSPENDED_USER: Omit<InsertUserData, 'organizationId'> = {
  email: 'suspended@test.example.com',
  givenName: 'Suspended',
  familyName: 'User',
  emailVerified: true,
};

/** Locked user — account locked due to too many failed login attempts */
export const LOCKED_USER: Omit<InsertUserData, 'organizationId'> = {
  email: 'locked@test.example.com',
  givenName: 'Locked',
  familyName: 'User',
  emailVerified: true,
};
