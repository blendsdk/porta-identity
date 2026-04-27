/**
 * User service — business logic orchestrator.
 *
 * Composes the repository, cache, password utilities, and audit log
 * to provide the complete user management API. All write operations
 * follow the pattern:
 *   1. Validate inputs
 *   2. Perform DB operation (via repository)
 *   3. Invalidate + re-cache (via cache)
 *   4. Write audit log (fire-and-forget)
 *
 * Read operations check cache first (by ID), fall back to DB on miss.
 * Email lookups always hit the DB (not cached — see cache design decision).
 *
 * Status lifecycle rules:
 *   - deactivate: active → inactive
 *   - reactivate: inactive → active
 *   - suspend: active → suspended
 *   - unsuspend: suspended → active
 *   - lock: active → locked (with reason and timestamp)
 *   - unlock: locked → active (clears reason and timestamp)
 */

import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  UserListOptions,
  PaginatedResult,
} from './types.js';
import {
  insertUser,
  findUserById as repoFindById,
  findUserByEmail as repoFindByEmail,
  getPasswordHash,
  updateUser as repoUpdate,
  listUsers as repoList,
  listUsersCursor as repoListCursor,
  emailExists,
  updateLoginStats,
  incrementFailedLoginCount,
  resetFailedLoginCount,
} from './repository.js';
import type { UpdateUserData, ListUsersCursorOptions } from './repository.js';
import type { CursorPaginatedResult } from '../lib/cursor.js';
import { getCachedUserById, cacheUser, invalidateUserCache } from './cache.js';
import { validatePassword, hashPassword, verifyPassword } from './password.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { UserNotFoundError, UserValidationError } from './errors.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new user in an organization.
 *
 * 1. Validates email uniqueness within the organization
 * 2. Validates and hashes password if provided
 * 3. Inserts user via repository
 * 4. Caches the new user
 * 5. Writes audit log entry
 *
 * @param input - User creation data (password is plaintext, will be hashed)
 * @param actorId - UUID of the user performing the action (for audit)
 * @returns Created user
 * @throws UserValidationError if email exists or password invalid
 */
export async function createUser(
  input: CreateUserInput,
  actorId?: string,
): Promise<User> {
  // Check for duplicate email in the organization
  const exists = await emailExists(input.organizationId, input.email);
  if (exists) {
    throw new UserValidationError('Email already exists in this organization');
  }

  // Hash password if provided
  let passwordHash: string | null = null;
  if (input.password) {
    const validation = validatePassword(input.password);
    if (!validation.isValid) {
      throw new UserValidationError(validation.error!);
    }
    passwordHash = await hashPassword(input.password);
  }

  // Insert into database
  const user = await insertUser({
    organizationId: input.organizationId,
    email: input.email,
    passwordHash,
    givenName: input.givenName,
    familyName: input.familyName,
    middleName: input.middleName,
    nickname: input.nickname,
    preferredUsername: input.preferredUsername,
    profileUrl: input.profileUrl,
    pictureUrl: input.pictureUrl,
    websiteUrl: input.websiteUrl,
    gender: input.gender,
    birthdate: input.birthdate,
    zoneinfo: input.zoneinfo,
    locale: input.locale,
    phoneNumber: input.phoneNumber,
    addressStreet: input.address?.street,
    addressLocality: input.address?.locality,
    addressRegion: input.address?.region,
    addressPostalCode: input.address?.postalCode,
    addressCountry: input.address?.country,
  });

  // Cache the new user
  await cacheUser(user);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.created',
    eventCategory: 'admin',
    metadata: { userId: user.id, email: user.email },
  });

  return user;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Find a user by ID.
 * Checks Redis cache first, falls back to database on miss.
 *
 * @param id - User UUID
 * @returns User or null if not found
 */
export async function getUserById(id: string): Promise<User | null> {
  // Try cache first
  const cached = await getCachedUserById(id);
  if (cached) return cached;

  // Fall back to database
  const user = await repoFindById(id);
  if (user) {
    await cacheUser(user);
  }
  return user;
}

/**
 * Find a user by email within an organization.
 * Always hits the database (email lookups are not cached).
 *
 * @param orgId - Organization UUID
 * @param email - User email address (case-insensitive)
 * @returns User or null if not found
 */
export async function getUserByEmail(orgId: string, email: string): Promise<User | null> {
  return repoFindByEmail(orgId, email);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update a user's profile fields.
 *
 * Builds an update data object from the input, checking for email
 * uniqueness if the email is being changed. Address fields are
 * flattened from the nested AddressInput to individual columns.
 *
 * @param id - User UUID
 * @param input - Fields to update
 * @param actorId - UUID of the user performing the action
 * @returns Updated user
 * @throws UserNotFoundError if user not found
 * @throws UserValidationError if new email already exists in org
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId?: string,
): Promise<User> {
  // If email is being changed, verify uniqueness
  if (input.email !== undefined) {
    // We need the current user to know the org ID
    const current = await repoFindById(id);
    if (!current) throw new UserNotFoundError(id);

    const taken = await emailExists(current.organizationId, input.email, id);
    if (taken) {
      throw new UserValidationError('Email already exists in this organization');
    }
  }

  // Build update data from input
  const updateData: UpdateUserData = {};
  if (input.email !== undefined) updateData.email = input.email;
  if (input.emailVerified !== undefined) updateData.emailVerified = input.emailVerified;
  if (input.givenName !== undefined) updateData.givenName = input.givenName;
  if (input.familyName !== undefined) updateData.familyName = input.familyName;
  if (input.middleName !== undefined) updateData.middleName = input.middleName;
  if (input.nickname !== undefined) updateData.nickname = input.nickname;
  if (input.preferredUsername !== undefined) updateData.preferredUsername = input.preferredUsername;
  if (input.profileUrl !== undefined) updateData.profileUrl = input.profileUrl;
  if (input.pictureUrl !== undefined) updateData.pictureUrl = input.pictureUrl;
  if (input.websiteUrl !== undefined) updateData.websiteUrl = input.websiteUrl;
  if (input.gender !== undefined) updateData.gender = input.gender;
  if (input.birthdate !== undefined) updateData.birthdate = input.birthdate;
  if (input.zoneinfo !== undefined) updateData.zoneinfo = input.zoneinfo;
  if (input.locale !== undefined) updateData.locale = input.locale;
  if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
  if (input.phoneNumberVerified !== undefined) updateData.phoneNumberVerified = input.phoneNumberVerified;

  // Flatten address fields from nested input
  if (input.address) {
    if (input.address.street !== undefined) updateData.addressStreet = input.address.street;
    if (input.address.locality !== undefined) updateData.addressLocality = input.address.locality;
    if (input.address.region !== undefined) updateData.addressRegion = input.address.region;
    if (input.address.postalCode !== undefined) updateData.addressPostalCode = input.address.postalCode;
    if (input.address.country !== undefined) updateData.addressCountry = input.address.country;
  }

  let user: User;
  try {
    user = await repoUpdate(id, updateData);
  } catch (err) {
    if (err instanceof Error && err.message === 'User not found') {
      throw new UserNotFoundError(id);
    }
    throw err;
  }

  // Invalidate old cache and re-cache the updated version
  await invalidateUserCache(user.id);
  await cacheUser(user);

  // Audit log (fire-and-forget)
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.updated',
    eventCategory: 'admin',
    metadata: { userId: user.id, fields: Object.keys(updateData) },
  });

  return user;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List users within an organization with pagination and filtering.
 * Delegates directly to the repository.
 *
 * @param options - Pagination, filter, and sort options (orgId required)
 * @returns Paginated result
 */
export async function listUsersByOrganization(
  options: UserListOptions,
): Promise<PaginatedResult<User>> {
  return repoList(options);
}

/**
 * List users with cursor-based keyset pagination.
 * Supports all existing filters (org scope, status, search, sort).
 *
 * @param options - Cursor, limit, filter, and sort options (orgId required)
 * @returns Cursor-paginated result with nextCursor/hasMore
 */
export async function listUsersCursor(
  options: ListUsersCursorOptions,
): Promise<CursorPaginatedResult<User>> {
  return repoListCursor(options);
}

// ---------------------------------------------------------------------------
// Status lifecycle
// ---------------------------------------------------------------------------

/**
 * Load a user and validate it exists before a status change.
 * @throws UserNotFoundError if not found
 */
async function loadUserForStatusChange(id: string): Promise<User> {
  const user = await repoFindById(id);
  if (!user) throw new UserNotFoundError(id);
  return user;
}

/**
 * Deactivate a user (active → inactive).
 *
 * @param id - User UUID
 * @param actorId - UUID of the user performing the action
 * @throws UserNotFoundError if not found
 * @throws UserValidationError if not currently active
 */
export async function deactivateUser(id: string, actorId?: string): Promise<void> {
  const user = await loadUserForStatusChange(id);

  if (user.status !== 'active') {
    throw new UserValidationError(`Cannot deactivate user from status: ${user.status}`);
  }

  await repoUpdate(id, { status: 'inactive' });
  await invalidateUserCache(id);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.deactivated',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

/**
 * Reactivate a user (inactive → active).
 *
 * @param id - User UUID
 * @param actorId - UUID of the user performing the action
 * @throws UserNotFoundError if not found
 * @throws UserValidationError if not currently inactive
 */
export async function reactivateUser(id: string, actorId?: string): Promise<void> {
  const user = await loadUserForStatusChange(id);

  if (user.status !== 'inactive') {
    throw new UserValidationError(`Cannot reactivate user from status: ${user.status}`);
  }

  await repoUpdate(id, { status: 'active' });
  await invalidateUserCache(id);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.reactivated',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

/**
 * Suspend a user (active → suspended).
 *
 * @param id - User UUID
 * @param reason - Optional reason for suspension
 * @param actorId - UUID of the user performing the action
 * @throws UserNotFoundError if not found
 * @throws UserValidationError if not currently active
 */
export async function suspendUser(
  id: string,
  reason?: string,
  actorId?: string,
): Promise<void> {
  const user = await loadUserForStatusChange(id);

  if (user.status !== 'active') {
    throw new UserValidationError(`Cannot suspend user from status: ${user.status}`);
  }

  await repoUpdate(id, { status: 'suspended' });
  await invalidateUserCache(id);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.suspended',
    eventCategory: 'admin',
    metadata: { userId: id, reason: reason ?? null },
  });
}

/**
 * Unsuspend a user (suspended → active).
 *
 * @param id - User UUID
 * @param actorId - UUID of the user performing the action
 * @throws UserNotFoundError if not found
 * @throws UserValidationError if not currently suspended
 */
export async function unsuspendUser(id: string, actorId?: string): Promise<void> {
  const user = await loadUserForStatusChange(id);

  if (user.status !== 'suspended') {
    throw new UserValidationError(`Cannot unsuspend user from status: ${user.status}`);
  }

  await repoUpdate(id, { status: 'active' });
  await invalidateUserCache(id);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.activated',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

/**
 * Lock a user (active → locked).
 *
 * Sets the locked_at timestamp and locked_reason. Locked users
 * cannot authenticate (getPasswordHash only returns for active users).
 *
 * @param id - User UUID
 * @param reason - Reason for locking the account
 * @param actorId - UUID of the user performing the action
 * @throws UserNotFoundError if not found
 * @throws UserValidationError if not currently active
 */
export async function lockUser(
  id: string,
  reason: string,
  actorId?: string,
): Promise<void> {
  const user = await loadUserForStatusChange(id);

  if (user.status !== 'active') {
    throw new UserValidationError(`Cannot lock user from status: ${user.status}`);
  }

  await repoUpdate(id, {
    status: 'locked',
    lockedAt: new Date(),
    lockedReason: reason,
  });
  await invalidateUserCache(id);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.locked',
    eventCategory: 'admin',
    metadata: { userId: id, reason },
  });
}

/**
 * Unlock a user (locked → active).
 *
 * Clears the locked_at timestamp and locked_reason.
 *
 * @param id - User UUID
 * @param actorId - UUID of the user performing the action
 * @throws UserNotFoundError if not found
 * @throws UserValidationError if not currently locked
 */
export async function unlockUser(id: string, actorId?: string): Promise<void> {
  const user = await loadUserForStatusChange(id);

  if (user.status !== 'locked') {
    throw new UserValidationError(`Cannot unlock user from status: ${user.status}`);
  }

  await repoUpdate(id, {
    status: 'active',
    lockedAt: null,
    lockedReason: null,
  });
  await invalidateUserCache(id);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId,
    eventType: 'user.unlocked',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

// ---------------------------------------------------------------------------
// Password management
// ---------------------------------------------------------------------------

/**
 * Set a user's password.
 *
 * Validates the password, hashes it with Argon2id, and stores the hash.
 * Also sets password_changed_at to the current timestamp.
 *
 * @param id - User UUID
 * @param password - New plaintext password
 * @param actorId - UUID of the user performing the action
 * @throws UserValidationError if password fails validation
 */
export async function setUserPassword(
  id: string,
  password: string,
  actorId?: string,
): Promise<void> {
  const validation = validatePassword(password);
  if (!validation.isValid) {
    throw new UserValidationError(validation.error!);
  }

  const hash = await hashPassword(password);

  await repoUpdate(id, {
    passwordHash: hash,
    passwordChangedAt: new Date(),
  });
  await invalidateUserCache(id);

  await writeAuditLog({
    actorId,
    eventType: 'user.password.set',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

/**
 * Verify a user's password.
 *
 * Returns false if the user has no password (passwordless), is not
 * active, or if the password doesn't match. No audit log is written —
 * login tracking is handled separately by recordLogin().
 *
 * @param id - User UUID
 * @param password - Plaintext password to verify
 * @returns true if the password matches
 */
export async function verifyUserPassword(id: string, password: string): Promise<boolean> {
  // getPasswordHash only returns for active users with a password
  const hash = await getPasswordHash(id);
  if (!hash) return false;

  return verifyPassword(hash, password);
}

/**
 * Clear a user's password (convert to passwordless-only).
 *
 * Sets password_hash to NULL and clears password_changed_at.
 *
 * @param id - User UUID
 * @param actorId - UUID of the user performing the action
 */
export async function clearUserPassword(id: string, actorId?: string): Promise<void> {
  await repoUpdate(id, {
    passwordHash: null,
    passwordChangedAt: null,
  });
  await invalidateUserCache(id);

  await writeAuditLog({
    actorId,
    eventType: 'user.password.cleared',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

/**
 * Mark a user's email as verified.
 *
 * @param id - User UUID
 * @param actorId - UUID of the user performing the action
 */
export async function markEmailVerified(id: string, actorId?: string): Promise<void> {
  await repoUpdate(id, { emailVerified: true });
  await invalidateUserCache(id);

  await writeAuditLog({
    actorId,
    eventType: 'user.email.verified',
    eventCategory: 'admin',
    metadata: { userId: id },
  });
}

/**
 * Mark a user's email as unverified.
 * Typically called when the email address changes.
 *
 * @param id - User UUID
 */
export async function markEmailUnverified(id: string): Promise<void> {
  await repoUpdate(id, { emailVerified: false });
  await invalidateUserCache(id);
}

// ---------------------------------------------------------------------------
// Login tracking
// ---------------------------------------------------------------------------

/**
 * Record a successful login for a user.
 *
 * Increments login_count and sets last_login_at. Also resets
 * failed_login_count and last_failed_login_at. Invalidates cache
 * because the login stats have changed.
 *
 * @param id - User UUID
 */
export async function recordLogin(id: string): Promise<void> {
  await updateLoginStats(id);
  await invalidateUserCache(id);
}

/**
 * Record a failed login attempt and auto-lock if threshold exceeded.
 *
 * Uses an atomic SQL UPDATE to increment the counter and conditionally
 * flip status to 'locked' with reason 'auto_lockout' in a single query.
 * Returns whether the account was just locked so the caller can show
 * an appropriate message and write an audit event.
 *
 * The threshold comes from system_config `max_failed_logins` (default 5).
 *
 * @param user - The user whose login failed
 * @returns Object with `locked: true` if the account was just auto-locked
 */
export async function recordFailedLogin(
  user: User,
): Promise<{ locked: boolean; failedCount: number }> {
  const maxAttempts = await getSystemConfigNumber('max_failed_logins', 5);

  const result = await incrementFailedLoginCount(user.id, maxAttempts);
  await invalidateUserCache(user.id);

  const justLocked = result.status === 'locked' && user.status === 'active';

  if (justLocked) {
    writeAuditLog({
      organizationId: user.organizationId,
      userId: user.id,
      eventType: 'user.auto_locked',
      eventCategory: 'security',
      description: `Account auto-locked after ${result.failedLoginCount} failed login attempts`,
      metadata: { failedCount: result.failedLoginCount, threshold: maxAttempts },
    });
  }

  return { locked: justLocked, failedCount: result.failedLoginCount };
}

/**
 * Check whether an auto-locked account should be unlocked (cooldown elapsed).
 *
 * Only applies to users with `status = 'locked'` and
 * `lockedReason = 'auto_lockout'`. Manual locks are never auto-unlocked.
 *
 * The cooldown duration comes from system_config `lockout_duration_seconds`
 * (default 900 = 15 minutes).
 *
 * @param user - User to check
 * @returns `true` if the account was auto-unlocked
 */
export async function checkAutoUnlock(user: User): Promise<boolean> {
  if (user.status !== 'locked' || user.lockedReason !== 'auto_lockout') {
    return false;
  }

  if (!user.lockedAt) return false;

  const cooldownSeconds = await getSystemConfigNumber('lockout_duration_seconds', 900);
  const elapsed = (Date.now() - user.lockedAt.getTime()) / 1000;

  if (elapsed < cooldownSeconds) {
    return false;
  }

  // Cooldown elapsed — unlock and reset counter
  await resetFailedLoginCount(user.id);
  await invalidateUserCache(user.id);

  writeAuditLog({
    organizationId: user.organizationId,
    userId: user.id,
    eventType: 'user.auto_unlocked',
    eventCategory: 'security',
    description: `Account auto-unlocked after ${cooldownSeconds}s cooldown`,
  });

  return true;
}

// ---------------------------------------------------------------------------
// OIDC integration
// ---------------------------------------------------------------------------

/**
 * Find a user for OIDC token/userinfo operations.
 *
 * Returns the user only if their status is 'active'. Non-active users
 * should not be able to obtain tokens or access the userinfo endpoint.
 * Used by the upgraded account-finder.ts.
 *
 * @param sub - Subject identifier (user UUID)
 * @returns Active user or null
 */
export async function findUserForOidc(sub: string): Promise<User | null> {
  const user = await getUserById(sub);
  if (!user) return null;

  // Only active users can interact with OIDC endpoints
  if (user.status !== 'active') return null;

  return user;
}
