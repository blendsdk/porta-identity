/**
 * User-role assignment types for the Porta SDK.
 *
 * @module types/user-roles
 */

/** Result returned after assigned roles are removed from a user. */
export interface UserRoleRemovalResult {
  /** Whether the current caller must authenticate again after the committed removal. */
  reauthenticationRequired: boolean;
}
