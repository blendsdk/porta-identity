/**
 * User claim value types for the Porta SDK.
 *
 * @module types/user-claims
 */

import type { CustomClaimDefinition } from './custom-claims.js';

/**
 * Stored custom claim value for one user and one claim definition.
 * Mirrors the server's `CustomClaimValue` record.
 */
export interface UserClaimValue {
  id: string;
  userId: string;
  claimId: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

/**
 * A claim definition joined with the user's stored value.
 * Returned when listing all claim values for a user.
 */
export interface UserClaimWithDefinition {
  definition: CustomClaimDefinition;
  value: UserClaimValue;
}
