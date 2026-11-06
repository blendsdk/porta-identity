import { UserValidationError } from './errors.js';
import { findServiceAccountClassification } from './repository.js';

/**
 * Read permanent noninteractive classification from the authoritative user row.
 * This remains true after unbinding and never adds a classification field to public User data.
 *
 * @param userId - Internal user UUID.
 * @returns Whether the surviving account is permanently noninteractive.
 * @example if (await isServiceAccount(user.id)) return null;
 */
export async function isServiceAccount(userId: string): Promise<boolean> {
  return findServiceAccountClassification(userId);
}

/**
 * Reject generic human-account mutations before they acquire lifecycle/organization locks.
 * Existing humans are never promoted and this classification never becomes false; a cache hit
 * or removal of the client/binding therefore cannot restore generic mutation authority.
 *
 * @param userId - Internal target user UUID.
 * @throws UserValidationError with a fixed, classification-neutral rejection.
 */
export async function requireInteractiveUser(userId: string): Promise<void> {
  if (await isServiceAccount(userId)) throw new UserValidationError('User operation is not permitted');
}
